-- Public thumbs-up/down voting on news stories.
--
-- The voter's identity is their linked Solana wallet address, not their user ID:
-- votes are shown on unauthenticated public surfaces, and the wallet is the
-- identity the product already treats as canonical for web3 features. One row
-- per (story, wallet) makes toggling idempotent — re-voting the same direction
-- overwrites in place, switching rewrites `direction`, and clearing deletes the
-- row by full primary key.
--
-- Totals are deliberately NOT denormalized onto news_stories / news_stories_by_status
-- and are NOT counter columns. They are derived by scanning the story partition
-- (NewsRepository.listVotes, capped at MAX_VOTES_SCAN = 5000), the same approach
-- MessageInteractionRepository.countReactionUsers takes. A denormalized total
-- would need read-modify-write on every vote and would race under concurrency.
--
-- Clustering by voter_address (rather than a timestamp) is what makes the
-- single-wallet read/overwrite/delete a single-row operation.
--
-- This file is Cassandra parity only — production runs the schemaless SQLite
-- KV backend, which is driven entirely by the defineTable metadata in
-- packages/api/src/Tables.tsx and needs no DDL.
CREATE TABLE IF NOT EXISTS fluxer.news_story_votes (
    story_id      bigint,
    voter_address text,
    direction     text,     -- 'up' | 'down'
    created_at    timestamp,
    updated_at    timestamp,
    PRIMARY KEY ((story_id), voter_address)
);
