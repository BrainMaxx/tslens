import { HoverProvider, TextDocument, Position, CancellationToken, Hover } from "vscode";
import { TSCodeLensProvider } from "./TSCodeLensProvider";
import { AppConfiguration } from "../classes/AppConfiguration";

export class TSCodeHoverProvider implements HoverProvider {
    constructor(private config: AppConfiguration) {}
    provideHover(document: TextDocument, position: Position, token: CancellationToken): Hover | Thenable<Hover> {

        if(!this.config.settings.basePreviewOnHover) {
            return null;
        }

        let hover = null;

        const key = `${document.uri.fsPath}_${position.line}`;
        if(TSCodeLensProvider.methods.has(key)) {
            hover = new Hover({ language: 'typescript', value: TSCodeLensProvider.methods.get(key) }); 
        }
        
        
        return hover;
    }

}