'use strict';
import {
  commands,
  window,
  ExtensionContext,
  languages,
  Disposable,
  workspace,
  SymbolInformation,
  SymbolKind,
  TextDocument,
  CancellationToken,
  CodeLens,
  Range,
  Uri,
  TextEditorRevealType
} from 'vscode';
import { ClassDeclaration, SyntaxKind } from 'ts-simple-ast';
import { MethodReferenceLens } from './classes/MethodReferenceLens';
import { TSCodeRefProvider } from './providers/TSCodeRefProvider';
import { TSCodeLensProvider } from './providers/TSCodeLensProvider';

export function provider(
  document: TextDocument,
  token: CancellationToken
): CodeLens[] | PromiseLike<CodeLens[]> {

  try {
    return commands
      .executeCommand<SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      )
      .then(symbolInformations => {
        var usedPositions = [];
        return symbolInformations
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
          .filter(item => !!item);
      });
  } catch (error) {
    console.log(error);
    return [];
  }
}

export function activate(context: ExtensionContext) {
  const refProvider = new TSCodeLensProvider(provider, context);
  const ref2Provider = new TSCodeRefProvider(provider, context);

  function updateTextEditor() {
    const filePath = window.activeTextEditor.document.fileName;
    const file = refProvider.config.project.getSourceFile(filePath);

    if (file) {
      const del = [];
      refProvider.classCache.forEach((v, k, map) => {
        if (k.endsWith(filePath.replace(/\\/g, '/').substring(1))) {
          del.push(k);
        }
      });
      del.forEach(x => refProvider.classCache.delete(x));

      file.refreshFromFileSystem();
    }
    //refProvider.clearDecorations(refProvider.overrideDecorations);
  }

  const triggerCodeLensComputation = () => {
    // if (!window.activeTextEditor) return;
    // var end = window.activeTextEditor.selection.end;
    // window.activeTextEditor
    //   .edit(editbuilder => {
    //     editbuilder.insert(end, ' ');
    //   })
    //   .then(() => {
    //     commands.executeCommand('undo');
    //   });
  };
  const disposables: Disposable[] = context.subscriptions;
  const self = this;
  disposables.push(
    //languages.registerCodeLensProvider({ pattern: '**/*.ts' }, navProvider),
    languages.registerCodeLensProvider({ pattern: '**/*.ts' }, refProvider),
    languages.registerCodeLensProvider({ pattern: '**/*.ts' }, ref2Provider)
  );
  disposables.push(
    window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateTextEditor();
        refProvider.updateDecorations(editor.document.uri);
      }
    }),
    workspace.onDidSaveTextDocument(updateTextEditor)
  );
  disposables.push(
    commands.registerCommand('tslens.update', () => {
      triggerCodeLensComputation();
    })
  );
  disposables.push(
    commands.registerCommand(
      'tslens.gotoFile',
      (filePath: string, line: number) => {
        workspace.openTextDocument(filePath).then(doc => {
          window
            .showTextDocument(doc)
            .then(e =>
              e.revealRange(
                new Range(line, 0, line + 1, 0),
                TextEditorRevealType.InCenter
              )
            );
        });
      }
    )
  );
  disposables.push(
    commands.registerCommand('tslens.showOverrides', async () => {
      var pos = window.activeTextEditor.selection.active;
      const f = refProvider.config.project.getSourceFile(
        window.activeTextEditor.document.fileName
      );

      const symbols = await commands.executeCommand<SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        window.activeTextEditor.document.uri
      );

      const filtered = symbols.find(x => x.location.range.contains(pos));

      let m = [];
      if (filtered && filtered.kind === SymbolKind.Class) {
        const cl = f.getClass(filtered.name);
        let bc: ClassDeclaration;
        if (cl) {
          bc = cl.getBaseClass();
          const methods = cl.getMethods().map(z => z.getName());
          const props = cl.getProperties().map(z => z.getName());

          if (bc) {
            m.push(
              ...bc
                .getProperties()
                .filter(
                  x =>
                    !x.hasModifier(SyntaxKind.PrivateKeyword) &&
                    props.indexOf(x.getName()) === -1
                )
                .map(x => {
                  return { label: x.getName(), description: 'Property' };
                })
            );
            m.push(
              ...bc
                .getMethods()
                .filter(
                  x =>
                    !x.hasModifier(SyntaxKind.PrivateKeyword) &&
                    methods.indexOf(x.getName()) === -1
                )
                .map(x => {
                  return { label: x.getName(), description: 'Method' };
                })
            );
          }
        }

        if (m.length > 0) {
          window
            .showQuickPick(m)
            .then((x: { label: string; description: string }) => {
              if (x) {
                if (x.description === 'Method') {
                  const method = bc.getMethod(x.label);
                  if (method) {
                    const params = method.getParameters().map(x => {
                      return {
                        name: x.getName(),
                        type: x.getType().getText()
                      };
                    });
                    const name = method.getName();
                    cl.addMethod({
                      name: name,
                      bodyText: `return super.${name}(${params
                        .map(z => z.name)
                        .join(', ')});`,
                      parameters: params,
                      returnType: method.getReturnType().getText()
                    });
                    f.save();
                  }
                }

                if (x.description === 'Property') {
                  const prop = bc.getProperty(x.label);
                  if (prop) {
                    const name = prop.getName();
                    cl.addProperty({
                      name: name,
                      type: prop.getType().getText()
                    });
                    f.save();
                  }
                }
              }
            });
        } else {
          window.showWarningMessage(
            'No override candidates found for ' + filtered.name
          );
        }
      }
    })
  );
}
