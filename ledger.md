# Ledger

Versioned changelog for `fluxer_vanguard`. Distinct from
`PROJECT_REPORT.md`/`TODO.md`, which track deploy-operational history.

Version format: `MAJOR.MINOR.PATCH.BUILD`

- **BUILD**: routine/internal commits, refactors, chores, docs.
- **PATCH**: user-facing bug fixes.
- **MINOR**: new features or capabilities.
- **MAJOR**: breaking changes (requires explicit user confirmation).

---

## 0.1.0.0 — 2026-07-25

Verification sprint against production (multiverse.forum) using the
test_dummy account, covering the 16-commit snapshot on
`chore/production-snapshot-2026-07` that landed 304 previously-uncommitted
files (admin panel revamp, badges feature, news feature, token-gating
subsystem, Solana/solana_das package, I.R.I.S. bot updates, branding
refresh, marketing updates, UI kit, auth/login redesign, Web3 modal, core
channel/guild/RPC refactor, constants symlink fix, build/infra config, doc
migration).

- Admin Badges page — BLOCKED. test_dummy lacks the `admin:authenticate`
  ACL (its "staff badge" is a cosmetic flair unrelated to the ACL system).
  Drove the real OAuth2 admin login flow end-to-end and confirmed the
  failure via `GET /admin/login?error=missing_admin_acl`. Source read
  confirms the page requires `admin:authenticate` to view (GET) and
  `user:update:flags`/`user:update:premium` to edit specific badges
  (POST); the 5 backing SVGs exist at `patches/badges/*.svg`. Not visually
  confirmed. Screenshots (session scratchpad, not committed):
  `admin_post_authorize.png`, `admin_landing.png`, `admin_badges.png`,
  `admin_badges2.png`.
- News-card `image_url` rendering — PASS. `GET /api/news` returned 3
  stories, 2 with non-null `image_url` (media-proxy URLs, HTTP 200,
  `image/webp`). `/login` (via `AuthLoginNewsTiles.tsx`) rendered headless
  with both images reaching `complete: true` at correct natural dimensions
  (426px, 1024px) and real artwork visible; the null-`image_url` story
  correctly fell back to a gradient instead of a broken image. Screenshot:
  `news_login_8s.png`.
- Web3/Identity modal balance — PASS. Ran the real-SIWS-flow script for
  test_dummy's wallet (`AwsW3kad25Uk7ptX3YY3wy4o1mN5BJTATfuMa1u4Di23`).
  Modal opened showing the correct address and balance "0.0000 SOL",
  consistent with the prior 2026-07-23 confirmation. Screenshot:
  `web3_modal_v2.png`.

**Checksum:** `91c71390f3100be305d50d797182bb889cec8a1c` (`git rev-parse
HEAD` — this entry documents verification results rather than a code
diff, so HEAD at time of writing is used in place of a diff hash).
