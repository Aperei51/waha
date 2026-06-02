# CLAUDE.md

Guidance for AI assistants (and humans) working in the **WAHA** repository.

## What WAHA is

**WAHA** (**W**hats**A**pp **H**TTP **A**PI) is a self-hosted REST API for WhatsApp.
It wraps several WhatsApp client "engines" behind a single HTTP/WebSocket API so you
can start sessions, send/receive messages, manage chats, groups, contacts, presence,
labels, and stream events via webhooks — all from your own server.

- Built with **NestJS** (TypeScript) on **Node.js 22**.
- Ships as a **Docker** image; the typical deployment is `docker run devlikeapro/waha`.
- Public docs: https://waha.devlike.pro/ — Swagger lives at `/` (and `/swagger`) of a running instance, the dashboard at `/dashboard`.

## CORE vs PLUS — read this first

This repository is the **CORE** (open-source) edition. There is a closed-source
**PLUS** edition that lives in `src/plus/` (**not present in this repo**). The codebase
is engineered so that core and plus coexist:

- `src/version.ts` → `getWAHAVersion()` returns `PLUS` if `src/plus/` exists at runtime
  (and `WAHA_VERSION` is not forced to `CORE`), otherwise `CORE`.
- `src/main.ts` dynamically imports `AppModulePlus` when the plus dir exists, else `AppModuleCore`.
- Core classes are suffixed `*Core` (e.g. `AppModuleCore`, `WebjsClientCore`,
  `session.webjs.core.ts`, `manager.core.ts`). Plus subclasses/extends them.
- Many core types are **abstract base classes** (`src/core/abc/`) that both editions implement.

**Hard rules enforced by pre-commit hooks — do not break these:**

1. **No `plus` references in core.** The string `plus` must not appear in
   `src/api/**`, `src/core/**`, `src/structures/**`, or `src/config.service.ts`
   (pygrep hook `no-plus-in-core`).
2. **`[PLUS]` commit prefix.** Commits that touch `src/plus/**` must start with `[PLUS]`,
   and such commits may touch **only** `src/plus/**`. Commits to other paths must **not**
   use the `[PLUS]` prefix (hook in `.precommit/validate_commit_message.py`).
   Core commits in this repo conventionally start with `[core]` (see `git log`).
3. **No `console.log`.** Use the injected pino logger instead (`no-console-log` hook).

When working in this repo you will almost always be in CORE territory. Keep core code
free of any awareness of plus.

## Engines

WAHA abstracts three interchangeable WhatsApp backends. The active engine is chosen by
the `WHATSAPP_DEFAULT_ENGINE` env var (default `WEBJS`, see `src/config.ts`).

| Engine  | Value   | Backing library                          | Browser? | Location                      |
|---------|---------|------------------------------------------|----------|-------------------------------|
| WEBJS   | `WEBJS` | `whatsapp-web.js` (devlikeapro fork) via Puppeteer | yes (Chromium/Chrome) | `src/core/engines/webjs/` |
| NOWEB   | `NOWEB` | `@adiwajshing/baileys` (devlikeapro fork) | no       | `src/core/engines/noweb/`     |
| GOWS    | `GOWS`  | Go `whatsmeow` subprocess over gRPC (`devlikeapro/gows`) | no | `src/core/engines/gows/` |

Each engine implements the abstract `WhatsappSession` from `src/core/abc/session.abc.ts`,
producing concrete `session.<engine>.core.ts` classes. GOWS spawns and talks to a Go
subprocess; its protobuf/gRPC code is generated (see "Protobuf / GOWS" below) and is
**git-ignored** under `src/core/engines/gows/proto/`.

The `WAHAEngine` enum and other core enums (`WAHAEvents`, `WAHASessionStatus`,
`WAHAPresenceStatus`, `WAMessageAck`) live in `src/structures/enums.dto.ts`.

## Repository layout

