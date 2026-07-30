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

// Vanilla, bundler-free inline script — this package has no client bundler (see HomePageScript.tsx
// for the established pattern).
//
// This script never constructs story markup. Every story's header and body is already rendered
// server-side inside the popup (NewsStoryPopup.tsx) and switching stories only flips the `hidden`
// attribute, so admin-authored story text is escaped exactly once, by hono, at render time.
//
// Sign-in is inferred from `localStorage.token`, which the app and the SIWS flow both write. That
// works because marketing, the app, and the API are all served from the same origin (see
// EndpointDerivation.tsx) — if marketing ever moves to its own hostname, this check goes blind and
// voting must switch to a cookie or an explicit session endpoint.

function buildNewsPopupScript(apiEndpoint: string, newsBasePath: string, initialStoryId: string | null): string {
	return `(function() {
  'use strict';

  var API_ENDPOINT = ${JSON.stringify(apiEndpoint)};
  var NEWS_BASE_PATH = ${JSON.stringify(newsBasePath)};
  var INITIAL_STORY_ID = ${JSON.stringify(initialStoryId)};
  var TOAST_DURATION_MS = 2200;

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    try {
      return window.localStorage.getItem('token');
    } catch (err) {
      return null;
    }
  }

  function init() {
    var popup = byId('mv-news-popup');
    if (!popup) return;

    var panel = popup.querySelector('.mv-popup-panel');
    var storyNodes = popup.querySelectorAll('.mv-popup-story');
    var railItems = popup.querySelectorAll('.mv-popup-rail-item');
    var chips = popup.querySelectorAll('.mv-popup-chip');
    var cards = document.querySelectorAll('.mv-story[data-story-id]');
    var upButton = byId('mv-vote-up');
    var downButton = byId('mv-vote-down');
    var upCount = byId('mv-vote-up-count');
    var downCount = byId('mv-vote-down-count');
    var voteHint = byId('mv-vote-hint');
    var shareButton = byId('mv-popup-share');
    var closeButton = byId('mv-popup-close');
    var toastEl = byId('mv-toast');

    var activeId = null;
    var lastFocused = null;
    var toastTimer = null;
    var pending = false;
    var votes = {};
    var order = [];

    // The URL to restore on close: the page the visitor actually arrived on. Deep links to a single
    // story fall back to the news index so closing the panel doesn't reopen it.
    var restoreUrl = INITIAL_STORY_ID ? NEWS_BASE_PATH : window.location.pathname + window.location.search;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var id = card.getAttribute('data-story-id');
      if (!id) continue;
      order.push(id);
      votes[id] = {
        up: parseInt(card.getAttribute('data-up-votes') || '0', 10) || 0,
        down: parseInt(card.getAttribute('data-down-votes') || '0', 10) || 0,
        mine: card.getAttribute('data-my-vote') || null
      };
    }

    function showToast(message) {
      if (!toastEl) return;
      toastEl.textContent = message;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function() {
        toastEl.hidden = true;
      }, TOAST_DURATION_MS);
    }

    function setNodeActive(nodes, id) {
      for (var i = 0; i < nodes.length; i++) {
        var match = nodes[i].getAttribute('data-story-id') === id;
        if (match) {
          nodes[i].classList.add('is-active');
        } else {
          nodes[i].classList.remove('is-active');
        }
      }
    }

    function renderCard(id) {
      var state = votes[id];
      if (!state) return;
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].getAttribute('data-story-id') !== id) continue;
        var meters = cards[i].querySelectorAll('.mv-story-votes');
        for (var j = 0; j < meters.length; j++) {
          var direction = meters[j].getAttribute('data-vote-direction');
          var countEl = meters[j].querySelector('.mv-story-vote-count');
          if (countEl) countEl.textContent = String(direction === 'up' ? state.up : state.down);
          if (state.mine === direction) {
            meters[j].classList.add('is-active');
          } else {
            meters[j].classList.remove('is-active');
          }
        }
      }
    }

    function renderFooter() {
      var state = activeId ? votes[activeId] : null;
      var signedIn = !!getToken();
      if (upCount) upCount.textContent = String(state ? state.up : 0);
      if (downCount) downCount.textContent = String(state ? state.down : 0);
      if (upButton) {
        if (state && state.mine === 'up') {
          upButton.classList.add('is-active');
        } else {
          upButton.classList.remove('is-active');
        }
        if (signedIn) {
          upButton.classList.remove('is-signed-out');
        } else {
          upButton.classList.add('is-signed-out');
        }
      }
      if (downButton) {
        if (state && state.mine === 'down') {
          downButton.classList.add('is-active');
        } else {
          downButton.classList.remove('is-active');
        }
        if (signedIn) {
          downButton.classList.remove('is-signed-out');
        } else {
          downButton.classList.add('is-signed-out');
        }
      }
      if (voteHint) voteHint.hidden = signedIn;
    }

    function showStory(id) {
      var found = false;
      for (var i = 0; i < storyNodes.length; i++) {
        var match = storyNodes[i].getAttribute('data-story-id') === id;
        storyNodes[i].hidden = !match;
        if (match) {
          found = true;
          var body = storyNodes[i].querySelector('.mv-popup-body');
          if (body) body.scrollTop = 0;
        }
      }
      if (!found) return false;
      activeId = id;
      setNodeActive(railItems, id);
      setNodeActive(chips, id);
      renderFooter();
      return true;
    }

    function open(id, updateHistory) {
      if (!showStory(id)) return;
      if (popup.hidden) {
        lastFocused = document.activeElement;
        popup.hidden = false;
        document.body.style.overflow = 'hidden';
        if (panel) panel.focus();
      }
      if (updateHistory) {
        window.history.pushState({mvStory: id}, '', NEWS_BASE_PATH + '/' + encodeURIComponent(id));
      }
    }

    function close(updateHistory) {
      if (popup.hidden) return;
      popup.hidden = true;
      activeId = null;
      document.body.style.overflow = '';
      if (updateHistory) {
        window.history.pushState({mvStory: null}, '', restoreUrl);
      }
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
      lastFocused = null;
    }

    function storyIdFromPath() {
      var path = window.location.pathname;
      if (path.indexOf(NEWS_BASE_PATH + '/') !== 0) return null;
      var rest = path.slice(NEWS_BASE_PATH.length + 1).replace(/\\/$/, '');
      if (!rest || rest.indexOf('/') !== -1) return null;
      return decodeURIComponent(rest);
    }

    function applyServerStory(record) {
      if (!record || typeof record.story_id !== 'string') return;
      var state = votes[record.story_id];
      if (!state) return;
      if (typeof record.up_votes === 'number') state.up = record.up_votes;
      if (typeof record.down_votes === 'number') state.down = record.down_votes;
      state.mine = record.my_vote === 'up' || record.my_vote === 'down' ? record.my_vote : null;
      renderCard(record.story_id);
      if (activeId === record.story_id) renderFooter();
    }

    // The server renders counts but can't know who the visitor is (marketing fetches /news without
    // their token), so my_vote arrives here on a second, authenticated pass.
    function hydrateMyVotes() {
      var token = getToken();
      if (!token) return;
      fetch(API_ENDPOINT + '/news', {headers: {Authorization: token}, cache: 'no-store'})
        .then(function(response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function(data) {
          var list = data && data.stories;
          if (!list || !list.length) return;
          for (var i = 0; i < list.length; i++) applyServerStory(list[i]);
        })
        .catch(function() {
          /* Counts stay at their server-rendered values; voting still works. */
        });
    }

    function sendVote(direction) {
      if (!activeId || pending) return;
      var token = getToken();
      if (!token) {
        showToast('Connect your Solana wallet to vote');
        return;
      }

      var state = votes[activeId];
      if (!state) return;

      var storyId = activeId;
      var previous = {up: state.up, down: state.down, mine: state.mine};
      var next = state.mine === direction ? null : direction;

      if (previous.mine === 'up') state.up = Math.max(0, state.up - 1);
      if (previous.mine === 'down') state.down = Math.max(0, state.down - 1);
      if (next === 'up') state.up = state.up + 1;
      if (next === 'down') state.down = state.down + 1;
      state.mine = next;
      renderCard(storyId);
      renderFooter();

      pending = true;
      fetch(API_ENDPOINT + '/news/' + encodeURIComponent(storyId) + '/vote', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: token},
        body: JSON.stringify({direction: next})
      })
        .then(function(response) {
          return response.json().then(function(body) {
            if (!response.ok) throw new Error(body && body.error ? body.error : 'Could not record your vote');
            return body;
          });
        })
        .then(function(body) {
          applyServerStory(body);
        })
        .catch(function(err) {
          votes[storyId] = previous;
          renderCard(storyId);
          if (activeId === storyId) renderFooter();
          showToast(err && err.message ? err.message : 'Could not record your vote');
        })
        .then(function() {
          pending = false;
        });
    }

    function share() {
      if (!activeId) return;
      var url = window.location.origin + NEWS_BASE_PATH + '/' + encodeURIComponent(activeId);
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showToast('Copying is not available in this browser');
        return;
      }
      navigator.clipboard
        .writeText(url)
        .then(function() {
          showToast('Story link copied');
        })
        .catch(function() {
          showToast('Copying is not available in this browser');
        });
    }

    for (var c = 0; c < cards.length; c++) {
      (function(cardEl) {
        cardEl.addEventListener('click', function(event) {
          // Leave modified clicks alone so "open in new tab" still reaches the story page.
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (event.button && event.button !== 0) return;
          var id = cardEl.getAttribute('data-story-id');
          if (!id) return;
          event.preventDefault();
          open(id, true);
        });
      })(cards[c]);
    }

    for (var r = 0; r < railItems.length; r++) {
      (function(item) {
        item.addEventListener('click', function() {
          var id = item.getAttribute('data-story-id');
          if (id) open(id, true);
        });
      })(railItems[r]);
    }

    for (var p = 0; p < chips.length; p++) {
      (function(chip) {
        chip.addEventListener('click', function() {
          var id = chip.getAttribute('data-story-id');
          if (id) open(id, true);
        });
      })(chips[p]);
    }

    if (closeButton) closeButton.addEventListener('click', function() { close(true); });
    if (upButton) upButton.addEventListener('click', function() { sendVote('up'); });
    if (downButton) downButton.addEventListener('click', function() { sendVote('down'); });
    if (shareButton) shareButton.addEventListener('click', share);

    popup.addEventListener('click', function(event) {
      if (event.target === popup) close(true);
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && !popup.hidden) close(true);
    });

    window.addEventListener('popstate', function() {
      var id = storyIdFromPath();
      if (id && votes[id]) {
        open(id, false);
      } else {
        close(false);
      }
    });

    for (var o = 0; o < order.length; o++) renderCard(order[o]);
    renderFooter();
    hydrateMyVotes();

    if (INITIAL_STORY_ID && votes[INITIAL_STORY_ID]) open(INITIAL_STORY_ID, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
}

export function newsPopupScript(
	apiEndpoint: string,
	newsBasePath: string,
	initialStoryId: string | null = null,
): JSX.Element {
	return (
		<script defer dangerouslySetInnerHTML={{__html: buildNewsPopupScript(apiEndpoint, newsBasePath, initialStoryId)}} />
	);
}
