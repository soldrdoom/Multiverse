/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

import type {Config} from '@app/Config';
import {fetchNftsForWallet} from '@fluxer/solana_das/src/NftFetcher';
import {SOLANA_RPC_URL} from '@fluxer/solana_das/src/SolanaNetwork';
import {SolanaAuthService} from '@fluxer/api/src/auth/services/SolanaAuthService';
import {createGuildID, createUserID} from '@fluxer/api/src/BrandedTypes';
import {GUILD_VANITY_MERCHANT_WALLET} from '@fluxer/api/src/guild/services/data/GuildVanityPurchaseService';
import {UserTipService} from '@fluxer/api/src/user/services/data/UserTipService';
import {DefaultUserOnly} from '@fluxer/api/src/middleware/AuthMiddleware';
import {createHealthCheckHandler, createLivenessCheckHandler, createReadinessCheckHandler} from '@app/HealthCheck';
import {createComponentLogger} from '@app/Logger';
import {createMarketingApp} from '@fluxer/marketing/src/App';
import {
	type InitializedServices,
	initializeAllServices,
	runServiceInitialization,
	type ServiceInitializer,
	shutdownAllServices,
	startBackgroundServices,
} from '@app/ServiceInitializer';
import {getBuildMetadata} from '@fluxer/config/src/BuildMetadata';
import {AppErrorHandler, AppNotFoundHandler} from '@fluxer/errors/src/domains/core/ErrorHandlers';
import {applyMiddlewareStack} from '@fluxer/hono/src/middleware/MiddlewareStack';
import {createServiceTelemetry} from '@fluxer/hono/src/middleware/TelemetryAdapters';
import type {BaseHonoEnv} from '@fluxer/hono_types/src/HonoTypes';
import {Hono} from 'hono';
import {trimTrailingSlash} from 'hono/trailing-slash';

export interface MountedRoutes {
	app: Hono<BaseHonoEnv>;
	services: InitializedServices;
	initialize: () => Promise<void>;
	start: () => Promise<void>;
	shutdown: () => Promise<void>;
}

export interface MountRoutesOptions {
	config: Config;
	staticDir?: string | undefined;
}

const startTime = Date.now();
const BUILD_METADATA = getBuildMetadata();

