# Food Delivery Marketplace

A full-stack food delivery platform connecting **4 actors** — customers, merchants, riders, and admins — in a single marketplace. Built with domain-driven design, a pure TypeScript domain core, and a real backend (Fastify + PostgreSQL).

## Features

| Role | Capabilities |
|---|---|
| **Customer** | Browse restaurants & menus, customize orders (options/spice), cart with real-time delivery fee calculation, place & track orders, file post-delivery disputes |
| **Merchant** | Incoming order console, accept/reject orders, menu CRUD (add/edit/remove dishes), commission rate negotiation with admin |
| **Rider** | Claim available deliveries (first-come-first-served), pickup-to-dropoff workflow with OTP verification, real-time order status transitions |
| **Admin** | Multi-order dashboard with financial breakdown, force-cancel orders, suspend/unsuspend merchants & riders, wallet settlement & payout, dispute resolution, auto-moderation (warning → downrank → suspend) |

**Order lifecycle** uses a dual-track state machine (merchant track + rider track) that converge at pickup — each track independent, each actor sees only their actionable transitions.

## Tech Stack

```
apps/web/          Vite + React SPA (4 actor UIs)          — TypeScript
apps/api/          Fastify + PostgreSQL (Drizzle ORM)       — TypeScript
packages/domain/   Pure domain logic (zero dependencies)    — TypeScript
```

- **Auth**: Lucia (session cookies, scrypt)
- **Maps**: Leaflet + OpenStreetMap (location picker, haversine distance)
- **Background jobs**: pg-boss (cron scheduling)
- **Testing**: Vitest + Testing Library + jsdom (UI) · node:test (domain)

## Quick Start

```bash
npm install
npm run dev            # dev server at http://localhost:5173
npm test               # domain logic tests
npm run test:ui        # UI component tests
npm run typecheck      # full type check
npm run build          # production build
```

To run the full stack with the API backend (Postgres in Docker), see [apps/api/README.md](./apps/api/README.md).

## Project Structure

```
packages/domain/src/   Pure business logic, no framework dependencies
  ├── order/           Dual-track state machine + transitions + timers
  ├── cart/            Cart logic (single-restaurant rule)
  ├── delivery/        Haversine distance, delivery fee, service zone
  ├── menu/            Menu CRUD with validation
  ├── settlement/      Per-order financial reconciliation
  ├── wallet/          Internal ledger (escrow → payout)
  ├── moderation/      Suspension & ranking utilities
  ├── dispute/         Post-delivery complaints + auto-moderation
  └── catalog/         Single source of truth for restaurants & menus

apps/web/src/ui/       React SPA
  ├── pages/           Home, Restaurant, Menu, Cart, Track, Merchant, Rider, Admin
  ├── store.tsx        Global state (useReducer + persist + API sync)
  └── api/client.ts    Typed fetch client (API seam)

apps/api/src/          Fastify backend
  ├── routes/          REST endpoints (catalog, orders, disputes, moderation, etc.)
  ├── db/              Drizzle schema + migrations + seed
  └── services/        Auth, demo data, background jobs
```

## Architecture

**Domain-driven**: All business rules live in `packages/domain/` — pure TypeScript functions with no framework, no I/O. The web app imports them via a path alias, the API uses them for validation and orchestration.

**Optimistic sync**: The web app dispatches actions locally (instant UI update) then mirrors them to the API in the background. On failure, it refetches from the server to roll back.

**Single source of truth**: Restaurant & menu data originates in `catalog.ts` — both the web app (reference data) and API (DB seed) draw from the same definitions.

## Documentation

- [Full project overview](./docs/overview.md)
- [Domain glossary](./CONTEXT.md)
- [Order lifecycle](./docs/order-lifecycle.md)
- [Architecture Decision Records](./docs/adr/)
