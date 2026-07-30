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

import {AuthBottomLink} from '@app/components/auth/AuthBottomLink';
import sharedStyles from '@app/components/auth/AuthPageStyles.module.css';
import {AuthRegisterFormCore} from '@app/components/auth/AuthRegisterFormCore';
import {useMultiverseDocumentTitle} from '@app/hooks/useMultiverseDocumentTitle';
import {useLocation} from '@app/lib/router/React';
import * as RouterUtils from '@app/utils/RouterUtils';
import {setPathQueryParams} from '@app/utils/UrlUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const RegisterPageContent = observer(function RegisterPageContent() {
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	// Sanitised at the read so both the navigation target and any re-propagation into a link
	// are covered. These previously reached window.history.replaceState raw and failed closed
	// only because the browser throws SecurityError cross-origin — an enforcement this repo
	// was relying on without stating.
	const rawRedirect = RouterUtils.sanitizeSameOriginPath(params['get']('redirect_to'));
	const redirectTo = rawRedirect || '/';
	const loginPath = rawRedirect ? setPathQueryParams('/login', {redirect_to: rawRedirect}) : '/login';

	return (
		<>
			<h1 className={sharedStyles.title}>
				<Trans>Create an account</Trans>
			</h1>

			<div className={sharedStyles.container}>
				<AuthRegisterFormCore
					fields={{
						showEmail: true,
						showPassword: true,
						showPasswordConfirmation: true,
						showUsernameValidation: true,
					}}
					submitLabel={<Trans>Create account</Trans>}
					redirectPath={redirectTo}
				/>

				<AuthBottomLink variant="login" to={loginPath} />
			</div>
		</>
	);
});

const RegisterPage = observer(function RegisterPage() {
	const {t} = useLingui();
	useMultiverseDocumentTitle(t`Register`);

	return <RegisterPageContent />;
});

export default RegisterPage;
