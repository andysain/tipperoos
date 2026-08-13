-- Keep the provider's full label, while storing the shorter labels used by the UI.
alter table teams add column full_name text;
alter table teams add column display_name text;

update teams
set full_name = name;

-- Remove club suffixes wherever they occur (for example AFC Bournemouth and
-- Sunderland AFC), then collapse the whitespace left behind.
update teams
set name = trim(regexp_replace(regexp_replace(name, '\m(FC|AFC)\M', '', 'gi'), '\s+', ' ', 'g'));

update teams
set display_name = replace(name, 'Manchester', 'Man');

update teams
set display_name = case name
  when 'Coventry City' then 'Coventry'
  when 'Leeds United' then 'Leeds'
  when 'Brighton & Hove Albion' then 'Brighton'
  when 'Ipswich Town' then 'Ipswich'
  when 'Tottenham Hotspur' then 'Tottenham'
  when 'Newcastle United' then 'Newcastle'
  else display_name
end;

alter table teams alter column full_name set not null;
alter table teams alter column display_name set not null;
alter table teams add constraint teams_full_name_unique unique (full_name);
alter table teams add constraint teams_display_name_unique unique (display_name);
