-- One-time bootstrap, run as postgres after 0001_schema.sql.
-- The app connects as frontdoor_app, which can only touch the frontdoor schema.
-- Run with a real password; never commit the filled-in version.

create role frontdoor_app with login password '<GENERATED>';

grant usage on schema frontdoor to frontdoor_app;
alter role frontdoor_app set search_path = frontdoor;

alter default privileges in schema frontdoor
  grant select, insert, update, delete on tables to frontdoor_app;
alter default privileges in schema frontdoor
  grant usage, select on sequences to frontdoor_app;
-- The trail is append-only for the application; 0002 revokes update and delete on it.
