import { MethodDeclaration } from 'ts-simple-ast';
import { SymbolKind } from "vscode";

export class TSLensConfiguration {
  public showReferences: boolean = true;
  public showBaseMemberInfo: boolean = true;

  public blackbox: string[] = [];
  public blackboxTitle: string = '<< called from blackbox >>';
  public excludeself: boolean = true;
  public singular: string = '{0} reference';
  public plural: string = '{0} references';
  public noreferences: string = 'no references found for {0}';
  public unusedcolor: string = '#999';
  public decorateunused: boolean = true;

  public methodOverrideColor: string = 'rgba(209,0,0,0.35)';
  public fieldOverrideColor: string = 'rgba(0, 123, 168, 0.35)';
  public interfaceImplementationColor: string = 'rgba(144, 192, 2, 0.35)';

  public referencesTypes: SymbolKind[] = [
    SymbolKind.File,
    SymbolKind.Module,
    SymbolKind.Namespace,
    SymbolKind.Package,
    SymbolKind.Class,
    SymbolKind.Method,
    SymbolKind.Property,
    SymbolKind.Field,
    SymbolKind.Constructor,
    SymbolKind.Enum,
    SymbolKind.Interface,
    SymbolKind.Function,
    SymbolKind.Variable,
    SymbolKind.Constant,
    SymbolKind.String,
    SymbolKind.Number,
    SymbolKind.Boolean,
    SymbolKind.Array,
    SymbolKind.Object,
    SymbolKind.Key,
    SymbolKind.Null];
}