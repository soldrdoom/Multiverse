CREATE TABLE IF NOT EXISTS fluxer.users_by_solana_address (
    solana_address text,
    user_id bigint,
    PRIMARY KEY (solana_address, user_id)
);
