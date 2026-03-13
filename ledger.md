## [v0.0.1.0] — 2026-03-12 · Milestone: Communications Sovereignty

### Email Infrastructure
- **Provider**: Proton Mail Bridge v3.22.0 running as a systemd service (`protonmail-bridge.service`) on the VPS host.
- **Keychain**: GPG key (ed25519, no passphrase) for the outbound mail identity, stored via `pass`. Bridge credentials persist across reboots.
- **Identity**: Outbound mail sent via the operator's Proton account.
- **SMTP relay**: `socat` service (`bridge-smtp-relay.service`) forwards `0.0.0.0:1026 → 127.0.0.1:1025` so the Docker container can reach Bridge via `host.docker.internal:1026`.
- **Config**: `integrations.email.enabled = true`, `provider = smtp`, `ignore_tls = true` (Bridge uses a self-signed cert for local STARTTLS).
- **Code changes** (`ignore_tls` support added):
  - `packages/config/src/schema/defs/integrations/email.json` — added `ignore_tls` field to `smtp_email` schema.
  - `packages/email/src/SmtpEmailProvider.tsx` — added `ignoreTls?: boolean` to `SmtpEmailConfig`; passes `ignoreTLS` to nodemailer transport.
  - `packages/api/src/email/EmailProviderFactory.tsx` — forwards `ignoreTls` from API config to provider constructor.
  - `packages/api/src/config/APIConfig.tsx` — added `ignoreTls: boolean` to smtp config type.
  - `packages/api/src/Config.tsx` — maps `smtp.ignore_tls` from master config.
- **docker-compose.yml**: Added `extra_hosts: ["host.docker.internal:host-gateway"]` to `fluxer` service.
- **Verified**: Test email delivered successfully with message ID confirmed.

### Bug Fixes
- **Discriminator #0000**: Patched `users` kv_store entry for user `1481496857258491904` (SolDrDoom) — `discriminator` set to `0`. Valkey cache keys `user:partial:*` and `user_activity:*` flushed.
- **Mobile Solana Login**: Removed `typeof window.solana !== 'undefined'` render gate from `AuthLoginLayout.tsx`. Button now always visible. Added user-facing error message when no wallet is detected (`No Solana wallet detected. Please use Phantom or Backpack...`).

---

## [v0.2.0.0] — 2026-03-10

- **Action**: Clean Slate Protocol executed. All legacy pre-deploy files archived to internal backup path.
- **Deploy**: Default Fluxer instance deployed via Docker Compose (`ghcr.io/fluxerapp/fluxer-server:stable`).
- **Stack**: Fluxer Server · Valkey 8.1 (Redis-compatible KV) · Nginx 1.25.4 (SSL proxy).
- **Database**: SQLite (single-node). Cassandra migration planned for Multiverse production phase.
- **SSL**: Let's Encrypt certs mounted into Nginx container. Cloudflare Full-Strict mode.
- **Domains**: Prior domain → Fluxer UI · Prior API subdomain → Fluxer API + WebSocket gateway.
- **WebSocket**: `proxy_set_header Upgrade $http_upgrade` + `Connection "upgrade"` active on api subdomain.
- **Next**: Multiverse rebranding pass — custom theme, instance name, Vanguard Rust extensions.
- **Status**: Live and stable.

---

## [v0.1.1.3] — 2026-03-02

- **Action**: Confirmed Dual-SSL (Google/Let's Encrypt) and BunnyCDN integration.
- **Result**: Asset handshake verified; CORS headers active (*).
- **Status**: Infrastructure Optimized and Stable.