export async function mountRoutes(options: MountRoutesOptions): Promise<MountedRoutes> {
	const {config, staticDir} = options;
	const logger = createComponentLogger('routes');
	const VERSION = BUILD_METADATA.buildNumber ?? '0.0.0';

	logger.info('Starting route mounting and service initialization');

	const app = new Hono<BaseHonoEnv>();

	app.use(trimTrailingSlash());

	const telemetry = createServiceTelemetry({
		serviceName: 'fluxer-server',
		skipPaths: ['/_health', '/_ready', '/_live'],
	});

	applyMiddlewareStack(app, {
		requestId: {},
		tracing: telemetry.tracing,
		metrics: {
			enabled: true,
			collector: telemetry.metricsCollector,
			skipPaths: ['/_health', '/_ready', '/_live'],
		},
		logger: {
			log: (data) => {
				logger.info(
					{
						method: data.method,
						path: data.path,
						status: data.status,
						durationMs: data.durationMs,
					},
					'Request completed',
				);
			},
			skip: ['/_health', '/_ready', '/_live'],
		},
		skipErrorHandler: true,
	});
	let initializers: Array<ServiceInitializer> = [];
	let services: InitializedServices = {};

	try {
		const result = await initializeAllServices({
			config,
			logger,
			staticDir,
		});

		initializers = result.initializers;
		services = result.services;

		if (services.s3 !== undefined) {
			app.route('/s3', services.s3.app);
			logger.info(config.isMonolith ? 'S3 service mounted at /s3 (restricted mode)' : 'S3 service mounted at /s3');
		}

		if (services.mediaProxy !== undefined) {
			app.route('/media', services.mediaProxy.app);
			logger.info(
				config.isMonolith
					? 'Media Proxy service mounted at /media (public-only mode)'
					: 'Media Proxy service mounted at /media',
			);

			// Config.endpoints.staticCdn (packages/config/src/EndpointDerivation.tsx) is a bare-root
			// domain, distinct from Config.endpoints.media (`/media`). On this deployment it resolves
			// to this same host (see CdnEndpoints.STATIC_HOST), so Cosmetics Shop listing
			// image/metadata URLs built from it (CosmeticsController.tsx, CosmeticsMintService.tsx)
			// land at bare-root `/cosmetics/*` / `/cosmetics-metadata/*` here — forward those into the
			// Media Proxy app directly (it registers matching routes reading the same CDN bucket those
			// uploads land in) rather than mounting the whole Media Proxy app at `/`, which would also
			// expose every other media-proxy route (avatars, icons, themes, etc.) at bare root.
			const mediaProxyApp = services.mediaProxy.app;
			app.get('/cosmetics/*', async (ctx) => mediaProxyApp.fetch(ctx.req.raw));
			app.get('/cosmetics-metadata/*', async (ctx) => mediaProxyApp.fetch(ctx.req.raw));
			logger.info('Cosmetics static asset routes mounted at / (forwarding to Media Proxy)');
		}

		if (services.admin !== undefined) {
			app.route('/admin', services.admin.app);
			logger.info('Admin service mounted at /admin');
		}

		if (services.api !== undefined) {
			const apiService = services.api;

			// Issue a nonce for Solana wallet re-signing in sudo mode verification.
			apiService.app.post('/v1/users/@me/sudo/solana/nonce', DefaultUserOnly, async (ctx) => {
				const {address} = await ctx.req.json<{address: string}>();
				if (!address || typeof address !== 'string') {
					return ctx.json({error: 'address required'}, 400);
				}
				const user = ctx.get('user');
				const linkedUser = await ctx.get('userRepository').findBySolanaAddress(address);
				if (!linkedUser || linkedUser.id.toString() !== user.id.toString()) {
					return ctx.json({error: 'Wallet not linked to this account'}, 403);
				}
				const solanaService = new SolanaAuthService(
					ctx.get('cacheService'),
					ctx.get('userRepository'),
					ctx.get('snowflakeService'),
					ctx.get('authService').createAuthSession.bind(ctx.get('authService')),
				);
				const {nonce} = await solanaService.getNonce(address);
				return ctx.json({nonce});
			});

			// Link a Solana wallet to an existing (email/password) account.
			apiService.app.post('/auth/solana/link', DefaultUserOnly, async (ctx) => {
				const {address, signature, nonce} = await ctx.req.json<{
					address: string;
					signature: string;
					nonce: string;
				}>();
				if (!address || !signature || !nonce) {
					return ctx.json({error: 'address, signature, and nonce required'}, 400);
				}
				try {
					const solanaService = new SolanaAuthService(
						ctx.get('cacheService'),
						ctx.get('userRepository'),
						ctx.get('snowflakeService'),
						ctx.get('authService').createAuthSession.bind(ctx.get('authService')),
					);
					await solanaService.linkWallet({user: ctx.get('user'), address, signature, nonce});
					return ctx.json({ok: true});
				} catch (err: any) {
					return ctx.json({error: err?.message ?? 'Failed to link wallet'}, 400);
				}
			});

			const SOL_PRICE_CACHE_KEY = 'sol_usd_price';
			const SOL_PRICE_CACHE_TTL = 60; // seconds

			async function fetchSolPriceUsd(cacheService: {get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, ttl: number) => Promise<void>}): Promise<number> {
				const cached = await cacheService.get(SOL_PRICE_CACHE_KEY);
				if (cached && typeof cached === 'number' && cached > 0) return cached;
				const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
					headers: {'Accept': 'application/json'},
				});
				const data = await res.json() as any;
				const price: number = data?.solana?.usd;
				if (!price || price <= 0) throw new Error('Unable to fetch SOL price');
				await cacheService.set(SOL_PRICE_CACHE_KEY, price, SOL_PRICE_CACHE_TTL);
				return price;
			}

			async function fetchRecentBlockhash(): Promise<string> {
				const rpcRes = await fetch(SOLANA_RPC_URL, {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{commitment: 'confirmed'}]}),
				});
				const rpcData = await rpcRes.json() as any;
				const blockhash: string | undefined = rpcData?.result?.value?.blockhash;
				if (!blockhash) throw new Error('No blockhash in response');
				return blockhash;
			}

			/** Polls `getTransaction` for a signature, retrying up to 8x with a 3s delay to ride out confirmation lag. */
			async function pollSolanaTransaction(txSignature: string): Promise<any> {
				let txData: any;
				for (let attempt = 0; attempt < 8; attempt++) {
					try {
						const rpcRes = await fetch(SOLANA_RPC_URL, {
							method: 'POST',
							headers: {'Content-Type': 'application/json'},
							body: JSON.stringify({
								jsonrpc: '2.0', id: 1,
								method: 'getTransaction',
								params: [txSignature, {encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0}],
							}),
						});
						const rpcJson = await rpcRes.json() as any;
						txData = rpcJson?.result;
					} catch { /* ignore transient error, retry */ }
					if (txData) break;
					if (attempt < 7) await new Promise(r => setTimeout(r, 3000));
				}
				return txData;
			}

			/**
			 * Sums lamports transferred to `destination` via System Program `transfer`
			 * instructions in a parsed transaction. Sums each matching instruction
			 * individually rather than diffing `destination`'s net pre/post account
			 * balance — the latter breaks whenever the payer is also `destination`
			 * (e.g. a self-paid platform fee), since the account's net balance then
			 * reflects every other outgoing transfer too, not just the inbound one.
			 */
			function sumTransfersTo(txData: any, destination: string): number {
				const instructions: Array<any> = txData?.transaction?.message?.instructions ?? [];
				let total = 0;
				for (const ix of instructions) {
					if (ix?.program !== 'system' || ix?.parsed?.type !== 'transfer') continue;
					if (ix.parsed.info?.destination !== destination) continue;
					total += Number(ix.parsed.info?.lamports ?? 0);
				}
				return total;
			}

			// ── Guild vanity link purchase (SOL-only, one-time, $1.99) ───────
			//
			// Guild owners can buy a permanent custom vanity invite link
			// (e.g. multiverse.forum/official) with SOL. The invoice/verify
			// shape mirrors the Solana RPC pattern used elsewhere in this
			// file (live price + blockhash fetched here, on-chain
			// confirmation polled here), but — unlike the old premium flow —
			// every purchase attempt is durably recorded in
			// guild_vanity_purchases via GuildVanityPurchaseService, so
			// there's a permanent, independently-verifiable audit trail
			// (tx signature, payer wallet, amount) rather than a cache blob
			// that vanishes after 30 minutes.

			const VANITY_USD_PRICE = 1.99;

			apiService.app.post('/v1/guilds/:guild_id/vanity/invoice', DefaultUserOnly, async (ctx) => {
				const guildIdParam = ctx.req.param('guild_id');
				if (!guildIdParam) {
					return ctx.json({error: 'guild_id required'}, 400);
				}
				const guildId = createGuildID(BigInt(guildIdParam));
				const user = ctx.get('user');
				const cacheService = ctx.get('cacheService');

				let solPriceUsd: number;
				try {
					solPriceUsd = await fetchSolPriceUsd(cacheService);
				} catch {
					return ctx.json({error: 'Unable to fetch current SOL price. Please try again.'}, 503);
				}

				const solAmount = VANITY_USD_PRICE / solPriceUsd;
				const amountLamports = Math.ceil(solAmount * 1_000_000_000);

				let recentBlockhash: string;
				try {
					recentBlockhash = await fetchRecentBlockhash();
				} catch {
					return ctx.json({error: 'Unable to fetch Solana blockhash. Please try again.'}, 503);
				}

				try {
					const {purchaseId, merchantWallet} = await ctx.get('guildService').initiateVanityPurchase({
						userId: user.id,
						guildId,
						amountLamports,
						solPriceUsd,
						usdAmount: VANITY_USD_PRICE,
					});

					return ctx.json({
						purchase_id: purchaseId,
						merchant_wallet: merchantWallet,
						amount_lamports: amountLamports,
						recent_blockhash: recentBlockhash,
						usd_amount: VANITY_USD_PRICE,
						sol_price_usd: solPriceUsd,
					});
				} catch (err: any) {
					return ctx.json({error: err?.message ?? 'Failed to create invoice'}, err?.status ?? 400);
				}
			});

			apiService.app.post('/v1/guilds/:guild_id/vanity/verify', DefaultUserOnly, async (ctx) => {
				const guildIdParam = ctx.req.param('guild_id');
				if (!guildIdParam) {
					return ctx.json({error: 'guild_id required'}, 400);
				}
				const guildId = createGuildID(BigInt(guildIdParam));
				const {purchase_id: purchaseId, tx_signature: txSignature} = await ctx.req.json<{
					purchase_id: string;
					tx_signature: string;
				}>();
				if (!purchaseId || !txSignature) {
					return ctx.json({error: 'purchase_id and tx_signature required'}, 400);
				}
				const user = ctx.get('user');
				const guildService = ctx.get('guildService');

				let purchase: {amount_lamports: number};
				try {
					purchase = await guildService.getPendingVanityPurchase({userId: user.id, guildId, purchaseId});
				} catch (err: any) {
					return ctx.json({error: err?.message ?? 'Purchase not found'}, err?.status ?? 404);
				}

				// Verify the transaction — retry up to 8x with 3s delay for confirmation lag.
				const txData = await pollSolanaTransaction(txSignature);

				if (!txData) {
					return ctx.json({error: 'Transaction not found after waiting. Please contact support with your tx signature.'}, 400);
				}
				if (txData.meta?.err !== null && txData.meta?.err !== undefined) {
					return ctx.json({error: 'Transaction failed on-chain'}, 400);
				}

				const received = sumTransfersTo(txData, GUILD_VANITY_MERCHANT_WALLET);
				if (received < purchase.amount_lamports) {
					return ctx.json({error: `Insufficient payment. Expected ${purchase.amount_lamports} lamports, received ${received}`}, 400);
				}

				// Account 0 is always the fee-payer/sender for a simple transfer transaction.
				const accountKeys: Array<{pubkey: string}> = txData.transaction?.message?.accountKeys ?? [];
				const payerWalletAddress = accountKeys[0]?.pubkey ?? '';

				try {
					await guildService.confirmVanityPurchase({
						userId: user.id,
						guildId,
						purchaseId,
						txSignature,
						payerWalletAddress,
					});
				} catch (err: any) {
					return ctx.json({error: err?.message ?? 'Failed to confirm purchase'}, err?.status ?? 400);
				}

				return ctx.json({ok: true});
			});

			// ── Direct user-to-user SOL tipping ───────────────────────────────
			//
			// Clicking the tip button on a profile lets a user send an
			// arbitrary SOL amount straight to another user's linked wallet,
			// plus a tiny flat platform fee (quoted here, shown to the user
			// before they sign). Unlike the vanity-purchase flow, the amount
			// is chosen by the sender rather than computed server-side, so
			// there's no "invoice" pre-registration step — the flow is just
			// quote → sign a single two-instruction transaction (tip +
			// fee) → verify on-chain → record. tx_signature is the record's
			// primary key, so verification doubles as anti-replay.

			const TIP_FEE_USD = 0.01;

			apiService.app.get('/v1/users/:user_id/tip-target', DefaultUserOnly, async (ctx) => {
				const targetIdParam = ctx.req.param('user_id');
				if (!targetIdParam) {
					return ctx.json({error: 'user_id required'}, 400);
				}

				let recipientUserId;
				try {
					recipientUserId = createUserID(BigInt(targetIdParam));
				} catch {
					return ctx.json({error: 'Invalid user_id'}, 400);
				}

				const user = ctx.get('user');
				const tipService = new UserTipService(ctx.get('userRepository'));

				let recipientWalletAddress: string;
				try {
					({recipientWalletAddress} = await tipService.getTipTarget({senderUserId: user.id, recipientUserId}));
				} catch (err: any) {
					return ctx.json({error: err?.message ?? 'Unable to resolve tip target'}, err?.status ?? 400);
				}

				let solPriceUsd: number;
				try {
					solPriceUsd = await fetchSolPriceUsd(ctx.get('cacheService'));
				} catch {
					return ctx.json({error: 'Unable to fetch current SOL price. Please try again.'}, 503);
				}
				const feeLamports = Math.max(1, Math.ceil((TIP_FEE_USD / solPriceUsd) * 1_000_000_000));

				let recentBlockhash: string;
				try {
					recentBlockhash = await fetchRecentBlockhash();
				} catch {
					return ctx.json({error: 'Unable to fetch Solana blockhash. Please try again.'}, 503);
				}

				return ctx.json({
					recipient_wallet: recipientWalletAddress,
					platform_wallet: GUILD_VANITY_MERCHANT_WALLET,
					fee_lamports: feeLamports,
					fee_usd: TIP_FEE_USD,
					recent_blockhash: recentBlockhash,
					sol_price_usd: solPriceUsd,
				});
			});

			apiService.app.post('/v1/users/:user_id/tip/verify', DefaultUserOnly, async (ctx) => {
				const targetIdParam = ctx.req.param('user_id');
				if (!targetIdParam) {
					return ctx.json({error: 'user_id required'}, 400);
				}

				let recipientUserId;
				try {
					recipientUserId = createUserID(BigInt(targetIdParam));
				} catch {
					return ctx.json({error: 'Invalid user_id'}, 400);
				}

				const {tx_signature: txSignature} = await ctx.req.json<{tx_signature: string}>();
				if (!txSignature) {
					return ctx.json({error: 'tx_signature required'}, 400);
				}

				const user = ctx.get('user');
				const tipService = new UserTipService(ctx.get('userRepository'));

				let recipientWalletAddress: string;
				try {
					({recipientWalletAddress} = await tipService.getTipTarget({senderUserId: user.id, recipientUserId}));
				} catch (err: any) {
					return ctx.json({error: err?.message ?? 'Unable to resolve tip target'}, err?.status ?? 400);
				}

				const txData = await pollSolanaTransaction(txSignature);
				if (!txData) {
					return ctx.json({error: 'Transaction not found after waiting. Please contact support with your tx signature.'}, 400);
				}
				if (txData.meta?.err !== null && txData.meta?.err !== undefined) {
					return ctx.json({error: 'Transaction failed on-chain'}, 400);
				}

				const amountLamports = sumTransfersTo(txData, recipientWalletAddress);
				const feeLamports = sumTransfersTo(txData, GUILD_VANITY_MERCHANT_WALLET);

				if (amountLamports <= 0) {
					return ctx.json({error: 'No SOL was transferred to the recipient'}, 400);
				}
				if (feeLamports <= 0) {
					return ctx.json({error: 'Platform fee was not paid'}, 400);
				}

				// Account 0 is always the fee-payer/sender for this transaction shape.
				const accountKeys: Array<{pubkey: string}> = txData.transaction?.message?.accountKeys ?? [];
				const senderWalletAddress = accountKeys[0]?.pubkey ?? '';

				let solPriceUsd = 0;
				try {
					solPriceUsd = await fetchSolPriceUsd(ctx.get('cacheService'));
				} catch { /* non-critical — only used for the historical record */ }

				try {
					await tipService.recordTip({
						senderUserId: user.id,
						recipientUserId,
						txSignature,
						senderWalletAddress,
						recipientWalletAddress,
						amountLamports,
						feeLamports,
						solPriceUsd,
					});
				} catch (err: any) {
					return ctx.json({error: err?.message ?? 'Failed to record tip'}, err?.status ?? 400);
				}

				return ctx.json({ok: true, amount_lamports: amountLamports, fee_lamports: feeLamports});
			});

			// ── NFT sticker fetcher ──────────────────────────────────────────
			//
			// Fetches all NFTs/cNFTs for a Solana wallet and returns a unified
			// list. The SOLANA_DAS_URL env var enables compressed NFT support via
			// a DAS-compatible RPC (Helius, Shyft, QuickNode, etc.).  Without it,
			// only traditional SPL-token NFTs are returned via the public Solana
			// mainnet RPC — no API key required for that path.
			//
			// Results are cached server-side for 5 minutes per wallet address.

			apiService.app.get('/v1/nfts', DefaultUserOnly, async (ctx) => {
				const user = ctx.get('user');
				const userRepository = ctx.get('userRepository');
				const owner = await userRepository.findSolanaAddressByUserId(user.id);

				if (!owner) {
					return ctx.json({error: 'No Solana wallet linked to this account'}, 404);
				}

				const cacheService = ctx.get('cacheService');
				const cacheKey = `nfts:${owner}`;

				const cached = await cacheService.get<string>(cacheKey);
				if (cached) {
					return ctx.json({nfts: JSON.parse(cached), dasEnabled: (process.env['SOLANA_DAS_URL'] ?? null) !== null});
				}

				const dasUrl = process.env['SOLANA_DAS_URL'] ?? null;

				try {
					const nfts = await fetchNftsForWallet(owner, dasUrl);
					if (nfts.length > 0) {
						await cacheService.set(cacheKey, JSON.stringify(nfts), 300);
					}
					return ctx.json({nfts, dasEnabled: dasUrl !== null});
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : 'Failed to fetch NFTs';
					return ctx.json({error: message}, 502);
				}
			});

			// ────────────────────────────────────────────────────────────────

			app.route('/api', apiService.app);
			app.get('/.well-known/fluxer', async (ctx) => {
				const response = await apiService.app.fetch(ctx.req.raw);
				const body = await response.json();
				return ctx.json(body, response.status as any);
			});
			logger.info('API service mounted at /api');
		}

		const healthHandler = createHealthCheckHandler({
			services,
			staticDir,
			version: VERSION,
			startTime,
			latencyThresholdMs: config.healthCheck.latencyThresholdMs,
		});
		app.get('/_health', healthHandler);
		logger.info('Health check endpoint mounted at /_health');

		const readinessHandler = createReadinessCheckHandler({
			services,
			staticDir,
			version: VERSION,
			startTime,
			latencyThresholdMs: config.healthCheck.latencyThresholdMs,
		});
		app.get('/_ready', readinessHandler);
		logger.info('Readiness check endpoint mounted at /_ready');

		const livenessHandler = createLivenessCheckHandler();
		app.get('/_live', livenessHandler);
		logger.info('Liveness check endpoint mounted at /_live');

		app.get('/sol-balance/:address', async (ctx) => {
			const address = ctx.req.param('address');
			try {
				const res = await fetch(SOLANA_RPC_URL, {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, {commitment: 'confirmed'}]}),
				});
				const data = await res.json();
				return ctx.json(data);
			} catch {
				return ctx.json({error: 'RPC unavailable'}, 502);
			}
		});

		if (config.services.marketing) {
			const marketingLogger = logger.child({component: 'marketing'});
			const marketingResult = createMarketingApp({
				config: {
					env: config.env === 'production' ? 'production' : 'development',
					port: config.services.marketing.port ?? 0,
					host: config.services.marketing.host ?? '127.0.0.1',
					secretKeyBase: config.services.marketing.secret_key_base,
					// Force root-mounted regardless of the service's own base_path default ('/marketing') —
					// when embedded in fluxer_server, marketing pages live directly at e.g. /help, not /marketing/help.
					basePath: '',
					apiEndpoint: config.endpoints.api,
					appEndpoint: config.endpoints.app,
					staticCdnEndpoint: config.endpoints.static_cdn,
					marketingEndpoint: config.endpoints.marketing,
					geoipDbPath: config.geoip.maxmind_db_path,
					trustCfConnectingIp: config.proxy.trust_cf_connecting_ip,
					releaseChannel: BUILD_METADATA.releaseChannel,
					buildTimestamp: BUILD_METADATA.buildTimestamp,
					rateLimit: null,
				},
				logger: marketingLogger,
				// Marketing owns the apex front page; the SPA (mounted after) keeps /login, /channels, etc.
				mountHome: true,
				mountNotFound: false,
			});
			app.route('/', marketingResult.app);
			logger.info('Marketing pages mounted at / (home, help, terms, support, etc.)');
		}

		if (services.appServer !== undefined) {
			app.route('/', services.appServer.app);
			logger.info('SPA App server mounted at /');
		}

		app.onError(AppErrorHandler);
		app.notFound(AppNotFoundHandler);

		logger.info({serviceCount: initializers.length}, 'All services mounted successfully');
	} catch (error) {
		logger.error({error: error instanceof Error ? error.message : 'Unknown error'}, 'Failed to mount routes');
		throw error;
	}

	const initialize = async (): Promise<void> => {
		await runServiceInitialization(initializers, logger);
	};

	const start = async (): Promise<void> => {
		await startBackgroundServices(initializers, logger);
	};

	const shutdown = async (): Promise<void> => {
		await shutdownAllServices(initializers, logger);
	};

	return {
		app,
		services,
		initialize,
		start,
		shutdown,
	};
}
