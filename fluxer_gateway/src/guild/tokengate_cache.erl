%% Copyright (C) 2026 Fluxer Contributors
%%
%% This file is part of Fluxer.
%%
%% Fluxer is free software: you can redistribute it and/or modify
%% it under the terms of the GNU Affero General Public License as published by
%% the Free Software Foundation, either version 3 of the License, or
%% (at your option) any later version.
%%
%% Fluxer is distributed in the hope that it will be useful,
%% but WITHOUT ANY WARRANTY; without even the implied warranty of
%% MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
%% GNU Affero General Public License for more details.
%%
%% You should have received a copy of the GNU Affero General Public License
%% along with Fluxer. If not, see <https://www.gnu.org/licenses/>.

%% Short-lived local cache for "does user X satisfy tokengate address G under
%% match mode M", keyed by {GateAddress, MatchMode, UserId} rather than
%% {ChannelId, UserId} so a category-level gate's cache entry is shared
%% across every child channel that inherits it. MatchMode is part of the key
%% (not just GateAddress) because the same address can be configured as
%% EXACT_ASSET on one channel and COLLECTION on another (or change mode over
%% time on the same channel) with genuinely different satisfaction results
%% for the same wallet -- collapsing them into one cache entry would leak a
%% collection-wide "satisfied" onto a channel that only wanted the exact
%% asset, or vice versa. This sits in front of the (already cached,
%% 10-minute TTL) TS-side TokenGateCacheService -- its only purpose is to
%% avoid a synchronous NATS round trip to `rpc.api` for every call within a
%% short window (e.g. a burst of viewable-channel recomputations), not to be
%% the source of truth. A short TTL is deliberate: correctness ultimately
%% still depends on `rpc_client:check_tokengate/2` being re-asked reasonably
%% soon.
-module(tokengate_cache).

-export([
    check/3,
    put/4,
    invalidate/3
]).

-type gate_address() :: binary().
-type match_mode() :: integer().
-type user_id() :: integer().

-define(TABLE, tokengate_cache).
-define(TTL_MS, 60000).

-spec check(gate_address(), match_mode(), user_id()) -> {ok, boolean()} | {error, not_cached}.
check(GateAddress, MatchMode, UserId) when
    is_binary(GateAddress), is_integer(MatchMode), is_integer(UserId)
->
    ensure_table(),
    Now = erlang:system_time(millisecond),
    case ets:lookup(?TABLE, {GateAddress, MatchMode, UserId}) of
        [{_, Satisfied, ExpiresAtMs}] when ExpiresAtMs > Now ->
            {ok, Satisfied};
        [{_, _, _}] ->
            {error, not_cached};
        [] ->
            {error, not_cached}
    end;
check(_, _, _) ->
    {error, not_cached}.

-spec put(gate_address(), match_mode(), user_id(), boolean()) -> ok.
put(GateAddress, MatchMode, UserId, Satisfied) when
    is_binary(GateAddress), is_integer(MatchMode), is_integer(UserId), is_boolean(Satisfied)
->
    ensure_table(),
    ExpiresAtMs = erlang:system_time(millisecond) + ?TTL_MS,
    true = ets:insert(?TABLE, {{GateAddress, MatchMode, UserId}, Satisfied, ExpiresAtMs}),
    ok;
put(_, _, _, _) ->
    ok.

-spec invalidate(gate_address(), match_mode(), user_id()) -> ok.
invalidate(GateAddress, MatchMode, UserId) when
    is_binary(GateAddress), is_integer(MatchMode), is_integer(UserId)
->
    ensure_table(),
    _ = ets:delete(?TABLE, {GateAddress, MatchMode, UserId}),
    ok;
invalidate(_, _, _) ->
    ok.

-spec ensure_table() -> ok.
ensure_table() ->
    guild_ets_utils:ensure_table(?TABLE, [named_table, public, set, {read_concurrency, true}]).

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

put_and_check_test() ->
    ok = put(<<"AbCd">>, 0, 10, true),
    ?assertEqual({ok, true}, check(<<"AbCd">>, 0, 10)),
    ok = invalidate(<<"AbCd">>, 0, 10).

check_missing_returns_not_cached_test() ->
    ?assertEqual({error, not_cached}, check(<<"NeverPut">>, 0, 999)).

invalidate_removes_entry_test() ->
    ok = put(<<"ToRemove">>, 0, 5, false),
    ?assertEqual({ok, false}, check(<<"ToRemove">>, 0, 5)),
    ok = invalidate(<<"ToRemove">>, 0, 5),
    ?assertEqual({error, not_cached}, check(<<"ToRemove">>, 0, 5)).

match_mode_is_part_of_the_cache_key_test() ->
    %% Same address, same user, different match mode -- must not collide.
    ok = put(<<"SharedAddr">>, 0, 20, true),
    ?assertEqual({error, not_cached}, check(<<"SharedAddr">>, 1, 20)),
    ?assertEqual({ok, true}, check(<<"SharedAddr">>, 0, 20)),
    ok = invalidate(<<"SharedAddr">>, 0, 20).

-endif.
