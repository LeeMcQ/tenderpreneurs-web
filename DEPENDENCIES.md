# Dependencies to install

The patch introduces two new runtime dependencies. Add them with:

```bash
npm install node-html-parser unpdf
```

That's it. No dev-deps, no peer-deps.

## What they're for

- **`node-html-parser`** — used by the eTenders adapter and the Treasury Bulletin adapter to parse HTML pages. ~12kb, no deps, Worker-compatible.
- **`unpdf`** — used by the Treasury Bulletin adapter to extract text from the weekly PDF. Worker-compatible (uses `pdfjs-dist` under the hood, but with the Node-only bits stripped). ~200kb.

## What's NOT needed

You may see online suggestions to install `cheerio` or `pdf-parse`. Don't — neither works reliably in Cloudflare Workers. The packages above are the Worker-compatible equivalents and are what this patch uses.

## Verifying after install

```bash
npm run build
```

If the build succeeds, the dependencies are correctly wired. If you see an error like `Cannot find module 'unpdf'`, the install didn't pick them up — check that `package.json` lists them under `dependencies`.
