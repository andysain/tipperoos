from __future__ import annotations

from html import escape


def panel(title: str, body: str) -> str:
    return (
        '<div class="tr-rules-hero">'
        f'<div class="tr-rules-hero-title">{escape(title)}</div>'
        f'<div class="tr-rules-hero-copy">{escape(body)}</div>'
        "</div>"
    )


def bot_panel(title: str, body: str) -> str:
    return (
        '<div class="tr-bot-rule-card">'
        f'<div class="tr-bot-rule-title">{escape(title)}</div>'
        f'<div class="tr-bot-rule-copy">{escape(body)}</div>'
        "</div>"
    )


def bot_panel_grid(cards: list[str]) -> str:
    return f'<div class="tr-bot-rule-grid">{"".join(cards)}</div>'


def section_title(title: str, caption: str | None = None) -> str:
    caption_html = f'<div class="tr-muted">{escape(caption)}</div>' if caption else ""
    return f'<div class="tr-rule-section-title">{escape(title)}</div>{caption_html}'


def points_grid(items: list[tuple[str, str]]) -> str:
    tiles = "".join(
        '<div class="tr-rule-tile">'
        f"<strong>{escape(label)}</strong>"
        f'<div class="tr-points">{escape(points)} <span>points</span></div>'
        "</div>"
        for label, points in items
    )
    return f'<div class="tr-rule-grid">{tiles}</div>'


def note(text: str) -> str:
    return f'<div class="tr-note">{escape(text)}</div>'


def example_card(title: str, rows: list[tuple[str, str, str]]) -> str:
    row_html = "".join(
        '<div class="tr-example-row">'
        f'<div>{escape(prediction)}<br><span class="tr-muted">{escape(reason)}</span></div>'
        f'<div class="tr-example-points">{escape(points)}</div>'
        "</div>"
        for prediction, reason, points in rows
    )
    return f'<div class="tr-example-card"><h4>{escape(title)}</h4>{row_html}</div>'


def example_grid(cards: list[str]) -> str:
    return f'<div class="tr-example-grid">{"".join(cards)}</div>'


def muted(text: str) -> str:
    return f'<div class="tr-muted">{escape(text)}</div>'