```
src/
  main.ts                  # Bootstrap: pino logging, exception filters, swagger, listen
  config.service.ts        # WhatsappConfigService — reads env vars, central config
  config.ts                # getEngineName() (WHATSAPP_DEFAULT_ENGINE)
  version.ts               # VERSION constant + CORE/PLUS detection
  api/                     # NestJS @Controller classes — the public REST + WS surface
  structures/              # *.dto.ts — request/response DTOs, enums, webhook payloads
  core/
    abc/                   # Abstract base classes: session.abc, manager.abc, DataStore, ...
    app.module.core.ts     # Root Nest module (CORE)
    manager.core.ts        # SessionManager implementation (CORE)
    engines/{webjs,noweb,gows}/   # Engine-specific session implementations
    auth/                  # API key + basic auth (api_key header, dashboard/swagger auth)
    config/                # Per-feature config services (engine, swagger, dashboard, webhook)
    media/                 # Media storage abstraction (LOCAL / S3 / PostgreSQL) + converters
    storage/               # Session auth/config/me/worker repos; sql + sqlite3 KV stores
    integrations/webhooks/ # WebhookSender + WebhookConductor (outbound webhooks)
    health/                # Health-check service
    services/              # Shared core services (e.g. ChannelsInfoServiceCore)
  apps/                    # Pluggable "apps" framework on top of BullMQ
    app_sdk/               # App SDK: consumers, jobs, auth, migrations
    chatwoot/              # Chatwoot integration app
  modules/rmutex/          # Redis-backed distributed mutex
  nestjs/                  # Cross-cutting Nest infra: filters, interceptors, pipes,
                           #   validation decorators, param decorators, websocket helpers
  utils/                   # Generic helpers (logging, ids, reactive/rxjs, bull, ...)
  dashboard/               # Git-ignored at build time; UI is fetched separately
tests/
  smoke/                   # goss container smoke tests (goss.yaml)
  perf/                    # k6/node perf scripts
```

Unit tests are colocated as `*.test.ts` next to source (jest `testRegex: .test.ts$`,
`rootDir: src`). There are very few of them; most verification is via smoke/e2e and manual.

## Key conventions

- **Path alias:** import internal modules with `@waha/*` → `src/*` (configured in
  `tsconfig.json` and resolved by `tsconfig-paths`). Prefer `@waha/...` over deep
  relative paths in new code; match whatever the surrounding file already uses.
- **DTOs in `src/structures/`:** every request/response shape is a class in a `*.dto.ts`
  file, decorated with `class-validator` + `@nestjs/swagger` decorators. Controllers
  reference these DTOs so Swagger and validation stay in sync.
- **Controllers in `src/api/`:** thin — they validate input (`WAHAValidationPipe`),
  resolve the session via `SessionManager`, and delegate to the engine session.
  They carry `@ApiSecurity('api_key')`, `@ApiTags(...)`, and `@ApiOperation(...)`.
  Use the shared param decorators in `src/nestjs/params/` (`SessionApiParam`, etc.).
- **Abstract-base pattern:** put shared behavior in `src/core/abc/*.abc.ts`; engine- or
  edition-specific behavior in concrete subclasses. Don't add engine-specific branches
  in the abstract class — override in the subclass.
- **Logging:** use the injected pino logger (`nestjs-pino` / `PinoLogger`,
  `LoggerBuilder`). Never `console.log` (pre-commit will reject it).
- **Config:** read configuration through `WhatsappConfigService` and the per-feature
  `*ConfigService` classes, not by reading `process.env` ad hoc (a few bootstrap
  spots in `main.ts`/`config.ts`/`version.ts` are the exception).
- **Events:** event names are the `WAHAEvents` enum string values (e.g. `message`,
  `session.status`). Webhook payload types live in `src/structures/webhooks*.ts`.

## Development workflow

Requirements: **Node ≥ 22** (`.nvmrc` pins `v22.16`), **Yarn 3.6.3** (Berry, via corepack).

```bash
# Install dependencies
yarn install

# Fetch + compile the GOWS protobuf files (needed before running)
yarn gows:proto              # = yarn gows:proto:fetch && yarn gows:proto:build

# Run in dev (watch mode)
yarn start:dev               # plain run: yarn start  →  http://localhost:3000

# Production-style run
yarn build && yarn start:prod
```

Common scripts (`package.json`):

