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

## 0.1.1.0 — 2026-07-25

Follow-up to the 0.1.0.0 sprint: unblocked and completed Admin Badges page
verification for test_dummy, fixing two real bugs discovered along the way.

- Admin ACLs form — added an "All" toggle to bulk-grant every ACL from the
  edit UI (commit `1e117684`).
- Admin ACLs save — FIXED. The "All" toggle was broken: `AdminACLs` has 101
  entries but `SetUserAclsRequest`'s schema capped the array at `.max(100)`,
  so saving after clicking "All" always 400'd. Raised the cap 100 → 150
  (commit `bb2cf000`), deployed.
- Admin OAuth2 login — FIXED (regression from the ACL grant above). Once
  test_dummy was actually granted all 101 ACLs via the fixed toggle, its own
  admin login broke with `oauth_failed`. Root cause: a second, independent
  schema — `UserResponseSchemas.tsx`'s `UserPrivateResponse.acls` — had the
  same stale `.max(100)` cap, validated on every `/api/users/@me` call
  including the one the admin OAuth2 callback makes. Confirmed via `docker
  logs` (`INVALID_FORMAT` validation errors) and confirmed the grant itself
  had genuinely succeeded server-side (raw pre-validation response showed
  all 101 ACLs correctly stored) — purely a response-schema bug blocking
  login, not a grant failure. Fixed the cap and pre-emptively bumped 3
  related `AdminApiKey` acls fields in `AdminSchemas.tsx` with the same
  pattern (commit `37644670`), deployed.
- Admin Badges page — PASS (previously BLOCKED in 0.1.0.0 for lack of ACL).
  Drove the full OAuth2 admin login flow for test_dummy end-to-end
  (`GET /admin` → oauth2/authorize consent → Authorize → oauth2_callback →
  landed authenticated on `/admin/users`, confirmed via "Test_Dummy#1993 /
  Admin" header). Looked up test_dummy on `/admin/badges` and confirmed the
  checkbox form correctly reflects granted flags (Staff checked, Bug Hunter
  checked). Navigated to test_dummy's User Detail page
  (`/admin/users/1485049080253177856`) and confirmed the actual badge SVG
  icons render inline next to the username — both
  `https://multiverse.forum/badges/staff.svg` and
  `https://multiverse.forum/badges/bug-hunter.svg` loaded successfully
  (blue star, red shield icons visible), no 404s or broken images. Note:
  the badge SVGs render on the User Detail page
  (`UserProfileBadges.tsx`), not inline on the `/admin/badges` edit page
  itself (`BadgesPage.tsx` renders labeled checkboxes only, no icon field
  in `AdminPackageConstants.BADGES`) — both pages were checked and both
  work correctly for their respective purposes. Screenshots (session
  scratchpad, not committed): `step1_admin.png`, `step5_badges.png`,
  `badges_lookedup.png`, `user_detail_badges.png`.

**Checksum:** `376446701bd8eb076f4fa95b45684f3a7538ddd8` (`git rev-parse
HEAD` — this entry documents verification results and two already-deployed
fix commits rather than a fresh code diff, so HEAD at time of writing is
used in place of a diff hash).
