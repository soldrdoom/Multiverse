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

function buildHomePageScript(solanaEndpoint: string): string {
	return `(function() {
  'use strict';

  var SOLANA_ENDPOINT = ${JSON.stringify(solanaEndpoint)};
  var POLL_INTERVAL_MS = 3000;
  var CHART_W = 620;
  var CHART_H = 150;
  var CHART_PAD = 10;
  var RAIL_GAP = 24;

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }

  function money(n, digits) {
    return '$' + n.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  }

  function big(n) {
    return n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : '$' + (n / 1e6).toFixed(1) + 'M';
  }

  function initRail() {
    var rail = byId('mv-rail');
    var dotsWrap = byId('mv-dots');
    if (!rail || !dotsWrap) return;

    var storyCount = rail.querySelectorAll('article').length;
    var page = 0;
    var programmatic = false;
    var programmaticTimer = null;

    function metrics() {
      var card = rail.querySelector('article');
      var pitch = card ? card.offsetWidth + RAIL_GAP : 312;
      var perView = Math.max(1, Math.round((rail.clientWidth + RAIL_GAP) / pitch));
      var stepPx = pitch * perView;
      var maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      var pages = Math.max(1, Math.ceil(storyCount / perView));
      return {pitch: pitch, perView: perView, stepPx: stepPx, maxScroll: maxScroll, pages: pages};
    }

    function renderDots(pages) {
      while (dotsWrap.firstChild) dotsWrap.removeChild(dotsWrap.firstChild);
      for (var i = 0; i < pages; i++) {
        (function(idx) {
          var dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'mv-dot' + (idx === page ? ' is-active' : '');
          dot.setAttribute('aria-label', 'Go to slide ' + (idx + 1));
          dot.addEventListener('click', function() {
            goTo(idx, false);
          });
          dotsWrap.appendChild(dot);
        })(i);
      }
    }

    function setPage(next, pages) {
      page = next;
      if (dotsWrap.children.length !== pages) {
        renderDots(pages);
        return;
      }
      for (var i = 0; i < dotsWrap.children.length; i++) {
        dotsWrap.children[i].className = 'mv-dot' + (i === page ? ' is-active' : '');
      }
    }

    function goTo(target, wrap) {
      var m = metrics();
      var max = m.pages - 1;
      var idx = wrap ? (target > max ? 0 : target < 0 ? max : target) : Math.min(max, Math.max(0, target));
      programmatic = true;
      clearTimeout(programmaticTimer);
      programmaticTimer = setTimeout(function() {
        programmatic = false;
      }, 750);
      rail.scrollTo({left: Math.min(m.maxScroll, idx * m.stepPx), behavior: 'smooth'});
      setPage(idx, m.pages);
    }

    rail.addEventListener('scroll', function() {
      if (programmatic) return;
      var m = metrics();
      var p = Math.min(m.pages - 1, Math.max(0, Math.round(rail.scrollLeft / m.stepPx)));
      if (p !== page) setPage(p, m.pages);
    }, {passive: true});

    var prevBtn = byId('mv-prev');
    var nextBtn = byId('mv-next');
    if (prevBtn) prevBtn.addEventListener('click', function() { goTo(page - 1, false); });
    if (nextBtn) nextBtn.addEventListener('click', function() { goTo(page + 1, false); });

    renderDots(metrics().pages);
    if (typeof ResizeObserver !== 'undefined') {
      var observer = new ResizeObserver(function() {
        var m = metrics();
        if (page > m.pages - 1) page = m.pages - 1;
        if (dotsWrap.children.length !== m.pages) renderDots(m.pages);
      });
      observer.observe(rail);
    }
  }

  function initSolana() {
    if (!byId('mv-network')) return;
    var range = '7';

    function setLive(live) {
      var liveBadge = byId('mv-live-badge');
      var cachedBadge = byId('mv-cached-badge');
      if (liveBadge) liveBadge.style.display = live ? 'flex' : 'none';
      if (cachedBadge) cachedBadge.style.display = live ? 'none' : 'inline';
    }

    function applyMarket(data) {
      var m = data.market;
      if (!m) return;
      setText('mv-sol-price', money(m.price, 2));
      var badge = byId('mv-sol-change');
      if (badge) {
        var up = (m.change24 || 0) >= 0;
        badge.className = 'mv-change-badge ' + (up ? 'is-up' : 'is-down');
        badge.textContent = (up ? '\\u25B2 +' : '\\u25BC ') + (m.change24 || 0).toFixed(2) + '%';
      }
      setText('mv-mkt-cap', big(m.cap));
      setText('mv-mkt-vol', big(m.vol));
      setText('mv-mkt-range', money(m.low24, 2) + ' \\u2013 ' + money(m.high24, 2));
      setText('mv-mkt-ath', money(m.ath, 2));
    }

    function applyChart(data) {
      var s = data.series;
      if (!s || s.length < 4) return;
      var min = Math.min.apply(null, s);
      var max = Math.max.apply(null, s);
      var span = (max - min) || 1;
      var line = '';
      var lastX = 0;
      var lastY = 0;
      for (var i = 0; i < s.length; i++) {
        var x = (i / (s.length - 1)) * CHART_W;
        var y = CHART_PAD + (1 - (s[i] - min) / span) * (CHART_H - CHART_PAD * 2);
        line += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        lastX = x;
        lastY = y;
      }
      var lineEl = byId('mv-chart-line');
      if (lineEl) lineEl.setAttribute('d', line);
      var areaEl = byId('mv-chart-area');
      if (areaEl) areaEl.setAttribute('d', line + ' L' + CHART_W + ' ' + CHART_H + ' L0 ' + CHART_H + ' Z');
      var dotEl = byId('mv-chart-dot');
      if (dotEl) {
        dotEl.setAttribute('cx', lastX.toFixed(1));
        dotEl.setAttribute('cy', lastY.toFixed(1));
      }
      setText('mv-chart-high', money(max, 2));
      setText('mv-chart-low', money(min, 2));
    }

    function formatEta(seconds) {
      var d = Math.floor(seconds / 86400);
      var h = Math.floor((seconds % 86400) / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      if (d > 0) return d + 'd ' + h + 'h';
      if (h > 0) return h + 'h ' + m + 'm';
      return m + 'm';
    }

    function applyNetwork(data) {
      if (typeof data.tps === 'number') {
        setText('mv-tps', Math.round(data.tps).toLocaleString('en-US'));
      }

      var samples = data.tpsSamples || [];
      if (samples.length > 0) {
        var bars = byId('mv-bars');
        if (bars) {
          var max = Math.max.apply(null, samples);
          var start = bars.children.length - samples.length;
          for (var i = 0; i < samples.length; i++) {
            var bar = bars.children[start + i];
            if (!bar) continue;
            bar.style.height = (max > 0 ? Math.max(8, Math.round((samples[i] / max) * 98)) : 8) + '%';
          }
          var sum = 0;
          for (var j = 0; j < samples.length; j++) sum += samples[j];
          setText(
            'mv-bars-label',
            'PEAK ' + Math.round(max).toLocaleString('en-US') + ' TPS \\u00B7 AVG ' +
              Math.round(sum / samples.length).toLocaleString('en-US')
          );
        }
      }

      if (typeof data.epoch === 'number') setText('mv-epoch-label', 'EPOCH ' + data.epoch);
      if (typeof data.epochPct === 'number') {
        var pctText = Math.round(data.epochPct) + '%';
        if (typeof data.epochEtaSeconds === 'number') {
          pctText += ' \\u00B7 ' + formatEta(data.epochEtaSeconds) + ' left';
        }
        setText('mv-epoch-pct', pctText);
        var fill = byId('mv-epoch-bar');
        if (fill) fill.style.width = Math.min(100, Math.max(0, data.epochPct)) + '%';
      }
    }

    function applyRangeLabel() {
      var label = range === '1' ? 'LAST 24 HOURS' : range === '30' ? 'LAST 30 DAYS' : 'LAST 7 DAYS';
      setText('mv-range-label', label + ' \\u00B7 COINGECKO');
    }

    function setRangeButtons() {
      var buttons = document.querySelectorAll('.mv-range-btn');
      for (var i = 0; i < buttons.length; i++) {
        var active = buttons[i].getAttribute('data-range') === range;
        buttons[i].className = 'mv-range-btn' + (active ? ' is-active' : '');
      }
    }

    function poll() {
      var requested = range;
      fetch(SOLANA_ENDPOINT + '?range=' + requested, {cache: 'no-store'})
        .then(function(response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function(data) {
          if (requested !== range) return;
          applyMarket(data);
          applyChart(data);
          applyNetwork(data);
          setLive(!!data.live);
        })
        .catch(function() {
          setLive(false);
        });
    }

    var rangeButtons = document.querySelectorAll('.mv-range-btn');
    for (var i = 0; i < rangeButtons.length; i++) {
      rangeButtons[i].addEventListener('click', function() {
        var next = this.getAttribute('data-range');
        if (!next || next === range) return;
        range = next;
        setRangeButtons();
        applyRangeLabel();
        poll();
      });
    }

    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }

  function init() {
    initRail();
    initSolana();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
}

export function homePageScript(solanaEndpoint: string): JSX.Element {
	return <script defer dangerouslySetInnerHTML={{__html: buildHomePageScript(solanaEndpoint)}} />;
}
