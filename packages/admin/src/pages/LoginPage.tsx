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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {ErrorAlert} from '@fluxer/admin/src/components/ErrorDisplay';
import {VStack} from '@fluxer/admin/src/components/ui/Layout/VStack';
import {Heading} from '@fluxer/admin/src/components/ui/Typography';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import {Button} from '@fluxer/ui/src/components/Button';
export interface LoginPageProps {
	config: Config;
	errorMessage: string | undefined;
}

export function LoginPage({config, errorMessage}: LoginPageProps) {
	return (
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Login ~ Multiverse Admin</title>
				<link rel="stylesheet" href={`${config.basePath}/static/app.css`} />
			</head>
			<body
				class="flex min-h-screen items-center justify-center bg-[var(--background-primary)] p-4"
				style={{
					backgroundImage:
						'radial-gradient(circle at 15% 15%, color-mix(in srgb, #9945ff 16%, transparent) 0%, transparent 45%), radial-gradient(circle at 85% 85%, color-mix(in srgb, #14f195 14%, transparent) 0%, transparent 45%)',
				}}
			>
				<VStack gap={4} class="w-full max-w-sm">
					<VStack gap={2} align="center" class="mb-2">
						<span
							class="flex h-12 w-12 items-center justify-center rounded-xl font-bold text-[var(--button-primary-text)] text-xl"
							style={{background: 'var(--gradient-brand)'}}
						>
							M
						</span>
					</VStack>
					<div class="vanguard-card p-8">
						<VStack gap={8}>
							<VStack gap={1} align="center">
								<Heading level={1} size="xl" class="text-neutral-50">
									Multiverse Admin
								</Heading>
								<p class="text-neutral-500 text-sm">Sign in with your staff account to continue.</p>
							</VStack>

							{errorMessage && <ErrorAlert error={errorMessage} />}

							<Button href={`${config.basePath}/auth/start`} variant="primary" fullWidth>
								Sign in with Multiverse
							</Button>
						</VStack>
					</div>
				</VStack>
			</body>
		</html>
	);
}
