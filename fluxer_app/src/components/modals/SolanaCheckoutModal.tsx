/*
 * Copyright (C) 2026 Multiverse Contributors
 *
 * This file is part of Multiverse.
 *
 * Multiverse is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Multiverse is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Multiverse. If not, see <https://www.gnu.org/licenses/>.
 */

import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import * as PremiumActionCreators from '@app/actions/PremiumActionCreators';
import type {SolanaInvoice} from '@app/actions/PremiumActionCreators';
import * as Modal from '@app/components/modals/Modal';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {Logger} from '@app/lib/Logger';
import multiverseOfficialLogo from '../../../assets/images/multiverse-official-logo.png';
import {Trans, useLingui} from '@lingui/react/macro';
import React, {useEffect, useRef, useState} from 'react';

const logger = new Logger('SolanaCheckoutModal');

// ── Solana transaction utilities ─────────────────────────────────────────────

const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(input: string): Uint8Array {
	const bytes = [0];
	for (const char of input) {
		const value = BASE58_CHARS.indexOf(char);
		if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
		let carry = value;
		for (let i = 0; i < bytes.length; i++) {
			carry += bytes[i] * 58;
			bytes[i] = carry & 0xff;
			carry >>= 8;
		}
		while (carry > 0) {
			bytes.push(carry & 0xff);
			carry >>= 8;
		}
	}
	for (const char of input) {
		if (char !== '1') break;
		bytes.push(0);
	}
	return new Uint8Array(bytes.reverse());
}

function encodeBase58(bytes: Uint8Array): string {
	const digits = [0];
	for (const byte of bytes) {
		let carry = byte;
		for (let i = 0; i < digits.length; i++) {
			carry += digits[i] << 8;
			digits[i] = carry % 58;
			carry = Math.floor(carry / 58);
		}
		while (carry > 0) {
			digits.push(carry % 58);
			carry = Math.floor(carry / 58);
		}
	}
	let result = '';
	for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1';
	for (let i = digits.length - 1; i >= 0; i--) result += BASE58_CHARS[digits[i]];
	return result;
}

function decode32(addr: string): Uint8Array {
	const raw = decodeBase58(addr);
	if (raw.length === 32) return raw;
	const out = new Uint8Array(32);
	if (raw.length < 32) {
		out.set(raw, 32 - raw.length);
	} else {
		out.set(raw.slice(raw.length - 32));
	}
	return out;
}

/** Serialize a Solana legacy SOL-transfer transaction to bytes, ready for base58 encoding. */
function buildSerializedSolTransfer(
	senderAddr: string,
	recipientAddr: string,
	lamports: number,
	recentBlockhash: string,
): Uint8Array {
	const sender = decode32(senderAddr);
	const recipient = decode32(recipientAddr);
	const systemProgram = new Uint8Array(32); // 11111111... = all zeros
	const blockhash = decode32(recentBlockhash);

	// System program Transfer instruction: type=2 (u32 LE) + lamports (u64 LE)
	const ixData = new Uint8Array(12);
	ixData[0] = 2; // instruction index (u32 LE, remaining 3 bytes are 0)
	new DataView(ixData.buffer).setBigUint64(4, BigInt(lamports), true);

	// Message layout (legacy):
	//   header [3]: numSigs=1, numROSigned=0, numROUnsigned=1
	//   accounts [compact-u16 + 32*n]: sender, recipient, systemProgram
	//   recentBlockhash [32]
	//   instructions [compact-u16 + ...]
	//     ix: programIdx, [accountIdxs compact-u16...], data [compact-u16...]
	const message = concat([
		new Uint8Array([1, 0, 1]),    // header
		new Uint8Array([3]),           // 3 accounts
		sender, recipient, systemProgram,
		blockhash,
		new Uint8Array([1]),           // 1 instruction
		new Uint8Array([2]),           // programAccountIndex = 2 (systemProgram)
		new Uint8Array([2, 0, 1]),     // 2 account indices: sender=0, recipient=1
		new Uint8Array([12]),          // data length = 12
		ixData,
	]);

	// Full transaction: [numSigs=1 compact-u16] [64 zero bytes = empty sig slot] [message]
	return concat([new Uint8Array([1]), new Uint8Array(64), message]);
}

