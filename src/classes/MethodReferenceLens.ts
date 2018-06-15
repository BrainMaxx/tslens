import { CodeLens } from "vscode";
import {
    Range,
    Command,
    Uri
  } from 'vscode';

export class MethodReferenceLens extends CodeLens {
  uri: Uri;

  constructor(range: Range, uri: Uri, command?: Command) {
    super(range, command);
    this.uri = uri;
  }
}