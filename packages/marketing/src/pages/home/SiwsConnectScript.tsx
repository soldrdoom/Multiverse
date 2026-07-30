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

// Ports fluxer_app's `AuthLoginLayout.tsx` (`handleSolanaLogin`) client-side SIWS logic into a
// vanilla, bundler-free inline script — this package has no client bundler (see HomePageScript.tsx
// for the established pattern). Kept deliberately dependency-free: no @solana/web3.js, no bs58,
// no tweetnacl. Base58 decoding isn't needed here since the address is only ever round-tripped as
// the base58 string the wallet itself provides — only the backend needs to decode it.
//
// NOTE: the onboarding redirect path ('/onboarding/solana') must stay in sync with
// `Routes.SOLANA_ONBOARDING` in fluxer_app/src/Routes.tsx — marketing intentionally does not
// depend on fluxer_app (it's an app, not a shared package), so this is a hardcoded mirror.
const SOLANA_ONBOARDING_PATH = '/onboarding/solana';

function buildSiwsConnectScript(apiEndpoint: string, appEndpoint: string, iconUrl: string): string {
	return `(function() {
  'use strict';

  var API_ENDPOINT = ${JSON.stringify(apiEndpoint)};
  var APP_ENDPOINT = ${JSON.stringify(appEndpoint)};
  var ONBOARDING_PATH = ${JSON.stringify(SOLANA_ONBOARDING_PATH)};
  var ICON_URL = ${JSON.stringify(iconUrl)};
  // Cosmetic only — lets a returning visitor see which wallet they're connected as without
  // re-prompting. Never read for authorization; the token is the credential.
  var WALLET_ADDRESS_KEY = 'mv_wallet_address';

  function byId(id) {
    return document.getElementById(id);
  }

  // Safe Uint8Array -> base64: avoids spread-operator call-stack limits on mobile WebKit.
  function u8ToBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function truncateAddress(address) {
    if (!address || address.length <= 10) return address;
    return address.slice(0, 4) + '\\u2026' + address.slice(-4);
  }

  // Wallet Standard fallback for wallets that don't attach a window.* global (e.g. Jupiter).
  // Apps dispatch wallet-standard:app-ready; already-initialized wallets respond via register().
  function getWalletStandardProvider() {
    try {
      var registered = [];
      window.dispatchEvent(
        new CustomEvent('wallet-standard:app-ready', {
          bubbles: false,
          cancelable: false,
          composed: false,
          detail: Object.freeze({
            register: function(w) {
              registered.push(w);
            },
          }),
        })
      );

      var wallet = null;
      for (var i = 0; i < registered.length; i++) {
        var w = registered[i];
        var isSolana = w.chains && w.chains.some(function(c) { return c.indexOf('solana:') === 0; });
        if (isSolana && w.name === 'Jupiter') {
          wallet = w;
          break;
        }
      }
      if (!wallet) {
        for (var j = 0; j < registered.length; j++) {
          var w2 = registered[j];
          var isSolana2 = w2.chains && w2.chains.some(function(c) { return c.indexOf('solana:') === 0; });
          if (isSolana2) {
            wallet = w2;
            break;
          }
        }
      }
      if (!wallet) return null;

      var account = null;
      var provider = {
        connect: function() {
          return wallet.features['standard:connect'].connect().then(function(result) {
            account = result.accounts[0];
            if (!account) throw new Error('No accounts returned from wallet');
          });
        },
        signIn: wallet.features['standard:signIn']
          ? function(input) {
              return wallet.features['standard:signIn'].signIn(input).then(function(results) {
                return results[0];
              });
            }
          : undefined,
        signMessage: function(messageBytes) {
          return wallet.features['solana:signMessage']
            .signMessage({account: account, message: messageBytes})
            .then(function(results) {
              var result = results[0];
              return {signature: result.signature, signedMessage: result.signedMessage};
            });
        },
      };
      Object.defineProperty(provider, 'publicKey', {
        get: function() {
          return account ? {toBase58: function() { return account.address; }} : null;
        },
      });
      return provider;
    } catch (err) {
      return null;
    }
  }

  function getWalletProvider() {
    return (
      (window.phantom && window.phantom.solana) ||
      window.solana ||
      window.solflare ||
      window.coinbaseSolana ||
      (window.backpack && window.backpack.solana) ||
      (window.magicEden && window.magicEden.solana) ||
      window.station || // Jupiter Station mobile in-app browser
      getWalletStandardProvider()
    );
  }

  var busy = false;

  function currentToken() {
    try {
      return window.localStorage.getItem('token');
    } catch (err) {
      return null;
    }
  }

  function storedAddress() {
    try {
      return window.localStorage.getItem(WALLET_ADDRESS_KEY);
    } catch (err) {
      return null;
    }
  }

  // Where to send the visitor after a successful sign-in, or null to stay on this page.
  // Only same-origin absolute paths are accepted — never a full URL, never protocol-relative — so a
  // crafted ?redirect_to= can't turn the sign-in button into an open redirect. Destinations that
  // point back at the sign-in surface itself are dropped, since that would just be a loop.
  function pendingDestination() {
    var raw = null;
    try {
      raw = new URLSearchParams(window.location.search).get('redirect_to');
    } catch (err) {
      return null;
    }
    if (!raw) return null;
    if (raw.charAt(0) !== '/' || raw.charAt(1) === '/' || raw.charAt(1) === '\\\\') return null;
    var parsed;
    try {
      parsed = new URL(raw, window.location.origin);
    } catch (err) {
      return null;
    }
    if (parsed.origin !== window.location.origin) return null;
    // Re-check AFTER normalisation, not just on the raw string: '/..//evil.example.com' survives the
    // charAt test above but URL() resolves it to the protocol-relative '//evil.example.com'. That is
    // only inert today because APP_ENDPOINT prefixes a scheme and host.
    if (parsed.pathname.charAt(1) === '/') return null;
    if (parsed.pathname === '/' || parsed.pathname === '/login' || parsed.pathname === '/register') return null;
    return parsed.pathname + parsed.search + parsed.hash;
  }

  function labelEl(trigger) {
    return trigger.querySelector('.mv-wallet-trigger-label');
  }

  function setState(state, text) {
    var triggers = document.querySelectorAll('.mv-wallet-trigger');
    for (var i = 0; i < triggers.length; i++) {
      var trigger = triggers[i];
      var label = labelEl(trigger);
      if (state === 'connecting') {
        trigger.disabled = true;
        trigger.classList.add('is-loading');
        trigger.classList.remove('is-connected');
        if (label) label.textContent = 'Connecting\\u2026';
      } else if (state === 'connected') {
        trigger.disabled = true;
        trigger.classList.remove('is-loading');
        trigger.classList.add('is-connected');
        if (label) label.textContent = text || 'Wallet connected';
      } else {
        trigger.disabled = false;
        trigger.classList.remove('is-loading', 'is-connected');
        if (label) label.textContent = trigger.getAttribute('data-default-label') || '';
      }
    }
  }

  function showError(message) {
    var errorEl = byId('mv-wallet-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  function clearError() {
    var errorEl = byId('mv-wallet-error');
    if (!errorEl) return;
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  // Signing in does NOT navigate away. The front page has things to do once you're authenticated
  // (voting on news stories), and bouncing to /channels/@me made those unreachable — you'd land in
  // the chat app having lost the story you were reading. "Launch App" in the header is the way in.
  //
  // The one unavoidable redirect is a wallet with no Multiverse account: needsOnboarding means
  // there is no identity to act as until a username is picked, so that still goes to onboarding.
  function performSignIn() {
    if (busy) return Promise.reject(new Error('Sign-in already in progress'));

    var sol = getWalletProvider();
    if (!sol) {
      return Promise.reject(
        new Error(
          'No Solana wallet detected. Please use Phantom, Solflare, Backpack, Coinbase Wallet, Magic Eden, or Jupiter, or open this page inside one of those apps.'
        )
      );
    }

    busy = true;
    setState('connecting', null);

    return Promise.resolve()
      .then(function() {
        return sol.connect();
      })
      .then(function() {
        var address = sol.publicKey.toBase58();

        return fetch(API_ENDPOINT + '/auth/solana/nonce', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({address: address}),
        })
          .then(function(res) {
            if (!res.ok) throw new Error('Could not start sign-in. Please try again.');
            return res.json();
          })
          .then(function(nonceData) {
            var nonce = nonceData.nonce;
            var message = nonceData.message;

            var signPromise;
            if (typeof sol.signIn === 'function') {
              var signInInput = {
                domain: window.location.host,
                address: address,
                statement: 'Sign in to Multiverse',
                uri: window.location.origin,
                version: '1',
                nonce: nonce,
                issuedAt: new Date().toISOString(),
                icon: ICON_URL,
              };
              signPromise = Promise.resolve(sol.signIn(signInInput)).then(function(result) {
                return {
                  sig64: u8ToBase64(new Uint8Array(result.signature)),
                  signedMessageB64: u8ToBase64(new Uint8Array(result.signedMessage)),
                };
              });
            } else {
              var msgBytes = new TextEncoder().encode(message);
              signPromise = Promise.resolve(sol.signMessage(msgBytes)).then(function(result) {
                var out = {sig64: u8ToBase64(new Uint8Array(result.signature)), signedMessageB64: undefined};
                if (result.signedMessage) {
                  out.signedMessageB64 = u8ToBase64(new Uint8Array(result.signedMessage));
                }
                return out;
              });
            }

            return signPromise.then(function(signed) {
              return fetch(API_ENDPOINT + '/auth/solana/verify', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  address: address,
                  signature: signed.sig64,
                  nonce: nonce,
                  signedMessage: signed.signedMessageB64,
                }),
              })
                .then(function(res) {
                  return res.json().then(function(body) {
                    if (!res.ok) throw new Error(body.error || 'Verification failed');
                    return body;
                  });
                })
                .then(function(result) {
                  if (result.needsOnboarding) {
                    sessionStorage.setItem('solana_temp_token', result.tempToken);
                    setState('connected', truncateAddress(address));
                    window.location.href = APP_ENDPOINT + ONBOARDING_PATH;
                    // Deliberately never resolves: the page is navigating away.
                    return new Promise(function() {});
                  }

                  localStorage.setItem('token', result.token);
                  localStorage.setItem('userId', String(result.user_id));
                  try {
                    localStorage.setItem(WALLET_ADDRESS_KEY, address);
                  } catch (err) {
                    /* Address display is cosmetic; a storage failure must not fail the sign-in. */
                  }

                  busy = false;
                  setState('connected', truncateAddress(address));
                  window.dispatchEvent(new CustomEvent('mv-siws-signed-in', {detail: {address: address}}));

                  // The app hands off here with ?redirect_to=<path> when a signed-out visitor tried to
                  // reach somewhere in the client. Honour it so they land where they were going; with
                  // no destination we stay put, which is what makes voting in place work.
                  var destination = pendingDestination();
                  if (destination) {
                    window.location.href = APP_ENDPOINT + destination;
                    return new Promise(function() {});
                  }

                  return {token: result.token, userId: String(result.user_id), address: address};
                });
            });
          });
      })
      .catch(function(err) {
        busy = false;
        setState(currentToken() ? 'connected' : 'disconnected', truncateAddress(storedAddress()));
        throw err;
      });
  }

  // Exposed synchronously (not inside DOMContentLoaded) so NewsPopupScript can call it on a vote
  // click regardless of which inline script the browser evaluates first.
  window.mvSiws = {
    signIn: performSignIn,
    isSignedIn: function() {
      return !!currentToken();
    },
    getToken: currentToken,
    // Lets callers skip an "approve the signature" prompt they know will never appear, so a visitor
    // with no wallet installed sees only the install message instead of it flashing past first.
    hasWallet: function() {
      return !!getWalletProvider();
    },
  };

  function initSiwsConnect() {
    var triggers = document.querySelectorAll('.mv-wallet-trigger');
    // Secondary entry points that start the same flow but must keep their own label — setState()
    // rewrites the text of every .mv-wallet-trigger, which would clobber "Create an identity".
    var signInLinks = document.querySelectorAll('.mv-wallet-signin-link');
    if (!triggers.length && !signInLinks.length) return;

    // Reflect an existing session on load — otherwise a returning visitor sees "Sign In with Solana"
    // while already authenticated, and clicking it would pointlessly re-run the whole flow.
    if (currentToken()) {
      setState('connected', truncateAddress(storedAddress()));
    }

    function handleConnect() {
      clearError();
      performSignIn().catch(function(err) {
        showError(err && err.message ? err.message : 'Solana sign-in failed. Please try again.');
      });
    }

    for (var i = 0; i < triggers.length; i++) {
      triggers[i].addEventListener('click', handleConnect);
    }
    for (var j = 0; j < signInLinks.length; j++) {
      signInLinks[j].addEventListener('click', handleConnect);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiwsConnect);
  } else {
    initSiwsConnect();
  }
})();
`;
}

export function siwsConnectScript(apiEndpoint: string, appEndpoint: string, iconUrl: string): JSX.Element {
	return <script defer dangerouslySetInnerHTML={{__html: buildSiwsConnectScript(apiEndpoint, appEndpoint, iconUrl)}} />;
}
