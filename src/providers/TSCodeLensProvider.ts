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
import { AppConfiguration } from '../classes/AppConfiguration';
import { MethodReferenceLens } from '../classes/MethodReferenceLens';
import { TSDecoration } from '../classes/TSDecoration';

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

export class TSCodeLensProvider implements CodeLensProvider {
  config: AppConfiguration;
  overrideDecorations: Map<string, TSDecoration> = new Map<
    string,
    TSDecoration
    >();

  classCache: Map<string, Array<ClassMemberTypes | TypeElementTypes>> = new Map<
    string,
    Array<ClassMemberTypes | TypeElementTypes>
    >();
  interfaces: Array<InterfaceDeclaration>;

  constructor(
    private provider: (
      document: TextDocument,
      token: CancellationToken
    ) => CodeLens[] | PromiseLike<CodeLens[]>,
    private context: ExtensionContext
  ) {
    this.config = new AppConfiguration();
    this.initInterfaces();
  }

  initInterfaces() {
    this.interfaces = enu
    .from(this.config.project.getSourceFiles())
    .select(x => {
      const ns = x.getNamespaces();
      if (ns.length > 0) {
        return ns.map(m => m.getInterfaces());
      } else {
        return [x.getInterfaces()];
      }
    })
    .selectMany(x => x)
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
      this.clearDecorations(this.overrideDecorations);
    }
  }

  async setupCodeLens(codeLens: CodeLens, force?: boolean, analyzeSymbols?: boolean) {
    if (codeLens instanceof MethodReferenceLens) {
      const file = this.config.project.getSourceFile(
        window.activeTextEditor.document.fileName
      );
      const testM = window.activeTextEditor.document.getText(codeLens.range);

      let isChanged: boolean = codeLens.isChanged;
      let filtered: SymbolInformation = codeLens.symbolInfo;
      if (analyzeSymbols) {
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
        isChanged = this.updateInterfaces([
          ...nonBlackBoxedLocations.map(x => x.uri.fsPath),
          ...file
            .getImportDeclarations()
            .map(x => x.getModuleSpecifierSourceFile().getFilePath())
        ]);

        filtered = symbols.find(
          x =>
            x.location.range.start.line === codeLens.range.start.line &&
            testM === x.name
        );
      }

      if (this.config.project && filtered) {
        if (
          filtered.kind === SymbolKind.Method ||
          filtered.kind === SymbolKind.Field ||
          filtered.kind === SymbolKind.Property
        ) {

          const ns = file.getNamespaces();
          let cl;
          if (ns.length > 0) {
            cl = enu.from(ns).select(x => x.getClass(filtered.containerName)).where(x => !!x).firstOrDefault();
          } else {
            cl = file.getClass(filtered.containerName);
          }

          if (cl) {
            let members = [];
            const key = `${cl.getName()}_${cl.getSourceFile().getFilePath()}`;
            if (this.classCache.has(key) && !isChanged) {
              members = this.classCache.get(key);
            } else {
              try {
                members = this.getClassMembers(cl);
                this.classCache.set(key, members);
              } catch (error) {
                console.log(error);
              }
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

            const classInd = classMembers.filter(x => x.getName() === testM);
            const interfaceInd = interfaceMembers.filter(
              x => x.getName() === testM
            );

            const isClassed = classInd.length > 0;
            const isInterface = interfaceInd.length > 0;

            // if (force && !isClassed && !isInterface) {
            //   const keysForDelete = [];
            //   this.overrideDecorations.forEach((value, key, x) => {
            //     if (
            //       key.startsWith(codeLens.uri.fsPath) &&
            //     key.endsWith(`${testM}`)
            //     ) {
            //       value.decoration.dispose();
            //       keysForDelete.push(key);
            //     }
            //   });
            //   keysForDelete.forEach(x => {
            //     this.overrideDecorations.delete(x);
            //   });
            // }

            if (isClassed || isInterface) {
              codeLens.isClassed = isClassed;
              codeLens.isInterface = isInterface;
              codeLens.interfaceInd = interfaceInd;
              codeLens.classInd = classInd;
              codeLens.testName = testM;
              codeLens.symbolInfo = filtered;
              codeLens.isChanged = isChanged;
              return true;
            }
          }
        }
      }
    }

    return false;
  }


  findInterfaceByName(x: ExpressionWithTypeArguments) {
    const iname = this.getInterfaceName(x);
    return enu.from(this.interfaces).firstOrDefault(z => {
      try {
        return z.getName() === iname;
      } catch (error) {
        return false;
      }
    });
  }

  updateInterfaces(locations: string[]): boolean {
    let isChanged = false;
    enu
      .from(locations)
      .distinct()
      .forEach(p => {
        const interfaces = this.getInterfacesAtPath(p);
        const path = p.replace(/\\/g, '/');
        if (
          !enu
            .from(this.interfaces)
            .any(x => x.getSourceFile().getFilePath() === path) &&
          interfaces.length > 0
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

  provideCodeLenses(document: TextDocument, token: CancellationToken): any {
    return (this.provider(document, token) as Thenable<MethodReferenceLens[]>).then(
      async codeLenses => {

        if (!this.config.settings.showBaseMemberInfo) {
          return [];
        }

        var filterAsync = (array, filter) =>
          Promise.all(array.map(entry => filter(entry))).then(bits =>
            array.filter(entry => bits.shift())
          );

        const f: MethodReferenceLens[] = await filterAsync(codeLenses, x => this.setupCodeLens(x, true, true));
        this.clearDecorations(this.overrideDecorations);
        return f;
      }
    );
  }

  async resolveCodeLens(
    codeLens: CodeLens,
    token: CancellationToken
  ): Promise<any> {
    if (codeLens instanceof MethodReferenceLens) {
      const isReady = await this.setupCodeLens(codeLens);

      if (isReady) {
        const isClassed = codeLens.isClassed;
        const isInterface = codeLens.isInterface;
        const filtered = codeLens.symbolInfo;
        const testM = codeLens.testName;
        const classInd = codeLens.classInd;
        const interfaceInd = codeLens.interfaceInd;

        if (isClassed || isInterface) {
          var editor = window.activeTextEditor;
          if (editor != null) {
            const gutterType = isClassed
              ? filtered.kind === SymbolKind.Method
                ? (isInterface ? 'interfaceMethodEdit' : 'methodEdit')
                : (isInterface ? 'interfaceFieldEdit' : 'fieldEdit')
              : 'implementInterface';
            const key = `${codeLens.uri.fsPath}_${
              codeLens.range.start.line
              }_${testM}`;

            let overrideDecoration;
            if (this.overrideDecorations.has(key)) {
              overrideDecoration = this.overrideDecorations.get(key);

              overrideDecoration.ranges = [codeLens.range];

              // decorationsForFile.decoration.dispose();
              // this.overrideDecorations.delete(key);
            } else {
              overrideDecoration = new TSDecoration();
              this.overrideDecorations.set(key, overrideDecoration);

              overrideDecoration.decoration = window.createTextEditorDecorationType(
                {
                  backgroundColor: isClassed
                    ? filtered.kind === SymbolKind.Method
                      ? this.config.settings.methodOverrideColor
                      : this.config.settings.fieldOverrideColor
                    : this.config.settings.interfaceImplementationColor,
                  gutterIconPath: this.context.asAbsolutePath(
                    `images/${gutterType}.svg`
                  )
                }
              );

              overrideDecoration.ranges.push(codeLens.range);
            }
            var inheritedBase = '';
            if (isClassed) {
              inheritedBase = enu
                .from(classInd)
                .distinct()
                .select(x => (x['baseClass'] as ClassDeclaration).getName())
                .toJoinedString(' < ');
            }

            if (isInterface) {
              inheritedBase += isClassed ? ' : ' : '';
              inheritedBase += enu
                .from(interfaceInd)
                .distinct()
                .select(x => (x['interface'] as InterfaceDeclaration).getName())
                .toJoinedString(' : ');
            }

            overrideDecoration.isClassMember = isClassed;
            overrideDecoration.isInterfaceMember = isInterface;
            overrideDecoration.inheritInfo = inheritedBase;

            this.updateDecorations(codeLens.uri);

            const ref = isClassed ? classInd[0] : interfaceInd[0];
            const firstRef = isClassed ? ref['baseClass'] : ref['interface'];
            const file = firstRef.getSourceFile();
            return new CodeLens(codeLens.range, {
              command: 'tslens.gotoFile',
              arguments: [
                file.getFilePath(),
                file.getLineNumberFromPos(ref.getPos())
              ],
              title: overrideDecoration.inheritInfo
            });
          }
        }
      }

      return new CodeLens(codeLens.range, {
        command: '',
        title: ''
      });
    }
  }
  updateDecorations(uri: Uri) {
    var isSameDocument = uri == window.activeTextEditor.document.uri;
    if (isSameDocument) {
      this.overrideDecorations.forEach((overrideDecoration, key) => {
        if (key.startsWith(uri.fsPath)) {
          var decoration = overrideDecoration.decoration;
          var ranges = overrideDecoration.ranges;
          window.activeTextEditor.setDecorations(decoration, ranges);
        }
      });
    }
  }
}
