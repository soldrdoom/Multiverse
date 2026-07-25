-- Developer teams for OAuth2 applications.
--
-- Teams are purely additive. An application transferred to a team keeps a
-- non-null owner_user_id (rewritten to the team's owner), so applications_by_owner
-- keeps working unchanged and abuse/legal attribution always resolves to a
-- person. applications.team_id was added ahead of time in
-- 20260725120000_application_metadata.cql.
--
-- Membership is invite-based: rows start in membership_state 'invited' and
-- confer zero capabilities until accepted. The team owner also holds a member
-- row (role 'admin', state 'accepted') so application_teams_by_user covers
-- them; ownership itself lives on application_teams.owner_user_id.
--
-- This file is Cassandra parity only — production runs the schemaless SQLite
-- KV backend and needs no DDL.
CREATE TABLE IF NOT EXISTS fluxer.application_teams (
    team_id       bigint,
    name          text,
    owner_user_id bigint,
    created_at    timestamp,
    version       int,
    PRIMARY KEY (team_id)
);

CREATE TABLE IF NOT EXISTS fluxer.application_team_members (
    team_id            bigint,
    user_id            bigint,
    role               text,     -- 'admin' | 'developer' | 'read_only'
    membership_state   text,     -- 'invited' | 'accepted'
    invited_by_user_id bigint,
    invited_at         timestamp,
    accepted_at        timestamp,
    version            int,
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS fluxer.application_teams_by_user (
    user_id bigint,
    team_id bigint,
    PRIMARY KEY (user_id, team_id)
);

-- Mirrors applications_by_owner for the team fan-out.
CREATE TABLE IF NOT EXISTS fluxer.applications_by_team (
    team_id        bigint,
    application_id bigint,
    PRIMARY KEY (team_id, application_id)
);
