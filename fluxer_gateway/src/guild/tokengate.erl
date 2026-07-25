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

%% Real-time-dispatch-side awareness of tokengated channels/categories.
%%
%% Effective-gate resolution (a channel's own address, or its parent
%% category's) is pure data lookup over already-synced channel maps -- it
%% needs no Solana/DAS knowledge and stays entirely in Erlang, mirroring
%% `TokenGateService.resolveEffectiveTokenGate` on the TS side. Only the
%% actual "does this wallet hold the token" check requires a call out to the
%% TS backend (`rpc_client:call/1`, subject `rpc.api`, request type
%% `check_tokengate`), since only Node has a DAS client. The overwhelmingly
%% common case -- a channel with no gate at all, own or inherited -- never
%% touches the network.
%%
%% Effective-visibility resolution (LOCKED vs HIDDEN, i.e. how a channel
%% appears to a member who fails its gate) follows the identical
%% own-value-wins-else-parent's-else-default shape, mirroring
%% `TokenGateService.resolveEffectiveTokenGateVisibility` on the TS side.
%%
%% Both resolutions actually have a third tier below the parent category: the
%% guild's own whole-server gate (`guilds.token_gate_address`/
%% `token_gate_match_mode`/`token_gate_visibility`), added 2026-07-22. A
%% channel/category with no gate of its own, whose parent (if any) also has
%% none, falls back to the guild before hitting the hardcoded default. The
%% guild's fields ride along on the same `<<"guild">>` map already used for
%% `owner_id`/`message_history_cutoff` (populated from the TS backend's
%% `GuildResponse`), so no new sync path is needed.
-module(tokengate).

-export([
    effective_gate_address/2,
    effective_gate_visibility/2,
    effective_gate_match_mode/2,
    user_satisfies_channel_gate/3
]).

-define(TOKEN_GATE_VISIBILITY_LOCKED, 0).
-define(TOKEN_GATE_MATCH_MODE_EXACT_ASSET, 0).

-type guild_state() :: map().
-type channel() :: map().
-type user_id() :: integer().

-spec effective_gate_address(channel(), guild_state()) -> binary() | undefined.
effective_gate_address(Channel, State) ->
    case raw_gate_address(Channel) of
        Address when is_binary(Address) ->
            Address;
        undefined ->
            ParentAddress =
                case parent_channel(Channel, State) of
                    undefined -> undefined;
                    ParentChannel -> raw_gate_address(ParentChannel)
                end,
            case ParentAddress of
                Address when is_binary(Address) -> Address;
                undefined -> raw_gate_address(guild_map(State))
            end
    end.

-spec raw_gate_address(channel()) -> binary() | undefined.
raw_gate_address(Channel) when is_map(Channel) ->
    case maps:get(<<"token_gate_address">>, Channel, undefined) of
        Address when is_binary(Address), Address =/= <<>> -> Address;
        _ -> undefined
    end;
raw_gate_address(_) ->
    undefined.

-spec effective_gate_visibility(channel(), guild_state()) -> integer().
effective_gate_visibility(Channel, State) ->
    case raw_gate_visibility(Channel) of
        Visibility when is_integer(Visibility) ->
            Visibility;
        undefined ->
            ParentVisibility =
                case parent_channel(Channel, State) of
                    undefined -> undefined;
                    ParentChannel -> raw_gate_visibility(ParentChannel)
                end,
            case ParentVisibility of
                Visibility when is_integer(Visibility) ->
                    Visibility;
                undefined ->
                    case raw_gate_visibility(guild_map(State)) of
                        GuildVisibility when is_integer(GuildVisibility) -> GuildVisibility;
                        undefined -> ?TOKEN_GATE_VISIBILITY_LOCKED
                    end
            end
    end.

-spec raw_gate_visibility(channel()) -> integer() | undefined.
raw_gate_visibility(Channel) when is_map(Channel) ->
    case maps:get(<<"token_gate_visibility">>, Channel, undefined) of
        Visibility when is_integer(Visibility) -> Visibility;
        _ -> undefined
    end;
