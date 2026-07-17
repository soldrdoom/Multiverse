import React from 'react';
import {useVault} from '@app/hooks/useVault';

export const IdentityVault: React.FC = () => {
	const {status, keyPair, error, unlock} = useVault();

	const isLocked = status !== 'unlocked';
	const identityKey = keyPair?.publicKeyB64 ?? '';

	return (
		<div style={{padding: '20px', color: 'white'}}>
			<h2 style={{fontSize: '24px', fontWeight: 'bold'}}>Identity Vault</h2>
			<p style={{marginTop: '10px'}}>
				Status:{' '}
				<span style={{color: isLocked ? '#ff4444' : '#00ff00'}}>{isLocked ? 'Locked' : 'Unlocked'}</span>
			</p>
			{error && <p style={{marginTop: '8px', color: '#ff4444', fontSize: '12px'}}>{error}</p>}
			{isLocked ? (
				<button
					onClick={unlock}
					disabled={status === 'pending'}
					style={{
						marginTop: '20px',
						padding: '10px 20px',
						background: '#5865f2',
						color: 'white',
						border: 'none',
						borderRadius: '4px',
						cursor: status === 'pending' ? 'not-allowed' : 'pointer',
						opacity: status === 'pending' ? 0.6 : 1,
					}}
				>
					{status === 'pending' ? 'Signing…' : 'Sign in with Solana'}
				</button>
			) : (
				<div style={{marginTop: '20px'}}>
					<p style={{fontSize: '12px', color: '#888'}}>X25519 Public Key:</p>
					<code
						style={{
							display: 'block',
							background: '#111',
							padding: '10px',
							borderRadius: '4px',
							wordBreak: 'break-all',
							fontSize: '11px',
						}}
					>
						{identityKey}
					</code>
				</div>
			)}
		</div>
	);
};