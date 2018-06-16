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
  MethodDeclaration
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

  constructor(private context: ExtensionContext) {
    this.config = new AppConfiguration();
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

  getClassMembers(cl: ClassDeclaration, arr?: ClassMemberTypes[]) {
    arr = arr || [];
    const bc = cl.getBaseClass();
    if (bc) {
      const methods = bc.getMembers();
      methods.forEach(x => (x['baseClass'] = bc));
      arr.push(...methods, ...this.getClassMembers(bc, methods));
      return arr;
    } else {
      return [];
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

  getImplemetsMembers(
    locations: Location[],
    filters?: ExpressionWithTypeArguments[]
  ): Array<PropertySignature | MethodSignature> {
    const allInterfaces = enu
      .from(locations)
      .select(x => x.uri.fsPath)
      .distinct()
      .select(p => {
        const interfaces = this.getInterfacesAtPath(p);
        return interfaces;
      })
      .selectMany(x => x)
      .distinct(x => x.getName());

    let members = allInterfaces
      .select(x => {
        let imembers = x.getMembers();
        imembers = imembers.filter(
          f => f instanceof PropertySignature || f instanceof MethodSignature
        );
        imembers.forEach(m => (m['interface'] = x));
        return imembers as Array<PropertySignature | MethodSignature>;
      })
      .selectMany(x => x);

    const names = filters.map(f => {
      if(f.compilerNode.expression['name']) {
        return f.compilerNode.expression['name'].escapedText.trim();
      } else {
        return f.compilerNode.getText().trim();
      }
    });

    // var includes = enu.from(members).where(x => names.indexOf((x['interface'] as InterfaceDeclaration).getName()) > -1)
    // .select(x => {
    //   const intf = x['interface'] as InterfaceDeclaration;
    //   return [intf.getName(), ...intf.getExtends().map(x => x.compilerNode.expression.getText().trim())]
    // })
    // .selectMany(x => x)
    // .distinct();

    var includes = allInterfaces
      .where(x => names.indexOf(x.getName()) > -1)
      .select(intf => {
        return [
          intf.getName(),
          ...intf
            .getExtends()
            .map(x => x.compilerNode.expression.getText().trim())
        ];
      })
      .selectMany(x => x)
      .distinct();

    members = members.where(x => {
      const intf = x['interface'] as InterfaceDeclaration;
      return includes.any(x => x === intf.getName());
    });

    return members.toArray();
  }

  // extractClassInfo(file: SourceFile, className: string) {
  //   var cl = file.getClass(className);

  //   if (cl) {
  //     const bm = this.getClassMembers(cl).filter(
  //       x =>
  //         x instanceof PropertyDeclaration ||
  //         x instanceof MethodDeclaration
  //     ) as Array<PropertyDeclaration | MethodDeclaration>;
  //     const names = bm.map(x => x.getName());

  //     const members = [];
  //     const impl = cl.getImplements();
  //     for (let index = 0; index < impl.length; index++) {
  //       const i = impl[index];

  //       enu
  //         .from(nonBlackBoxedLocations)
  //         .distinct(x => x.uri.fsPath)
  //         .forEach(p => {
  //           const interfaces = project
  //             .getSourceFile(p.uri.fsPath)
  //             .getInterfaces();
  //           interfaces.forEach(x => {
  //             const imembers = x.getMembers();
  //             imembers.forEach(m => (m['interface'] = x));
  //             members.push(...imembers);
  //           });
  //         });
  //     }

  //     const isInterface =
  //       members.map(x => x.getName()).indexOf(testM) > -1;
  //     const isClassed = names.indexOf(testM) > -1;

  //     if (!isClassed && !isInterface) {
  //       const keysForDelete = [];
  //       this.overrideDecorations.forEach((value, key, x) => {
  //         if (
  //           key.startsWith(codeLens.uri.fsPath) &&
  //           key.endsWith(testM)
  //         ) {
  //           value.decoration.dispose();
  //           keysForDelete.push(key);
  //         }
  //       });
  //       keysForDelete.forEach(x =>
  //         this.overrideDecorations.delete(x)
  //       );
  //     }
  // }

  async resolveCodeLens(
    codeLens: CodeLens,
    token: CancellationToken
  ): Promise<any> {
    if (codeLens instanceof MethodReferenceLens) {
      const file = this.config.project.getSourceFile(
        window.activeTextEditor.document.fileName
      );

      // const locations = await commands.executeCommand<Location[]>('vscode.executeReferenceProvider', codeLens.uri, codeLens.range.start);
      // const symbols = await commands.executeCommand<SymbolInformation[]>('vscode.executeDocumentSymbolProvider', vscode.window.activeTextEditor.document.uri);

      const res = await Promise.all([
        commands.executeCommand<Location[]>(
          'vscode.executeReferenceProvider',
          codeLens.uri,
          codeLens.range.start
        ),
        commands.executeCommand<SymbolInformation[]>(
          'vscode.executeDocumentSymbolProvider',
          window.activeTextEditor.document.uri
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
            const bm = this.getClassMembers(cl).filter(
              x =>
                x instanceof PropertyDeclaration ||
                x instanceof MethodDeclaration
            ) as Array<PropertyDeclaration | MethodDeclaration>;
            const names = bm.map(x => x.getName());

            const impls = cl.getImplements();
            const members =
              impls.length > 0
                ? this.getImplemetsMembers(nonBlackBoxedLocations, impls)
                : [];

            const isInterface =
              members.map(x => x.getName()).indexOf(testM) > -1;
            const isClassed = names.indexOf(testM) > -1;

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
                const gutterType = isInterface
                  ? 'implementInterface'
                  : filtered.kind === SymbolKind.Method
                    ? 'methodEdit'
                    : 'fieldEdit';
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
                      backgroundColor: isInterface
                        ? 'rgba(144, 192, 2, 0.35)'
                        : filtered.kind === SymbolKind.Method
                          ? 'rgba(209, 0, 0, 0.35)'
                          : 'rgba(0, 123, 168, 0.35)',
                      gutterIconPath: this.context.asAbsolutePath(
                        `images/${gutterType}.svg`
                      )
                    }
                  );

                  overrideDecoration.ranges.push(codeLens.range);
                }

                isInherited = true;

                if (isInterface) {
                  inheritedBase = enu
                    .from(
                      members
                        .filter(x => x.getName() === testM)
                        .map(x =>
                          (x['interface'] as InterfaceDeclaration).getName()
                        )
                    )
                    .distinct()
                    .toJoinedString(' < ');
                } else if (isClassed) {
                  inheritedBase = enu
                    .from(
                      bm
                        .filter(x => x.getName() === testM)
                        .map(x =>
                          (x['baseClass'] as ClassDeclaration).getName()
                        )
                    )
                    .distinct()
                    .toJoinedString(' < ');
                }
              }
            }
          }
        }
      }

      //   let declar;
      //   switch(filtered.kind) {
      //     case SymbolKind.Class:
      //       declar = 'class';break;
      //       case SymbolKind.Interface:
      //       declar = 'interface';break;
      //       case SymbolKind.Method:
      //       declar = 'method';break;
      //   }
      //   const key = `${
      //     codeLens.uri.fsPath
      //   }_${codeLens.range.start.line}_${testM}`;
      //   if(declar && !this.overrideDecorations.has(key)) {

      //   var overrideDecoration = new TSDecoration();
      //   this.overrideDecorations.set(key, overrideDecoration);

      //   overrideDecoration.decoration = vscode.window.createTextEditorDecorationType(
      //     {
      //       gutterIconPath: context.asAbsolutePath(
      //         `images/${declar}.svg`
      //       )
      //     }
      //   );

      //   overrideDecoration.ranges.push(codeLens.range);
      // }

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
