'use strict';
import { TSCodeLensProvider } from './classes/TSCodeLensProvider';
import {
  commands,
  window,
  ExtensionContext,
  languages,
  Disposable,
  workspace,
  SymbolInformation,
  SymbolKind
} from 'vscode';
import { ClassDeclaration } from 'ts-simple-ast';

export function activate(context: ExtensionContext) {
  const provider = new TSCodeLensProvider(context);

  function updateTextEditor() {
    const file = provider.config.project.getSourceFile(
      window.activeTextEditor.document.fileName
    );
    file.refreshFromFileSystem().then(() => triggerCodeLensComputation());
    //this.clearDecorations(this.overrideDecorations);
  }

  const triggerCodeLensComputation = () => {
    if (!window.activeTextEditor) return;

    var end = window.activeTextEditor.selection.end;
    window.activeTextEditor
      .edit(editbuilder => {
        editbuilder.insert(end, ' ');
      })
      .then(() => {
        commands.executeCommand('undo');
      });
  };
  const disposables: Disposable[] = context.subscriptions;
  const self = this;
  disposables.push(
    languages.registerCodeLensProvider({ pattern: '**/*.ts' }, provider)
  );
  disposables.push(
    window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateTextEditor();
        provider.updateDecorations(editor.document.uri);
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
    commands.registerCommand('tslens.showOverrides', async () => {
      var pos = window.activeTextEditor.selection.active;
      const f = provider.config.project.getSourceFile(
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
          if (bc) {
            m.push(
              ...bc
                .getMethods()
                .filter(
                  x =>
                    cl
                      .getMethods()
                      .map(z => z.getName())
                      .indexOf(x.getName()) === -1
                )
                .map(x => { return { label: x.getName(), description: 'Method' }})
            );
            m.push(
              ...bc
                .getProperties()
                .filter(
                  x =>
                    cl
                      .getProperties()
                      .map(z => z.getName())
                      .indexOf(x.getName()) === -1
                )
                .map(x => { return { label: x.getName(), description: 'Property' }})
            );
          }
        }

        if (m.length > 0) {
          window.showQuickPick(m).then((x: { label: string, description: string }) => {
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
