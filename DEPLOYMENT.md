# Deployment

**Live demo: https://watershed-plan-extractor.netlify.app**, hosted on Netlify, built from
this repository.

## Why the app fits a serverless host

The PDF never travels to the server. The browser reads it with pdf.js and sends only small
pieces: one work unit of text (at most 12 pages and 60,000 characters, with up to 6 page
images) or two scanned page images per request. Each request has a 50-second deadline,
and the server keeps nothing between requests.

So a 100 MB+ plan needs no upload limit, no temporary storage and no job queue. The same
build runs on Netlify, on Vercel, in Docker or on any Node host.

| Host limit (Netlify Functions) | What the app does |
| --- | --- |
| 60 s per synchronous request | Every model call has a 50 s deadline; a unit that runs out of time is split in half and retried |
| 6 MB request body | Requests are capped at 4 MB and validated before any model call |
| No shared memory between instances | Nothing is stored server-side; results live in the user's browser (IndexedDB) |

## Netlify configuration

`netlify.toml` holds the build settings, so the site needs no settings in the UI except
the environment variables.

```toml
[build]
  command = "npm run build -w frontend"   # from the repository root, so the backend workspace is installed
  publish = "frontend/.next"

[build.environment]
  NODE_VERSION = "22"
  NEXT_TELEMETRY_DISABLED = "1"

[[plugins]]
  package = "@netlify/plugin-nextjs"      # Netlify's Next.js runtime: pages and route handlers
```

The API routes (`/api/extract`, `/api/ocr`, `/api/health`) and the report page run as
Netlify Functions; the home and Accuracy pages are static. There is no middleware: the
security headers, including the Content Security Policy, are static headers set in
`frontend/next.config.ts`.

### Environment variables

Set them in Netlify under **Site configuration → Environment variables**. Mark the keys
**Contains secret values** and give them the **Functions** scope, so they exist only where
the API routes run and never in build output or logs.

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | A key used only for this site, in a workspace with a monthly spend limit |
| `OPENAI_API_KEY` | Optional; used when no Anthropic key is set, or when `LLM_PROVIDER=openai` |
| `EXTRACTION_MODEL`, `OCR_MODEL`, `EXTRACTION_EFFORT` | Optional; see the README |
| `MAX_PAGES`, `RATE_LIMIT_PER_MIN` | Optional; default 800 pages and 60 calls per minute per client |

`NODE_ENV` does not need to be set: Next.js builds with `production` and the functions run
with it. Setting `NODE_ENV=production` in the **build** scope would make npm skip
devDependencies (Tailwind, TypeScript) and the build would fail.

The keys are read only by `frontend/src/server/llm.ts`, which is marked `server-only`.
`/api/health` reports which provider and model are configured and never a key value.

Set your own key. When a project has no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, Netlify's
AI Gateway injects its own (with a matching base URL) and bills model calls to the
account's Netlify credits; a key set on the project turns that off for its provider.

### Deploying

From a terminal, in the repository root:

```bash
npx netlify-cli login                  # opens the browser once
npx netlify-cli sites:create --name <name> --filter @app/frontend
# set the environment variables in the Netlify UI (above), then:
npx netlify-cli deploy --build --prod --site <site id> --filter @app/frontend
```

`--filter @app/frontend` tells the CLI which workspace is the site. The live demo is
deployed this way from a clean checkout of a commit (`git worktree add`), so nothing
uncommitted ships. Connecting the Git repository under **Add new site → Import an existing
project** works too; the settings come from `netlify.toml`.

**Building on Windows.** Netlify's Next.js runtime (5.16) writes Windows paths into the
code it generates when the build runs on Windows, and the deployed function cannot start
(`Cannot find package '\var\task\frontend'`). It does the same for middleware, which is
why the app uses none. Netlify's own build servers run Linux and are not affected. From a
Windows machine, build, fix the paths, then deploy the build:

```bash
npx netlify-cli build --context production --filter @app/frontend
node scripts/netlify-windows-paths.mjs
npx netlify-cli deploy --prod --no-build --dir frontend/.netlify/static --skip-functions-cache --site <site id> --filter @app/frontend
```

`--dir frontend/.netlify/static` is where the runtime puts the static files; without it a
`--no-build` deploy publishes the raw `.next` folder and every script returns 404.

