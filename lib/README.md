# lib/ — self-hosted editor dependencies

`codemirror.js` is a single pre-built ES-module bundle of every third-party
dependency the editor needs (all `@codemirror/*`, `@lezer/highlight`,
`@codemirror/lang-html`, `@replit/codemirror-indentation-markers`,
`@codemirror/theme-one-dark`, `acorn`, and `js-beautify`). `editor.js` imports
from `./lib/codemirror.js`, so the site never touches an external CDN.

This file is a committed build artifact — `node build.mjs` just copies it. You
only need to regenerate it when you want to upgrade one of the dependencies:

    cd lib
    npm install            # installs the deps listed in lib/package.json
    npm run build          # esbuild entry.js -> codemirror.js

`entry.js` is the bundle entry (it re-exports exactly what `editor.js` imports).
