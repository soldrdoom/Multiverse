-- Per-token records for bot authentication.
--
-- lookup_hash is the SHA-256 of the token secret and is the partition key, so
-- authenticating a request is one point read. The secret is 256 bits of CSPRNG
-- output; password hashing exists to make low-entropy secrets expensive to
-- guess and bought nothing here except latency on every authenticated request.
--
-- applications.bot_token_hash is left in place for now so a token issued before
-- this change keeps working through the legacy verification path. It is dropped
-- once no such tokens remain.
CREATE TABLE IF NOT EXISTS fluxer.application_bot_tokens (
    lookup_hash        text,
    token_id           bigint,
    application_id     bigint,
    bot_user_id        bigint,
    name               text,
    preview            text,
    created_at         timestamp,
    created_by_user_id bigint,
    last_used_at       timestamp,
    version            int,
    PRIMARY KEY (lookup_hash)
);

CREATE TABLE IF NOT EXISTS fluxer.application_bot_tokens_by_application (
    application_id bigint,
    token_id       bigint,
    lookup_hash    text,
    PRIMARY KEY (application_id, token_id)
) WITH CLUSTERING ORDER BY (token_id DESC);
