from __future__ import annotations

import sys
from datetime import datetime, timedelta
from html import escape
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

from tipperoos.core.constants import (
    APP_TITLE,
    BOT_SPECS,
    PLAYER_EMOJIS,
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    SESSION_QUERY_PARAM,
    SYDNEY,
)
from tipperoos.core.domain import (
    flag_for_code,
    has_teams,
    leaderboard_player_name,
    leaderboard_rank_label,
    match_result_line,
    match_time_summary,
    matchup_label,
    player_display_for_centre,
    prediction_scoreline,
    score_reason,
    status_badge,
    team_display,
    team_format_from_lookup,
)
from tipperoos.core.scoring import (
    score_prediction_details,
)
from tipperoos.core.time_utils import (
    iso_dt,
    local_label,
    now_utc,
    parse_dt,
)
from tipperoos.core.timing import get_timings, reset_timings, timed
from tipperoos.data.store import (
    app_setup_state,
    clear_data_cache,
    db,
    execute,
    get_player,
    load_matches,
    load_players,
    load_predictions,
    load_settings,
    load_teams,
    load_winner_picks,
    login_setup_state,
)
from tipperoos.services.actions import (
    save_prediction,
    upsert_winner_pick,
)
from tipperoos.services.admin_ops import (
    RESULT_STATUSES,
    apply_result_updates,
    assign_round_of_32_match,
    build_result_updates_from_csv,
    build_result_updates_from_table,
    generate_bot_predictions,
    generate_bot_winner_picks,
    import_archive_fixture_csvs,
    result_editor_rows,
    save_result,
)
from tipperoos.services.analytics import (
    calculate_leaderboard,
    cumulative_human_scores,
    group_standings,
)
from tipperoos.services.players import (
    check_pin,
    create_player,
    ensure_default_bots,
    unique_username,
)
from tipperoos.services.session_tokens import (
    make_session_token as make_signed_session_token,
    validate_session_token as validate_signed_session_token,
)
from tipperoos.services.views.match_centre_view import get_match_centre_page
from tipperoos.services.views.predictions_view import (
    WinnerPickView,
    get_predictions_page,
)
from tipperoos.web.styles import inject_styles
from tipperoos.web.ui import (
    example_card,
    example_grid,
    muted,
    note,
    panel,
    points_grid,
    section_title,
)

st.set_page_config(page_title=APP_TITLE, page_icon="T", layout="wide")


def session_secret() -> bytes:
    secret = st.secrets.get("SESSION_SECRET")
    if not secret:
        st.error("Missing SESSION_SECRET. Add it to Streamlit secrets before deploying.")
        st.stop()
    return str(secret).encode("utf-8")


def make_session_token(player_id: str) -> str:
    return make_signed_session_token(player_id, session_secret())


def validate_session_token(token: str | None) -> str | None:
    return validate_signed_session_token(token, session_secret())


def set_session_cookie(token: str) -> None:
    safe_token = escape(token, quote=True)
    components.html(
        f"""
        <script>
        document.cookie = "{SESSION_COOKIE_NAME}={safe_token}; Max-Age={SESSION_MAX_AGE_SECONDS}; Path=/; SameSite=Lax";
        </script>
        """,
        height=0,
    )


def clear_session_cookie() -> None:
    components.html(
        f"""
        <script>
        document.cookie = "{SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax";
        </script>
        """,
        height=0,
    )


def query_param_value(name: str) -> str | None:
    value = st.query_params.get(name)
    if isinstance(value, list):
        return value[0] if value else None
    return value


def set_session_query_param(token: str) -> None:
    st.query_params[SESSION_QUERY_PARAM] = token


def clear_session_query_param() -> None:
    if SESSION_QUERY_PARAM in st.query_params:
        del st.query_params[SESSION_QUERY_PARAM]


def hint_numeric_pin_keyboard() -> None:
    components.html(
        """
        <script>
        const applyNumericPins = () => {
          const inputs = window.parent.document.querySelectorAll('input[type="password"][maxlength="6"]');
          inputs.forEach((input) => {
            input.setAttribute("inputmode", "numeric");
            input.setAttribute("pattern", "[0-9]*");
            input.setAttribute("autocomplete", "one-time-code");
          });
        };
        applyNumericPins();
        new MutationObserver(applyNumericPins).observe(window.parent.document.body, {
          childList: true,
          subtree: true
        });
        </script>
        """,
        height=0,
    )


def pin_input(label: str, key: str) -> str:
    return st.text_input(label, type="password", max_chars=6, key=key)


def queue_session_cookie(player_id: str) -> None:
    st.session_state.pending_session_cookie = make_session_token(player_id)


def emit_pending_cookie_update() -> bool:
    cleared_cookie = False
    if st.session_state.get("pending_session_cookie"):
        token = st.session_state.pending_session_cookie
        set_session_query_param(token)
        set_session_cookie(token)
        st.session_state.pop("pending_session_cookie", None)
    if st.session_state.get("clear_session_cookie"):
        clear_session_query_param()
        clear_session_cookie()
        st.session_state.pop("clear_session_cookie", None)
        cleared_cookie = True
    return cleared_cookie


def apply_player_session(player: dict, persist: bool = False) -> None:
    st.session_state.player_id = player["id"]
    st.session_state.display_name = player["display_name"]
    st.session_state.is_admin = bool(player.get("is_admin"))
    st.session_state.app_unlocked = True
    if persist:
        queue_session_cookie(player["id"])


