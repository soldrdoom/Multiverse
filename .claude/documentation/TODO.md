# To-Do — incidental discoveries

Running backlog of things noticed while working on unrelated tasks: not
blocking whatever was in progress at the time, but worth fixing. Add a
dated entry when you find something; note here when it's resolved rather
than deleting the entry, so there's a record of what's already been dealt
with.

---

## 2026-07-18 — `.lfsconfig` points at a defunct private repo

**Found while:** pushing the `refactor` branch to `soldrdoom/Multiverse` (see `PROJECT_REPORT.md`'s 2026-07-18 session notes for full context).

**What's wrong:** `.lfsconfig` at the repo root points Git LFS at `https://github.com/fluxerapp-old/fluxer-private.git/info/lfs` — a private repo from an earlier point in this project's history, unrelated to both `fluxerapp/fluxer` (upstream) and `soldrdoom/Multiverse` (this fork). `.gitattributes` marks `fluxer_static/**` as LFS-tracked (currently just the 6 default avatar PNGs, `fluxer_static/avatars/0.png`–`5.png`).

**Impact:** any `git push` that includes LFS-tracked objects tries to authenticate against that old, inaccessible repo and hangs/fails. Had to push with `GIT_LFS_SKIP_PUSH=1` to get the `refactor` branch up at all — meaning the LFS objects themselves (the 6 avatar PNGs) are **not yet on `soldrdoom/Multiverse`**, only the LFS pointer files are.

**Fix options** (pick one):
1. Point `.lfsconfig` at wherever LFS should actually live for this fork (`soldrdoom/Multiverse`'s own LFS storage, if GitHub LFS is enabled for it) — the normal fix, keeps LFS.
2. Simpler, given the actual files: each avatar PNG is only ~1.6KB — LFS exists to keep large binaries out of git history, and these are nowhere near that threshold. Just un-LFS them (remove the `fluxer_static/**` line from `.gitattributes`, re-add the real PNG bytes as normal git blobs) and drop `.lfsconfig` entirely. Probably the right call unless there's a reason to expect `fluxer_static/` to hold much larger files later.

**Status:** not started.

---

## 2026-07-18 — `patches/Routes.tsx`, `ServiceInitializer.tsx`, `SmtpEmailProvider.tsx` are dead code

**Found while:** mounting `packages/marketing` into `fluxer_server` for the `/support` page work (see `PROJECT_REPORT.md`'s 2026-07-18 session notes).

**What's wrong:** `patches/` contains what look like personal customized versions of three core files — `Routes.tsx`, `ServiceInitializer.tsx`, `SmtpEmailProvider.tsx` — sitting alongside the real, tracked versions at `fluxer_server/src/Routes.tsx` etc. Checked the actual `fluxer_server/Dockerfile`: it copies `fluxer_server/` directly (`COPY fluxer_server/ ./fluxer_server/`) and never overlays anything from `patches/` onto those specific files (only `patches/badges/` and `patches/emoji/` — plain asset directories — actually get copied over app assets; the `patches/index.html` and `patches/web/` overrides were removed this session for a separate reason, see the login-hero deploy notes). So right now, editing `patches/Routes.tsx` has **zero effect** on what actually runs — confirmed the hard way, by editing it first, rebuilding, and finding the change wasn't reflected until the edit was redone on the real file.

Also notable: `fluxer_server/src/Routes.tsx` (the real one) is actually slightly *ahead* of `patches/Routes.tsx` — it has an NFT-sticker-fetch endpoint (`/v1/nfts`) that the patches version lacks. So `patches/Routes.tsx` isn't even a superset; it looks like an abandoned earlier draft.

**Open question:** is there a manual step (run by hand, not automated) where these patches get copied over the real files before some other build path — e.g. a non-Docker deploy, or a step in tooling that wasn't found this session? Or are these just stale and safe to delete?

**Status:** not started — needs the user's own memory of what `patches/` was originally for, since nothing in the repo currently wires it up for these three files.

---

## 2026-07-18 — `docker compose build fluxer_server` is a silent no-op

**Found while:** trying to redeploy the login-page Support link fix (see `PROJECT_REPORT.md`'s "cont'd" session notes).

**What's wrong:** `compose.yaml`'s `fluxer_server` service has no `build:` key at all — only `image: multiverse-server:local`. Running `docker compose build fluxer_server` exits 0 with no output and leaves the image completely unchanged; there's nothing wrong, there's just nothing *to* build from compose's perspective. No error, no warning — it looks exactly like a successful no-op rebuild.

**Impact:** easy to think you've redeployed when you haven't. The actual working deploy command (confirmed this session) is a plain `docker build -f fluxer_server/Dockerfile -t multiverse-server:local .` run from the repo root, followed by `docker compose up -d fluxer_server` to recreate the container from the new tag.

**Fix options** (pick one):
1. Add a proper `build:` section to `compose.yaml`'s `fluxer_server` service (`context: .`, `dockerfile: fluxer_server/Dockerfile`) so `docker compose build` actually works and matches what everyone's muscle memory expects.
2. Leave it as-is but document the real command somewhere obvious (e.g. a `deploy` script or a README note), since apparently two sessions in a row have had to rediscover this by hand.

**Status:** not started. **Update 2026-07-19:** the same pattern was repeated deliberately for the new `iris_bot`/`ollama` services (`image: iris-bot:local` / `image: ollama/ollama:latest`, no `build:` key) — so this no-op affects three services now, not just `fluxer_server`. Same fix options apply to all of them if this ever gets addressed.

---

## 2026-07-18 — Plutonium delinked from nav/footer/sitemap, feature left in place

**Found while:** a marketing branding pass requested after the Support page shipped (see `PROJECT_REPORT.md`).

**What's wrong (or rather, unresolved):** the user said "remove the Plutonium link, we won't be using it." Removed the links from `Navigation.tsx` (desktop + mobile drawer), `Footer.tsx`, and `Sitemap.tsx`, but left `MarketingRouteRegistrar.tsx`'s `/plutonium` route registration and `PlutoniumPage.tsx`/`PlutoniumSection.tsx` untouched — the page is still live at a direct URL, just no longer linked or indexed. That was a deliberate scope call (delinking is safe/reversible, deleting a whole premium-tier feature page is not, and "we won't be using it" is ambiguous between the two).

**Open question:** does "we won't be using it" mean fully retire the feature (delete the page/route, and check for any other references — billing flows, i18n keys like `pricing_and_tiers.plutonium.tier_name` / `footer.plutonium_tier`), or is delinking sufficient?

**Status:** resolved (superseded) — the 2026-07-18 monetization-removal session made Plutonium free for everyone, which answered this by making the question moot: there's no more subscription to sell, so the marketing page's job changed from "buy this" to "here's what's included." See the new entries below for that session's own follow-ups.

---

## 2026-07-18 — Stripe/donation/Visionary column cleanup: migration never actually written, and this deployment doesn't use Cassandra anyway

**Found while:** removing Stripe entirely and making Plutonium free (see `PROJECT_REPORT.md`); corrected while working on the vanity-link feature's rollout.

**Correction to an earlier entry in this file:** an earlier pass here claimed a `20260718120000_remove_stripe_donations_visionary.cql` migration existed alongside the vanity-purchases one. That was wrong — the DROP-TABLE SQL for Stripe/donation/gift-code/visionary tables was drafted in conversation and in the session plan, but the `.cql` file itself was never created. Only `20260718130000_guild_vanity_purchases.cql` exists on disk.

**Also found:** this VPS's live `config/config.json` sets `"database": {"backend": "sqlite", ...}` — this deployment doesn't run Cassandra at all. The SQLite backend (`packages/api/src/database/SqliteKV.tsx`) is a generic key-value emulation over one physical `kv_store` table; every `defineTable(...)` just becomes a `table_name` partition at runtime, with no DDL/migration step required. So for *this* instance, the Cassandra migration tooling is only relevant if/when a Cassandra-backed deployment exists — nothing to "apply" here for either the vanity-purchases table (it just works once the new code is deployed) or a future Stripe-column cleanup.

**Also found (important for whenever the Stripe-removal migration actually gets written):** `fluxer_api/scripts/CassandraMigrate.tsx`'s `check` command has a hard-coded forbidden-pattern list that includes `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DROP KEYSPACE/TYPE/INDEX`, and `CREATE INDEX/MATERIALIZED VIEW` — this is enforced in CI (`.github/workflows/migrate-cassandra.yaml` runs `check` before `up`). A migration that drops the old Stripe/donation/visionary tables as originally drafted would **fail CI validation outright**. Whoever picks up the Cassandra-side cleanup (for a Cassandra-backed deployment) needs a different approach than `DROP TABLE`/`DROP COLUMN` — this project's migration tool is deliberately forward-only/non-destructive, so the real answer might just be "leave the old tables/columns in place, unused, forever" rather than trying to physically remove them through this tool.

`User.tsx`/`UserTypes.tsx` still carry `stripe_customer_id`/`stripe_subscription_id`/`premium_type`/`premium_since`/`premium_until`/`premium_will_cancel`/`premium_billing_cycle`/`premium_lifetime_sequence`/`has_ever_purchased` as live (if now-unread) fields — nothing writes to them anymore, so they're inert, not broken.

**Status:** not started — no migration file exists to run; if a Cassandra-backed deployment ever needs this cleanup, it'll need a non-destructive approach given the tool's forbidden-pattern rules.

---

## 2026-07-18 — small stragglers from the Stripe/Visionary removal

**Found while:** the same removal pass, noticed but out of scope to chase down mid-task:

- `ValidationErrorCodes.VISIONARY_REQUIRED_FOR_BOT_DISCRIMINATOR` (in `packages/constants/src/ValidationErrorCodes.tsx`) has zero throw sites left anywhere — safe to delete along with its `ErrorCodeMappings.tsx`/i18n entries whenever someone's next in that file.
- `Routes.GIFT_REGISTER`/`Routes.GIFT_LOGIN` (in `fluxer_app/src/Routes.tsx`) are now unused string constants — their actual routes were removed from `AuthRoutes.tsx`, the constants weren't.
- `Routes.PREMIUM_CALLBACK` — confirmed this one predates the session (no registered route ever used it, just referenced in `RootComponent.tsx`'s standalone-route check), so it's not something this session broke, but it's dead in the same way and could be cleaned up alongside the other two if anyone's doing a routes-constants sweep.
- `giftBaseRoute` (bare `/gift` → redirect-to-`/channels/@me`) in `AuthRoutes.tsx` has no children left under it since `giftRegisterRoute`/`giftLoginRoute` were removed — still harmless, just vestigial.

**Status:** not started — none of these are broken, just leftover names/routes with nothing behind them.

---

## 2026-07-18 — bare-root vanity URLs (`multiverse.forum/official`) depend on Routes.tsx staying the single source of truth for top-level paths

**Found while:** building the guild vanity-link purchase feature's bare-root routing (Phase C of the monetization-removal work).

**What to know:** `RouterConstants.tsx`'s `isBareVanityCodePath` decides whether a bare single-segment path like `/official` should render the invite-landing page (vanity code) instead of bouncing an unauthenticated visitor to `/login`. It works by excluding every literal top-level segment already named in `fluxer_app/src/Routes.tsx`'s `Routes` object, so a real app route never gets mistaken for someone's custom link. **This only works if every top-level route the app registers has a corresponding entry in `Routes.tsx`** — a route added straight into `AuthRoutes.tsx`/`AppRoutes.tsx`/`RootRoutes.tsx` with a hardcoded path string and no `Routes.tsx` constant would silently fall through and get treated as a vanity-code candidate instead of a real page.

**Status:** not broken today (spot-checked against every route file touched this session, all path strings trace back to `Routes.tsx` constants) — just a maintenance invariant worth knowing about before adding a new bare single-segment top-level route in the future.

---

## 2026-07-18 — Phase C (guild vanity-link purchase) needs a real end-to-end SOL payment test

**Found while:** implementing the feature — backend (`GuildVanityPurchaseService`, Cassandra tables, fluxer_server RPC routes) and frontend (purchase modal, wallet-signing utility, `GuildVanityURLTab` gate, bare-root routing) all typecheck clean against the pre-existing baseline, but none of it has been exercised against a real wallet/real mainnet transaction — this sandbox has no way to do that.

**What to verify before calling this done:** owner buys → wallet signs → invoice/verify round-trip → `GuildFeatures.VANITY_URL` actually gets set → the tx-signature anti-replay check actually rejects a reused signature → the receipt/Solscan link renders → visiting the bare vanity URL while logged out actually shows the invite-landing page with the address bar unchanged (this last one in particular has never been visually confirmed, only reasoned through against the router's sort behavior).

**Status:** not started — needs a real small SOL payment on mainnet (or a devnet dry run first) plus a manual click-through, ideally before the Cassandra migration for `guild_vanity_purchases` gets applied to production.

---

## 2026-07-19 — corrected emoji sprite sheets are hot-patched live but not baked into the Docker image

**Found while:** fixing the emoji-picker "cut into 4 pieces" bug (see `PROJECT_REPORT.md`'s 2026-07-19 session notes for full root-cause writeup — the deployed `patches/emoji/spritesheet-emoji@2x.png` had genuine pixel-level corruption, unrelated to caching).

**What's done:** regenerated all 12 `patches/emoji/spritesheet-*.png` files (main + 5 skin tones, 1x/2x each) from the current `GenerateEmojiSprites.tsx` against the live CDN, verified clean, and `docker cp`'d them straight into the running `fluxer_server` container's writable layer. The live site is serving the corrected files right now.

**What's not done:** the Docker image itself (`multiverse-server:local`) was never rebuilt, so this fix only lives in (a) the current container's writable layer and (b) `patches/emoji/*.png` on disk (which is untracked by git, per the existing `patches/` notes elsewhere in this file). If the `fluxer_server` container is ever recreated from the existing image tag without first rebuilding — e.g. a plain `docker compose up -d` / `restart` after a host reboot, or someone reaching for `docker compose build` (which, per the entry above, is a silent no-op here) — the corrupted sprite sheets will reappear, since the image itself was never fixed.

**Fix:** run the real deploy sequence (`docker build -f fluxer_server/Dockerfile -t multiverse-server:local .` from repo root, then `docker compose up -d fluxer_server`) at least once so the corrected `patches/emoji/*.png` files that are already on disk actually get baked into the image, not just hot-patched into the running container.

**Status:** not started — live site is fine for now, but fragile until an actual image rebuild happens.

---

## 2026-07-19 — dark-skin-tone (`1f3ff`) emoji sprite sheet has real content gaps

**Found while:** the same emoji-sprite-sheet investigation above.

**What's wrong:** `multiverse.forum/emoji/` (the CDN `GenerateEmojiSprites.tsx` fetches source SVGs from) doesn't have assets for a fair number of compound ZWJ + gender + dark-skin-tone sequences — e.g. `🧎🏿‍♀️`, `🏃🏿‍♂️`, `🧘🏿‍♂️`. The generation script's placeholder fallback (a plain random-colored circle) fires for each, so `spritesheet-1f3ff.png`/`@2x` has a noticeable number of colored dots standing in for real emoji. Confirmed via the script's own `Missing SVG for ... using placeholder` log output during regeneration — dozens of hits, all dark-skin-tone combos.

**Impact:** lower severity than the corruption bug above (nothing renders *broken*, just occasionally the wrong/generic icon) — only affects users who've set the darkest skin-tone preference.

**Status:** not started — would need either sourcing the missing SVGs from somewhere else, or accepting the gap as a known limitation of whatever twemoji snapshot is hosted at that CDN path.

---

## 2026-07-19 — I.R.I.S. is a plain user account, not a real bot (`isBot: true`)

**Found while:** building the I.R.I.S. assistant service (see `PROJECT_REPORT.md`'s "I.R.I.S." session notes for the full story — including why the original OAuth2-bot-application plan was abandoned).

**What's true today:** I.R.I.S. (`iris@multiverse.forum`, user id `1528293381598957569`) is a normal registered user, created via the public `/auth/register` endpoint — not an OAuth2 application/bot account. It authenticates with a plain session token (`Authorization: <token>`, no `Bot ` prefix), doesn't show a "BOT" badge anywhere in the UI, and counts against nothing bot-specific (rate limits, permission defaults, etc. all apply to it as if it were a human member). This was an explicit, deliberate scope decision by the user ("create it as a regular user account for now, we'll set up bot infrastructure another time"), not an oversight.

**What real bot infrastructure would add, if this gets revisited:** an actual `isBot: true` account via `POST /oauth2/applications` (owned by the platform owner), which would show the BOT badge, use bot-specific rate-limit/permission paths, and be a real step toward the "Public Bot API" roadmap item (see the same session notes) rather than a one-off. The backend primitives for this (bot-token gateway auth, bot display names via the `globalName` feature added this same session, bot-scoped guild-join via `POST /oauth2/authorize/consent`) are all already confirmed working — see `.claude/plans/stateless-percolating-crystal.md` for the original researched plan, which is still valid if/when this gets picked back up. The blocker last time wasn't the bot infrastructure itself, it was needing the owner's own session to create an application owned by them — that'd need to be solved (e.g. the owner runs the creation call themselves, or performs it via the app's own UI once one exists) rather than re-attempted via any kind of auth-bypass endpoint.

**Status:** not started — I.R.I.S. works fine as a regular account for its current single-owner-DM-plus-one-guild scope; only matters if/when it needs to look/behave like a "real" bot, or the Public Bot API roadmap item gets built for real.

---

## 2026-07-19 — leftover `llama3.2:3b` model still cached in the `ollama_data` volume

**Found while:** the same I.R.I.S. session — empirically compared Llama 3.2 3B against Qwen3 0.6B before the user picked 0.6B as the actual default (see `PROJECT_REPORT.md`).

**What's wrong:** the `ollama_data` Docker volume still has the ~2GB `llama3.2:3b` model pulled from that comparison, even though `compose.yaml`'s `ollama` service now only auto-pulls `qwen3:0.6b` on boot. Harmless — just unused disk space (this VPS has 346GB free) — not a correctness issue.

**Fix:** `docker exec ollama ollama rm llama3.2:3b` whenever someone's tidying up, or just leave it in case 3B needs to be A/B-tested against 0.6B again later.

**Status:** not started — pure disk-space cleanup, no urgency.

---

## 2026-07-19 — I.R.I.S.'s platform-question deflection is a coarse keyword match, not real understanding

**Found while:** the same session, after the underlying model was caught confidently inventing a wrong answer about self-hosting (see `PROJECT_REPORT.md`).

**What's true today:** `MessageHandler.tsx`'s `PLATFORM_KEYWORDS`/`mentionsPlatform()` catches an incoming message and deflects with a fixed reply *before* it reaches the model, but only if the message contains one of a fixed list of exact substrings (`multiverse`, `self-host`, `whitepaper`, `roadmap`, `tokenomics`, `plutonium`, `identity vault`, `bot api`, `agplv3`, `agpl`, `csam`, etc.). A platform question phrased without any of those words (e.g. "how do messages get delivered here," "can I run my own copy of this") would sail past the guard and reach the model directly — which, per the same session's testing, is willing to confidently make something up rather than admit it doesn't know.

**Impact:** low today (I.R.I.S. only talks to its one owner, who already knows not to trust it on platform facts) — would matter more if I.R.I.S.'s audience or scope ever expands (see the entry above about it being a plain account, and the "Public Bot API" roadmap item).

**Status:** not started — the keyword list can be extended incrementally as gaps are found; a more robust fix (e.g. a lightweight intent classifier, or just re-enabling the already-built-but-disabled `KnowledgeBase.tsx` whitepaper/roadmap grounding, which tested as accurate in the earlier 3B comparison) is a separate, bigger decision for whoever revisits I.R.I.S.'s scope.
