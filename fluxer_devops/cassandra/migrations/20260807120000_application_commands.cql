-- Global bot application commands (Discord-style "/" slash commands).
--
-- Keyed by (bot_user_id, name) rather than application_id: both read paths
-- this feature needs (a bot resolving its own commands from its
-- token-derived user id, and a client resolving a guild member's commands
-- from that member's user id) arrive with a bot user id in hand, never an
-- application_id — BotTokenService.resolveToken resolves a token straight to
-- a UserID and discards application_id. application_id is kept as a plain
-- display/audit column.
--
-- id is a snowflake synthesized at registration time. It is deliberately not
-- part of the primary key so re-registering an existing command name simply
-- replaces the row in place, keeping `WHERE bot_user_id = ?` a single
-- partition read/write for the full bulk-overwrite-per-registration flow.
--
-- options is JSON.stringify(Array<ApplicationCommandOptionDefinition>), the
-- same convention guild_audit_logs.changes uses for structured data that
-- doesn't need to be queried on directly.
CREATE TABLE IF NOT EXISTS fluxer.application_commands (
    bot_user_id    bigint,
    name           text,
    id             bigint,
    application_id bigint,
    description    text,
    options        text,
    created_at     timestamp,
    updated_at     timestamp,
    PRIMARY KEY ((bot_user_id), name)
);
