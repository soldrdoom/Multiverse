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

import type {
	CounterParams,
	GaugeParams,
	HistogramParams,
	MetricsInterface,
} from '@fluxer/media_proxy/src/types/Metrics';
import {recordCounter, recordGauge, recordHistogram} from '@fluxer/telemetry/src/Metrics';
import {isTelemetryActive} from '@fluxer/telemetry/src/Telemetry';

export function createMetrics(): MetricsInterface {
	return {
		counter({name, dimensions = {}, value = 1}: CounterParams) {
			if (!isTelemetryActive()) return;
			recordCounter({name, dimensions, value});
		},
		histogram({name, dimensions = {}, valueMs}: HistogramParams) {
			if (!isTelemetryActive()) return;
			recordHistogram({name, dimensions, valueMs});
		},
		gauge({name, dimensions = {}, value}: GaugeParams) {
			if (!isTelemetryActive()) return;
			recordGauge({name, dimensions, value});
		},
		isEnabled() {
			return isTelemetryActive();
		},
	};
}