def restore_session_from_cookie() -> bool:
    if st.session_state.get("player_id"):
        return True
    token = query_param_value(SESSION_QUERY_PARAM) or st.context.cookies.get(SESSION_COOKIE_NAME)
    player_id = validate_session_token(token)
    if not player_id:
        if token:
            clear_session_query_param()
            st.session_state.clear_session_cookie = True
        return False
    player = get_player(player_id)
    if not player or not player.get("active"):
        clear_session_query_param()
        st.session_state.clear_session_cookie = True
        return False
    apply_player_session(player, persist=False)
    return True


def bootstrap_admin_if_needed() -> None:
    admins = [p for p in load_players(include_inactive=True) if p.get("is_admin")]
    if admins:
        return

    st.warning("No admin exists yet.")
    st.caption("Create the first admin from Streamlit secrets. This requires the admin bootstrap code.")
    with st.form("bootstrap_admin"):
        code = st.text_input("Admin bootstrap code", type="password")
        submitted = st.form_submit_button("Create first admin", type="primary")
    if submitted:
        expected = st.secrets.get("ADMIN_BOOTSTRAP_CODE")
        if not expected:
            st.error("Set ADMIN_BOOTSTRAP_CODE in Streamlit secrets before creating the first admin.")
            return
        if code != expected:
            st.error("That bootstrap code is not right.")
            return
        temp_pin = st.secrets.get("ADMIN_TEMP_PIN")
        if not temp_pin:
            st.error("Set ADMIN_TEMP_PIN in Streamlit secrets before creating the first admin.")
            return
        create_player(
            st.secrets.get("ADMIN_USERNAME", "admin"),
            st.secrets.get("ADMIN_DISPLAY_NAME", "admin"),
            temp_pin,
            is_admin=True,
        )
        st.success("First admin created. Log in with the configured username and PIN.")
        st.rerun()


def unlock_app_panel() -> None:
    _, panel, _ = st.columns([1, 1.15, 1])
    with panel:
        st.title(APP_TITLE)
        st.caption("World Cup predictions")
        with st.form("unlock_app"):
            code = st.text_input("Competition code", type="password")
            submitted = st.form_submit_button("Continue", type="primary", use_container_width=True)
        if submitted:
            if code == st.secrets.get("COMPETITION_CODE"):
                st.session_state.app_unlocked = True
                st.rerun()
            else:
                st.error("That competition code is not right.")


def login_page() -> None:
    if not st.session_state.get("app_unlocked"):
        unlock_app_panel()
        return

    _, panel, _ = st.columns([1, 1.4, 1])
    with panel:
        st.title(APP_TITLE)
        st.caption("World Cup predictions")

        setup = login_setup_state()
        if not setup["schema_ok"]:
            st.error("Setup needed: Supabase tables are not ready yet.")
            st.markdown(
                """
                1. Open Supabase.
                2. Go to the SQL editor.
                3. Run `sql/schema.sql`.
                4. Refresh this app.
                """
            )
            with st.expander("Technical detail"):
                st.code(str(setup["error"]))
            return

        bootstrap_admin_if_needed()
        settings = setup["settings"]
        players = setup["players"]

        tab_login, tab_create = st.tabs(["Login", "Create player"])

        with tab_login:
            if not players:
                st.info("No players yet.")
            else:
                hint_numeric_pin_keyboard()
                options = {f"{p.get('emoji') or ''} {p['display_name']}".strip(): p for p in players}
                label = st.selectbox("Player", list(options.keys()))
                if st.session_state.get("login_player_label") != label:
                    st.session_state.login_player_label = label
                    st.session_state.login_pin = ""
                pin = pin_input("PIN", "login_pin")
                if st.button("Login", type="primary", use_container_width=True):
                    player = options[label]
                    if check_pin(pin, player["pin_hash"]):
                        apply_player_session(player, persist=True)
                        st.rerun()
                    else:
                        st.error("That PIN did not match.")

        with tab_create:
            if not settings.get("allow_player_signup", True):
                st.info("Player creation is closed for now. Ask the family admin if you need access.")
            else:
                hint_numeric_pin_keyboard()
                display_name = st.text_input("Display name")
                emoji_choice = st.selectbox("Player emoji (optional)", PLAYER_EMOJIS)
                custom_emoji = ""
                if emoji_choice == "Other":
                    custom_emoji = st.text_input("Custom emoji", max_chars=8, placeholder="😎")
                pin = pin_input("Choose a 4 or 6 digit PIN", "create_pin")
                confirm_pin = pin_input("Confirm PIN", "create_pin_confirm")
                submitted = st.button("Create player", use_container_width=True)
                if submitted:
                    emoji = custom_emoji.strip() if emoji_choice == "Other" else emoji_choice
                    if not display_name.strip():
                        st.error("Display name is required.")
                    elif pin != confirm_pin:
                        st.error("The PINs do not match.")
                    elif not (pin.isdigit() and len(pin) in (4, 6)):
                        st.error("PIN must be 4 or 6 digits.")
                    else:
                        try:
                            username = unique_username(display_name)
                            create_player(username, display_name, pin, emoji)
                            player = execute(
                                db().table("players").select("*").eq("username", username).limit(1),
                                "login.created_player_lookup",
                            )[0]
                            st.session_state.create_pin = ""
                            st.session_state.create_pin_confirm = ""
                            apply_player_session(player, persist=True)
                            st.rerun()
                        except Exception as exc:
                            st.error("Could not create that player. Please try a slightly different display name.")
                            with st.expander("Technical detail"):
                                st.code(str(exc))


