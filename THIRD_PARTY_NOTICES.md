# Third-party notices

VortexFX's original code is MIT licensed. Third-party packages and user-supplied
assets retain their respective licenses.

## Distributed runtime components

- **Inter Variable**, from `@fontsource-variable/inter`: SIL Open Font License
  1.1. The complete font license and copyright notice are preserved in
  [public/licenses/Inter-OFL-1.1.txt](public/licenses/Inter-OFL-1.1.txt).
  Upstream: [The Inter Project](https://github.com/rsms/inter).
- **React, React DOM and Scheduler**: MIT License, copyright Meta Platforms,
  Inc. and affiliates. The shared license text is preserved in
  [public/licenses/React-MIT.txt](public/licenses/React-MIT.txt).
  Upstream: [React](https://github.com/facebook/react).

Vite also emits the full bundled dependency notices at
`dist/licenses/dependencies.md` during production builds. Preserve these notices
and the files copied from `public/licenses/` when redistributing a build.
Development tooling retains its own package licenses in `node_modules/`; it is
not relicensed by the project MIT license.

## Optional local assets

Cambria and all other local font binaries are excluded from the repository.
The animated README previews contain rasterized artwork rendered with Inter.
Inter is the only font distributed by default, through its licensed npm package.
Optional fonts and imported images require permission for their intended use; they are
not covered by the VortexFX MIT license.

For Windows-supplied fonts, Microsoft's
[font redistribution FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq)
distinguishes sharing rendered word graphics from redistributing font binaries.
Copies obtained from other sources remain subject to their own license terms.

## Visual inspiration

Inspired by *[Using Blender Like A Graphic Designer!](https://www.youtube.com/watch?v=72xChVM08jI)*.
No video footage, tutorial screenshots, transcript or Blender files are
distributed. The effect is independently implemented in this project.
