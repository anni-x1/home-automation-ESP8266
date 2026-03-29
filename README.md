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
- `CLAUDE.md` and `AGENTS.md` are ignored and will not be pushed.

## License

Add your preferred license in this repository before making it public.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
