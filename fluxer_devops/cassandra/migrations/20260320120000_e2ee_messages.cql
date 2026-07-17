-- E2EE Phase 2: per-message encrypted ciphertext column.
-- Stores the Base64-encoded NaCl box sealed payload for DM messages
-- with the E2EE flag set. Null for all non-encrypted messages.
ALTER TABLE fluxer.messages ADD encrypted_content text;
