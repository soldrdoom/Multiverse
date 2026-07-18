# Fluxer ("Multiverse") — Project Report

_Generated 2026-07-17 as a handoff snapshot for continuing work from a different machine (Termux/Android)._

See also **`TODO.md`** in this same directory — a running backlog of things noticed incidentally while working on unrelated tasks (not urgent enough to stop and fix at the time, but worth circling back to).

## What this project is

Fluxer, product-named **Multiverse**, is a free and open source, self-hostable instant messaging and VoIP platform in the vein of Discord: servers ("guilds"), text/voice channels with categories and granular permissions, DMs, threaded replies, reactions, typing indicators, custom emoji/stickers, and voice/video calls with screen sharing. It's licensed **AGPLv3**, with a separate commercial licensing path (see `LICENSING.md`) and a CLA for contributors.

Repo location on this machine: `/root/multiverse/fluxer_vanguard` (git remote: `https://github.com/fluxerapp/fluxer.git`).

Related directories under `/root/multiverse/`: `fluxer_vanguard` is the actual application monorepo; the parent `multiverse/` folder also holds deployment/ops scripts, data volumes for backing services (`scylla_data`, `meili_data`, `minio_data`), and a `secrets/` folder — none of that is part of the app repo itself.

There's also a sibling checkout at `/root/multiverse_github_sync` containing the public docs site content (`multiverse_docs/`) — appears to be a separate sync target for `docs.fluxer.app`, not the main app.

## Tech stack

| Layer | Technology |
|---|---|
| Backend HTTP services | TypeScript + Node.js, **Hono** web framework |
| Real-time WebSocket gateway | **Erlang/OTP** (Cowboy, rebar3) — message routing & presence |
| Relay layer | **Erlang/OTP** (`fluxer_relay`) + TS directory service (`fluxer_relay_directory`) |
| Frontend (web + desktop) | **React 19**, MobX for state, rspack bundler, Tailwind v4 |
| Desktop packaging | **Electron** (`fluxer_desktop`, own nested pnpm workspace) |
| Performance-critical client code | **Rust → WASM** (`fluxer_app/crates/libfluxcore`, via wasm-pack) |
| Primary datastore | **SQLite** by default; optional **Cassandra** for distributed/scaled self-hosting |
| Cache / rate limiting / coordination | **Valkey** (Redis-compatible) |
| Full-text search | **Meilisearch** |
| Object storage | S3-compatible (`@aws-sdk/client-s3`) |
| Messaging between services | **NATS** (JetStream) |
| Voice/video | **LiveKit** SFU (WebRTC) |
| i18n | **Lingui** |
| Build orchestration | **Turborepo** + **pnpm** workspaces (catalog-pinned dependency versions) |
| Lint/format | **Biome** |
| Testing | **Vitest** |
| Dev environment | **devenv** (Nix-based reproducible shell), with an experimental Docker/VS Code Dev Container fallback |
| Observability | OpenTelemetry, Sentry, Pino logging |
| Auth extras | WebAuthn/passkeys (`@simplewebauthn`), OAuth2, Bluesky OAuth, hCaptcha/Turnstile |
| Solana / Web3 | `@solana/web3.js` (server only), `bs58`, `tweetnacl`, `libsodium-wrappers` (client) — see dedicated section below |

## Repository structure

Monorepo managed by pnpm + Turborepo. Workspace packages: `packages/*`, `fluxer_server`, `fluxer_app`, `fluxer_integration/*` (per `pnpm-workspace.yaml`). Notable top-level members:

- **`fluxer_server`** — umbrella Node/TS service bundling all backend services together for simple self-hosting.
- **`fluxer_gateway`**, **`fluxer_relay`** — Erlang/OTP services (outside the pnpm workspace, built with rebar3).
- **`fluxer_relay_directory`** — TS registry/discovery service for relays.
- **`fluxer_app_proxy`**, **`fluxer_media_proxy`** — TS proxy services (media fetch/transform).
- **`fluxer_admin`** — admin panel.
- **`fluxer_marketing`** — marketing site.
- **`fluxer_app`** — the React web client, also the base for the Electron build.
- **`fluxer_desktop`** — Electron desktop wrapper.
- **`fluxer_docs`** — Mintlify-based docs site (`docs.fluxer.app`).
- **`packages/`** — ~40 shared internal libraries (config, api domain logic, cassandra, s3, nats, rate_limit, i18n, logger, sentry, telemetry, oauth2, markdown_parser, snowflake IDs, etc).
- **`fluxer_devops/`** — deployment helpers, e.g. `livekitctl` for bootstrapping a LiveKit SFU.

