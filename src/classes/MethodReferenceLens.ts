import { CodeLens, SymbolInformation } from "vscode";
import {
    Range,
    Command,
    Uri
  } from 'vscode';
import { TSDecoration } from "./TSDecoration";
import { MethodDeclaration, PropertyDeclaration, PropertySignature, MethodSignature } from "ts-simple-ast";
export class MethodReferenceLens extends CodeLens {
  uri: Uri;
  decoration: TSDecoration;
  isClassed: boolean;
  isInterface: boolean;
  symbolInfo: SymbolInformation;
  testName: string;
  classInd: Array<PropertyDeclaration | MethodDeclaration>;
  interfaceInd: Array<PropertySignature | MethodSignature>;
  isChanged: boolean;

  constructor(range: Range, uri: Uri, command?: Command, decoration?: TSDecoration, symbol?: SymbolInformation) {
    super(range, command);
    this.uri = uri;
    this.decoration = decoration;
    this.symbolInfo = symbol;
  }
}