function concat(arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((n, a) => n + a.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const a of arrays) { out.set(a, offset); offset += a.length; }
	return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SolanaCheckoutModalProps {
	plan: 'monthly' | 'yearly';
	onSuccess?: () => void;
}

// Solana gradient logo (inline SVG, no external deps)
function SolanaLogo({size = 22}: {size?: number}) {
	return (
		<svg width={size} height={size} viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<defs>
				<linearGradient id="scm-sol-grad" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="#9945FF" />
					<stop offset="100%" stopColor="#14F195" />
				</linearGradient>
			</defs>
			<rect x="16" y="20" width="96" height="18" rx="5" fill="url(#scm-sol-grad)" />
			<rect x="16" y="55" width="96" height="18" rx="5" fill="url(#scm-sol-grad)" />
			<rect x="16" y="90" width="96" height="18" rx="5" fill="url(#scm-sol-grad)" />
		</svg>
	);
}

export const SolanaCheckoutModal: React.FC<SolanaCheckoutModalProps> = ({plan, onSuccess}) => {
	const {t} = useLingui();
	const [invoice, setInvoice] = useState<SolanaInvoice | null>(null);
	const [loadingInvoice, setLoadingInvoice] = useState(true);
	const [invoiceError, setInvoiceError] = useState<string | null>(null);

	const [paying, setPaying] = useState(false);
	const [payError, setPayError] = useState<string | null>(null);
	const [verifying, setVerifying] = useState(false);

	const [copied, setCopied] = useState(false);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let mounted = true;
		PremiumActionCreators.createSolanaInvoice(plan)
			.then((inv) => { if (mounted) setInvoice(inv); })
			.catch((err) => {
				logger.error('Failed to create invoice', err);
				if (mounted) setInvoiceError(t`Failed to create payment invoice. Please try again.`);
			})
			.finally(() => { if (mounted) setLoadingInvoice(false); });
		return () => { mounted = false; };
	}, [plan, t]);

	useEffect(() => {
		return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
	}, []);

	const handleCopy = () => {
		if (!invoice) return;
		void navigator.clipboard.writeText(invoice.recipient);
		setCopied(true);
		copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
	};

	const submitVerification = async (signature: string, inv: SolanaInvoice) => {
		setVerifying(true);
		try {
			await PremiumActionCreators.verifySolanaPayment(inv.invoiceId, signature);
			ModalActionCreators.pop();
			onSuccess?.();
		} catch (err: any) {
			logger.error('Payment verification failed', err);
			const msg = err?.body?.message ?? err?.message ?? t`Verification failed. Please try again.`;
			setPayError(String(msg));
		} finally {
			setVerifying(false);
		}
	};

	const handlePayWithPhantom = async () => {
		if (!invoice) return;
		setPayError(null);
		setPaying(true);
		try {
			const sol = (window as any).phantom?.solana ?? (window as any).solana;
			if (!sol) {
				setPayError(t`Phantom wallet not found. Please install the Phantom browser extension.`);
				return;
			}
			if (!sol.isConnected) await sol.connect();
			const senderAddress: string = sol.publicKey?.toString();
			if (!senderAddress) { setPayError(t`Could not get wallet address.`); return; }

			const txBytes = buildSerializedSolTransfer(senderAddress, invoice.recipient, invoice.amountLamports, invoice.recentBlockhash);
			const encodedTx = encodeBase58(txBytes);

			// Use Phantom's low-level request() to pass raw base58-encoded transaction bytes
			// directly to the extension, bypassing the @solana/web3.js Transaction interface.
			if (typeof sol.request !== 'function') throw new Error(`sol.request unavailable (${typeof sol.request})`);

			const result = await sol.request({
				method: 'signAndSendTransaction',
				params: {message: encodedTx, sendOptions: {preflightCommitment: 'confirmed'}},
			});
			const signature: string = result?.signature ?? (typeof result === 'string' ? result : null);
			if (!signature) throw new Error(`No signature returned: ${JSON.stringify(result)}`);

			logger.info('Transaction sent', {signature});
			await submitVerification(signature, invoice);
		} catch (err: any) {
			if (err?.code === 4001 || err?.message?.includes('rejected') || err?.message?.includes('cancelled')) return;
			logger.error('Phantom payment failed', err);
			setPayError(`[${err?.code ?? err?.name ?? 'Error'}] ${err?.message ?? 'Unknown error'}`);
		} finally {
			setPaying(false);
		}
	};

	const isBusy = paying || verifying;
	const planPeriod = plan === 'monthly' ? t`/ month` : t`/ year`;

	// ── Custom header title element ──────────────────────────────────────────
	const headerIcon = (
		<span style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
			<SolanaLogo size={32} />
		</span>
	);

	const headerRight = (
		<span style={{display: 'flex', alignItems: 'center', gap: '0.375rem'}}>
			<img src={multiverseOfficialLogo} alt="Multiverse" style={{width: 40, height: 40, objectFit: 'contain'}} />
		</span>
	);

	return (
		<Modal.Root size="small" centered onClose={() => !isBusy && ModalActionCreators.pop()}>
			<Modal.Header
				title={
					<span style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', letterSpacing: '0.06em', textTransform: 'uppercase'}}>
						{headerIcon}
						<Trans>Solana Payment</Trans>
						{headerRight}
					</span>
				}
				onClose={() => !isBusy && ModalActionCreators.pop()}
			/>

			<Modal.Content>
				<div style={{display: 'flex', flexDirection: 'column', gap: '0.875rem'}}>
					{loadingInvoice ? (
						<div style={{display: 'flex', justifyContent: 'center', padding: '1.5rem'}}>
							<Spinner />
						</div>
					) : invoiceError ? (
						<p style={{margin: 0, color: 'var(--danger, #f04747)', fontSize: '0.875rem'}}>{invoiceError}</p>
					) : invoice ? (
						<>
							{/* YOUR PLAN card */}
							<div style={{
								background: 'rgba(255,255,255,0.04)',
								border: '1px solid rgba(255,255,255,0.07)',
								borderRadius: 10,
								padding: '1rem 1.25rem',
								textAlign: 'center',
							}}>
								<div style={{fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: '0.5rem'}}>
									<Trans>Your Plan</Trans>
								</div>
								<div style={{fontSize: '1.75rem', fontWeight: 700, color: 'var(--header-primary, #fff)', lineHeight: 1.15}}>
									${invoice.usd.toFixed(2)}{' '}
									<span style={{fontSize: '1.1rem', fontWeight: 400, color: 'rgba(255,255,255,0.5)'}}>
										USD {planPeriod}
									</span>
								</div>
								<div style={{marginTop: '0.3rem', fontSize: '0.9rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)'}}>
									≈ {invoice.sol} SOL{' '}
									<span style={{color: 'rgba(255,255,255,0.45)'}}>
										(@ ${invoice.solPriceUsd.toLocaleString(undefined, {maximumFractionDigits: 2})}/SOL)
									</span>
								</div>
							</div>

							{/* RECIPIENT WALLET */}
							<div>
								<div style={{fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: '0.3rem'}}>
									<Trans>Recipient Wallet</Trans>
								</div>
								<div style={{fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '0.3rem'}}>
									<Trans>Send SOL to:</Trans>
								</div>
								<div style={{display: 'flex', alignItems: 'center', gap: '0.625rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '0.625rem 0.75rem'}}>
									<span style={{fontFamily: 'monospace', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.85)', wordBreak: 'break-all', flex: 1}}>
										{invoice.recipient}
									</span>
									<Button type="button" variant="secondary" small compact onClick={handleCopy} disabled={isBusy}>
										{copied ? <Trans>Copied!</Trans> : <Trans>Copy Address</Trans>}
									</Button>
								</div>
							</div>

							{/* Pay button / busy state */}
							{paying || verifying ? (
								<div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '0.5rem 0'}}>
									<Spinner />
									<span style={{fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)'}}>
										{paying ? <Trans>Waiting for wallet confirmation…</Trans> : <Trans>Verifying payment…</Trans>}
									</span>
								</div>
							) : (
								<button
									type="button"
									style={{
										width: '100%',
										padding: '0.875rem',
										background: '#00C864',
										border: 'none',
										borderRadius: 10,
										fontSize: '1rem',
										fontWeight: 700,
										color: '#000',
										cursor: 'pointer',
										letterSpacing: '0.02em',
									}}
									onClick={() => void handlePayWithPhantom()}
									disabled={isBusy}
								>
									<Trans>Pay instantly with Solana</Trans>
								</button>
							)}

							{payError && (
								<p style={{margin: 0, color: 'var(--danger, #f04747)', fontSize: '0.875rem'}}>{payError}</p>
							)}
						</>
					) : null}
				</div>
			</Modal.Content>

			<Modal.Footer>
				<div style={{display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
					<span style={{fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '0.3rem'}}>
						<img src={multiverseOfficialLogo} alt="" style={{width: 28, height: 28, objectFit: 'contain'}} />
						<Trans>Powered by Multiverse</Trans>
					</span>
					<Button type="button" variant="secondary" onClick={() => ModalActionCreators.pop()} disabled={isBusy}>
						<Trans>Cancel</Trans>
					</Button>
				</div>
			</Modal.Footer>
		</Modal.Root>
	);
};

export default SolanaCheckoutModal;