Full architectural notes (service responsibilities, config flow, storage options, contribution workflow) are captured in **`CLAUDE.md`** at the repo root — that file is the canonical, up-to-date reference and should be read first when resuming work.

## Solana / Web3 subsystem

Fluxer has a real, non-trivial Solana integration spanning auth, encryption, and commerce. Four distinct features, all wallet-based (no email/password required for the wallet paths):

### 1. Wallet-based sign-in (Sign-In With Solana / SIWS)
- **Wallets supported**: Phantom, Solflare, Backpack, Coinbase Wallet, Magic Eden, and Jupiter — plus any wallet registered via the Wallet Standard (`solana:signMessage` feature detection), so the list isn't a hard allowlist. Provider resolution prefers Jupiter by name among wallet-standard registrants, then falls back to directly injected providers (`window.phantom?.solana`, `window.solana`, `window.solflare`, `window.coinbaseSolana`, `window.backpack?.solana`, `window.magicEden?.solana`).
- **Client**: `fluxer_app/src/components/auth/AuthLoginLayout.tsx` (`handleSolanaLogin`) — fetches a nonce, gets the SIWS message signed by the wallet, posts it for verification; new wallets are redirected to `Routes.SOLANA_ONBOARDING` (`SolanaOnboardingPage.tsx`) to pick a username/email before the account is finalized.
- **Server**: `packages/api/src/auth/services/SolanaAuthService.tsx` (427 lines), wired up in `packages/api/src/auth/AuthController.tsx` at `/auth/solana/nonce`, `/auth/solana/verify`, `/auth/solana/finalize`, `/auth/solana/verify-email` — independently verifies the SIWS message/signature server-side using Node's `node:crypto` (Ed25519), hand-rolled base58 decode, domain pinned to `multiverse.forum`.
- No third-party wallet-adapter library (`@solana/wallet-adapter-*`) is used — the provider interface is hand-typed and hand-driven on both client and server.

### 2. NFT-gated cosmetics (stickers, etc.)
- **Server**: `fluxer_server/src/utils/NftFetcher.tsx` — queries Solana **mainnet-beta** via the DAS API (compatible with Helius/Shyft/QuickNode), reads Token Metadata program (`metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`), supports both regular and **compressed NFTs (cNFTs)**, paginates up to 1,000 NFTs per wallet, normalizes `ipfs://`/`ar://` URIs.
- **Domain logic**: `packages/api/src/cosmetics/CosmeticsController.tsx` + `CosmeticsRepository.tsx`, `packages/schema/src/domains/cosmetics/CosmeticSchemas.tsx`.
- **Client**: `CosmeticsShopModal.tsx`, `CosmeticsTab.tsx`, `CosmeticsStore.tsx`, `CosmeticsService.ts`, `NftStickerRecord.tsx` — lets a user connect a wallet, have their NFTs enumerated, and unlock cosmetics (e.g. NFT-derived stickers) tied to ownership.

### 3. Identity Vault — wallet-derived E2EE for DMs
- `fluxer_app/src/services/vault/VaultService.ts` (248 lines), surfaced via `IdentityVault.tsx` settings section / `VaultTab.tsx` / `useVault.tsx`.
- **Flow**: user signs a deterministic challenge string with their wallet → the 64-byte Ed25519 signature is hashed (SHA-512) → first 32 bytes seed an Ed25519 keypair → converted to X25519 via `libsodium-wrappers` for ECDH → X25519 pubkey registered with the backend → the X25519 private key is encrypted (AES-256-GCM, key derived via HKDF-SHA-256 from the current session token) and stored in its own IndexedDB database (`MultiverseVault`), isolated from all other app data.
- Explicitly labeled in-code as **"Phase 1 E2EE (DMs only)"** — i.e. a first iteration, not full-coverage E2EE yet.