def setup_status_page(setup: dict) -> None:
    st.title("Setup")
    st.caption("Competition readiness checklist")
    items = [
        ("Schema", setup["schema_ok"], "Supabase tables are available."),
        ("Admin", setup["admin_count"] > 0, f"{setup['admin_count']} admin player(s)."),
        ("Teams", setup["team_count"] > 0, f"{setup['team_count']} teams imported."),
        ("Matches", setup["match_count"] > 0, f"{setup['match_count']} matches imported."),
        ("Winner Deadline", setup["winner_deadline_set"], "Winner-pick deadline is set."),
        ("Bots", setup["bots_count"] >= len(BOT_SPECS), f"{setup['bots_count']} bot player(s)."),
    ]
    cols = st.columns(3)
    for index, (label, ok, detail) in enumerate(items):
        with cols[index % 3]:
            st.metric(label, "Ready" if ok else "Needed")
            st.caption(detail)
    if not setup["team_count"] or not setup["match_count"]:
        st.info("Next step: go to Admin > Import and import the archive fixture CSVs.")
    if not setup["winner_deadline_set"]:
        st.info("Set the winner-pick deadline before inviting family players.")
    if setup["bots_count"] < len(BOT_SPECS):
        st.info("Go to Admin > Bots and create the default bots.")


def sidebar() -> str:
    label = st.session_state.get("display_name", "Player")
    st.sidebar.subheader(f"Playing as: {label}")
    if st.sidebar.button("Switch player"):
        st.session_state.clear_session_cookie = True
        for key in ("player_id", "display_name", "is_admin"):
            st.session_state.pop(key, None)
        st.rerun()

    pages = ["My Predictions", "Rules", "Leaderboard", "Match Centre"]
    if st.session_state.get("is_admin"):
        pages.append("Admin")
    return st.sidebar.radio("Page", pages)


