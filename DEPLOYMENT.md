# Deployment

**Live demo: {{LIVE_URL}}**, hosted on Netlify, built from this repository.

## Why the app fits a serverless host

The PDF never travels to the server. The browser reads it with pdf.js and sends only small
pieces: one work unit of text (at most 12 pages and 60,000 characters, with up to 6 page
images) or up to 8 scanned page images per request. Each request finishes within 50
seconds, and the server keeps nothing between requests.

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
  package = "@netlify/plugin-nextjs"      # Netlify's Next.js runtime: pages, route handlers, proxy
```

The API routes (`/api/extract`, `/api/ocr`, `/api/health`) and server-rendered pages run as
Netlify Functions. The proxy that sets the per-request CSP nonce runs on every page request.

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

### Deploying

From a terminal, in the repository root:

```bash
npx netlify-cli login                  # opens the browser once
npx netlify-cli sites:create           # or: npx netlify-cli link, for an existing site
# set the environment variables in the Netlify UI (above), then:
npx netlify-cli deploy --build --prod
```

Or connect the Git repository under **Add new site → Import an existing project**; the
settings come from `netlify.toml`.

To roll back, open **Deploys**, choose an earlier deploy and select **Publish deploy**.

### Checks after a deploy

```bash
curl -s https://<site>/api/health                       # {"ok":true,"provider":"anthropic",...}
curl -sI https://<site>/ | grep -iE "content-security|strict-transport|x-frame|x-content-type"
grep -rE "sk-ant-|sk-proj-" frontend/.next/static || echo "no key strings in the client bundle"
```

Then upload a plan in the browser and open a sample.

{{LIVE_CHECKS}}

## Security settings

- **Headers** (`frontend/next.config.ts` and `frontend/src/proxy.ts`): a Content Security
  Policy with a per-request nonce for scripts, `connect-src 'self'`,
  `frame-ancestors 'none'` and `worker-src 'self' blob:` for pdf.js; HSTS;
  `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; a
  Permissions-Policy that turns off camera, microphone, geolocation and payment;
  `X-Frame-Options: DENY`. The `X-Powered-By` header is removed.
- **Requests** are validated with strict Zod schemas (unknown fields rejected) and size caps
  before any model call. Errors return `{ error: { code, message, requestId, retryAfter? } }`
  and never a stack trace.
- **Rate limit:** a token bucket per client address in each function instance. It slows a
  burst from one browser; the provider's spend limit is the hard cap.
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
