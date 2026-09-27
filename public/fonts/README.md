# Local fonts

Place artwork fonts here and interface fonts in `ui/`. Supported formats are
`.ttf`, `.otf`, `.woff` and `.woff2`; nested folders are scanned automatically.
All discovered fonts, including interface fonts, appear in the font selector.
For the interface, a file with `Regular` in its name is preferred, otherwise
the first interface font is used.

Inter is included as a separately licensed npm dependency and works without
any local files. Cambria Bold Italic was used for the original artwork; it is
not distributed with this repository. Original Bitstream Charter Bold Italic
is a recommended alternative; check the license of the particular font file.

Local fonts are ignored by Git. Add only fonts you are licensed to use on the
web. Vite serves this folder and copies it into production builds: Git ignores
do not prevent web distribution. Review or remove local font files before
sharing a server or deploying a build.
