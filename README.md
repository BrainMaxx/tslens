# TSLens

A VSCode plugin for **typescript** which adds reference code lenses, highlights, gutters for interfaces/classes methods implementations and overrides.

Inspired by tslens extension.

Still under development, but basic functionality is working)

## Works like this:
![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot2.png)

Supports complex inheritance info like this (navigation also supported): 

![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot3.png)

**TSLens: Show override candidates** command opens the list of possible base class members for override: 

![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot4.png)

## Supported gutters:
- ![interface](https://raw.githubusercontent.com/BrainMaxx/tslens/master/implementInterface.png) - interface implementation
- ![interface](https://raw.githubusercontent.com/BrainMaxx/tslens/master/methodEdit.png) - method override
- ![interface](https://raw.githubusercontent.com/BrainMaxx/tslens/master/fieldEdit.png) - field override

## Supported commands:

- **TSLens: Update** - updates current file,
- **TSLens: Show override candidates** - if cursor inside some class that extends some other, shows override candidates from the base class and adds them

## Configuration properties
- tslens.showReferences
  - A flag which indicates whether the references infos should be shown
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