The sample plans' PDFs ship with the site so their pages show in the evidence panel. The
scanned sample's PDF (18 MB) is left out of the submission zip to keep it small; a copy built
from the zip links that sample's pages to MDEQ instead.

To roll back, open **Deploys**, choose an earlier deploy and select **Publish deploy**.

### Checks after a deploy

```bash
curl -s https://<site>/api/health                       # {"ok":true,"provider":"anthropic",...}
curl -sI https://<site>/ | grep -iE "content-security|strict-transport|x-frame|x-content-type"
grep -rE "sk-ant-|sk-proj-" frontend/.next/static || echo "no key strings in the client bundle"
```

Then upload a plan in the browser and open a sample.

Results on the live demo after the final deploy (2026-10-21, commit `974237c`):

- `/api/health` returns `{"ok":true,"provider":"anthropic","model":"claude-haiku-5-5",...}`
  and no key.
- The home page sets all six security headers (CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`,
  the referrer and permissions policies) and no `X-Powered-By`.
- Home, Accuracy, How it works and a sample report return 200; an unknown path returns 404.
- A malformed request to `/api/extract` returns 400 `INVALID_INPUT` with a request id.
- One small request to `/api/extract` with a real page of text returned verified items in
  4 s, so the key, the model and the verifier work in the deployed function.
- The sample results and PDFs are served, and the build has no `sk-ant-` or `sk-proj-` string.
- pdf.js's decoders are served from `/pdfjs/wasm/` as `application/wasm`, and the CSP allows
  them to compile (`'wasm-unsafe-eval'`).

The pages, the compare view, the filters and the layouts at 1536, 1440 and 375 px wide were
checked on the same commit running locally, because the browser tool used here only opens
localhost. A full upload through the live site was not run on this deploy; the runs in
[TESTING.md](TESTING.md) used the same pipeline through the eval CLI.

## Security settings

- **Headers** (`frontend/next.config.ts`, values in `frontend/src/server/security-headers.ts`):
  a Content Security Policy with scripts from this origin only (plus Next.js's inline
  bootstrap scripts, and `'wasm-unsafe-eval'` so pdf.js can compile its JPEG 2000 and JBIG2
  decoders, served from `/pdfjs/wasm/`), `connect-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'` and `worker-src 'self' blob:` for pdf.js; HSTS;
  `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; a
  Permissions-Policy that turns off camera, microphone, geolocation and payment;
  `X-Frame-Options: DENY`. The `X-Powered-By` header is removed. A per-request script nonce
  would need middleware (see the Windows note above); no document text is ever rendered as
  HTML, so inline scripts have no way in.
- **Requests** are validated with strict Zod schemas (unknown fields rejected) and size caps
  before any model call. Errors return `{ error: { code, message, requestId, retryAfter? } }`
  and never a stack trace.
- **Rate limit:** a token bucket per client address in each function instance. It slows a
  burst from one browser; the provider account's prepaid balance or spend limit is the hard cap.
- **Logs** (Netlify → Logs → Functions) show the request id, route, status, duration and
  token counts. Document text is never logged.

## Docker

For self-hosting or for a host that runs containers (Railway, Render, Fly.io):

```bash
cp .env.example frontend/.env.local    # set a key
docker compose up --build              # http://localhost:3000
```

Without Compose:

```bash
docker build -f frontend/Dockerfile -t watershed-extractor .
docker run -p 3000:3000 --env-file frontend/.env.local watershed-extractor
```

`frontend/Dockerfile` builds Next.js in standalone mode (`NEXT_STANDALONE=1`) and runs it
on Node 22 Alpine as the unprivileged `node` user. `.dockerignore` keeps `.env` files,
`node_modules`, build output and the evaluation PDFs out of the build context, so no key
can end up in the image.

## Other hosts

- **Vercel:** works without code changes on a Pro plan; the API routes already set
  `maxDuration = 60`. The Hobby plan's terms do not allow commercial use, which is why the
  demo is on Netlify.
- **Any Node host:** `npm ci && npm run build && npm start -w frontend` (port 3100), with the
  environment variables set.

## Cost

Netlify's free plan covers the demo. Model cost per plan is reported in
[TESTING.md](TESTING.md); each result is cached in the user's browser, so reopening a plan
costs nothing, and the sample plans on the home page are precomputed.
