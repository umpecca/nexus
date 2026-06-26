# Vendored drawio web app

This directory holds the self-hosted [drawio](https://github.com/jgraph/drawio) web app that Nexus
loads to edit diagrams **fully offline** — nothing is fetched from diagrams.net at runtime.

The contents are large (~150 MB) and are **git-ignored** (see `.gitignore`); only this README and
`.gitkeep` are tracked. Populate the directory with:

```sh
npm run fetch:drawio              # pinned version (see scripts/fetch-drawio.mjs)
npm run fetch:drawio -- 30.2.5    # or an explicit drawio release tag
```

This must be run before `vite build` / packaging so `dist/drawio/` is produced. The build config
unpacks `dist/drawio/**` and `dist/drawio-host.html` from the asar archive (`build.asarUnpack` in
`package.json`) because the drawio app loads many sub-resources and workers over `file://`, which is
unreliable inside an asar.

At runtime the editor is opened in a modal window by `electron/main.cjs` (`openDrawioEditor`), which
loads `public/drawio-host.html` — a tiny page that embeds `drawio/index.html?embed=1&proto=json…`
in an iframe — and drives the embed protocol via `electron/drawioEmbed.cjs` and
`electron/drawioPreload.cjs`.