### 4. Solana Pay–style checkout (Premium subscriptions)
- `fluxer_app/src/components/modals/SolanaCheckoutModal.tsx`, backed by `PremiumActionCreators.tsx` (`SolanaInvoice` type: `amountLamports`, `sol`, `usd`, `solPriceUsd`, `recipient`, `recentBlockhash`, `expiresAt`).
- Flow: `createSolanaInvoice(plan)` → user pays from their wallet → `verifySolanaPayment(invoiceId, txSignature)` confirms on-chain. Transaction bytes are hand-encoded/decoded client-side with a local base58 codec (also uses the `bs58` package elsewhere) rather than pulling in `@solana/web3.js` on the client.

### Dependency footprint
- **`fluxer_server`** (Node backend): `@solana/web3.js ^1.98.4` — used server-side for `Keypair`/`PublicKey` (e.g. `fluxer_server/test_solana.ts` is a smoke-test script, not a real feature file).
- **`fluxer_app`** (browser client): deliberately does **not** bundle `@solana/web3.js`. Instead: `bs58` (base58 codec), `tweetnacl` (NaCl primitives), `libsodium-wrappers` + `@types/libsodium-wrappers` (Ed25519→X25519 conversion for the Vault). No `@solana/wallet-adapter-*`, no Metaplex/Anchor/SPL-token packages anywhere in the repo.
- No wallet other than Phantom/Solflare/generic-injected is explicitly named anywhere in code or comments — there's no WalletConnect, mobile deep-linking, or hardware-wallet-specific handling visible.

### Battleworld — removed (2026-07-17)
Battleworld was a separate wallet-gated WebGL experience (its own page, a dedicated SIWS hook, a logo visualizer component, and — historically — an `battleworld.quest` nginx vhost and a `/root/battleworld-authority.json` Solana keypair). It has been fully scrapped:
- **Code deleted**: `fluxer_app/src/pages/battleworld/` and `fluxer_app/src/services/visualizer/` (the only consumer of both was Battleworld — nothing else imported them).
- **Stale build artifacts deleted**: `fluxer_server/static/` (71MB, not the live-served `dist/`), `maps_backup/` (45MB of old sourcemaps), and the one bundle in `patches/` that still contained compiled Battleworld strings.
- **Server-level access**: already clean before this pass — no `battleworld.quest` nginx vhost, no matching TLS cert, no crontab/systemd entries, no CSP/CORS allowances, and no references anywhere in `config.json` or `.env` files. (`ledger.md` shows a prior purge on 2026-03-13 already removed most of this; Battleworld was apparently rebuilt afterward as this standalone page, which is what got removed here.)
- **`/root/battleworld-authority.json`**: the orphaned Solana keypair that used to live outside the repo in `$HOME` has been deleted at the user's explicit confirmation.

## Development workflow (as documented)

```bash
devenv shell   # enter reproducible Nix dev environment
devenv up      # boots Postgres/NATS/backend via one process manager, serves at :48763
```

```bash
pnpm build | pnpm lint | pnpm typecheck | pnpm test   # turbo-orchestrated, repo root
pnpm --filter <pkg> test                                # scope to one workspace package
```

Contribution rules: PRs target the `canary` trunk branch, titles follow Conventional Commits (squash-merged), backend changes want a unit test, frontend changes don't require one unless the area already has coverage or the change is high-risk.

## ⚠️ Important note for switching to Termux (Android)

The project's **only fully-supported dev workflow depends on Nix (`devenv shell`/`devenv up`)**, plus native services (Postgres, NATS, Valkey/Redis, Meilisearch, LiveKit) and a Rust→WASM toolchain (`wasm-pack`) for the frontend build. Nix does not run natively on Android/Termux (no traditional root filesystem control, no kernel namespaces support in stock Termux), so `devenv shell` / `devenv up` will very likely **not work as-is** on a Termux checkout.

