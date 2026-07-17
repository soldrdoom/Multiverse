CREATE TABLE IF NOT EXISTS fluxer.applied_profile_cosmetics (
    user_id bigint,
    slot text,
    mint_address text,
    applied_at timestamp,
    PRIMARY KEY ((user_id), slot)
);

CREATE TABLE IF NOT EXISTS fluxer.applied_server_cosmetics (
    guild_id bigint,
    slot text,
    mint_address text,
    applied_by bigint,
    applied_at timestamp,
    PRIMARY KEY ((guild_id), slot)
);

CREATE TABLE IF NOT EXISTS fluxer.creator_applications (
    solana_address text,
    status text,
    applied_at timestamp,
    reviewed_at timestamp,
    reviewed_by text,
    PRIMARY KEY ((solana_address))
);

CREATE TABLE IF NOT EXISTS fluxer.creators (
    creator_id int,
    solana_address text,
    commission_rate int,
    payout_suspended boolean,
    approved_at timestamp,
    PRIMARY KEY ((creator_id))
);

CREATE TABLE IF NOT EXISTS fluxer.creators_by_wallet (
    solana_address text,
    creator_id int,
    PRIMARY KEY ((solana_address))
);

CREATE TABLE IF NOT EXISTS fluxer.cosmetic_listings (
    id text,
    creator_id int,
    name text,
    description text,
    image_url text,
    cosmetic_type text,
    rarity text,
    price_lamports bigint,
    collection_address text,
    status text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY ((id))
);

CREATE TABLE IF NOT EXISTS fluxer.cosmetic_listings_by_creator (
    creator_id int,
    id text,
    PRIMARY KEY ((creator_id), id)
);
