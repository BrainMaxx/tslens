import { TSLensConfiguration } from './TSLensConfiguration';
import Project from 'ts-simple-ast';
import * as vscode from 'vscode';

export class AppConfiguration {
  private cachedSettings: TSLensConfiguration;

  public readonly project: Project;

  constructor() {
    if (vscode.workspace.rootPath) {
      this.project = new Project({
        tsConfigFilePath: vscode.workspace.rootPath + '/tsconfig.json',
        addFilesFromTsConfig: true
      });
    }
    vscode.workspace.onDidChangeConfiguration(e => {
      this.cachedSettings = null;
    });
  }

  get extensionName() {
    return 'TSLens';
  }

  public TSLensEnabled: boolean = true;

  get settings(): TSLensConfiguration {
    if (!this.cachedSettings) {
      var settings = vscode.workspace.getConfiguration(this.extensionName);
      this.cachedSettings = new TSLensConfiguration();
      for (var propertyName in this.cachedSettings) {
        if (settings.has(propertyName)) {
          this.cachedSettings[propertyName] = settings.get(propertyName);
        }
      }
    }
    return this.cachedSettings;
  }
}
