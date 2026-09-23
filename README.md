# Video Maker

Turn a few photos of yourself into short videos of you singing, dancing or acting.
You upload photos once (a "persona"), pick a motion template or your own clip, and a
video model swaps you into the clip while keeping its motion, expression and audio.

This is the orchestration layer: identity capture, consent, job queue, provider
adapters and a small web UI. The rendering itself is done by a hosted video model
(fal.ai by default). A mock provider lets you run the whole flow offline.

## How it works

```
photos ──► persona (primary reference photo)
                         │
template clip / upload ──┼──► job ──► provider.submit() ──► status check on each read ──► download render
                         │                (fal.ai queue,     (browser poll, cron, or webhook)
prompt / mode ───────────┘                 or mock)
```

There is no background worker. A job is submitted to the provider inside the
request that creates it, and every later read of the job performs one status
check. That keeps each request short, which is what serverless platforms need,
and the hourly cron plus optional webhook cover jobs nobody is watching.

- `src/lib/providers/` – the `VideoProvider` contract plus `mock` and `fal` implementations.
- `src/lib/pipeline/jobs.ts` – create/submit, refresh, finalize, cancel.
- `src/lib/pipeline/personas.ts` – photo validation and the consent record.
- `src/lib/store.ts` – document store: JSON file with a lock file, or Upstash Redis.
- `src/lib/storage.ts` – file storage: local disk, or Vercel Blob with browser-direct uploads.
- `src/lib/client/upload.ts` – the browser side of uploads; picks the transport from `/api/config`.
- `src/lib/templates.ts` – catalogue of motion templates; clips are supplied by you.
- `src/app/` – Next.js App Router pages and API routes.

## Quick start (offline, mock provider)

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000, create a persona, then Generate → "Upload my own clip".
The mock provider "renders" for eight seconds and returns the uploaded clip.
Locally, files and the database live under `./data`.

## Real renders with fal.ai

1. Create a key at https://fal.ai/dashboard/keys.
2. Providers must be able to download your photos and clips, so expose the app on a
   public HTTPS origin. Locally, run a tunnel such as `ngrok http 3000` and use its URL.
3. Set in `.env`:

   ```
   VIDEO_PROVIDER=fal
   FAL_KEY=...
   PUBLIC_BASE_URL=https://<your-public-origin>
   WEBHOOK_SECRET=<random string>   # optional, speeds up completion
   ```

4. Check the model ids in `.env.example` against https://fal.ai/models. Model names
   change with each release; any model that takes `{ video_url, image_url }` and returns
   `{ video: { url } }` works without code changes. Other vendors (Runway Act-Two,
   Kling motion control, HeyGen) need a small adapter implementing `VideoProvider`.

## Deploy to Vercel

The code is ready for it; you need three things from the Vercel dashboard.

1. **Import the repository** as a Next.js project (Add New → Project). Keep the
   default build settings.
2. **Attach storage** from the project's Storage tab:
   - **Blob** (Vercel Blob). This sets `BLOB_READ_WRITE_TOKEN`, which switches
     file storage to Blob and turns on browser-direct uploads. Without it every
     upload over 4.5 MB fails with a platform error.
   - **Upstash Redis** (Marketplace). This sets `UPSTASH_REDIS_REST_URL` and
     `UPSTASH_REDIS_REST_TOKEN`, which switch the database to Redis. Without it
     the JSON file is written to a temporary disk and vanishes between requests.
3. **Set environment variables** (Settings → Environment Variables):

   | Variable         | Value                                                     |
   | ---------------- | --------------------------------------------------------- |
   | `VIDEO_PROVIDER` | `fal`                                                     |
   | `FAL_KEY`        | your fal.ai key                                           |
   | `WEBHOOK_SECRET` | a long random string (finished renders arrive by webhook) |
   | `CRON_SECRET`    | a long random string (protects the hourly refresh)        |

   `PUBLIC_BASE_URL` is optional: it defaults to the production domain. Set it
   to the preview URL if you want webhooks on a preview deployment.

Then deploy. Check the first run on the `/jobs/<id>` page; its timeline shows
the provider request id and any error text verbatim.

Notes on limits:

- `vercel.json` schedules the refresh cron hourly. Hobby plans only allow a
  limited cron cadence; Pro plans can run it every minute. The browser
  polling on the job page does the real work either way.
- The Redis store keeps the whole database in one key. That is fine for one
  person and a few hundred jobs; move to Postgres before opening it to others.
- Route handlers that download a finished render declare `maxDuration = 60`.
  Very long renders are fetched from the provider URL on later reads.

## Templates

A template is a licensed clip of one performer. Metadata lives in
`src/lib/templates.ts`; the clips are deliberately not committed. Put a file at
`public/templates/<id>.mp4` and the template becomes selectable. Use footage and
music you have the rights to redistribute; the output video contains both.

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | development server                             |
| `npm run build`     | production build                               |
| `npm start`         | production server                              |
| `npm test`          | unit tests (store, personas, jobs, fal adapter) |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run lint`      | eslint                                         |

## What is deliberately not here yet

- **Accounts.** Single-user, no auth. Add it before exposing the app publicly, and
  scope personas and jobs to the signed-in user.
- **Stronger consent.** A checkbox does not stop someone uploading another person's
  photos. Add a live selfie check compared against the uploads before launch.
- **Face and quality checks.** Uploads are validated by type and size only. A face
  detector that rejects photos with zero or several faces will cut failed renders.
- **A relational database.** The document store (JSON file or one Redis key) is
  fine for one person. Multi-tenant use needs per-record storage behind the same
  `Store` interface.
- **Billing and rate limits.** Every render costs money at the provider.
