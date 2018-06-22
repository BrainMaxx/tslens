import {
  CodeLensProvider,
  Range,
  TextEditorDecorationType,
  window,
  TextDocument,
  CancellationToken,
  CodeLens,
  commands,
  SymbolInformation,
  SymbolKind,
  Location,
  ExtensionContext,
  Uri
} from 'vscode';
import { AppConfiguration } from './AppConfiguration';
import { MethodReferenceLens } from './MethodReferenceLens';
import {
  Project,
  ClassDeclaration,
  ClassMemberTypes,
  InterfaceDeclaration,
  ExpressionWithTypeArguments,
  PropertySignature,
  MethodSignature,
  PropertyDeclaration,
  MethodDeclaration,
  SyntaxKind,
  TypeElementTypes
} from 'ts-simple-ast';

import minimatch = require('minimatch');
import * as enu from 'linq';

const standardSymbolKindSet = [
  SymbolKind.Method,
  SymbolKind.Function,
  SymbolKind.Property,
  SymbolKind.Class,
  SymbolKind.Interface
];
const cssSymbolKindSet = [
  SymbolKind.Method,
  SymbolKind.Function,
  SymbolKind.Property,
  SymbolKind.Variable
];

const SymbolKindInterst = {
  scss: cssSymbolKindSet,
  less: cssSymbolKindSet,
  ts: standardSymbolKindSet,
  js: standardSymbolKindSet
};

export class TSDecoration {
  ranges: Range[] = [];
  decoration: TextEditorDecorationType;
}

export class TSCodeLensProvider implements CodeLensProvider {
  config: AppConfiguration;

  private unusedDecorations: Map<string, TSDecoration> = new Map<
    string,
    TSDecoration
  >();

  private overrideDecorations: Map<string, TSDecoration> = new Map<
    string,
    TSDecoration
  >();

  classCache: Map<string, Array<ClassMemberTypes | TypeElementTypes>> = new Map<
    string,
    Array<ClassMemberTypes | TypeElementTypes>
  >();
  interfaces: Array<InterfaceDeclaration>;

  constructor(private context: ExtensionContext) {
    this.config = new AppConfiguration();
    this.interfaces = enu
      .from(this.config.project.getSourceFiles())
      .select(x => x.getInterfaces())
      .where(x => x.length > 0)
      .selectMany(x => x)
      .toArray();
  }

  clearDecorations(set: Map<string, TSDecoration>) {
    var editor = window.activeTextEditor;
    if (editor != null) {
      var keys = [];
      set.forEach((overrideDecoration, key) => {
        if (key.startsWith(editor.document.uri.fsPath)) {
          var decoration = overrideDecoration.decoration;
          var ranges = overrideDecoration.ranges;
          if (ranges.length > 0 && decoration) {
            decoration.dispose();
            decoration = null;
            keys.push(key);
          }
        }
      });

      keys.forEach(x => set.delete(x));
    }
  }

