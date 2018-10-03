import * as enu from 'linq';
import Project, { ExpressionWithTypeArguments, InterfaceDeclaration, ClassDeclaration, ClassMemberTypes, TypeElementTypes } from 'ts-simple-ast';

export class Utils {

    public static getInterfaces(project: Project) {
        const res = enu
        .from(project.getSourceFiles())
        .where(x => !!x)
        .select(x => {
          const ns = x.getNamespaces();
          if (ns.length > 0) {
            return ns.map(m => m.getInterfaces());
          } else {
            return [x.getInterfaces()];
          }
        })
        .selectMany(x => x)
        .where(x => x.length > 0)
        .selectMany(x => x)
        .toArray();

        return res;
      }

      public static findInterfaceByName(interfaces: InterfaceDeclaration[], x: ExpressionWithTypeArguments) {
        const iname = this.getInterfaceName(x);
        return enu.from(interfaces).firstOrDefault(z => {
          try {
            return z.getName() === iname;
          } catch (error) {
            return false;
          }
        });
      }

      public static updateInterfaces(project: Project, locations: string[]): boolean {
        let isChanged = false;
        enu
          .from(locations)
          .distinct()
          .forEach(p => {
            const interfaces = this.getInterfacesAtPath(project, p);
            const path = p.replace(/\\/g, '/');
            if (
              !enu
                .from(interfaces)
                .any(x => x.getSourceFile().getFilePath() === path) &&
              interfaces.length > 0
            ) {
              interfaces.push(...interfaces);
              isChanged = true;
            }
          });
    
        return isChanged;
      }

      public static getClassImplements(interfaces: InterfaceDeclaration[], cl: ClassDeclaration) {
        return enu
          .from(cl.getImplements())
          .select(x => this.findInterfaceByName(interfaces, x))
          .where(x => !!x)
          .select(x => {
            return [x, ...x.getExtends().map(z => this.findInterfaceByName(interfaces, z))];
          })
          .selectMany(x => x)
          .where(x => !!x)
          .select(x => {
            let mem = x.getMembers();
            mem.forEach(z => (z['interface'] = x));
            return mem;
          })
          .selectMany(x => x)
          .toArray();
      }
    
      public static getClassMembers(
        interfaces: InterfaceDeclaration[],
        cl: ClassDeclaration,
        arr?: Array<ClassMemberTypes | TypeElementTypes>
      ): Array<ClassMemberTypes | TypeElementTypes> {
        arr = arr || this.getClassImplements(interfaces, cl);
        const bc = cl.getBaseClass();
        if (bc) {
          const methods = bc.getMembers();
    
          methods.forEach(x => (x['baseClass'] = bc));
          arr.push(
            ...this.getClassImplements(interfaces, bc),
            ...methods,
            ...this.getClassMembers(interfaces, bc, methods)
          );
    
          return arr;
        } else {
          return this.getClassImplements(interfaces, cl);
        }
      }
    
      public static getInterfacesAtPath(project: Project, path: string): InterfaceDeclaration[] {
        const file = project.getSourceFile(path);
    
        return file ? enu
          .from(file.getNamespaces())
          .select(x => x.getInterfaces())
          .selectMany(x => x)
          .concat(file.getInterfaces())
          .toArray() : [];
      }
    
      public static getInterfaceName(f: ExpressionWithTypeArguments) {
        if (f.compilerNode.expression['name']) {
          return f.compilerNode.expression['name'].escapedText.trim();
        } else if (f.compilerNode.expression['escapedText']) {
          return f.compilerNode.expression['escapedText'].trim();
        } else {
          return f.compilerNode.expression.getText().trim();
        }
      }
} 