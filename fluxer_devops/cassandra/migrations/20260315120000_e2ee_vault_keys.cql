-- E2EE Phase 1: per-user X25519 public key registry.
-- The public_key column stores the Base64-encoded 32-byte Curve25519 public key
-- derived from the user's wallet signature.  One row per user; upsert on conflict.
CREATE TABLE IF NOT EXISTS fluxer.user_public_keys (
    user_id     bigint,
    public_key  text,
    created_at  timestamp,
    updated_at  timestamp,
    PRIMARY KEY ((user_id))
);
