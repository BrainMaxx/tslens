import { Utils } from './../classes/Utils';
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
  private overrideDecorations: Map<string, TSDecoration> = new Map<
    string,
    TSDecoration
  >();

  private classCache: Map<
    string,
    Array<ClassMemberTypes | TypeElementTypes>
  > = new Map<string, Array<ClassMemberTypes | TypeElementTypes>>();
  private interfaces: Array<InterfaceDeclaration>;
  public static methods: Map<string, string> = new Map();

  constructor(
    private config: AppConfiguration,
    private provider: (
      document: TextDocument,
      token: CancellationToken
    ) => PromiseLike<MethodReferenceLens[]>,
    private context: ExtensionContext
  ) {
    this.initInterfaces();
  }

  initInterfaces() {
    //setTimeout(() => {
    this.interfaces = Utils.getInterfaces(this.config.project);
    return true;
    //}, 1000);
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

  private recheckInterfaces: boolean = true;

  private async setupCodeLens(codeLens: CodeLens, analyzeSymbols?: boolean) {
    if (codeLens instanceof MethodReferenceLens) {
      const file = this.config.project.getSourceFile(
        window.activeTextEditor.document.fileName
      );

      if (!file) {
        return false;
      }

      TSCodeLensProvider.methods = new Map();
      const testName = window.activeTextEditor.document.getText(codeLens.range);

      let isChanged: boolean = codeLens.isChanged;
      let symbol: SymbolInformation = codeLens.symbolInfo;

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

        this.recheckInterfaces &&
          this.initInterfaces() &&
          (this.recheckInterfaces = false);

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

        isChanged = Utils.updateInterfaces(this.config.project, [
          ...nonBlackBoxedLocations.map(x => x.uri.fsPath),
          ...file
            .getImportDeclarations()
            .map(x => {
              const fp = x.getModuleSpecifierSourceFile();
              return fp && fp.getFilePath();
            })
            .filter(x => !!x)
        ]);

        symbol = symbols.find(
          x =>
            x.location.range.start.line === codeLens.range.start.line &&
            testName === x.name
        );
      }

      if (this.config.project && symbol) {
        if (
          symbol.kind === SymbolKind.Method ||
          symbol.kind === SymbolKind.Field ||
          symbol.kind === SymbolKind.Property
        ) {
          const ns = file.getNamespaces();
          let parentClass;
          if (ns.length > 0) {
            parentClass = enu
              .from(ns)
              .select(x => x.getClass(symbol.containerName))
              .where(x => !!x)
              .firstOrDefault();
          } else {
            parentClass = file.getClass(symbol.containerName);
          }

          if (parentClass) {
            let members = [];
            const key = `${parentClass.getName()}_${parentClass
              .getSourceFile()
              .getFilePath()}`;
            if (this.classCache.has(key) && !isChanged) {
              members = this.classCache.get(key);
            } else {
              try {
                members = Utils.getClassMembers(this.interfaces, parentClass);
                this.classCache.set(key, members);
              } catch (error) {
                console.log(error);
              }
            }

            //let members = Utils.getClassMembers(this.interfaces, parentClass);
            const classMembers = members.filter(
              x =>
                x instanceof PropertyDeclaration ||
                x instanceof MethodDeclaration
            ) as Array<PropertyDeclaration | MethodDeclaration>;

            const interfaceMembers = members.filter(
              x =>
                x instanceof PropertySignature || x instanceof MethodSignature
            ) as Array<PropertySignature | MethodSignature>;

            const classInd = classMembers.filter(x => x.getName() === testName);
            const interfaceInd = interfaceMembers.filter(
              x => x.getName() === testName
            );

            const isClassed = classInd.length > 0;
            const isInterface = interfaceInd.length > 0;

            if (symbol.kind === SymbolKind.Method && isClassed) {
              const key = `${symbol.location.uri.fsPath}_${
                symbol.location.range.start.line
              }`;
              TSCodeLensProvider.methods.set(key, classInd[0].getText());
            }

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
              codeLens.testName = testName;
              codeLens.symbolInfo = symbol;
              codeLens.isChanged = isChanged;
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  provideCodeLenses(document: TextDocument, token: CancellationToken): any {
    return (this.provider(document, token) as Thenable<
      MethodReferenceLens[]
    >).then(async codeLenses => {
      if (!this.config.settings.showBaseMemberInfo) {
        return [];
      }

      var filterAsync = (array, filter) =>
        Promise.all(array.map(entry => filter(entry))).then(bits =>
          array.filter(entry => bits.shift())
        );

      const f: MethodReferenceLens[] = await filterAsync(codeLenses, x =>
        this.setupCodeLens(x, true)
      );
      this.clearDecorations(this.overrideDecorations);
      return f;
    });
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
        const symbol = codeLens.symbolInfo;
        const testM = codeLens.testName;
        const classInd = codeLens.classInd;
        const interfaceInd = codeLens.interfaceInd;

        if (isClassed || isInterface) {
          var editor = window.activeTextEditor;
          if (editor != null) {
            const gutterType = isClassed
              ? symbol.kind === SymbolKind.Method
                ? isInterface
                  ? 'interfaceMethodEdit'
                  : 'methodEdit'
                : isInterface
                  ? 'interfaceFieldEdit'
                  : 'fieldEdit'
              : 'implementInterface';
            const key = `${codeLens.uri.fsPath}_${
              codeLens.range.start.line
            }_${testM}`;

            let overrideDecoration;
            if (this.overrideDecorations.has(key)) {
              overrideDecoration = this.overrideDecorations.get(key);
              overrideDecoration.ranges = [codeLens.range];
            } else {
              overrideDecoration = new TSDecoration();
              this.overrideDecorations.set(key, overrideDecoration);

              overrideDecoration.decoration = window.createTextEditorDecorationType(
                {
                  backgroundColor: isClassed
                    ? symbol.kind === SymbolKind.Method
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
            var inheritInfo = '';
            if (isClassed) {
              inheritInfo = enu
                .from(classInd)
                .distinct()
                .select(x => (x['baseClass'] as ClassDeclaration).getName())
                .toJoinedString(' < ');
            }

            if (isInterface) {
              inheritInfo += isClassed ? ' : ' : '';
              inheritInfo += enu
                .from(interfaceInd)
                .distinct()
                .select(x => (x['interface'] as InterfaceDeclaration).getName())
                .toJoinedString(' : ');
            }

            overrideDecoration.isClassMember = isClassed;
            overrideDecoration.isInterfaceMember = isInterface;
            overrideDecoration.inheritInfo = inheritInfo;

            this.updateDecorations(codeLens.uri);

            const ref = isClassed ? classInd[0] : interfaceInd[0];
            const firstRef = isClassed ? ref['baseClass'] : ref['interface'];
            const file = firstRef.getSourceFile();

            return new CodeLens(codeLens.range, {
              command: 'tslens.gotoFile',
              arguments: [
                file.getFilePath(),
                file.getLineNumberAtPos(ref.getPos())
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
