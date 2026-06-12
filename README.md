# Tipperoos

World Cup predictions MVP built with Streamlit and Supabase Postgres.

## Local Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `sql/schema.sql`.
3. Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml`.
4. Fill in:

```toml
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-service-role-or-api-key"
COMPETITION_CODE = "family-code-goes-here"
ADMIN_BOOTSTRAP_CODE = "separate-admin-bootstrap-code"
SESSION_SECRET = "long-random-string-for-persistent-login"

ADMIN_USERNAME = "admin"
ADMIN_DISPLAY_NAME = "admin"
ADMIN_TEMP_PIN = "temporary-pin-goes-here"
```

5. Install dependencies:

```bash
pip install -r requirements.txt
```

6. Run the app:

```bash
streamlit run app.py
```

## Source Layout

The Streamlit entrypoint stays at `app.py`, while reusable Python code lives under
`src/tipperoos/`:

- `core/` - constants, scoring, date/time helpers, domain formatting, lock rules
- `data/` - Supabase access and cached loaders
- `services/` - player creation, predictions, results, bots, imports, analytics
- `web/` - Streamlit presentation helpers and styles

## First Run

On first launch, if no admin exists, the login page shows a `Create first admin` form.
It uses the `ADMIN_*` values from Streamlit secrets and requires `ADMIN_BOOTSTRAP_CODE`.

After logging in as admin:

1. Go to `Admin`.
2. Open `Setup` to see what still needs doing.
3. Open `Import` and click `Import archive fixture CSVs`.
4. Open `Settings` and set the winner-pick deadline.
5. Optionally close player creation once everyone is in.
6. Share the private family code so family players can unlock the app and create themselves.

If the database already exists from an earlier schema version, re-run `sql/schema.sql`.
It includes safe `if not exists` migration steps.

## Archive Fixture Import

The app imports seed data from `archive/`:

- `teams.csv`
- `matches.csv`
- `tournament_stages.csv`
- `host_cities.csv`

The import creates:

- teams for the winner-pick dropdown
- all 72 group-stage fixtures with teams
- knockout fixture shells with `match_label` values like `2A vs 2B` and `W73 vs W75`

Round of 32 team assignment is manual in the admin UI. Later knockout rounds can be
propagated from completed knockout results where the fixture labels are clear.

## Result Updates

Results are stored separately from fixture data in `match_results`. Admin > Results
has an editable table for entering scores, previewing the changes, and confirming
before saving.

The CSV upload is a fallback for bulk updates. It uses `archive/results.csv`.

Use this CSV shape:

```csv
match_number,team_a_code,team_b_code,team_a_score,team_b_score,status,advance_team_code
```

`team_a_code` and `team_b_code` are validated against the saved fixture before a
score can be imported. `status` is optional and defaults to `completed` when scores
are present. For tied knockout matches, set `advance_team_code` to the code of the
team that advanced.

## Notes

- Do not commit `.streamlit/secrets.toml`.
- The UI avoids gambling language.
- All display times use `Australia/Sydney`.
- Match predictions lock server-side before saving.
- Player login persists in the browser with a signed cookie until `Switch player` is clicked.
