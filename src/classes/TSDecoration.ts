import { Range, TextEditorDecorationType } from "vscode";

export class TSDecoration {
    ranges: Range[] = [];
    decoration: TextEditorDecorationType;
    isClassMember: boolean;
    isInterfaceMember: boolean;
    inheritInfo: string;
  }