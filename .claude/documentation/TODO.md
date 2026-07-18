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