| Command            | What it does                                              |
|--------------------|-----------------------------------------------------------|
| `yarn start`       | `nest start`                                              |
| `yarn start:dev`   | `nest start --watch`                                      |
| `yarn build`       | `nest build` (output to `dist/`)                          |
| `yarn lint`        | `oxlint --deny-warnings` (lint must be warning-clean)     |
| `yarn lint-fix`    | `oxlint --fix --deny-warnings`                            |
| `yarn format`      | `prettier --write` over `src/` and `test/`                |
| `yarn test`        | `jest` (unit, `*.test.ts`)                                |
| `yarn test:cov`    | jest with coverage                                        |
| `yarn test:e2e`    | jest with `test/jest-e2e.json`                            |
| `yarn gows:proto`  | fetch + build GOWS gRPC/protobuf stubs                    |

**Linting/formatting:** this project uses **oxlint** (not eslint) and **prettier**.
Prettier config (`.prettierrc`): single quotes, trailing commas (`all`), 2-space
indent, semicolons, `printWidth: 80`, `proseWrap: always`. Run `yarn format` and
`yarn lint` before committing — they also run via pre-commit.

**Pre-commit hooks** (`.pre-commit-config.yaml`, install with `pre-commit install`):
oxlint (auto-fix), prettier, README table-of-contents regeneration, the `[PLUS]`
commit-message validator, `no-plus-in-core`, and `no-console-log`.

## Docker / build

- Image is built from the multi-stage `Dockerfile`. Build args select the engine/browser:
  `USE_BROWSER` (`chromium`/`chrome`/`none`) and `WHATSAPP_DEFAULT_ENGINE`.
- `Makefile` targets wrap the common builds:
  `make build` (chromium WEBJS), `make build-chrome`, `make build-noweb`, `make build-gows`,
  `make build-all`.
- The dashboard UI and GOWS binary are pulled from external repos at the SHAs pinned in
  `waha.config.json`.
- CI: `.github/workflows/build.yaml` builds the engine × browser × arch matrix on tag
  pushes and runs **goss** smoke tests (`tests/smoke/`).
- `docker-compose.yaml` and `docker-compose/` provide local stacks (Postgres, MongoDB,
  Redis, MinIO/S3) for the optional storage backends.

## Configuration (env vars)

`.env.example` is the canonical, commented reference. Highlights:

- `WHATSAPP_DEFAULT_ENGINE` — `WEBJS` (default) / `NOWEB` / `GOWS`.
- `WAHA_API_KEY` — API key for the `api_key` header (`sha512:...` form supported).
- `WAHA_DASHBOARD_*`, `WHATSAPP_SWAGGER_*` — enable/secure dashboard & Swagger.
- `WAHA_MEDIA_STORAGE` — `LOCAL` / `S3` / `POSTGRESQL` (+ matching `WAHA_S3_*` /
  `WAHA_MEDIA_POSTGRESQL_URL`).
- `WHATSAPP_SESSIONS_POSTGRESQL_URL` / `WHATSAPP_SESSIONS_MONGO_URL` — session storage backends.
- `WAHA_LOG_FORMAT` (`JSON`/`PRETTY`), `WAHA_LOG_LEVEL`, `WAHA_BASE_URL`.

Always add new config to `WhatsappConfigService` (and document it in `.env.example`),
rather than reading `process.env` directly in feature code.

## Protobuf / GOWS

GOWS talks to a Go `whatsmeow` subprocess over gRPC. The proto/gRPC TypeScript stubs are
**generated, not committed** (`src/core/engines/gows/proto/` is git-ignored). Regenerate
with `yarn gows:proto` (driven by `scripts/gows-proto.js`, pinned via `waha.config.json`).
If you see missing GOWS types after a fresh clone, run that first.

## When making changes

1. Keep CORE free of any `plus` reference; respect the abstract-base layering.
2. Put new request/response shapes in `src/structures/*.dto.ts` with validator + swagger
   decorators; wire them through a thin controller in `src/api/`.
3. For engine behavior, implement/override in the relevant `session.<engine>.core.ts`,
   keeping shared logic in `session.abc.ts`.
4. Use the pino logger, `@waha/*` imports, and `WhatsappConfigService` for config.
5. Run `yarn lint` + `yarn format` (and `yarn test` if you touched tested code) before
   committing.
6. Commit messages: `[core] ...` for normal changes; `[PLUS] ...` only for `src/plus/**`
   (and never mix the two in one commit).
