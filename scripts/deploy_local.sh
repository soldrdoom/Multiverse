#!/usr/bin/env bash
#
# Build and deploy fluxer_server to this VPS's production containers.
#
# This exists because the frontend bundle and the server image each read build
# identity from a *different* mechanism — the bundle from process env at host
# build time, the image from Docker ARGs — and nothing kept the two in sync.
# When they disagree the browser reports one Sentry release and the server
# reports another, and source-map symbolication silently fails: artifacts get
# uploaded under a release no event ever reports. Defining the values once here
# is the whole point of the file.
#
# Usage:  scripts/deploy_local.sh            # build + deploy
#         scripts/deploy_local.sh --build    # build only, do not touch containers
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BUILD_ONLY=0
[[ "${1:-}" == "--build" ]] && BUILD_ONLY=1

# --- Node 24 -----------------------------------------------------------------
# Installed but deliberately not on the default PATH. The frontend build and the
# packages/api test suite both need it (the latter for node:sqlite); system Node
# is v18 and fails in ways that look like broken code rather than a wrong runtime.
export PATH="/usr/local/node24/bin:$HOME/.cargo/bin:$PATH"

# --- FLUXER_CONFIG -----------------------------------------------------------
# MANDATORY, and its absence is destructive. fluxer_app/rspack.config.mjs's
# readConfig() falls back to `config.json` resolved against the repo root, which
# does not exist here — the real file is config/config.json. The build script
# runs `rm -rf dist` *before* that read, so an unset FLUXER_CONFIG deletes the
# existing bundle and only then fails. Do not remove this line.
export FLUXER_CONFIG="${FLUXER_CONFIG:-$REPO_ROOT/config/config.json}"
[[ -r "$FLUXER_CONFIG" ]] || { echo "FATAL: FLUXER_CONFIG not readable: $FLUXER_CONFIG" >&2; exit 1; }

# --- Build identity ----------------------------------------------------------
# NOTE ON ORDERING: this project's convention is to commit the deploy snapshot
# *after* a healthy deploy, so BUILD_SHA below is the parent of the eventual
# snapshot commit. That is harmless for symbolication — the bundle and the
# uploaded source maps come from this same invocation and therefore agree — but
# it means the Sentry release is one commit behind the snapshot it shipped as.
# If you want them identical, commit first and deploy second.
export BUILD_SHA="${BUILD_SHA:-$(git rev-parse --short HEAD)}"
# Must be > 0. fluxer_app/src/index.tsx drops `dist` when the parsed number is
# <= 0, and the default is '0' — which is why `dist` has always been unset.
export BUILD_NUMBER="${BUILD_NUMBER:-$(git rev-list --count HEAD)}"
export BUILD_TIMESTAMP="${BUILD_TIMESTAMP:-$(date -u +%s)}"
# Defaults to 'nightly' everywhere, which is why production has been reporting
# environment: "nightly" to Sentry. Override per deploy if that is not wanted.
export RELEASE_CHANNEL="${RELEASE_CHANNEL:-nightly}"

echo "==> build identity"
printf '    BUILD_SHA=%s  BUILD_NUMBER=%s  BUILD_TIMESTAMP=%s  RELEASE_CHANNEL=%s\n' \
  "$BUILD_SHA" "$BUILD_NUMBER" "$BUILD_TIMESTAMP" "$RELEASE_CHANNEL"

# --- Optional: Sentry source-map upload credentials ---------------------------
# Sourced by fluxer_app/scripts/upload-sourcemaps.mjs. Deliberately outside the
# repo and outside the Docker build context so it can neither be committed nor
# baked into an image. The uploader exits 0 when the token is absent, so a
# machine without this file still builds and deploys normally.
if [[ -r /root/.config/fluxer/sentry.env ]]; then
  echo "==> sentry.env present; source maps will upload"
else
  echo "==> sentry.env absent; source-map upload will skip (traces stay minified)"
fi

# --- Frontend ----------------------------------------------------------------
# Built on the host, NOT in Docker. The image copies the prebuilt dist/. A stale
# bundle shipping while the build "succeeded" is this project's most-repeated
# deploy incident, so verify the served chunk hash afterwards rather than
# trusting exit status alone.
echo "==> building frontend"
pnpm --filter fluxer_app build

# --- Preserve the outgoing image as a rollback point -------------------------
# This step was, until now, only a runbook note a human/agent had to remember to
# run by hand before the `docker build` below overwrites `multiverse-server:local`.
# It got skipped at least 5 times (2026-07-29 x3, 2026-08-11 x2) for exactly that
# reason. Making it unconditional here, not documentation, is the actual fix.
if docker image inspect multiverse-server:local >/dev/null 2>&1; then
  ROLLBACK_TAG="rollback-$(date -u +%Y%m%d)-pre-${BUILD_SHA}"
  echo "==> tagging outgoing image as multiverse-server:$ROLLBACK_TAG before it's replaced"
  docker tag multiverse-server:local "multiverse-server:$ROLLBACK_TAG"
else
  echo "==> no existing multiverse-server:local image to preserve (first build on this box?)"
fi

# --- Image -------------------------------------------------------------------
# The four --build-arg values MUST match the four exports above. That pairing is
# the reason this file exists.
echo "==> building image"
docker build -t multiverse-server:local -f fluxer_server/Dockerfile \
  --build-arg BUILD_SHA="$BUILD_SHA" \
  --build-arg BUILD_NUMBER="$BUILD_NUMBER" \
  --build-arg BUILD_TIMESTAMP="$BUILD_TIMESTAMP" \
  --build-arg RELEASE_CHANNEL="$RELEASE_CHANNEL" \
  .

if [[ "$BUILD_ONLY" == "1" ]]; then
  echo "==> --build given; not touching containers"
  exit 0
fi

echo "==> deploying"
docker compose up -d fluxer_server

echo "==> done. Verify before believing it:"
echo "    docker inspect fluxer_server --format '{{.State.Health.Status}} {{.Created}}'"
echo "    curl -s https://multiverse.forum/app | grep -o 'assets/[a-f0-9]*\\.js' | sort -u"
echo "    # then confirm that chunk hash CHANGED, and that the served bytes"
echo "    # contain what you expect. A healthy container proves nothing about"
echo "    # which bundle it is serving."
