-- Auth & Player Accounts grilling session, 2026-08-01.
-- Reverts identity key from email to display_name (see docs/adr/0002).

-- email: was `unique not null`, becomes optional and non-unique. Not every
-- player has one, and family members may share a parent's address.
alter table players drop constraint if exists players_email_key;
alter table players alter column email drop not null;

-- display_name becomes the identity/login key: mandatory (already was),
-- unique case-insensitively (wasn't enforced before).
create unique index players_display_name_lower_idx on players (lower(display_name));

-- Small kid-friendly personalization touch, carried forward from the old app.
alter table players add column emoji text;

-- Forced-reset flow for admin-assisted PIN resets (see CLAUDE.md, Identity and auth).
alter table players add column pin_reset_required boolean not null default false;
