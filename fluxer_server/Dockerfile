ARG BUILD_SHA
ARG BUILD_NUMBER
ARG BUILD_TIMESTAMP
ARG RELEASE_CHANNEL=nightly

FROM node:24-trixie-slim AS base

WORKDIR /usr/src/app

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

RUN apt-get update && apt-get install -y --no-install-recommends \
	curl \
	python3 \
	make \
	g++ \
	&& rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY patches/ ./patches/

COPY packages/admin/package.json ./packages/admin/
COPY packages/api/package.json ./packages/api/
COPY packages/app_proxy/package.json ./packages/app_proxy/
COPY packages/bot_sdk/package.json ./packages/bot_sdk/
COPY packages/cache/package.json ./packages/cache/
COPY packages/captcha/package.json ./packages/captcha/
COPY packages/cassandra/package.json ./packages/cassandra/
COPY packages/config/package.json ./packages/config/
COPY packages/constants/package.json ./packages/constants/
COPY packages/date_utils/package.json ./packages/date_utils/
COPY packages/elasticsearch_search/package.json ./packages/elasticsearch_search/
COPY packages/email/package.json ./packages/email/
COPY packages/errors/package.json ./packages/errors/
COPY packages/geo_utils/package.json ./packages/geo_utils/
COPY packages/geoip/package.json ./packages/geoip/
COPY packages/hono/package.json ./packages/hono/
COPY packages/hono_types/package.json ./packages/hono_types/
COPY packages/http_client/package.json ./packages/http_client/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/initialization/package.json ./packages/initialization/
COPY packages/ip_utils/package.json ./packages/ip_utils/
COPY packages/kv_client/package.json ./packages/kv_client/
COPY packages/limits/package.json ./packages/limits/
COPY packages/list_utils/package.json ./packages/list_utils/
COPY packages/locale/package.json ./packages/locale/
COPY packages/logger/package.json ./packages/logger/
COPY packages/markdown_parser/package.json ./packages/markdown_parser/
COPY packages/marketing/package.json ./packages/marketing/
COPY packages/media_proxy/package.json ./packages/media_proxy/
COPY packages/media_proxy_utils/package.json ./packages/media_proxy_utils/
COPY packages/meilisearch_search/package.json ./packages/meilisearch_search/
COPY packages/mime_utils/package.json ./packages/mime_utils/
COPY packages/nats/package.json ./packages/nats/
COPY packages/number_utils/package.json ./packages/number_utils/
COPY packages/oauth2/package.json ./packages/oauth2/
COPY packages/openapi/package.json ./packages/openapi/
COPY packages/queue/package.json ./packages/queue/
COPY packages/rate_limit/package.json ./packages/rate_limit/
COPY packages/s3/package.json ./packages/s3/
COPY packages/schema/package.json ./packages/schema/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/sms/package.json ./packages/sms/
COPY packages/snowflake/package.json ./packages/snowflake/
COPY packages/solana_das/package.json ./packages/solana_das/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/time/package.json ./packages/time/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validation/package.json ./packages/validation/
COPY packages/virus_scan/package.json ./packages/virus_scan/
COPY packages/worker/package.json ./packages/worker/
COPY fluxer_server/package.json ./fluxer_server/
COPY fluxer_app/package.json ./fluxer_app/

RUN pnpm install --no-frozen-lockfile

RUN pnpm approve-builds msgpackr-extract@3.0.3 @parcel/watcher@2.5.6

RUN pnpm rebuild msgpackr-extract @parcel/watcher

FROM deps AS build

COPY tsconfigs /usr/src/app/tsconfigs

COPY packages/ ./packages/
RUN pnpm --filter @fluxer/config generate
COPY fluxer_server/ ./fluxer_server/

RUN pnpm --filter @fluxer/marketing build:css

COPY fluxer_media_proxy/data/model.onnx ./fluxer_media_proxy/data/model.onnx

# RUN cd fluxer_server && pnpm typecheck

FROM erlang:28-slim AS gateway-build

ARG LOGGER_LEVEL=info

WORKDIR /usr/src/app/gateway

RUN apt-get update && apt-get install -y --no-install-recommends \
	git \
	curl \
	make \
	gcc \
	g++ \
	libc6-dev \
	ca-certificates \
	gettext-base \
	&& rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/erlang/rebar3/releases/download/3.24.0/rebar3 -o /usr/local/bin/rebar3 && \
	chmod +x /usr/local/bin/rebar3

COPY fluxer_gateway/rebar.config fluxer_gateway/rebar.lock* ./
RUN rebar3 compile --deps_only