raw_gate_visibility(_) ->
    undefined.

%% How `effective_gate_address/2`'s address is matched against a wallet's
%% held assets (0 = EXACT_ASSET, 1 = COLLECTION). Same own-wins-else-parent's
%% -else-default shape as `effective_gate_visibility/2`, mirroring
%% `TokenGateService.resolveEffectiveTokenGateMatchMode` on the TS side.
-spec effective_gate_match_mode(channel(), guild_state()) -> integer().
effective_gate_match_mode(Channel, State) ->
    case raw_gate_match_mode(Channel) of
        MatchMode when is_integer(MatchMode) ->
            MatchMode;
        undefined ->
            ParentMatchMode =
                case parent_channel(Channel, State) of
                    undefined -> undefined;
                    ParentChannel -> raw_gate_match_mode(ParentChannel)
                end,
            case ParentMatchMode of
                MatchMode when is_integer(MatchMode) ->
                    MatchMode;
                undefined ->
                    case raw_gate_match_mode(guild_map(State)) of
                        GuildMatchMode when is_integer(GuildMatchMode) -> GuildMatchMode;
                        undefined -> ?TOKEN_GATE_MATCH_MODE_EXACT_ASSET
                    end
            end
    end.

-spec raw_gate_match_mode(channel()) -> integer() | undefined.
raw_gate_match_mode(Channel) when is_map(Channel) ->
    case maps:get(<<"token_gate_match_mode">>, Channel, undefined) of
        MatchMode when is_integer(MatchMode) -> MatchMode;
        _ -> undefined
    end;
raw_gate_match_mode(_) ->
    undefined.

-spec parent_channel(channel(), guild_state()) -> channel() | undefined.
parent_channel(Channel, State) ->
    case map_utils:get_integer(Channel, <<"parent_id">>, undefined) of
        undefined -> undefined;
        ParentId -> guild_permissions:find_channel_by_id(ParentId, State)
    end.

%% Does this user currently satisfy the given channel's effective tokengate?
%% `true` when there's no gate at all (the fast, common path), or when the
%% user is the guild owner -- an owner must always be able to see and enter
%% every channel in their own guild, gated or not, mirroring the permission
%% bypass `guild_permissions:compute_member_permissions/4` already grants
%% owners (`?ALL_PERMISSIONS` regardless of roles/overwrites).
-spec user_satisfies_channel_gate(user_id(), channel(), guild_state()) -> boolean().
user_satisfies_channel_gate(UserId, Channel, State) ->
    case UserId =:= owner_id(State) of
        true ->
            true;
        false ->
            case effective_gate_address(Channel, State) of
                undefined ->
                    true;
                GateAddress ->
                    MatchMode = effective_gate_match_mode(Channel, State),
                    check_gate(GateAddress, MatchMode, UserId)
            end
    end.

-spec owner_id(guild_state()) -> user_id().
owner_id(State) ->
    map_utils:get_integer(guild_map(State), <<"owner_id">>, 0).

