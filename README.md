# TSLens

A VSCode plugin for **typescript** which adds reference code lenses, highlights, gutter icons for interfaces/classes methods/properties implementations and overrides.

Useful in development and analyzing big projects on Typescript.

Works on the top of Typescript AST

## Works like this:
![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot2.png)

Supports complex inheritance info like this (navigation also supported): 

![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot3.png)

**TSLens: Show override candidates** command opens the list of possible base class members for override: 

![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot4.png)

## Supported gutters:
- ![interface](https://raw.githubusercontent.com/BrainMaxx/tslens/master/implementInterface.png) - interface implementation
- ![method](https://raw.githubusercontent.com/BrainMaxx/tslens/master/methodEdit.png) - method override
- ![field](https://raw.githubusercontent.com/BrainMaxx/tslens/master/fieldEdit.png) - field override
- ![interface method](https://raw.githubusercontent.com/BrainMaxx/tslens/master/interfaceMethodEdit.png) - interface method override
- ![interface field](https://raw.githubusercontent.com/BrainMaxx/tslens/master/interfaceFieldEdit.png) - interface field override

## Supported commands:

- **TSLens: Update** - updates current file,
- **TSLens: Show override candidates** - if cursor inside some class that extends some other, shows override candidates from the base class and adds them

## Configuration properties
- tslens.tsConfigPath
  - Optional tsconfig.json file path, in case of using heterogeneous workspaces
- tslens.showReferences
  - A flag which indicates whether the references infos should be shown
- tslens.referencesTypes
  - Types of symbol as numbers from [SymbolKind](https://github.com/Microsoft/vscode/blob/0532c31e4c1eee343aec19b55672c2d79b51f6f4/src/vs/editor/common/modes.ts#L585) enum that should be analyzed for references
- tslens.showBaseMemberInfo
  - A flag which indicates whether the inheritance infos should be shown
- tslens.methodOverrideColor
  - Color for method override
- tslens.fieldOverrideColor
  - Color for field override
- tslens.interfaceImplementationColor
  - Color for interface implementation

- tslens.blackboxTitle
  - Localization for the case where the only usages are from blackboxed sources
- tslens.blackbox
  - Array of glob patterns for blackboxed resources
- tslens.excludeself
  - A flag which indicates whether the initiating reference should be excluded
- tslens.decorateunused
  - A flag which indicates whether the initiating reference should be decorated if it is unsed
- tslens.singular
  - Localization for the singular case
- tslens.plural
  - Localization for the plural case
- tslens.noreferences
  - Localization for the case when there are no references found
- tslens.unusedcolor
  - Color for unused references