COPY fluxer_gateway/. ./fluxer_gateway
RUN LOGGER_LEVEL=${LOGGER_LEVEL} envsubst '${LOGGER_LEVEL}' < fluxer_gateway/config/vm.args.template > fluxer_gateway/config/vm.args && \
	LOGGER_LEVEL=${LOGGER_LEVEL} envsubst '${LOGGER_LEVEL}' < fluxer_gateway/config/sys.config.template > fluxer_gateway/config/sys.config && \
	(cd fluxer_gateway && rebar3 as prod release)

FROM node:24-trixie-slim AS production

ARG BUILD_SHA
ARG BUILD_NUMBER
ARG BUILD_TIMESTAMP
ARG RELEASE_CHANNEL

LABEL org.opencontainers.image.title="Multiverse Server"
LABEL org.opencontainers.image.description="Unified Multiverse server - combines all backend services into a single deployable container"
LABEL org.opencontainers.image.vendor="Multiverse Contributors"
LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/fluxerapp/fluxer"
LABEL org.opencontainers.image.documentation="https://docs.fluxer.app"
LABEL org.opencontainers.image.revision="${BUILD_SHA}"
LABEL org.opencontainers.image.version="${BUILD_NUMBER}"
LABEL org.opencontainers.image.created="${BUILD_TIMESTAMP}"

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
	curl \
	ffmpeg \
	&& rm -rf /var/lib/apt/lists/*


RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/packages ./packages
COPY --from=build /usr/src/app/fluxer_server ./fluxer_server
COPY --from=build /usr/src/app/tsconfigs ./tsconfigs
COPY --from=build /usr/src/app/pnpm-workspace.yaml ./
COPY --from=build /usr/src/app/package.json ./
COPY --from=gateway-build /usr/src/app/gateway/fluxer_gateway/_build/prod/rel/fluxer_gateway /opt/fluxer_gateway
RUN chown -R 1001:1001 /opt/fluxer_gateway
COPY fluxer_app/dist /usr/src/app/assets
COPY fluxer_app/assets/fonts/ /usr/src/app/assets/fonts/
RUN node -e " \
  const fs = require('fs'); \
  const path = require('path'); \
  const nmFluxer = '/usr/src/app/node_modules/@fluxer'; \
  fs.mkdirSync(nmFluxer, {recursive: true}); \
  const pkgsDir = '/usr/src/app/packages'; \
  for (const pkg of fs.readdirSync(pkgsDir)) { \
    const jsonPath = path.join(pkgsDir, pkg, 'package.json'); \
    if (!fs.existsSync(jsonPath)) continue; \
    const name = JSON.parse(fs.readFileSync(jsonPath)).name; \
    if (!name || !name.startsWith('@fluxer/')) continue; \
    const short = name.slice('@fluxer/'.length); \
    const link = path.join(nmFluxer, short); \
    if (!fs.existsSync(link)) { \
      fs.symlinkSync(path.join(pkgsDir, pkg), link); \
    } \
  } \
"
COPY patches/badges/ /usr/src/app/assets/badges/
COPY patches/emoji/ /usr/src/app/assets/emoji/
COPY fluxer_static/avatars/ /usr/src/app/assets/avatars/

RUN mkdir -p /usr/src/app/data/storage && \
	mkdir -p /usr/src/app/data/db && \
	mkdir -p /opt/data && \
	mkdir -p /data/s3 && \
	mkdir -p /data/sqlite && \
	mkdir -p /data/queue && \
	mkdir -p /var/log/fluxer && \
	chown -R root:root /usr/src/app/data && \
	chown -R root:root /opt/data && \
	chown -R root:root /data

ARG INCLUDE_NSFW_ML=false

RUN echo "Skipping NSFW detection model (INCLUDE_NSFW_ML=$INCLUDE_NSFW_ML)"



EXPOSE 8080


ENV NODE_PATH=/usr/src/app/node_modules/.pnpm/node_modules
ENV NODE_ENV=production

ENV FLUXER_SERVER_HOST=0.0.0.0
ENV FLUXER_SERVER_PORT=8080
ENV FLUXER_GATEWAY_HOST=127.0.0.1
ENV FLUXER_GATEWAY_PORT=8082
ENV DATABASE_BACKEND=sqlite
ENV SQLITE_PATH=/usr/src/app/data/db/fluxer.db
ENV STORAGE_ROOT=/usr/src/app/data/storage
ENV SEARCH_BACKEND=sqlite
ENV FLUXER_SERVER_STATIC_DIR=/usr/src/app/assets

ENV BUILD_SHA=${BUILD_SHA}
ENV BUILD_NUMBER=${BUILD_NUMBER}
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
ENV RELEASE_CHANNEL=${RELEASE_CHANNEL}

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
	CMD curl -f http://localhost:8080/_health || exit 1

ENTRYPOINT ["pnpm", "--filter", "fluxer_server", "start"]
