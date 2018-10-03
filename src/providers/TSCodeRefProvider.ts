import {
    CodeLensProvider,
    Range,
    window,
    TextDocument,
    CancellationToken,
    CodeLens,
    commands,
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
  
  export class TSCodeRefProvider implements CodeLensProvider {
    config: AppConfiguration;
    private unusedDecorations: Map<string, TSDecoration> = new Map<
      string,
      TSDecoration
    >();
    constructor(private provider: (document: TextDocument, token: CancellationToken) => PromiseLike<MethodReferenceLens[]>, private context: ExtensionContext) {
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
      }
    }
    provideCodeLenses(
      document: TextDocument,
      token: CancellationToken
    ): CodeLens[] | Thenable<CodeLens[]> {
      return this.config.settings.showReferences ? this.provider(document, token).then(x => {
        return x.filter(f => !!this.config.settings.referencesTypes.find(z => z === f.symbolInfo.kind));
      }) : [];
    }
    async resolveCodeLens(
      codeLens: CodeLens,
      token: CancellationToken
    ): Promise<any> {
      if (codeLens instanceof MethodReferenceLens) {
        const locations = await commands.executeCommand<Location[]>(
          'vscode.executeReferenceProvider',
          codeLens.uri,
          codeLens.range.start
        );
  
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
      }
    }
  }
  