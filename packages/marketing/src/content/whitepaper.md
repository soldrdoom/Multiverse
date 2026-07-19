## Abstract

Multiverse is an instant messaging and voice/video platform for communities — servers, channels, DMs, calls — built on a conventional, reliable web2 core and layered with optional web3 features: wallet-based sign-in, NFT-gated cosmetics, an end-to-end encrypted Identity Vault, and on-chain payments for specific digital goods. It is developed and operated by Multiverse Platform AB.

Multiverse has no native token. Nothing in this document is an offer to sell securities or any other financial instrument, and nothing here should be read as investment advice. Where this document describes future plans, those are forward-looking statements that may change without notice.

## Vision

Crypto-native communities have largely had to choose between two unsatisfying options: a polished, reliable chat product with no meaningful concept of wallet-based identity, or a fully decentralized alternative that treats reliability, moderation, and day-to-day usability as secondary concerns. Multiverse starts from the premise that a community's chat platform doesn't have to force that tradeoff. Wallets can be a first-class identity and payment primitive without requiring a token, without requiring full protocol decentralization, and without giving up the uptime and moderation guarantees a real community depends on.

## The problem

Mainstream chat platforms treat a user's identity as an email address and a password. There's no native way to prove wallet ownership, gate a role or a cosmetic on holding a specific asset, or settle a payment on-chain — any of that has to be bolted on through bots and third-party integrations that the platform itself doesn't understand or support.

At the same time, chat and messaging systems built as genuinely decentralized protocols tend to under-invest in the parts that make a platform usable at scale: consistent uptime, responsive voice and video, spam and abuse moderation, and a client experience that doesn't require technical sophistication to use. Communities that want both — a platform that works the way they expect a modern chat app to work, and one that treats their wallet as something real — have not had a good option.

## Solution overview

Multiverse is a single, professionally operated platform that treats web3 features as an optional layer on top of a conventional web2 core, not a replacement for it. Email and password authentication work exactly as they would on any mainstream platform. Servers, channels, roles, moderation tools, voice and video calls, custom emoji, and search all work the same way regardless of whether a given user or community engages with any of the wallet-based features at all.

On top of that core, users who want it can sign in with a Solana wallet instead of an email and password, unlock cosmetic profile features tied to NFTs they hold, and use a wallet-derived encryption scheme for private messages. Communities can sell specific digital goods — currently, vanity server URLs — for a one-time, on-chain SOL payment.

## Architecture at a glance

Multiverse's backend is split into small, purpose-built services: a real-time gateway for message routing and presence, an API layer for the application's core domain logic, and a media/voice layer built on LiveKit for calls and screen sharing. Storage defaults to SQLite, with an optional distributed backend for larger deployments. This is standard, well-understood infrastructure — the same category of system any serious messaging product is built on — not a novel consensus protocol or a thin wrapper around a blockchain. The web3 features described below sit alongside this core as additional, optional services; they don't replace or route around it.

## Web3 features in detail

**Sign-In With Solana (SIWS).** Users can authenticate by signing a one-time challenge with a Solana wallet (Phantom, Solflare, Backpack, Coinbase Wallet, and others) instead of using an email and password. The signature is verified server-side against the wallet's public key. A user's private key and seed phrase never leave their wallet and are never transmitted to or stored by Multiverse.

**NFT-gated cosmetics.** Holding a qualifying NFT can unlock cosmetic profile features — this is a cosmetic-only mechanism. It does not grant governance rights, revenue share, or any claim on Multiverse Platform AB, and it is not a security.

**Identity Vault.** An end-to-end encryption scheme for direct messages in which the encryption key material is derived from a wallet signature rather than issued and held by Multiverse. Because the key is derived from something the user controls, it's portable across sessions and devices in a way a platform-issued credential wouldn't be.

**On-chain payments for digital goods.** Specific paid features — currently, custom vanity URLs for servers — can be purchased with a one-time, on-chain SOL payment, verified by checking the transaction on Solana mainnet. This is a per-item purchase mechanism, not a subscription, not a token, and not an investment product.

## No token, one network

Multiverse has no native fungible token and none is planned. Where a payment is denominated in cryptocurrency, it is denominated in SOL — an existing, independent, third-party asset — or in fiat currency. Multiverse Platform AB does not issue, sell, or otherwise offer any token of its own.

## Operating model

Multiverse Platform AB develops and operates the only instance of Multiverse. This is closer to how Solana Labs stewards the Solana network, or how Google operates YouTube, than to a protocol anyone can independently stand up: there is one canonical, centrally operated service, run by the company that builds it. Multiverse does not offer, document, or support running an independent deployment of the platform.

## Why the code is public

Multiverse's source code is public on GitHub, licensed under the AGPLv3, with a contributor license agreement (CLA) for external contributions. This is a deliberate choice aimed at a community that is — reasonably — skeptical of new platforms it can't inspect: publishing the code lets outside developers and security researchers read exactly what the platform does, verify claims about how the Identity Vault and wallet authentication work, and contribute directly.

Publishing the code is not an invitation to run a separate, independent copy of Multiverse. Source availability and open contribution are about transparency and trust, not about deployment rights.

## Trust, security, and moderation

Multiverse runs a public responsible-disclosure program for security researchers, described in full at [/security](/security). Wallet authentication is non-custodial: Multiverse never holds a user's private keys or seed phrase, only a verified public key and signature. Like any platform that hosts user-generated content and media, Multiverse maintains standard content-moderation and legal-compliance infrastructure, including CSAM detection and reporting obligations.

## Roadmap

Near-term priorities include native mobile apps, exploratory work on federation between Multiverse communities, and expanding the range of cosmetic categories that can be gated by NFT ownership. On the payments side, the set of digital goods that can be purchased on-chain may grow over time. These are directional statements about where the product is headed, not commitments to specific dates or features — they may change as the platform develops.

## Legal and risk disclaimers

- Multiverse has no token, and nothing in this document is an offer or solicitation to buy or sell securities or any other financial instrument.
- Nothing in this document is investment, legal, or financial advice.
- Statements about future plans, features, or roadmap items are forward-looking and may change without notice.
- The Identity Vault, NFT-gating mechanism, and on-chain payment flow described here have not been independently audited as of the publication of this document.
- Payments made in SOL carry the ordinary risks of cryptocurrency: price volatility and transaction irreversibility. Users are responsible for the security of their own wallets.
- Multiverse Platform AB's registered entity details are available at [/company-information](/company-information). Where anything in this document conflicts with the [Terms of Service](/terms) or [Privacy Policy](/privacy), those documents govern.

## Learn more

- [Terms of Service](/terms)
- [Privacy Policy](/privacy)
- [Security and responsible disclosure](/security)
- [Company information](/company-information)
- [Support](/support)
- [Source code on GitHub](https://github.com/fluxerapp/fluxer)
