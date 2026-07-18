CREATE TABLE IF NOT EXISTS fluxer.guild_vanity_purchases (
    guild_id bigint,
    purchase_id text,
    purchaser_user_id bigint,
    tx_signature text,
    payer_wallet_address text,
    amount_lamports bigint,
    sol_price_usd_at_purchase double,
    usd_amount double,
    vanity_code text,
    status text,
    created_at timestamp,
    confirmed_at timestamp,
    PRIMARY KEY ((guild_id), purchase_id)
);

CREATE TABLE IF NOT EXISTS fluxer.guild_vanity_purchases_by_tx_signature (
    tx_signature text,
    guild_id bigint,
    purchase_id text,
    PRIMARY KEY ((tx_signature))
);
