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

- **Natural-language parsing:** Input is Unicode-normalized, common shorthand such as `tmrw` and `tonite` is expanded, and compact times and number words are interpreted. Deterministic patterns extract quantities and canonical measurement units before date parsing so numbers such as “2” are not mistaken for a time. Explicit dayparts and relative phrases are handled locally; remaining dates are parsed with Chrono using British date ordering and forward-date preference. Parsed fragments are removed from the display text, while the original input, structured quantity, due date, time precision, and any safety warning are retained.
- **AI prompts and output safety:** Each action compacts only the required active-list data, assigns stable indexes, and combines task-specific instructions with a system rule that treats list content as untrusted data. Gemini receives a strict JSON schema, minimal thinking configuration, and an action-specific output ceiling. Responses must contain non-thought text and valid JSON; strings and numeric fields are bounded and normalized, duplicate generated names are removed, source indexes and IDs are checked, and incomplete or partially covered results are rejected instead of being written to Firestore.
- **Duplicate detection and merging:** Item names are normalized with Unicode decomposition, case folding, accent removal, `&` expansion, punctuation removal, and whitespace collapsing. A matching active item opens a comparison sheet rather than merging silently. The user can keep both entries or merge them; compatible or missing units allow quantities to be added, conflicting units prefer the incoming quantity, incoming due-date and raw-input metadata take precedence when provided, and `timesAdded` records repeated additions.
- **Quota coordination:** The Worker counts prompt tokens before generation and reserves the input count plus the action’s maximum possible output against one Durable Object. Its single-threaded storage tracks global monthly tokens, per-user monthly tokens, and successful plus in-flight daily requests. A successful generation atomically converts the reservation into measured input/output usage; any generation or validation failure releases it, preventing concurrency races and failed calls from consuming successful-request allowance.
- **Interface structure:** `App.jsx` owns session-level routing and shared sheet state. `HomeScreen` and `ListScreen` contain the primary list workflows, while focused bottom-sheet components handle creation, editing, search, account actions, AI previews, duplicate decisions, and cross-list optimization. Hooks isolate viewport behavior, services isolate AI and offline access, and deterministic libraries contain parsing, date, formatting, and merge rules. The mobile-first design uses thumb-reachable actions, preview-before-apply flows for destructive or AI-assisted changes, explicit offline/update feedback, and archived originals for reversible list reorganization.

These implementation details are based on the repository’s parsing and merge utilities, Cloudflare Worker task/result pipeline, Durable Object budget operations, React component boundaries, and service-worker lifecycle code rather than inferred behavior. Runtime outcomes can still vary with browser support, network conditions, Firebase synchronization, and Gemini availability.

## Engineering challenges

- Preserving a responsive list experience across online, offline, and reconnecting states.
- Parsing flexible human input without silently producing unsafe dates or quantities.
- Preventing duplicate Firestore items while supporting intentional quantity merging.
- Recovering from delayed or interrupted real-time Firestore listeners on mobile browsers.
- Coordinating service-worker updates without unexpectedly interrupting an active session.
- Treating list content and AI prompts as untrusted input and constraining generated output.
- Ensuring failed AI requests release reserved capacity instead of consuming user quotas.
- Keeping a feature-rich interface maintainable through modular frontend and Worker boundaries.

Current limitations include:

- AI assistance depends on the Cloudflare Worker, Gemini API, network availability, and configured usage budgets; provider errors or high usage can temporarily prevent generation.
- Firestore can accept local writes offline, but reconciliation and remote updates may take time to appear after connectivity returns.
- Natural-language parsing is deterministic and English-oriented, so ambiguous phrasing, uncommon units, locale-specific dates, and other edge cases may require manual correction.
- Service-worker releases require the client to activate a newer cached build. Lyst exposes update state and defers activation until the user accepts it, but reloading can still interrupt unsaved interface state.

## Impact

Lyst reduces the effort required to capture and organize everyday information. Natural-language parsing turns quick notes into structured list items, offline support keeps essential data accessible during connectivity loss, and AI assistance accelerates list creation without becoming a dependency for normal use.

From an engineering perspective, the project demonstrates an end-to-end approach to authenticated serverless AI, offline-first data synchronization, structured model output, defensive rate limiting, and maintainable React architecture.
