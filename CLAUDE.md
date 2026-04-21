# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MCP (Model Context Protocol) stdio server exposing `resmigazete.gov.tr` (Turkish Official Gazette) to LLM clients. Published as a CLI binary `resmi-gazete-mcp` that hosts four tools: `get_fihrist`, `read_article`, `search_gazette`, `extract_pdf_text`.

## Commands

The repo ships a `package-lock.json`, so use npm here (not pnpm) to keep the lockfile consistent:

```bash
npm install
npm run dev         # run with tsx from src/
npm run typecheck   # tsc --noEmit
npm run build       # tsc → dist/
npm start           # node dist/index.js
```

No test runner or linter is configured; `typecheck` is the only CI-like gate.

Manual E2E against the real MCP protocol:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Architecture

The server is a thin request router over four tools; the interesting logic lives in the HTTP + parse layers.

**Request flow.** `src/index.ts` boots a `StdioServerTransport` around `createServer()` in `src/server.ts`. `server.ts` declares the tool list + JSON Schemas to MCP, and on `CallTool` validates arguments with zod, dispatches to the matching handler in `src/tools/*`, and wraps results as `{ content: [{ type: "text", text: JSON.stringify(...) }] }`. Errors are caught and returned as `{ isError: true, content: [...] }` — handlers should throw `Error` with a human-readable message rather than formatting error envelopes themselves.

**HTTP + cache is the core abstraction.** All outbound fetches go through `fetchUrl()` in `src/http.ts`. It uses `undici.request` with a browser-ish `User-Agent` (the site returns 403 without one), exponential-backoff retries on 5xx/429, a 25 MB body cap, and a `allow404` flag used by fihrist probing. Every successful response is persisted to `src/cache.ts` — a content-addressed JSON store at `~/.cache/resmi-gazete-mcp/<sha1[0:2]>/<sha1>.json` (override via `RESMI_GAZETE_CACHE_DIR`). Binary responses (PDFs) are stored base64-encoded with `binary: true`. The cache has no eviction; callers pass `ttlMs` to opt into staleness checks. When adding a new tool, route through `fetchUrl` so caching and retry behavior are uniform — don't call `undici` directly.

**Fihrist URL scheme.** `buildFihristUrl(date, mukerrerIndex)` in `src/parse/fihrist.ts` maps `YYYY-MM-DD` to `https://www.resmigazete.gov.tr/eskiler/YYYY/MM/YYYYMMDD[M<n>].htm`. The `M<n>` suffix addresses mükerrer (supplementary) issues; `getFihrist` probes indices 1..5 sequentially and stops at the first 404 — keep that probe bounded if you extend it.

**Fihrist parsing is heuristic.** `parseFihrist` walks every DOM node and treats `<b>`/`<strong>` text matching `/BÖLÜM[Ü]?$|İLÂN BÖLÜMÜ|İLAN BÖLÜMÜ/i` as section headers; `<a>` tags whose `href` matches `eskiler/YYYY/MM/YYYYMMDD[M<n>]-<n>.(htm|pdf)` become items. It deduplicates PDF/HTML pairs by base URL and attaches the PDF to the existing HTML item as `pdfUrl`. If you change this matcher, verify against both regular and mükerrer days — the structure is not a strict schema.

**Search is fan-out over `getFihrist`.** `searchGazette` iterates the date range (skipping Sundays — the gazette isn't published), fetches fihrists in batches of 5 concurrent requests, and does Turkish-normalized substring matching (`toLocaleLowerCase("tr-TR")` + NFKD diacritic strip) against item titles only. Range is capped at 730 days and results at 500; the function short-circuits once `maxResults` is reached and reports `truncated: true`. Performance depends heavily on the fihrist cache being warm.

**URL validation is host-locked.** `readArticle` and `extractPdfText` reject any URL whose hostname isn't `www.resmigazete.gov.tr` and enforce the expected extension. Preserve this when adding tools that take URLs — don't fetch arbitrary hosts through this server.

## Conventions

- ESM only (`"type": "module"` + `moduleResolution: "bundler"`). Relative imports inside `src/` must use the `.js` extension even for `.ts` files, e.g. `import { fetchUrl } from "./http.js"`.
- TypeScript `strict` is on. `rootDir: src`, `outDir: dist`.
- Node ≥ 20. The `bin` entry ships `dist/index.js` with the `#!/usr/bin/env node` shebang — don't remove it.
- New tools: add the handler under `src/tools/`, a zod schema + JSON Schema + dispatch case in `src/server.ts`, and any shared types in `src/types.ts`.
