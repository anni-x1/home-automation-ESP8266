# Home Automation App

A Next.js home automation dashboard that controls Blynk-connected devices (lights, fans, and door control), with voice-command support and direct virtual pin testing.

## Tech Stack

- Next.js (App Router)
- React
- TypeScript
- Blynk Cloud API

## Features

- Toggle multiple home devices from a single UI
- Voice command handling for supported actions
- Door open/close trigger
- Direct Blynk virtual pin test panel
- Secure server-side token forwarding through a Next.js API route

## Prerequisites

- Node.js 20+ recommended
- A Blynk account and device token

## Environment Variables

Copy `.env.example` to `.env` and fill your actual values:

```bash
cp .env.example .env
```

Required variable:

- `BLYNK_TOKEN` - your Blynk device auth token used by `src/app/api/blynk/update/route.ts`

## Local Development

Install dependencies and run dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build and Run

```bash
npm run build
npm run start
```

## Deploy on Vercel

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. In Vercel project settings, add environment variable:
   - `BLYNK_TOKEN` = your production Blynk token
4. Deploy.

After deployment, Vercel will use:

- `npm install`
- `npm run build`

No extra `vercel.json` is required for this setup.

## GitHub Safety Notes

- Keep `.env` private (already ignored by `.gitignore`).
- Commit `.env.example` so others know required variables.
