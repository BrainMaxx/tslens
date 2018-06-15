export class TSLensConfiguration {
    public blackbox: string[] = [];
    public blackboxTitle: string = '<< called from blackbox >>';
    public excludeself: boolean = true;
    public singular: string = '{0} reference';
    public plural: string = '{0} references';
    public noreferences: string = 'no references found for {0}';
    public unusedcolor: string = '#999';
    public decorateunused: boolean = true;
  }