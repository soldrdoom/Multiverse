FROM node:24-bookworm-slim AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

FROM base AS deps

# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches/ ./patches/
COPY packages/iris_bot/package.json ./packages/iris_bot/
COPY packages/constants/package.json ./packages/constants/

# Install dependencies
# Note: --no-frozen-lockfile (not --frozen-lockfile) because pnpm's frozen-lockfile check
# validates the whole workspace, and fluxer_app's "@typescript/native-preview": "*" dependency
# is pre-existing repo drift unrelated to this service (semver prerelease exclusion means a
# wildcard range can never cleanly validate against that package's dev/nightly versions).
RUN pnpm install --no-frozen-lockfile --prod --filter @fluxer/iris_bot...

FROM node:24-bookworm-slim

WORKDIR /app

# Install runtime utilities (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
	curl && \
	rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/iris_bot/node_modules ./packages/iris_bot/node_modules

# Copy source
COPY packages/constants/package.json ./packages/constants/
COPY packages/constants/src ./packages/constants/src
COPY packages/iris_bot/package.json packages/iris_bot/tsconfig.json ./packages/iris_bot/
COPY packages/iris_bot/src ./packages/iris_bot/src

# Knowledge base: read directly from the marketing package's own source files, at the
# same relative path KnowledgeBase.tsx expects in local dev, so there's no duplicate copy.
COPY packages/marketing/src/content/whitepaper.md ./packages/marketing/src/content/whitepaper.md
COPY packages/marketing/src/marketing_i18n/locales/messages.yaml ./packages/marketing/src/marketing_i18n/locales/messages.yaml

RUN mkdir -p /app/.cache/corepack && chown -R nobody:nogroup /app

WORKDIR /app/packages/iris_bot

ENV HOME=/app
ENV COREPACK_HOME=/app/.cache/corepack
ENV NODE_ENV=production

USER nobody

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8080/_health || exit 1

# Invoke tsx directly (not via "pnpm start") — pnpm's script runner performs a
# workspace-wide dependency consistency check that needs the full monorepo's
# lockfile/package.jsons, which this image intentionally doesn't carry.
CMD ["./node_modules/.bin/tsx", "src/index.tsx"]
