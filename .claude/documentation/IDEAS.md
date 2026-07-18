# Ideas — speculative, not committed

Things worth revisiting but not decided on. Unlike `TODO.md` (known problems
with the current code) this is for "should we even build this" — bigger,
riskier, or more speculative directions that came up in conversation. Add a
dated entry when one comes up; note here if it gets picked up, rejected, or
folded into a real plan, rather than deleting the entry.

---

## 2026-07-18 — Tokenize guild vanity URLs as an on-chain Rust program

**Came up while:** discussing the just-shipped guild vanity-link purchase feature (see `PROJECT_REPORT.md`) — the current design is a $1.99 SOL payment, verified on-chain via tx signature, that flips a `GuildFeatures.VANITY_URL` bit and lets the guild set an arbitrary code, all tracked in Cassandra (`guild_vanity_purchases`). The question raised: should the vanity code itself become a tokenized on-chain asset instead — something like `.sol` domains (Bonfida/SNS), minted, owned, and tradeable via a real Solana program written in Rust (e.g. Anchor)?

**Current lean: probably not, at least not now.** Reasoning discussed:

- **Blast radius of a bug is categorically different.** A mistake in the current design is a Cassandra row to fix. A mistake in an on-chain registry/token program is potentially permanent and exploitable — no rollback, and putting real value behind a program means it needs a real security audit before mainnet, which is a different scale of engineering investment than a payment-verified DB flag.
- **The trust story is already achieved without tokenizing the namespace.** The stated goal (verifiable, un-fake-able payment, building trust with a crypto-native audience) comes from the on-chain SOL payment itself — which the current design already has. Tokenizing the *slug* buys something different: transferability (selling "official" to another guild), not additional trust.
- **A vanity link isn't obviously a portable asset the way a domain is.** `.sol`/ENS-style domains resolve to a wallet across many contexts; a Multiverse vanity link is meaningless without the specific guild behind it. Full tokenization edges toward "launch a naming-service/marketplace product" — with its own squatting/speculation dynamics — rather than a natural extension of "pay once to unlock your own guild's link."

**What would change the calculus:** if the actual goal is transferability specifically (letting a guild owner sell a premium slug to someone else, or letting vanity links survive/transfer independent of the guild), that's a real, distinct feature worth its own conversation — the current design would need custom transfer logic in Cassandra either way, so "should transfer be a first-class on-chain concept" is a fair question to revisit if that use case becomes real.

**Status:** parked — not pursuing unless the transferability use case becomes concrete.
