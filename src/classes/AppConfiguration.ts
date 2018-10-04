import { TSLensConfiguration } from './TSLensConfiguration';
import Project, { Options } from 'ts-simple-ast';
import * as vscode from 'vscode';
import fs = require('fs');


export class AppConfiguration {
  private cachedSettings: TSLensConfiguration;

  public readonly project: Project;

  constructor() {
    if (vscode.workspace.rootPath) {

      let options: Options = {
        tsConfigFilePath: this.settings.tsConfigPath || (vscode.workspace.rootPath + '/tsconfig.json'),
        addFilesFromTsConfig: true
      };

      const exists = fs.existsSync(options.tsConfigFilePath); 
      if(exists) {
        this.project = new Project(options);
      } else {
        this.project = new Project();
      }
    }
    vscode.workspace.onDidChangeConfiguration(e => {
      this.cachedSettings = null;
    });
  }

  get extensionName() {
    return 'tslens';
  }

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
