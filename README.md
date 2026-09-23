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
template clip / upload ──┼──► job ──► provider.submit() ──► poll status ──► download render
                         │                (fal.ai queue,             (webhook optional)
prompt / mode ───────────┘                 or mock)
```

- `src/lib/providers/` – the `VideoProvider` contract plus `mock` and `fal` implementations.
- `src/lib/pipeline/jobs.ts` – submit, poll, finalize; resumes unfinished jobs on restart.
- `src/lib/pipeline/personas.ts` – photo validation and the consent record.
- `src/lib/store.ts` – JSON-on-disk database with a lock file. Swap for Postgres before scaling.
- `src/lib/storage.ts` – local file storage served by `/api/files/[id]` with Range support.
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
- **A real queue and object storage.** The JSON store, in-process poller and local
  disk are fine for one server. For more, move jobs to a worker (BullMQ, SQS) and
  files to S3/R2, behind the same `Store`, `VideoProvider` and storage functions.
- **Billing and rate limits.** Every render costs money at the provider.
