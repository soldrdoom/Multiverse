CREATE TABLE IF NOT EXISTS fluxer.user_tips (
    tx_signature text,
    sender_user_id bigint,
    recipient_user_id bigint,
    sender_wallet_address text,
    recipient_wallet_address text,
    amount_lamports bigint,
    fee_lamports bigint,
    sol_price_usd_at_tip double,
    created_at timestamp,
    PRIMARY KEY ((tx_signature))
);