Practical implications to plan around before switching machines:
- You probably cannot run the full stack (gateway + relay in Erlang, backend in Node, Postgres/NATS/Valkey/Meilisearch/LiveKit) directly in Termux without an alternative environment (e.g. a Linux container via `proot-distro`, or developing read-only/editing-only in Termux and running/testing on this machine or a remote VM).
- Erlang/OTP (`rebar3`) and Rust (`wasm-pack`) toolchains would need separate installation in Termux/proot — devenv normally provides these via Nix.
- If you only need to **read/edit code and commit** from the phone (not run the stack), plain `git`, `node`, and `pnpm` in Termux should be sufficient for the TypeScript packages; just expect `typecheck`/`build` on `fluxer_app` to fail without the WASM toolchain unless you install `wasm-pack` and Rust separately.
- Consider whether the intent is "edit on phone, run/test on this VM" (e.g. via SSH) rather than a fully standalone Termux dev loop — that avoids re-solving the Nix/Erlang/Rust toolchain problem on Android.

This is worth deciding explicitly before the switch, since it changes what "picking up where you left off" can mean on that device.

## 2026-07-18 session — repo hygiene audit, login hero, and a critical infra discovery

Started as "add a hero section to the login page + a support page," but surfaced several things worth a permanent record before a production deploy happened.

### This machine is the live production server

This was not established anywhere in prior docs and matters a lot: `/root/multiverse/fluxer_vanguard` on this VPS (hostname `vmi3160311`, Contabo, IP `92.118.57.149`) **is** the box serving `multiverse.forum` — the domain resolves directly to this machine's IP, nginx is listening on 80/443 with a `multiverse` site config, and a Docker Compose stack (`nats`, `valkey`, `fluxer_gateway`, `fluxer_server`, all "Up 2 months" as of this session) is the actual live service.

Critically, **the live `fluxer_server` container does not run from this checkout**. Per `compose.yaml`, only `./config` and `./server_data` are bind-mounted into the container — the application code itself is baked into the image `multiverse-server:local`, which was last built **2026-04-19** (confirmed via `docker images`). So: editing files in this repo, or even committing/pushing them, has **zero effect on the live site** until someone explicitly rebuilds that image and recreates the `fluxer_server` container (`fluxer_server/Dockerfile` is the build source). This surprised the user mid-session — they'd assumed "push it live" was a git operation, but git push here is unrelated to deployment; the Docker image rebuild is the actual deploy mechanism.

### The 5,400-file uncommitted rebrand + a near-miss on secrets

At session start, `git status` showed **5,474 uncommitted changes** on the `refactor` branch (tracking `origin/refactor` on `fluxerapp/fluxer`, the upstream OSS repo) — turned out to be a from-scratch Fluxer→Multiverse rebrand (copyright headers, product strings, generated i18n catalogs) that had never been committed. The user confirmed this was intentional, finished work, and asked for it to be committed and pushed as-is.

Before doing that, an audit of the untracked (not just modified) files turned up two real problems:

1. **Live secrets were untracked but not actually gitignored.** `config.json` (root), `fluxer_server/config.json`, `config/config_security.json`, `config/ssl/`, and `nats.conf` all carry real values (S3 keys, VAPID keys, admin OAuth secrets, sudo-mode secret — confirmed non-empty, never previously committed) but the `.gitignore` pattern only covered `/config/config.json`, not the root-level file, and had no rule at all for the others. A blind `git add -A` would have pushed these to the public `fluxerapp/fluxer` GitHub repo. Fixed: `.gitignore` now explicitly covers `/config.json`, `/fluxer_server/config.json`, `/config/config_security.json`, `/config/config_core.json`, `/config/config_assets.json`, `/config/CC_Part{1,2,3}.json`, `/config/ssl/`, `/nats.conf`, `/server_data/`, `/fluxer_api/data/`, `/fluxer_relay_directory/data/`, `/.claude/`.
2. **A live Helius API key was hardcoded directly in `compose.yaml`** (`SOLANA_DAS_URL`, tracked file) — newly added in the uncommitted diff, so it was about to enter git history for the first time. Caught before push (nothing was ever public). Fixed: replaced with `${HELIUS_API_KEY}` interpolation in `compose.yaml`, real value moved to `.env` (gitignored, already loaded by Docker Compose automatically).

