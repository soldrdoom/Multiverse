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
import {SolanaAuthService} from '@fluxer/api/src/auth/services/SolanaAuthService';
import {DefaultUserOnly} from '@fluxer/api/src/middleware/AuthMiddleware';
import {createHealthCheckHandler, createLivenessCheckHandler, createReadinessCheckHandler} from '@app/HealthCheck';
import {createComponentLogger} from '@app/Logger';
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

			// ── Solana premium payment endpoints ────────────────────────────

			const MERCHANT_WALLET = 'AwsW3kad25Uk7ptX3YY3wy4o1mN5BJTATfuMa1u4Di23';

			// USD prices — SOL amount is computed at invoice time from live price
			const USD_PRICES = {
				monthly: {usd: 5.00,  months: 1,  billingCycle: 'monthly'},
				yearly:  {usd: 50.00, months: 12, billingCycle: 'yearly'},
			} as const;

			const SOL_PRICE_CACHE_KEY = 'sol_usd_price';
			const SOL_PRICE_CACHE_TTL = 60; // seconds

			async function fetchSolPriceUsd(cacheService: {get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, ttl: number) => Promise<void>}): Promise<number> {
				const cached = await cacheService.get<number>(SOL_PRICE_CACHE_KEY);
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

			// GET /premium/solana/prices — returns USD pricing info
			apiService.app.get('/v1/premium/solana/prices', async (ctx) => {
				return ctx.json({
					merchant: MERCHANT_WALLET,
					monthly: {usd: USD_PRICES.monthly.usd},
					yearly:  {usd: USD_PRICES.yearly.usd},
				});
			});

			// POST /premium/solana/invoice — creates a short-lived payment invoice with live SOL price
			apiService.app.post('/v1/premium/solana/invoice', DefaultUserOnly, async (ctx) => {
				const {plan} = await ctx.req.json<{plan: string}>();
				if (plan !== 'monthly' && plan !== 'yearly') {
					return ctx.json({error: 'plan must be monthly or yearly'}, 400);
				}
				const user = ctx.get('user');
				const cacheService = ctx.get('cacheService');

				// Fetch live SOL price and compute lamports for the USD amount
				let solPriceUsd: number;
				try {
					solPriceUsd = await fetchSolPriceUsd(cacheService);
				} catch {
					return ctx.json({error: 'Unable to fetch current SOL price. Please try again.'}, 503);
				}

				const usdAmount = USD_PRICES[plan].usd;
				const solAmount = usdAmount / solPriceUsd;
				const amountLamports = Math.ceil(solAmount * 1_000_000_000);
				const solDisplay = Math.ceil(solAmount * 10000) / 10000; // 4 decimal places

				// Fetch recent blockhash server-side to avoid CORS issues with browser→RPC calls
				let recentBlockhash: string;
				try {
					const rpcRes = await fetch('https://api.mainnet-beta.solana.com', {
						method: 'POST',
						headers: {'Content-Type': 'application/json'},
						body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{commitment: 'confirmed'}]}),
					});
					const rpcData = await rpcRes.json() as any;
					recentBlockhash = rpcData?.result?.value?.blockhash;
					if (!recentBlockhash) throw new Error('No blockhash in response');
				} catch {
					return ctx.json({error: 'Unable to fetch Solana blockhash. Please try again.'}, 503);
				}

				const invoiceId = crypto.randomUUID();
				const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
				await cacheService.set(
					`premium-invoice:${invoiceId}`,
					JSON.stringify({userId: user.id.toString(), plan, amountLamports, usdAmount, solPriceUsd, used: false}),
					1800,
				);
				return ctx.json({
					invoiceId,
					amountLamports,
					sol: solDisplay,
					usd: usdAmount,
					solPriceUsd,
					recipient: MERCHANT_WALLET,
					recentBlockhash,
					expiresAt: expiresAt.toISOString(),
				});
			});

			// POST /premium/solana/verify — verifies tx and grants premium
			apiService.app.post('/v1/premium/solana/verify', DefaultUserOnly, async (ctx) => {
				const {invoiceId, txSignature} = await ctx.req.json<{invoiceId: string; txSignature: string}>();
				if (!invoiceId || !txSignature) {
					return ctx.json({error: 'invoiceId and txSignature required'}, 400);
				}

				const cacheService = ctx.get('cacheService');
				const invoiceKey = `premium-invoice:${invoiceId}`;
				const rawInvoice = await cacheService.getAndDelete<string>(invoiceKey);
				if (!rawInvoice) {
					return ctx.json({error: 'Invoice not found or expired'}, 404);
				}
				const invoice = JSON.parse(typeof rawInvoice === 'string' ? rawInvoice : JSON.stringify(rawInvoice)) as {
					userId: string; plan: 'monthly' | 'yearly'; amountLamports: number; used: boolean;
				};

				const user = ctx.get('user');
				if (invoice.userId !== user.id.toString()) {
					return ctx.json({error: 'Invoice does not belong to this user'}, 403);
				}

				// Verify the transaction on Solana mainnet — retry up to 8x with 3s delay for confirmation lag
				let txData: any;
				for (let attempt = 0; attempt < 8; attempt++) {
					try {
						const rpcRes = await fetch('https://api.mainnet-beta.solana.com', {
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

				if (!txData) {
					return ctx.json({error: 'Transaction not found after waiting. Please contact support with your tx signature.'}, 400);
				}
				if (txData.meta?.err !== null && txData.meta?.err !== undefined) {
					return ctx.json({error: 'Transaction failed on-chain'}, 400);
				}

				// Find merchant wallet in account keys and check balance increase
				const accountKeys: Array<{pubkey: string}> = txData.transaction?.message?.accountKeys ?? [];
				const merchantIdx = accountKeys.findIndex((k: any) => k.pubkey === MERCHANT_WALLET);
				if (merchantIdx < 0) {
					return ctx.json({error: 'Merchant wallet not found in transaction accounts'}, 400);
				}

				const preBalances: number[] = txData.meta?.preBalances ?? [];
				const postBalances: number[] = txData.meta?.postBalances ?? [];
				const received = (postBalances[merchantIdx] ?? 0) - (preBalances[merchantIdx] ?? 0);

				if (received < invoice.amountLamports) {
					// Put the invoice back so user can retry with correct amount
					await cacheService.set(invoiceKey, JSON.stringify({...invoice, used: false}), 1800);
					return ctx.json({error: `Insufficient payment. Expected ${invoice.amountLamports} lamports, received ${received}`}, 400);
				}



				// Grant premium
				const price = USD_PRICES[invoice.plan];
				const stripeService = ctx.get('stripeService') as any;
				const hasEverPurchased = user.premiumSince !== null;
				await stripeService.premiumService.grantPremium(user.id, 1, price.months, price.billingCycle, hasEverPurchased);

				return ctx.json({ok: true, plan: invoice.plan});
			});

			// POST /premium/solana/recover — one-time recovery: grant premium for a confirmed tx
			apiService.app.post('/v1/premium/solana/recover', DefaultUserOnly, async (ctx) => {
				const {txSignature, plan} = await ctx.req.json<{txSignature: string; plan: string}>();
				if (!txSignature || (plan !== 'monthly' && plan !== 'yearly')) {
					return ctx.json({error: 'txSignature and plan (monthly|yearly) required'}, 400);
				}
				const user = ctx.get('user');
				const rpcRes = await fetch('https://api.mainnet-beta.solana.com', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'getTransaction',
						params: [txSignature, {encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0}]}),
				});
				const rpcJson = await rpcRes.json() as any;
				const txData = rpcJson?.result;
				if (!txData || txData.meta?.err) return ctx.json({error: 'Transaction invalid or not confirmed'}, 400);
				const accountKeys = txData.transaction?.message?.accountKeys ?? [];
				const merchantIdx = accountKeys.findIndex((k: any) => k.pubkey === MERCHANT_WALLET);
				if (merchantIdx < 0) return ctx.json({error: 'Merchant wallet not in tx'}, 400);
				const received = (txData.meta.postBalances[merchantIdx] ?? 0) - (txData.meta.preBalances[merchantIdx] ?? 0);
				const price = USD_PRICES[plan as 'monthly' | 'yearly'];
				const minLamports = Math.floor(price.usd / 100 * 1_000_000_000); // at least $0.01 worth
				if (received < minLamports) return ctx.json({error: `Received only ${received} lamports`}, 400);
				const stripeService = ctx.get('stripeService') as any;
				const hasEverPurchased = user.premiumSince !== null;
				await stripeService.premiumService.grantPremium(user.id, 1, price.months, price.billingCycle, hasEverPurchased);
				return ctx.json({ok: true, plan, received});
			});

			// ────────────────────────────────────────────────────────────────

			app.route('/api', apiService.app);
			app.get('/.well-known/fluxer', (ctx) => apiService.app.fetch(ctx.req.raw));
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
				const res = await fetch('https://api.mainnet-beta.solana.com', {
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
