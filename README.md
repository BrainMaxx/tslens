# TSLens

A VSCode plugin for **typescript** which adds reference code lenses, highlights, gutters for interfaces/classes methods implementations and overrides.

Inspired by TypeLens extension.

Still under development, but basic functionality is working)

## Works like this:
![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot.png)
![Example code with code highlights lens](https://raw.githubusercontent.com/BrainMaxx/tslens/master/screenshot2.png)

## Configuration properties

- typelens.blackboxTitle
  - Localization for the case where the only usages are from blackboxed sources
- typelens.blackbox
  - Array of glob patterns for blackboxed resources
- typelens.excludeself
  - A flag which indicates whether the initiating reference should be excluded
- typelens.decorateunused
  - A flag which indicates whether the initiating reference should be decorated if it is unsed
- typelens.singular
  - Localization for the singular case
- typelens.plural
  - Localization for the plural case
- typelens.noreferences
  - Localization for the case when there are no references found
- typelens.unusedcolor
  - Color for unused references