%% The guild's own properties map (owner_id, token_gate_*, etc.), as synced
%% from the TS backend's `GuildResponse`. `#{}` for a state with no guild data
%% yet, so callers can treat a missing guild the same as one with no
%% whole-server gate configured.
-spec guild_map(guild_state()) -> map().
guild_map(State) ->
    Data = maps:get(data, State, #{}),
    maps:get(<<"guild">>, Data, #{}).

-spec check_gate(binary(), integer(), user_id()) -> boolean().
check_gate(GateAddress, MatchMode, UserId) ->
    case tokengate_cache:check(GateAddress, MatchMode, UserId) of
        {ok, Satisfied} ->
            Satisfied;
        {error, not_cached} ->
            fetch_and_cache(GateAddress, MatchMode, UserId)
    end.

-spec fetch_and_cache(binary(), integer(), user_id()) -> boolean().
fetch_and_cache(GateAddress, MatchMode, UserId) ->
    Request = #{
        <<"type">> => <<"check_tokengate">>,
        <<"user_id">> => integer_to_binary(UserId),
        <<"gate_address">> => GateAddress,
        <<"match_mode">> => MatchMode
    },
    case rpc_client:call(Request) of
        {ok, Data} ->
            Status = maps:get(<<"status">>, Data, <<"unavailable">>),
            case Status of
                <<"satisfied">> ->
                    ok = tokengate_cache:put(GateAddress, MatchMode, UserId, true),
                    true;
                <<"unsatisfied">> ->
                    ok = tokengate_cache:put(GateAddress, MatchMode, UserId, false),
                    false;
                _ ->
                    %% "unavailable" or anything unrecognized: fail closed,
                    %% don't cache, so a transient DAS outage self-heals on
                    %% the next visibility recompute instead of being
                    %% pinned for the cache TTL.
                    false
            end;
        {error, _Reason} ->
            false
    end.

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

effective_gate_address_own_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"GateAddr">>},
    ?assertEqual(<<"GateAddr">>, effective_gate_address(Channel, #{})).

effective_gate_address_none_test() ->
    Channel = #{<<"id">> => <<"100">>},
    ?assertEqual(undefined, effective_gate_address(Channel, #{})).

effective_gate_address_null_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_address">> => null},
    ?assertEqual(undefined, effective_gate_address(Channel, #{})).

effective_gate_address_inherited_from_parent_test() ->
    Channel = #{<<"id">> => <<"200">>, <<"parent_id">> => <<"100">>},
    State = #{
        data => #{
            <<"channels">> => [
                #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"CategoryGate">>},
                Channel
            ]
        }
    },
    ?assertEqual(<<"CategoryGate">>, effective_gate_address(Channel, State)).

effective_gate_address_own_overrides_parent_test() ->
    Channel = #{
        <<"id">> => <<"200">>,
        <<"parent_id">> => <<"100">>,
        <<"token_gate_address">> => <<"OwnGate">>
    },
    State = #{
        data => #{
            <<"channels">> => [
                #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"CategoryGate">>},
                Channel
            ]
        }
    },
    ?assertEqual(<<"OwnGate">>, effective_gate_address(Channel, State)).

effective_gate_visibility_own_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_visibility">> => 1},
    ?assertEqual(1, effective_gate_visibility(Channel, #{})).

effective_gate_visibility_defaults_to_locked_test() ->
    Channel = #{<<"id">> => <<"100">>},
    ?assertEqual(0, effective_gate_visibility(Channel, #{})).

effective_gate_visibility_inherited_from_parent_test() ->
    Channel = #{<<"id">> => <<"200">>, <<"parent_id">> => <<"100">>},
    State = #{
        data => #{
            <<"channels">> => [
                #{<<"id">> => <<"100">>, <<"token_gate_visibility">> => 1},
                Channel
            ]
        }
    },
    ?assertEqual(1, effective_gate_visibility(Channel, State)).

effective_gate_visibility_own_overrides_parent_test() ->
    Channel = #{
        <<"id">> => <<"200">>,
        <<"parent_id">> => <<"100">>,
        <<"token_gate_visibility">> => 0
    },
    State = #{
        data => #{
            <<"channels">> => [
                #{<<"id">> => <<"100">>, <<"token_gate_visibility">> => 1},
                Channel
            ]
        }
    },
    ?assertEqual(0, effective_gate_visibility(Channel, State)).

