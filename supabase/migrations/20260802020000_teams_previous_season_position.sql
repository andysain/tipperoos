-- Predict the Table capture UI: show a club's actual previous-season
-- finishing position as context on the calling card, instead of an
-- editorialized "hot take" reaction (product decision during issue #26 --
-- facts over commentary). Null = the club wasn't in the Premier League
-- last season (promoted), rendered as "Promoted" client-side.
alter table teams add column previous_season_position smallint;

alter table teams add constraint valid_previous_season_position check (
  previous_season_position is null
  or previous_season_position between 1 and 20
);

-- 2024/25 final Premier League table, for clubs still in the league this
-- season (the rest are promoted sides and stay null).
update teams set previous_season_position = 1 where name = 'Arsenal FC';
update teams set previous_season_position = 2 where name = 'Manchester City FC';
update teams set previous_season_position = 3 where name = 'Manchester United FC';
update teams set previous_season_position = 4 where name = 'Aston Villa FC';
update teams set previous_season_position = 5 where name = 'Liverpool FC';
update teams set previous_season_position = 6 where name = 'AFC Bournemouth';
update teams set previous_season_position = 7 where name = 'Sunderland AFC';
update teams set previous_season_position = 8 where name = 'Brighton & Hove Albion FC';
update teams set previous_season_position = 9 where name = 'Brentford FC';
update teams set previous_season_position = 10 where name = 'Chelsea FC';
update teams set previous_season_position = 11 where name = 'Fulham FC';
update teams set previous_season_position = 12 where name = 'Newcastle United FC';
update teams set previous_season_position = 13 where name = 'Everton FC';
update teams set previous_season_position = 14 where name = 'Leeds United FC';
update teams set previous_season_position = 15 where name = 'Crystal Palace FC';
update teams set previous_season_position = 16 where name = 'Nottingham Forest FC';
update teams set previous_season_position = 17 where name = 'Tottenham Hotspur FC';
