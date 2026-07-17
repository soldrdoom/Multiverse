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

import {observer} from 'mobx-react-lite';
import multiverseOfficialLogo from '../../../assets/images/multiverse-official-logo.png';

export const MultiverseSymbol = observer(({className}: {className?: string}) => {
	return (
		<img
			src={multiverseOfficialLogo}
			alt="Multiverse"
			className={className}
			style={{
				width: '54px',
				height: '54px',
				objectFit: 'cover',
				objectPosition: 'center',
				display: 'block',
				padding: 0,
				margin: 0,
				maxWidth: 'none',
				maxHeight: 'none',
				transform: 'scale(1.3)',
				transformOrigin: 'center',
				flexShrink: 0,
			}}
		/>
	);
});