effective_gate_match_mode_own_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_match_mode">> => 1},
    ?assertEqual(1, effective_gate_match_mode(Channel, #{})).

effective_gate_match_mode_defaults_to_exact_asset_test() ->
    Channel = #{<<"id">> => <<"100">>},
    ?assertEqual(0, effective_gate_match_mode(Channel, #{})).

effective_gate_match_mode_inherited_from_parent_test() ->
    Channel = #{<<"id">> => <<"200">>, <<"parent_id">> => <<"100">>},
    State = #{
        data => #{
            <<"channels">> => [
                #{<<"id">> => <<"100">>, <<"token_gate_match_mode">> => 1},
                Channel
            ]
        }
    },
    ?assertEqual(1, effective_gate_match_mode(Channel, State)).

effective_gate_match_mode_own_overrides_parent_test() ->
    Channel = #{
        <<"id">> => <<"200">>,
        <<"parent_id">> => <<"100">>,
        <<"token_gate_match_mode">> => 0
    },
    State = #{
        data => #{
            <<"channels">> => [
                #{<<"id">> => <<"100">>, <<"token_gate_match_mode">> => 1},
                Channel
            ]
        }
    },
    ?assertEqual(0, effective_gate_match_mode(Channel, State)).

user_satisfies_channel_gate_no_gate_test() ->
    Channel = #{<<"id">> => <<"100">>},
    ?assertEqual(true, user_satisfies_channel_gate(1, Channel, #{})).

user_satisfies_channel_gate_respects_match_mode_in_cache_key_test() ->
    %% Same address, same user, cached with opposite results per match mode.
    %% Both channels must stay cache-hits (never fall through to a real RPC,
    %% which would hang/crash this test) -- the only variable is each
    %% channel's own `token_gate_match_mode`, proving it's really threaded
    %% through to the cache lookup rather than resolved and discarded.
    ExactChannel = #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"ModeSensitiveGate">>},
    CollectionChannel = #{
        <<"id">> => <<"101">>,
        <<"token_gate_address">> => <<"ModeSensitiveGate">>,
        <<"token_gate_match_mode">> => 1
    },
    ok = tokengate_cache:put(<<"ModeSensitiveGate">>, 0, 55, true),
    ok = tokengate_cache:put(<<"ModeSensitiveGate">>, 1, 55, false),
    ?assertEqual(true, user_satisfies_channel_gate(55, ExactChannel, #{})),
    ?assertEqual(false, user_satisfies_channel_gate(55, CollectionChannel, #{})),
    ok = tokengate_cache:invalidate(<<"ModeSensitiveGate">>, 0, 55),
    ok = tokengate_cache:invalidate(<<"ModeSensitiveGate">>, 1, 55).

user_satisfies_channel_gate_uses_cache_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"CachedGate">>},
    ok = tokengate_cache:put(<<"CachedGate">>, 0, 42, true),
    ?assertEqual(true, user_satisfies_channel_gate(42, Channel, #{})),
    ok = tokengate_cache:invalidate(<<"CachedGate">>, 0, 42).

user_satisfies_channel_gate_owner_bypass_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"UncachedGate">>},
    State = #{data => #{<<"guild">> => #{<<"owner_id">> => <<"7">>}}},
    %% Owner satisfies the gate even though nothing was ever cached/fetched
    %% for this address -- if this fell through to check_gate/2 it would
    %% synchronously RPC out and this test would hang/crash, not just fail.
    ?assertEqual(true, user_satisfies_channel_gate(7, Channel, State)).

user_satisfies_channel_gate_non_owner_still_gated_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"NonOwnerGate">>},
    State = #{data => #{<<"guild">> => #{<<"owner_id">> => <<"7">>}}},
    ok = tokengate_cache:put(<<"NonOwnerGate">>, 0, 8, false),
    ?assertEqual(false, user_satisfies_channel_gate(8, Channel, State)),
    ok = tokengate_cache:invalidate(<<"NonOwnerGate">>, 0, 8).

owner_id_from_state_test() ->
    State = #{data => #{<<"guild">> => #{<<"owner_id">> => <<"99">>}}},
    ?assertEqual(99, owner_id(State)).

owner_id_missing_defaults_to_zero_test() ->
    ?assertEqual(0, owner_id(#{})).

effective_gate_address_falls_back_to_guild_test() ->
    Channel = #{<<"id">> => <<"100">>},
    State = #{data => #{<<"guild">> => #{<<"token_gate_address">> => <<"GuildGate">>}}},
    ?assertEqual(<<"GuildGate">>, effective_gate_address(Channel, State)).

effective_gate_address_own_overrides_guild_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"OwnGate">>},
    State = #{data => #{<<"guild">> => #{<<"token_gate_address">> => <<"GuildGate">>}}},
    ?assertEqual(<<"OwnGate">>, effective_gate_address(Channel, State)).

effective_gate_address_parent_overrides_guild_test() ->
    Channel = #{<<"id">> => <<"200">>, <<"parent_id">> => <<"100">>},
    State = #{
        data => #{
            <<"guild">> => #{<<"token_gate_address">> => <<"GuildGate">>},
            <<"channels">> => [
                #{<<"id">> => <<"100">>, <<"token_gate_address">> => <<"CategoryGate">>},
                Channel
            ]
        }
    },
    ?assertEqual(<<"CategoryGate">>, effective_gate_address(Channel, State)).

effective_gate_address_ungated_category_still_falls_back_to_guild_test() ->
    %% Regression coverage: a channel nested under a category that has no
    %% gate of its own must still reach the guild-wide tier, not stop at
    %% "parent exists" and give up.
    Channel = #{<<"id">> => <<"200">>, <<"parent_id">> => <<"100">>},
    State = #{
        data => #{
            <<"guild">> => #{<<"token_gate_address">> => <<"GuildGate">>},
            <<"channels">> => [
                #{<<"id">> => <<"100">>},
                Channel
            ]
        }
    },
    ?assertEqual(<<"GuildGate">>, effective_gate_address(Channel, State)).

effective_gate_address_no_gate_anywhere_test() ->
    Channel = #{<<"id">> => <<"100">>},
    ?assertEqual(undefined, effective_gate_address(Channel, #{})).

effective_gate_visibility_falls_back_to_guild_test() ->
    Channel = #{<<"id">> => <<"100">>},
    State = #{data => #{<<"guild">> => #{<<"token_gate_visibility">> => 1}}},
    ?assertEqual(1, effective_gate_visibility(Channel, State)).

effective_gate_visibility_own_overrides_guild_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_visibility">> => 0},
    State = #{data => #{<<"guild">> => #{<<"token_gate_visibility">> => 1}}},
    ?assertEqual(0, effective_gate_visibility(Channel, State)).

effective_gate_visibility_no_guild_data_defaults_to_locked_test() ->
    Channel = #{<<"id">> => <<"100">>},
    ?assertEqual(0, effective_gate_visibility(Channel, #{})).

effective_gate_match_mode_falls_back_to_guild_test() ->
    Channel = #{<<"id">> => <<"100">>},
    State = #{data => #{<<"guild">> => #{<<"token_gate_match_mode">> => 1}}},
    ?assertEqual(1, effective_gate_match_mode(Channel, State)).

effective_gate_match_mode_own_overrides_guild_test() ->
    Channel = #{<<"id">> => <<"100">>, <<"token_gate_match_mode">> => 0},
    State = #{data => #{<<"guild">> => #{<<"token_gate_match_mode">> => 1}}},
    ?assertEqual(0, effective_gate_match_mode(Channel, State)).

user_satisfies_channel_gate_guild_wide_gate_blocks_non_owner_test() ->
    Channel = #{<<"id">> => <<"100">>},
    State = #{
        data => #{
            <<"guild">> => #{<<"owner_id">> => <<"7">>, <<"token_gate_address">> => <<"GuildWideGate">>}
        }
    },
    ok = tokengate_cache:put(<<"GuildWideGate">>, 0, 8, false),
    ?assertEqual(false, user_satisfies_channel_gate(8, Channel, State)),
    %% Owner bypasses the guild-wide gate the same as a channel-level one.
    ?assertEqual(true, user_satisfies_channel_gate(7, Channel, State)),
    ok = tokengate_cache:invalidate(<<"GuildWideGate">>, 0, 8).

-endif.
