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
  }