Also found and correctly excluded from the commit: `patches/` (a personal local customization layer overriding `SmtpEmailProvider.tsx`/`ServiceInitializer.tsx`/`Routes.tsx`, plus a full built frontend bundle — legitimate self-hosting pattern, not malicious, but shouldn't land in shared history), several personal ops/debug scripts (`diag.sh`, `vanguard_diag.sh`, `sovereign_start.sh`, `fluxer_server/{hello.js,inspect_crash.ts,probe.tsx,test_bind.ts,test_solana.ts,vanguard_shield.ts}`, `packages/api/launcher.ts` — the last one also hardcodes a local dev search key), and assorted scratch files (`catalog_*.txt`, `repair_catalog.py`, a stray `twemoji-api-*.tgz`, `fluxer_app/package-lock.json`).

**Also restored, not excluded**: a large set of untracked-but-required source files — Identity Vault (E2EE), Solana/Web3 (`SolanaWalletStore`, `Web3Modal`, `SolanaCheckoutModal`), and Cosmetics feature code, plus 4 Cassandra migrations — that already-tracked files (`GuildNavbar.tsx`, `AppLayout.tsx`, etc.) import and depend on. These had simply never been `git add`ed; without them, a commit of only the "modified" files would have shipped broken imports.

Net result: one commit (`chore: sync repo to Multiverse rebrand, restore vault/solana/cosmetics source, add login hero`, later amended to scrub the Helius key) covering ~5,400 files, cleanly scoped to real product source.

### GitHub remote confusion — unresolved, needs follow-up

The local checkout's `origin` pointed at `fluxerapp/fluxer` (the upstream open-source project) the whole time, which is almost certainly not where personal deploys should go. The user's actual personal fork is **`github.com/soldrdoom/Multiverse`** — but it has a completely unrelated git history (no common ancestor with this checkout's `refactor` branch) and a **10,112-file diff** against it, bigger than the rebrand diff handled this session. Its `main` branch has only two commits ("Initial Sovereign Commit v0.2.0.0" and one that "injects SolanaAuthService logic"), suggesting `soldrdoom/Multiverse` may already have more advanced state in some areas than this checkout.

**This was not reconciled this session.** The user directed: treat this sandbox's checkout as correct and push it to `soldrdoom/Multiverse` as a new branch (not overwriting `main`), for later review/merge — but the push never completed due to SSH auth setup (a new deploy key had to be issued for this specific machine; the existing "Multiverse VPS" GitHub key, added Feb 20 2026, belongs to key material not present anywhere on this filesystem, so it's presumably from a since-lost or rotated setup). Whoever picks this up next should either complete that push+reconciliation, or — probably better — actually diff the two to understand *why* `soldrdoom/Multiverse` is 10K files apart before merging anything, since "ahead" and "diverged" aren't the same thing.

### Login page hero

Built and live-compared all 4 design concepts from an earlier design review (Signal/minimalist, Feature Showcase, Visual Showcase, Trust Ledger) via a throwaway dev-only switcher on `/login`, using a real running dev server + headless Chromium screenshots (Playwright, installed fresh into the sandbox for this — not a project dependency). User picked **Concept B (Feature Showcase)**: headline + subhead + 3 feature rows (self-hosted, voice/video, Solana login). Now permanent at `fluxer_app/src/components/auth/AuthLoginHero.tsx`, wired into `AuthLayout.tsx` only on `/login`, with real Lingui `<Trans>` strings (extracted + compiled). Verified at 1600px/1366px/mobile — hero is desktop-only by design, mobile shows the form alone. Typecheck diffs identically to the pre-session baseline (67 pre-existing unrelated errors, zero new ones).

### Support page shipped — and a bigger discovery: marketing pages were never actually live

Added `packages/marketing/src/pages/SupportPage.tsx` (Documentation link, "coming soon" Whitepaper, Roadmap link — same `renderContentLayout`/`.help-card` pattern as `HelpIndexPage.tsx`), wired into `MarketingRouteRegistrar.tsx`, `Sitemap.tsx`, and `Footer.tsx`, with new `company_and_resources.support.*` i18n keys.

While verifying it live, found something bigger: **`packages/marketing`'s routes were never mounted into the actual running server at all.** `registerMarketingRoutes` is only ever called from `packages/marketing/src/App.tsx`'s own standalone `createMarketingApp()` — nothing in `fluxer_server` (the umbrella container actually deployed here) ever called it, and no separate `fluxer_marketing` container or nginx route existed either. Every marketing path (`/help`, `/terms`, `/support`, ...) had been silently falling through to the SPA's `index.html` — confirmed by fetching `/support` right after the first deploy and finding the chat app's shell instead of real content, despite a `200` status.

This predates the session; it's a structural gap between "self-hosted single container" (what's actually deployed, per `compose.yaml` + this VPS's `docker ps`) and "marketing runs as its own service" (what the code assumed). Root cause: `config/config.json`'s `services.marketing.enabled` flag — whose schema description literally says *"Whether to enable the Marketing service **within fluxer_server**"* — was never actually read by any routing code. The flag existed; nothing honored it.

**Fix** (user chose "mount marketing into fluxer_server" over "stand up a separate service"): `fluxer_server/src/Routes.tsx` now calls `createMarketingApp()` directly and mounts the result at `/` via `app.route('/', marketingResult.app)`, guarded by `if (config.services.marketing)`. Two new options were added (`registerMarketingRoutes`/`createMarketingApp`: `mountHome`, `mountNotFound`, both default `true` for the standalone-service case) so the embedded mount can skip marketing's own `/` and catch-all handlers — those still need to belong to the SPA. `basePath` is force-set to `''` regardless of the schema's `/marketing` default, since embedded routes live directly at e.g. `/help`, not `/marketing/help`. Verified live: root still serves the chat app (confirmed via the SPA-only `channels/@me` redirect script, to be certain marketing's homepage wasn't shadowing it), `/support` and `/help` now render real content, gateway/API/health all unaffected.

Also caught along the way: `NotFoundPage.tsx` imported from a path that was never actually renamed in the rebrand (`MultiverseLogoWordmarkIcon` from a same-named-but-nonexistent file instead of the real `FluxerLogoWordmarkIcon.tsx`), and `MarketingCard`'s `children` prop type was too strict for conditional-rendering patterns already in use (`FeatureCard.tsx`) — only surfaced now because `fluxer_server` had never depended on `packages/marketing` before. Both fixed; both pre-existing, unrelated to this session's actual work.

**Also confirmed and corrected mid-session**: an earlier edit was mistakenly made to `patches/Routes.tsx` before realizing that file is never actually used by the Docker build (the Dockerfile copies `fluxer_server/` directly; nothing overlays `patches/Routes.tsx` onto it). The real, live file is `fluxer_server/src/Routes.tsx` — a separate, tracked file with almost-but-not-quite the same content (it additionally has the NFT-sticker-fetch endpoint that `patches/Routes.tsx` lacked). If `patches/` is meant to be applied at some point, that mechanism doesn't currently exist for `Routes.tsx`/`ServiceInitializer.tsx`/`SmtpEmailProvider.tsx` — worth checking `TODO.md` or asking the user whether those patch files are meant to matter at all.

### Still pending as of end of session

- Push to `soldrdoom/Multiverse` — **done** this session (pushed `refactor` as a new branch, `main` untouched; see the PR link the user was given). LFS objects were skipped (`GIT_LFS_SKIP_PUSH=1`) due to a defunct `.lfsconfig` — see `TODO.md`.
- Whether `patches/Routes.tsx`, `patches/ServiceInitializer.tsx`, `patches/SmtpEmailProvider.tsx` are meant to be wired into the build somehow, or are abandoned drafts safe to ignore/delete — unresolved, see `TODO.md`.
