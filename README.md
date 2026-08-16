# Lyst

## Overview

Lyst is a mobile-first personal list application designed for fast capture, reliable offline use, and intelligent list assistance. It combines natural-language input with cloud synchronization and AI features while keeping the core list experience simple and responsive.

The application is built with React and Vite, uses Firebase Authentication and Firestore for user data, and runs as an installable progressive web app. AI requests are processed through a Cloudflare Worker backed by Gemini.

## Problem

Traditional list applications often require users to enter every detail manually, depend heavily on a stable internet connection, or add AI features that compromise privacy, reliability, and cost control.

Lyst addresses these limitations by allowing users to write items naturally, such as tasks containing quantities, dates, and times. The app extracts useful metadata automatically, keeps previously synchronized data available offline, and places AI access behind authenticated, rate-limited infrastructure.

## Key features

- Create, edit, archive, search, and manage personal lists.
- Parse natural-language dates, times, quantities, and measurement units.
- Merge duplicate items while preserving compatible quantity information.
- Synchronize per-user data through Firestore with offline persistence.
- Continue using cached lists during extended offline periods.
- Generate lists, suggest missing items, complete partial lists, and clean item names with AI.
- Protect AI endpoints with Firebase ID-token verification and origin restrictions.
- Enforce daily request limits and monthly token budgets per user.
- Provide a mobile-first PWA experience with service-worker updates and offline caching.

## Architecture

The React frontend is organized into screens, reusable components, sheets, hooks, services, and deterministic utility modules. Firebase Authentication manages user sessions, while Firestore stores each user’s lists and nested list items under user-scoped document paths.

The service worker handles application caching, offline navigation, cache expiration, and update activation. Firestore’s persistent local cache provides synchronized data access across browser tabs.

AI requests flow through a Cloudflare Worker rather than directly from the browser. The Worker validates request origins and Firebase tokens, builds structured Gemini tasks, sanitizes model output, and returns constrained JSON responses. A Durable Object coordinates request reservations and token accounting to enforce global and per-user budgets safely.

## Engineering challenges

- Preserving a responsive list experience across online, offline, and reconnecting states.
- Parsing flexible human input without silently producing unsafe dates or quantities.
- Preventing duplicate Firestore items while supporting intentional quantity merging.
- Recovering from delayed or interrupted real-time Firestore listeners on mobile browsers.
- Coordinating service-worker updates without unexpectedly interrupting an active session.
- Treating list content and AI prompts as untrusted input and constraining generated output.
- Ensuring failed AI requests release reserved capacity instead of consuming user quotas.
- Keeping a feature-rich interface maintainable through modular frontend and Worker boundaries.

## Impact

Lyst reduces the effort required to capture and organize everyday information. Natural-language parsing turns quick notes into structured list items, offline support keeps essential data accessible during connectivity loss, and AI assistance accelerates list creation without becoming a dependency for normal use.

From an engineering perspective, the project demonstrates an end-to-end approach to authenticated serverless AI, offline-first data synchronization, structured model output, defensive rate limiting, and maintainable React architecture.
