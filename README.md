# Lyst

A minimal personal list app with offline support, natural-language parsing, and AI-assisted list generation.

Built with React, Firebase, Cloudflare Workers, and Gemini.

## Features

- Create and manage personal lists
- Natural-language item parsing
- Offline-first support
- Firebase Authentication and Firestore sync
- AI-powered generation, suggestions, and cleanup
- Per-user AI rate limiting
- Mobile-first PWA experience
## Tech stack

React · Vite · Firebase · Firestore · Cloudflare Workers · Gemini API · Framer Motion · chrono-node

## Requirements

- Node.js 22 or newer
- A Firebase project with Authentication, Firestore, and Hosting enabled
- A Cloudflare account for the AI Worker
- A Gemini API key

## Local setup

Install both application workspaces:

```bash
npm install
npm install --prefix worker
```

Copy `.env.example` to `.env.local` and fill in the Firebase web configuration. Keep the Worker URL set to `http://localhost:8787/ai` when running it locally.

Store the Gemini key as a local Worker secret:

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
cd ..
```

Run the frontend and Worker in separate terminals:

```bash
npm run dev
npm run worker:dev
```

The frontend defaults to `http://localhost:5173`. The Worker configuration allows this origin for local development.

## Validation

Run all lint, test, frontend build, and Worker packaging checks:

```bash
npm run check
```

Individual commands are also available:

```bash
npm run lint
npm test
npm run build
npm run worker:check
```

## Deployment

Deploy the Worker after setting its production `GEMINI_API_KEY` secret:

```bash
npm run worker:deploy
```

Set `VITE_LYST_AI_URL` to the deployed Worker `/ai` endpoint, build the frontend, and deploy Firebase resources:

```bash
npm run build
npx firebase-tools deploy --only firestore:rules,hosting
```

Firebase project selection lives in `.firebaserc`; review it before deploying from a fork.

## Project layout

```text
src/                 React application
public/              PWA manifest, icons, and service worker
worker/src/          Authenticated Gemini API Worker and rate limiter
firestore.rules      Per-user Firestore access rules
firebase.json        Firebase Hosting and Firestore configuration
```

Environment files, build output, local Firebase state, Worker development state, and dependencies are intentionally excluded from Git.
