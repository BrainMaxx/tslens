import { CodeLens } from "vscode";
import {
    Range,
    Command,
    Uri
  } from 'vscode';
import { TSDecoration } from "./TSDecoration";
export class MethodReferenceLens extends CodeLens {
  uri: Uri;
  decoration: TSDecoration;
  isClassed: any;
  isInterface: any;
  symbolInfo: any;
  testName: any;
  classInd: any;
  interfaceInd: any;
  isChanged: boolean;

  constructor(range: Range, uri: Uri, command?: Command, decoration?: TSDecoration) {
    super(range, command);
    this.uri = uri;
    this.decoration = decoration;
  }
}