def winner_pick_card(player_id: str, winner_pick: WinnerPickView, require_first: bool = False) -> bool:
    teams = winner_pick.teams
    teams_by_name = winner_pick.teams_by_name
    current_pick = winner_pick.current_pick
    unlocked = winner_pick.unlocked
    if not teams:
        st.subheader("Tournament winner pick")
        if st.session_state.get("is_admin"):
            st.info("No teams have been imported yet. Go to Admin > Import to load the archive fixtures.")
        else:
            st.info("Competition setup is not finished yet. Check back once the teams are imported.")
        return False

    current_team = current_pick.get("team") if current_pick else None
    index = [t["name"] for t in teams].index(current_team) if current_team in [t["name"] for t in teams] else 0
    disabled = not unlocked
    edit_key = "winner_pick_editing"
    if require_first and not current_pick and unlocked:
        st.info("Choose your overall winner first, then match predictions will unlock.")

    if current_pick and not st.session_state.get(edit_key):
        team = teams_by_name.get(current_pick["team"])
        pick_label = team_display(current_pick["team"], team.get("icon") if team else None)
        with st.container(border=True):
            summary_col, action_col = st.columns([1, 0.18], vertical_alignment="center")
            summary_col.markdown(
                f'<div class="tr-winner-summary"><span>Winner pick</span><strong>{escape(pick_label)}</strong></div>',
                unsafe_allow_html=True,
            )
            if unlocked:
                if action_col.button("Edit", key="edit_winner_pick", use_container_width=True):
                    st.session_state[edit_key] = True
                    st.rerun()
            else:
                action_col.caption("Locked")
        return True

    st.subheader("Tournament winner pick")
    with st.container(border=True):
        if current_pick:
            team = teams_by_name.get(current_pick["team"])
            pick_label = team_display(current_pick["team"], team.get("icon") if team else None)
            st.markdown(f"**Saved pick:** {pick_label}")
        elif not unlocked:
            st.warning("Winner pick deadline has passed.")

        with st.form("winner_pick_form", border=False):
            selected = st.selectbox(
                "Overall winner",
                [t["name"] for t in teams],
                index=index,
                disabled=disabled,
                format_func=team_format_from_lookup(teams_by_name),
            )
            submitted = st.form_submit_button("Save winner pick", disabled=disabled, type="primary", use_container_width=True)
    if submitted:
        try:
            upsert_winner_pick(player_id, selected)
            st.session_state[edit_key] = False
            st.success("Winner pick saved.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))

    return bool(current_pick) or not unlocked


def score_picker(label: str, current_score: int, key: str, disabled: bool) -> int:
    common_scores: list[int | str] = [0, 1, 2, 3, 4, "5+"]
    default_score: int | str = current_score if current_score < 5 else "5+"
    selected = st.segmented_control(
        label,
        common_scores,
        default=default_score,
        key=f"score_{key}",
        disabled=disabled,
        width="stretch",
    )
    if selected == "5+":
        more_scores = list(range(5, 11))
        if current_score not in more_scores and current_score >= 5:
            more_scores.append(current_score)
            more_scores.sort()
        return int(
            st.selectbox(
                "Score",
                more_scores,
                index=more_scores.index(current_score) if current_score in more_scores else 0,
                key=f"score_more_{key}",
                disabled=disabled,
                label_visibility="collapsed",
            )
        )
    return int(selected if selected is not None else current_score)


def time_remaining_label(delta: timedelta) -> str:
    total_minutes = max(0, int(delta.total_seconds() // 60))
    days, remainder = divmod(total_minutes, 60 * 24)
    hours, minutes = divmod(remainder, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def tip_deadline_notice(match: dict, settings: dict, status: str) -> tuple[str, str] | None:
    if status != "Open":
        return None
    kickoff = parse_dt(match.get("kickoff_time"))
    if not kickoff:
        return None
    lock_minutes = int(settings.get("lock_minutes_before_kickoff") or 30)
    lock_at = kickoff - timedelta(minutes=lock_minutes)
    remaining = lock_at - now_utc()
    if remaining <= timedelta(0):
        return ("critical", "Tip needed now - locking")
    label = time_remaining_label(remaining)
    if remaining <= timedelta(hours=6):
        return ("critical", f"High risk - locks in {label}")
    if remaining <= timedelta(hours=24):
        return ("urgent", f"Tip needed today - locks in {label}")
    if remaining <= timedelta(days=3):
        return ("soon", f"Upcoming tip - locks in {label}")
    return None


def prediction_form(match: dict, prediction: dict | None, disabled: bool) -> None:
    player_id = st.session_state.player_id
    key = match["id"]
    existing_a = int(prediction["pred_team_a_score"]) if prediction else 0
    existing_b = int(prediction["pred_team_b_score"]) if prediction else 0
    team_a_label = team_display(match["team_a"], match.get("team_a_icon") or flag_for_code(match.get("team_a_code")))
    team_b_label = team_display(match["team_b"], match.get("team_b_icon") or flag_for_code(match.get("team_b_code")))

    c1, c2 = st.columns(2)
    with c1:
        pred_a = score_picker(team_a_label, existing_a, f"a_{key}", disabled)
    with c2:
        pred_b = score_picker(team_b_label, existing_b, f"b_{key}", disabled)
    st.markdown(
        '<div class="tr-scoreline-preview">'
        f'<span>{escape(team_a_label)}</span><strong>{pred_a} - {pred_b}</strong><span>{escape(team_b_label)}</span>'
        "</div>",
        unsafe_allow_html=True,
    )

    advance_team = prediction.get("pred_advance_team") if prediction else None
    if match.get("is_knockout"):
        options = [match["team_a"], match["team_b"]]
        index = options.index(advance_team) if advance_team in options else 0
        advance_team = st.selectbox("If level, who advances?", options, index=index, key=f"adv_{key}", disabled=disabled)
    button_label = "Update prediction" if prediction else "Save prediction"
    button_type = "secondary" if prediction else "primary"
    submitted = st.button(button_label, disabled=disabled, type=button_type, use_container_width=True, key=f"save_{key}")

    if submitted:
        try:
            save_prediction(player_id, match["id"], int(pred_a), int(pred_b), advance_team)
            st.success("Prediction saved.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))


def my_predictions_page() -> None:
    player_id = st.session_state.player_id
    with timed("page.my_predictions.view"):
        view = get_predictions_page(player_id)

    with timed("page.my_predictions.header"):
        st.title("My Predictions")
        prediction_stats = [
            ("To tip", view.metrics.get("Open", 0)),
            ("Saved", view.metrics.get("Saved", 0)),
            ("Locked", view.metrics.get("Locked", 0)),
            ("Missed", view.metrics.get("Missed", 0)),
        ]
        st.markdown(
            '<div class="tr-summary-stats">'
            + "".join(
                f'<div class="tr-summary-stat"><span>{label}</span><strong>{value}</strong></div>'
                for label, value in prediction_stats
            )
            + "</div>",
            unsafe_allow_html=True,
        )

    with timed("page.my_predictions.winner_pick"):
        winner_ready = winner_pick_card(player_id, view.winner_pick, require_first=True)

    with timed("page.my_predictions.filter"):
        st.subheader("Match predictions")
        if not winner_ready:
            return

        filter_choice = st.segmented_control(
            "Filter",
            ["To tip", "Saved", "All", "Completed"],
            default="To tip",
        )
        filter_state_key = "my_predictions_filter"
        if st.session_state.get(filter_state_key) != filter_choice:
            st.session_state[filter_state_key] = filter_choice
            st.session_state.my_predictions_visible_count = 12

    with timed("page.my_predictions.match_list"):
        visible_count = int(st.session_state.get("my_predictions_visible_count", 12))
        visible_matches = []
        for match_view in view.matches:
            match = match_view.match
            prediction = match_view.prediction
            status = match_view.status
            if filter_choice == "To tip" and status != "Open":
                continue
            if filter_choice == "Saved" and status != "Saved":
                continue
            if filter_choice == "Completed" and match.get("status") != "completed":
                continue
            visible_matches.append(match_view)

        rendered = 0
        for match_view in visible_matches[:visible_count]:
            match = match_view.match
            prediction = match_view.prediction
            status = match_view.status
            rendered += 1
            with st.container(border=True):
                deadline_notice = tip_deadline_notice(match, view.settings, status)
                if deadline_notice:
                    urgency, message = deadline_notice
                    st.markdown(
                        f'<div class="tr-tip-risk tr-tip-risk-{urgency}">{escape(message)}</div>',
                        unsafe_allow_html=True,
                    )
                badge_label = "Needs tip" if status == "Open" else status
                st.markdown(
                    f'<div class="tr-card-top"><div>{status_badge(badge_label)}</div>'
                    f'<div class="tr-card-meta">{match_time_summary(match)}</div></div>',
                    unsafe_allow_html=True,
                )
                if match_view.pick_text:
                    st.markdown(f'<div class="tr-card-pick">{match_view.pick_text}</div>', unsafe_allow_html=True)

                if not has_teams(match):
                    st.info("Teams are not set for this fixture yet.")
                    continue

                prediction_form(match, prediction, match_view.disabled)

        if rendered == 0:
            st.info("No matches in this view.")
        elif rendered < len(visible_matches):
            remaining = len(visible_matches) - rendered
            if st.button(f"Show 12 more ({remaining} remaining)", use_container_width=True):
                st.session_state.my_predictions_visible_count = rendered + 12
                st.rerun()


def leaderboard_page() -> None:
    st.title("Leaderboard")
    df = calculate_leaderboard()
    if df.empty:
        st.info("No players yet.")
        return

    matches = load_matches()
    completed_count = len([match for match in matches if match.get("status") == "completed"])
    current_player_id = st.session_state.get("player_id")
    current_rows = df[df["Player ID"] == current_player_id]
    top_score = int(df.iloc[0]["Total points"])
    if current_rows.empty:
        current_rank = "-"
        current_score = 0
    else:
        current_rank_value = int(current_rows.iloc[0]["Rank"])
        current_score = int(current_rows.iloc[0]["Total points"])
        current_tied = len(df[df["Total points"] == current_score]) > 1
        current_rank = leaderboard_rank_label(current_rank_value, current_tied)

    leaderboard_stats = [
        ("Matches", f"{completed_count}/104"),
        ("Your rank", current_rank),
        ("Your Score", current_score),
        ("Top score", top_score),
    ]
    st.markdown(
        '<div class="tr-summary-stats">'
        + "".join(
            f'<div class="tr-summary-stat"><span>{label}</span><strong>{value}</strong></div>'
            for label, value in leaderboard_stats
        )
        + "</div>",
        unsafe_allow_html=True,
    )

    if completed_count == 0:
        st.info("The leaderboard will start moving once the first result is entered. Everyone is tied for now.")
    st.caption("Match points come from exact scores, correct goal differences, and correct results. Winner bonuses are shown separately.")


    for row in df.to_dict("records"):
        is_current = row["Player ID"] == current_player_id
        classes = ["tr-leader-row"]
        if row["Bot"]:
            classes.append("tr-leader-row-bot")
        if is_current:
            classes.append("tr-leader-row-current")
        total_points = int(row["Total points"])
        if total_points == 0:
            classes.append("tr-leader-row-zero")
        rank = int(row["Rank"])
        medal = {1: "Gold", 2: "Silver", 3: "Bronze"}.get(rank) if total_points > 0 else None
        rank_classes = ["tr-leader-rank"]
        if medal:
            rank_classes.append(f"tr-leader-rank-{medal.lower()}")
        tied = len(df[df["Total points"] == row["Total points"]]) > 1
        rank_display = leaderboard_rank_label(rank, tied)
        rank_html = f'<div class="{" ".join(rank_classes)}">{rank_display}</div>'
        name = escape(leaderboard_player_name(row))
        bot_badge = '<span class="tr-leader-bot">Bot</span>' if row["Bot"] else ""
        you_badge = '<span class="tr-leader-you">You</span>' if is_current else ""
        html = (
            f'<div class="{" ".join(classes)}">'
            f"{rank_html}"
            '<div class="tr-leader-player">'
            f'<div class="tr-leader-name">{name} {bot_badge} {you_badge}</div>'
            f'<div class="tr-leader-breakdown">Exact {int(row["Exact"])} · '
            f'Goal diff {int(row["Goal diff"])} · Result {int(row["Result"])}</div>'
            "</div>"
            f'<div class="tr-leader-stat"><strong>{int(row["Score points"])}</strong><span>Match</span></div>'
            f'<div class="tr-leader-stat"><strong>{int(row["Winner bonus"])}</strong><span>Winner</span></div>'
            f'<div class="tr-leader-total"><strong>{int(row["Total points"])}</strong><span>Total</span></div>'
            "</div>"
        )
        st.markdown(html, unsafe_allow_html=True)


    progress_df = cumulative_human_scores()
    if not progress_df.empty:
        st.subheader("Score progression")
        st.line_chart(progress_df.set_index("Match"), height=280)


def match_centre_prediction_rows(match: dict, predictions: list[dict], players: dict[str, dict], completed: bool) -> str:
    if not predictions:
        return '<div class="tr-centre-empty">No predictions for this match.</div>'

    rows = []
    predictions = sorted(
        predictions,
        key=lambda pred: (
            bool(players.get(pred["player_id"], {}).get("is_bot")),
            str(players.get(pred["player_id"], {}).get("display_name") or "").lower(),
        ),
    )
    for pred in predictions:
        player = players.get(pred["player_id"])
        if not player:
            continue
        details = score_prediction_details(match, pred)
        bot_badge = '<span class="tr-leader-bot">Bot</span>' if player.get("is_bot") else ""
        if completed:
            points = int(details["total_points"])
            reason = score_reason(details)
            result_html = f'<div class="tr-centre-points"><strong>{points}</strong><span>{escape(reason)}</span></div>'
        else:
            result_html = '<div class="tr-centre-points tr-centre-points-pending"><strong>-</strong><span>Pending</span></div>'
        advance = ""
        if match.get("is_knockout") and pred.get("pred_advance_team"):
            advance = f'<div class="tr-centre-advance">Advances: {escape(str(pred["pred_advance_team"]))}</div>'
        rows.append(
            '<div class="tr-centre-row">'
            '<div>'
            f'<div class="tr-centre-player">{player_display_for_centre(player)} {bot_badge}</div>'
            f'<div class="tr-centre-tip">{prediction_scoreline(pred)}{advance}</div>'
            '</div>'
            f'{result_html}'
            '</div>'
        )
    return "".join(rows) if rows else '<div class="tr-centre-empty">No predictions for this match.</div>'


def match_centre_page() -> None:
    player_id = st.session_state.player_id
    with timed("page.match_centre.header"):
        st.title("Match Centre")
        filter_choice = st.segmented_control(
            "Filter",
            ["Open", "Locked", "Completed", "All"],
            default="Open",
        )
        filter_state_key = "match_centre_filter"
        if st.session_state.get(filter_state_key) != filter_choice:
            st.session_state[filter_state_key] = filter_choice
            st.session_state.match_centre_visible_count = 12

    with timed("page.match_centre.view"):
        view = get_match_centre_page(player_id, filter_choice)

    with timed("page.match_centre.match_list"):
        visible_count = int(st.session_state.get("match_centre_visible_count", 12))
        visible_matches = []
        for match_view in view.matches:
            status = match_view.status
            if filter_choice == "Open" and status != "Open":
                continue
            if filter_choice == "Locked" and status != "Locked":
                continue
            if filter_choice == "Completed" and status != "Completed":
                continue
            visible_matches.append(match_view)

        rendered = 0
        for match_view in visible_matches[:visible_count]:
            match = match_view.match
            row_html = match_view.row_html
            if match_view.reveal:
                row_html = match_centre_prediction_rows(
                    match,
                    match_view.predictions,
                    view.players,
                    match_view.completed,
                )
            body_html = f'<div class="tr-centre-body">{row_html}</div>' if row_html else ""

            rendered += 1
            st.markdown(
                '<div class="tr-centre-card">'
                '<div class="tr-centre-head">'
                '<div>'
                f'<div class="tr-centre-meta">{status_badge(match_view.status, compact=True)} <span>{escape(match_time_summary(match))}</span></div>'
                f'<div class="tr-centre-title">{escape(match_result_line(match))}</div>'
                f'<div class="tr-card-pick">{escape(match_view.pick_text)}</div>'
                '</div>'
                '</div>'
                f'{body_html}'
                '</div>',
                unsafe_allow_html=True,
            )

        if rendered == 0:
            st.info("No matches in this view.")
        elif rendered < len(visible_matches):
            remaining = len(visible_matches) - rendered
            if st.button(f"Show 12 more ({remaining} remaining)", key="match_centre_show_more", use_container_width=True):
                st.session_state.match_centre_visible_count = rendered + 12
                st.rerun()


def rules_page() -> None:
    st.title("Rules")
    html = "\n".join(
        [
            panel(
                "Tip the score before kickoff",
                "Matches lock 30 minutes before kickoff. The score is the score at the end of the match, "
                "including extra time if extra time is played. Penalty shootout goals do not count.",
            ),
            section_title("Match points", "For the match score, you get the highest one that applies."),
            points_grid(
                [
                    ("Exact score", "5"),
                    ("Correct goal difference", "4"),
                    ("Correct result", "3"),
                    ("Wrong result", "0"),
                ]
            ),
            section_title("Bonuses"),
            note("Knockout scoring is still under review and will be finalised before the knockout rounds kick off."),
            points_grid(
                [
                    ("Correct knockout advancement", "+2"),
                    ("Correct overall winner", "+10"),
                ]
            ),
            section_title("Examples"),
            example_grid(
                [
                    example_card(
                        "Actual: Australia 2-1 Japan",
                        [
                            ("Australia 2-1 Japan", "Exact score", "5"),
                            ("Australia 1-0 Japan", "Correct goal difference", "4"),
                            ("Australia 3-1 Japan", "Correct result", "3"),
                            ("Australia 1-1 Japan", "Wrong result", "0"),
                        ],
                    ),
                    example_card(
                        "Actual: England 1-1 USA",
                        [
                            ("England 1-1 USA", "Exact score", "5"),
                            ("England 0-0 USA", "Correct goal difference", "4"),
                            ("England 2-2 USA", "Correct goal difference", "4"),
                            ("England 2-1 USA", "Wrong result", "0"),
                        ],
                    ),
                ]
            ),
            section_title("Knockout matches"),
            panel(
                "Pick who progresses",
                "If you predict a draw in a knockout match, choose who progresses. Advancement points are "
                "added separately from score points.",
            ),
            muted("Bots are computer players for fun and appear on the leaderboard."),
        ]
    )
    st.markdown(html, unsafe_allow_html=True)


def settings_admin() -> None:
    settings = load_settings()
    teams = load_teams()
    st.subheader("Settings")
    with st.form("settings_form"):
        deadline_raw = settings.get("winner_pick_deadline")
        deadline_dt = parse_dt(deadline_raw).astimezone(SYDNEY) if deadline_raw else None
        date_value = deadline_dt.date() if deadline_dt else None
        time_value = deadline_dt.time() if deadline_dt else None
        d = st.date_input("Winner pick deadline date", value=date_value)
        t = st.time_input("Winner pick deadline time", value=time_value)
        final_options = [""] + [team["name"] for team in teams]
        current_final = settings.get("final_winner") or ""
        final_winner = st.selectbox(
            "Final tournament winner",
            final_options,
            index=final_options.index(current_final) if current_final in final_options else 0,
        )
        lock_minutes = st.number_input("Lock minutes before kickoff", min_value=0, max_value=240, value=int(settings.get("lock_minutes_before_kickoff") or 30))
        allow_player_signup = st.toggle(
            "Allow family members to create players",
            value=bool(settings.get("allow_player_signup", True)),
        )
        submitted = st.form_submit_button("Save settings")
    if submitted:
        local_deadline = datetime.combine(d, t, tzinfo=SYDNEY) if d and t else None
        payload = {
            "id": 1,
            "winner_pick_deadline": iso_dt(local_deadline),
            "final_winner": final_winner or None,
            "lock_minutes_before_kickoff": int(lock_minutes),
            "allow_player_signup": allow_player_signup,
            "timezone": "Australia/Sydney",
            "updated_at": iso_dt(now_utc()),
        }
        try:
            db().table("settings").upsert(payload, on_conflict="id").execute()
            clear_data_cache()
            st.success("Settings saved.")
            st.rerun()
        except Exception as exc:
            if "allow_player_signup" in str(exc):
                st.error("The settings table needs the latest schema migration. Re-run sql/schema.sql in Supabase.")
            else:
                st.error("Settings could not be saved.")
            with st.expander("Technical detail"):
                st.code(str(exc))


def import_admin() -> None:
    st.subheader("Archive import")
    st.write("Imports teams, stages, group matches, and knockout fixture shells from the local archive CSVs.")
    if st.button("Import archive fixture CSVs", type="primary"):
        try:
            team_count, match_count = import_archive_fixture_csvs()
            st.success(f"Imported {team_count} teams and {match_count} matches.")
        except Exception as exc:
            st.error("Import failed.")
            with st.expander("Technical detail"):
                st.code(str(exc))


def round_of_32_admin() -> None:
    st.subheader("Round of 32 setup")
    teams = [t["name"] for t in load_teams()]
    if not teams:
        st.info("Import teams first.")
        return
    r32_matches = [m for m in load_matches() if m.get("stage") == "Round of 32"]
    if not r32_matches:
        st.info("No Round of 32 fixtures found.")
        return
    for match in r32_matches:
        with st.expander(f"Match {match.get('match_number')}: {match.get('match_label')}"):
            with st.form(f"r32_{match['id']}"):
                options = [""] + teams
                idx_a = options.index(match.get("team_a")) if match.get("team_a") in options else 0
                idx_b = options.index(match.get("team_b")) if match.get("team_b") in options else 0
                team_a = st.selectbox("First team", options, index=idx_a, key=f"r32a_{match['id']}")
                team_b = st.selectbox("Second team", options, index=idx_b, key=f"r32b_{match['id']}")
                submitted = st.form_submit_button("Save teams")
            if submitted:
                if not team_a or not team_b or team_a == team_b:
                    st.error("Choose two different teams.")
                else:
                    try:
                        assign_round_of_32_match(match, team_a, team_b)
                        st.success("Round of 32 fixture updated.")
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))


def result_admin() -> None:
    st.subheader("Results")
    matches = load_matches()
    if not matches:
        st.info("No matches yet.")
        return

    tab_edit, tab_upload, tab_single = st.tabs(["Edit Table", "Upload CSV", "Single match"])

    with tab_edit:
        rows = result_editor_rows(matches)
        if not rows:
            st.info("No fixtures with teams are ready for results yet.")
        else:
            st.caption("Edit scores directly, preview the changes, then confirm the save.")
            edited = st.data_editor(
                pd.DataFrame(rows),
                key="results_table_editor",
                use_container_width=True,
                hide_index=True,
                num_rows="fixed",
                disabled=[
                    "match_number",
                    "kickoff",
                    "stage",
                    "team_a",
                    "team_a_code",
                    "team_b_code",
                    "team_b",
                ],
                column_order=[
                    "match_number",
                    "kickoff",
                    "stage",
                    "team_a",
                    "team_a_code",
                    "team_a_score",
                    "team_b_score",
                    "team_b_code",
                    "team_b",
                    "status",
                    "advance_team_code",
                ],
                column_config={
                    "match_number": st.column_config.NumberColumn("Match", width="small"),
                    "kickoff": st.column_config.TextColumn("Kickoff", width="medium"),
                    "stage": st.column_config.TextColumn("Stage", width="small"),
                    "team_a": st.column_config.TextColumn("Team A", width="medium"),
                    "team_a_code": st.column_config.TextColumn("A code", width="small"),
                    "team_a_score": st.column_config.NumberColumn("A score", min_value=0, max_value=30, step=1),
                    "team_b_score": st.column_config.NumberColumn("B score", min_value=0, max_value=30, step=1),
                    "team_b_code": st.column_config.TextColumn("B code", width="small"),
                    "team_b": st.column_config.TextColumn("Team B", width="medium"),
                    "status": st.column_config.SelectboxColumn("Status", options=list(RESULT_STATUSES)),
                    "advance_team_code": st.column_config.TextColumn("Advances", width="small"),
                },
            )

            updates, errors, _unchanged = build_result_updates_from_table(edited)
            if errors:
                st.error("Fix these rows before saving.")
                st.dataframe(pd.DataFrame(errors), use_container_width=True, hide_index=True)

            if updates:
                st.write(f"{len(updates)} result change(s) ready to apply.")
                st.dataframe(
                    pd.DataFrame([update["preview"] for update in updates]),
                    use_container_width=True,
                    hide_index=True,
                )
            else:
                st.info("No result changes found in the table.")

            if st.button("Confirm and save table results", type="primary", disabled=bool(errors) or not updates):
                try:
                    saved = apply_result_updates(updates, imported_by=st.session_state.get("player_id"))
                    st.success(f"Saved {saved} result change(s).")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))

    with tab_upload:
        st.caption(
            "Upload `archive/results.csv`. Required columns: `match_number`, `team_a_code`, "
            "`team_b_code`, `team_a_score`, `team_b_score`. For tied knockout matches, "
            "also set `advance_team_code`."
        )
        uploaded = st.file_uploader("Results CSV", type="csv")
        if uploaded:
            try:
                updates, errors, unchanged = build_result_updates_from_csv(uploaded)
            except Exception as exc:
                st.error("Could not read that CSV.")
                with st.expander("Technical detail"):
                    st.code(str(exc))
                return

            if errors:
                st.error("Fix these CSV rows before saving.")
                st.dataframe(pd.DataFrame(errors), use_container_width=True, hide_index=True)

            if updates:
                st.write(f"{len(updates)} result change(s) ready to apply.")
                st.dataframe(
                    pd.DataFrame([update["preview"] for update in updates]),
                    use_container_width=True,
                    hide_index=True,
                )
            else:
                st.info("No result changes found in that CSV.")

            if unchanged:
                st.caption(f"{unchanged} row(s) already matched the current saved result.")

            confirm_disabled = bool(errors) or not updates
            if st.button("Confirm and save CSV results", type="primary", disabled=confirm_disabled):
                try:
                    saved = apply_result_updates(updates, imported_by=st.session_state.get("player_id"))
                    st.success(f"Saved {saved} result change(s).")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))

    with tab_single:
        labels = [
            f"{m.get('match_number')}: {matchup_label(m)} (Sydney {local_label(m.get('kickoff_time'))})"
            for m in matches
        ]
        selected_label = st.selectbox("Match", labels)
        match = matches[labels.index(selected_label)]
        if not has_teams(match):
            st.warning("Set both teams before entering a result.")
            return
        with st.form("result_form"):
            c1, c2, c3 = st.columns([2, 1, 2])
            score_a = c1.number_input(match["team_a"], min_value=0, max_value=30, value=int(match.get("team_a_score") or 0))
            c2.markdown("### -")
            score_b = c3.number_input(match["team_b"], min_value=0, max_value=30, value=int(match.get("team_b_score") or 0))
            status = st.selectbox(
                "Status",
                ["scheduled", "completed", "cancelled", "postponed"],
                index=["scheduled", "completed", "cancelled", "postponed"].index(match.get("status") or "scheduled"),
            )
            advance_team = None
            if match.get("is_knockout"):
                options = [match["team_a"], match["team_b"]]
                existing = match.get("advance_team")
                advance_team = st.selectbox("Team advanced", options, index=options.index(existing) if existing in options else 0)
            submitted = st.form_submit_button("Save result")
        if submitted:
            try:
                save_result(match, int(score_a), int(score_b), advance_team, status)
                st.success("Result saved.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))


def bot_admin() -> None:
    st.subheader("Bots")
    if st.button("Ensure default bots exist"):
        ensure_default_bots()
        st.success("Default bots are ready.")
    cols = st.columns(4)
    for i, (bot_type, spec) in enumerate(BOT_SPECS.items()):
        if cols[i].button(f"Generate {spec['display_name']} predictions"):
            count = generate_bot_predictions(bot_type)
            st.success(f"Generated {count} predictions.")
    if cols[3].button("Generate bot winner picks"):
        count = generate_bot_winner_picks()
        st.success(f"Generated {count} winner picks.")


def backup_admin() -> None:
    st.subheader("Backups")
    tables = {
        "players": load_players(include_inactive=True),
        "teams": load_teams(active_only=False),
        "matches": load_matches(),
        "predictions": load_predictions(),
        "winner_picks": load_winner_picks(),
        "settings": [load_settings()],
    }
    for name, rows in tables.items():
        df = pd.DataFrame(rows)
        st.download_button(
            f"Download {name}.csv",
            df.to_csv(index=False).encode("utf-8"),
            file_name=f"{name}.csv",
            mime="text/csv",
        )


def standings_admin() -> None:
    st.subheader("Group standings")
    standings = group_standings()
    if not standings:
        st.info("No teams imported yet.")
        return
    for group, rows in standings.items():
        st.write(f"Group {group}")
        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


def admin_page() -> None:
    st.title("Admin")
    tab_setup, tab_settings, tab_import, tab_results, tab_r32, tab_bots, tab_standings, tab_backups = st.tabs(
        ["Setup", "Settings", "Import", "Results", "Round of 32", "Bots", "Standings", "Backups"]
    )
    with tab_setup:
        setup_status_page(app_setup_state())
    with tab_settings:
        settings_admin()
    with tab_import:
        import_admin()
    with tab_results:
        result_admin()
    with tab_r32:
        round_of_32_admin()
    with tab_bots:
        bot_admin()
    with tab_standings:
        standings_admin()
    with tab_backups:
        backup_admin()


def timing_panel() -> None:
    if not st.session_state.get("is_admin"):
        return
    records = get_timings()
    if not records:
        return
    rows = [{"Step": record.label, "ms": round(record.elapsed_ms, 1)} for record in records]
    page_records = [record for record in records if record.label.startswith("page.")]
    total_ms = round(sum(record.elapsed_ms for record in page_records), 1)
    with st.sidebar.expander(f"Timing · {total_ms} ms", expanded=False):
        st.dataframe(pd.DataFrame(rows).sort_values("ms", ascending=False), hide_index=True, use_container_width=True)


def main() -> None:
    reset_timings()
    with timed("app.inject_styles"):
        inject_styles()
    with timed("app.session"):
        cleared_cookie = emit_pending_cookie_update()
        if not cleared_cookie:
            restore_session_from_cookie()
    if "player_id" not in st.session_state:
        with timed("page.login"):
            login_page()
        timing_panel()
        return

    with timed("app.sidebar"):
        page = sidebar()
    with timed(f"page.{page}"):
        if page == "My Predictions":
            my_predictions_page()
        elif page == "Leaderboard":
            leaderboard_page()
        elif page == "Match Centre":
            match_centre_page()
        elif page == "Rules":
            rules_page()
        elif page == "Admin":
            admin_page()
    timing_panel()


if __name__ == "__main__":
    main()