  reinitDecorations() {
    var settings = this.config.settings;
    var editor = window.activeTextEditor;
    if (editor != null) {
      this.clearDecorations(this.unusedDecorations);
      this.clearDecorations(this.overrideDecorations);

      // if (settings.decorateunused) {
      //   var unusedDecoration = new TSDecoration();
      //   this.unusedDecorations.set(
      //     editor.document.uri.fsPath,
      //     unusedDecoration
      //   );
      //   unusedDecoration.decoration = vscode.window.createTextEditorDecorationType(
      //     {
      //       color: settings.unusedcolor
      //     }
      //   );
      // }
    }
  }
  provideCodeLenses(
    document: TextDocument,
    token: CancellationToken
  ): CodeLens[] | Thenable<CodeLens[]> {
    var settings = this.config.settings;

    if (!this.config.TSLensEnabled) {
      return;
    }

    this.reinitDecorations();

    return commands
      .executeCommand<SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      )
      .then(symbolInformations => {
        var usedPositions = [];
        return symbolInformations
          .filter(symbolInformation => {
            var knownInterest: SymbolKind[] = <SymbolKind[]>(
              SymbolKindInterst[document.languageId]
            );
            if (!knownInterest) {
              knownInterest = standardSymbolKindSet;
            }
            return knownInterest.indexOf(symbolInformation.kind) > -1;
          })
          .map(symbolInformation => {
            var index;
            var lineIndex = symbolInformation.location.range.start.line;
            do {
              var range = symbolInformation.location.range;
              var line = document.lineAt(lineIndex);
              index = line.text.lastIndexOf(symbolInformation.name);
              if (index > -1) {
                break;
              }
              lineIndex++;
            } while (lineIndex <= symbolInformation.location.range.end.line);

            if (symbolInformation.name == '<function>') {
              range = null;
            } else if (index == -1) {
              var line = document.lineAt(
                symbolInformation.location.range.start.line
              );
              index = line.firstNonWhitespaceCharacterIndex;
              lineIndex = range.start.line;
              range = new Range(lineIndex, index, lineIndex, 90000);
            } else {
              range = new Range(
                lineIndex,
                index,
                lineIndex,
                index + symbolInformation.name.length
              );
            }
            if (range) {
              var position = document.offsetAt(range.start);
              if (!usedPositions[position]) {
                usedPositions[position] = 1;
                return new MethodReferenceLens(
                  new Range(range.start, range.end),
                  document.uri
                );
              }
            }
          })
          .filter(item => item != null);
      });
  }

  findInterfaceByName(x: ExpressionWithTypeArguments) {
    return enu
      .from(this.interfaces)
      .firstOrDefault(z => z.getName() === this.getInterfaceName(x));
  }

  updateInterfaces(locations: Location[]): boolean {
    let isChanged = false;
    enu
      .from(locations)
      .select(x => x.uri.fsPath)
      .distinct()
      .forEach(p => {
        const interfaces = this.getInterfacesAtPath(p);
        const path = p.replace(/\\/g, '/');
        if (
          !enu
            .from(this.interfaces)
            .any(x => x.getSourceFile().getFilePath() === path)
        ) {
          this.interfaces.push(...interfaces);
          isChanged = true;
        }
      });

    return isChanged;
  }

  getClassImplements(cl: ClassDeclaration) {
    return enu
      .from(cl.getImplements())
      .select(x => this.findInterfaceByName(x))
      .where(x => !!x)
      .select(x => {
        return [x, ...x.getExtends().map(z => this.findInterfaceByName(z))];
      })
      .selectMany(x => x)
      .where(x => !!x)
      .select(x => {
        let mem = x.getMembers();
        mem.forEach(z => (z['interface'] = x));
        return mem;
      })
      .selectMany(x => x)
      .toArray();
  }

  getClassMembers(
    cl: ClassDeclaration,
    arr?: Array<ClassMemberTypes | TypeElementTypes>
  ): Array<ClassMemberTypes | TypeElementTypes> {
    arr = arr || this.getClassImplements(cl);
    const bc = cl.getBaseClass();
    if (bc) {
      const methods = bc.getMembers();

      methods.forEach(x => (x['baseClass'] = bc));
      arr.push(
        ...this.getClassImplements(bc),
        ...methods,
        ...this.getClassMembers(bc, methods)
      );

      return arr;
    } else {
      return this.getClassImplements(cl);
    }
  }

  getInterfacesAtPath(path: string): InterfaceDeclaration[] {
    const file = this.config.project.getSourceFile(path);

    return enu
      .from(file.getNamespaces())
      .select(x => x.getInterfaces())
      .selectMany(x => x)
      .concat(file.getInterfaces())
      .toArray();
  }

  getInterfaceName(f: ExpressionWithTypeArguments) {
    if (f.compilerNode.expression['name']) {
      return f.compilerNode.expression['name'].escapedText.trim();
    } else if (f.compilerNode.expression['escapedText']) {
      return f.compilerNode.expression['escapedText'].trim();
    } else {
      return f.compilerNode.expression.getText().trim();
    }
  }

  async resolveCodeLens(
    codeLens: CodeLens,
    token: CancellationToken
  ): Promise<any> {
    if (codeLens instanceof MethodReferenceLens) {
      const file = this.config.project.getSourceFile(
        window.activeTextEditor.document.fileName
      );

      const res = await Promise.all([
        commands.executeCommand<Location[]>(
          'vscode.executeReferenceProvider',
          codeLens.uri,
          codeLens.range.start
        ),
        commands.executeCommand<SymbolInformation[]>(
          'vscode.executeDocumentSymbolProvider',
          codeLens.uri
        )
      ]);

      const locations = res[0];
      const symbols = res[1];

      var settings = this.config.settings;
      var filteredLocations = locations;
      if (settings.excludeself) {
        filteredLocations = locations.filter(
          location => !location.range.isEqual(codeLens.range)
        );
      }

      const blackboxList = this.config.settings.blackbox || [];
      const nonBlackBoxedLocations = filteredLocations.filter(location => {
        const fileName = location.uri.path;
        return !blackboxList.some(pattern => {
          return new minimatch.Minimatch(pattern).match(fileName);
        });
      });

      var isSameDocument = codeLens.uri == window.activeTextEditor.document.uri;
      var message;
      var amount = nonBlackBoxedLocations.length;
      if (amount == 0) {
        message = settings.noreferences;
        var name = isSameDocument
          ? window.activeTextEditor.document.getText(codeLens.range)
          : '';
        message = message.replace('{0}', name + '');
      } else if (amount == 1) {
        message = settings.singular;
        message = message.replace('{0}', amount + '');
      } else {
        message = settings.plural;
        message = message.replace('{0}', amount + '');
      }

      let isInherited = false;
      let inheritedBase = '';

      const testM = window.activeTextEditor.document.getText(codeLens.range);

      const isChanged = this.updateInterfaces(nonBlackBoxedLocations);

      const filtered = symbols.find(
        x => x.location.range.contains(codeLens.range) && testM === x.name
      );

      if (this.config.project) {
        if (
          filtered.kind === SymbolKind.Method ||
          filtered.kind === SymbolKind.Field ||
          filtered.kind === SymbolKind.Property
        ) {
          var cl = file.getClass(filtered.containerName);

          if (cl) {
            let members = [];
            const key = `${cl.getName()}_${cl.getSourceFile().getFilePath()}`;
            if (this.classCache.has(key) && !isChanged) {
              members = this.classCache.get(key);
            } else {
              members = this.getClassMembers(cl);
              this.classCache.set(key, members);
            }

            const classMembers = members.filter(
              x =>
                x instanceof PropertyDeclaration ||
                x instanceof MethodDeclaration
            ) as Array<PropertyDeclaration | MethodDeclaration>;

            const interfaceMembers = members.filter(
              x =>
                x instanceof PropertySignature || x instanceof MethodSignature
            ) as Array<PropertySignature | MethodSignature>;

            const classInd = classMembers
              .filter(x => x.getName() === testM)
              .map(x => (x['baseClass'] as ClassDeclaration).getName());
            const interfaceInd = interfaceMembers
              .filter(x => x.getName() === testM)
              .map(x => (x['interface'] as InterfaceDeclaration).getName());

            const isClassed = classInd.length > 0;
            const isInterface = interfaceInd.length > 0;

            if (!isClassed && !isInterface) {
              const keysForDelete = [];
              this.overrideDecorations.forEach((value, key, x) => {
                if (
                  key.startsWith(codeLens.uri.fsPath) &&
                  key.endsWith(`${codeLens.range.start.line}_${testM}`)
                ) {
                  value.decoration.dispose();
                  keysForDelete.push(key);
                }
              });
              keysForDelete.forEach(x => {
                this.overrideDecorations.get(x).decoration.dispose();
                this.overrideDecorations.delete(x);
              });
            }

            if (isClassed || isInterface) {
              var editor = window.activeTextEditor;
              if (editor != null) {
                const gutterType = isClassed
                  ? filtered.kind === SymbolKind.Method
                    ? 'methodEdit'
                    : 'fieldEdit'
                  : 'implementInterface';
                const key = `${codeLens.uri.fsPath}_${
                  codeLens.range.start.line
                }_${testM}`;

                if (this.overrideDecorations.has(key)) {
                  var decorationsForFile = this.overrideDecorations.get(key);

                  decorationsForFile.ranges = [codeLens.range];

                  // decorationsForFile.decoration.dispose();
                  // this.overrideDecorations.delete(key);
                } else {
                  var overrideDecoration = new TSDecoration();
                  this.overrideDecorations.set(key, overrideDecoration);

                  overrideDecoration.decoration = window.createTextEditorDecorationType(
                    {
                      backgroundColor: isClassed
                        ? filtered.kind === SymbolKind.Method
                          ? 'rgba(209, 0, 0, 0.35)'
                          : 'rgba(0, 123, 168, 0.35)'
                        : 'rgba(144, 192, 2, 0.35)',
                      gutterIconPath: this.context.asAbsolutePath(
                        `images/${gutterType}.svg`
                      )
                    }
                  );

                  overrideDecoration.ranges.push(codeLens.range);
                }

                isInherited = true;

                if (isClassed) {
                  inheritedBase = enu
                    .from(classInd)
                    .distinct()
                    .toJoinedString(' < ');
                }

                if (isInterface) {
                  inheritedBase += isClassed ? ' : ' : '';
                  inheritedBase += enu
                    .from(interfaceInd)
                    .distinct()
                    .toJoinedString(' : ');
                }
              }
            }
          }
        }
      }

      if (isInherited) {
        message += ' :: ' + inheritedBase;
      }

      if (
        amount == 0 &&
        filteredLocations.length == 0 &&
        isSameDocument &&
        settings.decorateunused
      ) {
        if (this.unusedDecorations.has(codeLens.uri.fsPath)) {
          var decorationsForFile = this.unusedDecorations.get(
            codeLens.uri.fsPath
          );
          decorationsForFile.ranges.push(codeLens.range);
        }
      }

      this.updateDecorations(codeLens.uri);

      const range = new Range(
        codeLens.range.start.line,
        codeLens.range.start.character,
        codeLens.range.end.line,
        codeLens.range.end.character
      );

      if (amount == 0 && filteredLocations.length != 0) {
        return new CodeLens(range, {
          command: '',
          title: settings.blackboxTitle
        });
      } else if (amount > 0) {
        return new CodeLens(range, {
          command: 'editor.action.showReferences',
          title: message,
          arguments: [
            codeLens.uri,
            codeLens.range.start,
            nonBlackBoxedLocations
          ]
        });
      } else {
        return new CodeLens(range, {
          command: 'editor.action.findReferences',
          title: message,
          arguments: [codeLens.uri, codeLens.range.start]
        });
      }
    }
  }
  updateDecorations(uri: Uri) {
    var isSameDocument = uri == window.activeTextEditor.document.uri;
    if (isSameDocument) {
      if (this.unusedDecorations.has(uri.fsPath)) {
        var unusedDecoration = this.unusedDecorations.get(uri.fsPath);
        var decoration = unusedDecoration.decoration;
        var unusedDecorations = unusedDecoration.ranges;
        window.activeTextEditor.setDecorations(decoration, unusedDecorations);
      }

      //this.clearDecorations(this.overrideDecorations);

      this.overrideDecorations.forEach((overrideDecoration, key) => {
        if (key.startsWith(uri.fsPath)) {
          var decoration = overrideDecoration.decoration;
          var overrideDecorations = overrideDecoration.ranges;
          window.activeTextEditor.setDecorations(
            decoration,
            overrideDecorations
          );
        }
      });
    }
  }
}
