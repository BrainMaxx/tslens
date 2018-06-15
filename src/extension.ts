'use strict';
import * as vscode from 'vscode';
import { TSCodeLensProvider } from './TSCodeLensProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new TSCodeLensProvider(context);

  function updateTextEditor() {
    const file = provider.config.project.getSourceFile(
      vscode.window.activeTextEditor.document.fileName
    );
    file.refreshFromFileSystem().then(() => triggerCodeLensComputation());    
    //this.clearDecorations(this.overrideDecorations);
  }

  
  const triggerCodeLensComputation = () => {
    // if (!vscode.window.activeTextEditor) return;
    // var end = vscode.window.activeTextEditor.selection.end;
    // vscode.window.activeTextEditor
    //   .edit(editbuilder => {
    //     editbuilder.insert(end, ' ');
    //   })
    //   .then(() => {
    //     commands.executeCommand('undo');
    //   });
  };
  const disposables: vscode.Disposable[] = context.subscriptions;
  const self = this;
  // disposables.push(
  //   commands.registerCommand('TSLens.toggle', () => {
  //     provider.config.TSLensEnabled = !provider.config.TSLensEnabled;
  //     triggerCodeLensComputation();
  //   })
  // );
  disposables.push(
    vscode.languages.registerCodeLensProvider({ pattern: '**/*.ts' }, provider)
  );
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateTextEditor();
        provider.updateDecorations(editor.document.uri);
      }
    }),
    vscode.workspace.onDidSaveTextDocument(updateTextEditor)
  );
}
