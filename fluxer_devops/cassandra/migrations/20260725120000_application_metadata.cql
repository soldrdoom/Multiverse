-- Application metadata: description, an icon owned by the application itself
-- (rather than derived from its bot user's avatar), a controlled-vocabulary tag
-- set for the future bot directory, and policy URLs.
--
-- team_id is added here rather than in a later migration because developer
-- teams land next and this avoids a second ALTER against the same table. It
-- stays null until an application is transferred to a team.
ALTER TABLE fluxer.applications ADD description text;
ALTER TABLE fluxer.applications ADD icon_hash text;
ALTER TABLE fluxer.applications ADD tags set<text>;
ALTER TABLE fluxer.applications ADD privacy_policy_url text;
ALTER TABLE fluxer.applications ADD terms_of_service_url text;
ALTER TABLE fluxer.applications ADD team_id bigint;
