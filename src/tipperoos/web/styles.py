from __future__ import annotations

import streamlit as st


def inject_styles() -> None:
    st.markdown(
        """
        <style>
        :root {
            color-scheme: light;
            --tr-border: rgba(128, 128, 128, 0.28);
            --tr-muted: #6b7280;
            --tr-subtle-bg: rgba(128, 128, 128, 0.08);
            --tr-soft-bg: rgba(128, 128, 128, 0.05);
            --tr-saved-bg: #eff6ff;
            --tr-saved-border: #93c5fd;
            --tr-saved-text: #1e3a8a;
            --tr-personal-bg: #eef2ff;
            --tr-personal-border: #6366f1;
            --tr-personal-text: #312e81;
            --tr-score-accent: #1e3a8a;
        }
        html,
        body,
        .stApp,
        [data-testid="stAppViewContainer"] {
            color-scheme: light;
            background: #ffffff;
        }
        .block-container {
            max-width: 1180px;
            padding-top: 2.4rem;
            padding-bottom: 4rem;
        }
        h1, h2, h3 {
            letter-spacing: 0;
        }
        div[data-testid="stForm"] {
            border-radius: 8px;
        }
        div[data-testid="stMetricValue"] {
            font-size: 1.75rem;
        }
        div[data-testid="stSegmentedControl"] button {
            min-height: 2.35rem;
        }
        div[data-testid="stSegmentedControl"] button[aria-pressed="true"] {
            color: #1e3a8a;
            background: #eff6ff;
            border-color: #93c5fd;
        }
        div[data-testid="stSegmentedControl"] button[aria-pressed="true"] * {
            color: #1e3a8a;
        }
        .tr-card-title {
            font-size: 1.28rem;
            font-weight: 750;
            margin-bottom: 0.25rem;
        }
        .tr-card-meta {
            color: #6b7280;
            font-size: 0.95rem;
            line-height: 1.35;
            margin-bottom: 0;
        }
        .tr-card-pick {
            color: #9ca3af;
            font-size: 0.86rem;
            font-weight: 600;
            line-height: 1.35;
            margin-bottom: 0;
        }
        .tr-team-label {
            font-size: 1.35rem;
            font-weight: 800;
            color: inherit;
            margin-bottom: 0.35rem;
        }
        .tr-card-top {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            flex-wrap: wrap;
            gap: 0.5rem 0.75rem;
            margin-bottom: 0.15rem;
        }
        .tr-muted {
            color: var(--tr-muted);
            font-size: 0.92rem;
            line-height: 1.35;
        }
        .tr-summary-stats {
            display: flex;
            align-items: stretch;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin: 0.35rem 0 0.85rem;
        }
        .tr-summary-stat {
            display: inline-flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 0.65rem;
            min-width: 7rem;
            border: 1px solid var(--tr-border);
            border-radius: 8px;
            background: var(--tr-soft-bg);
            padding: 0.48rem 0.7rem;
        }
        .tr-summary-stat span {
            color: var(--tr-muted);
            font-size: 0.82rem;
            font-weight: 750;
            line-height: 1.2;
        }
        .tr-summary-stat strong {
            color: inherit;
            font-size: 1.05rem;
            font-weight: 850;
            line-height: 1;
        }
        .tr-winner-summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-bottom: 0;
        }
        .tr-winner-picked {
            display: inline-flex;
            align-items: baseline;
            gap: 0.75rem;
            min-width: 0;
        }
        .tr-winner-picked span {
            color: var(--tr-muted);
            font-size: 0.88rem;
            font-weight: 750;
            white-space: nowrap;
        }
        .tr-winner-picked strong {
            font-size: 1.1rem;
            font-weight: 850;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tr-winner-locked {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            border: 1px solid var(--tr-border);
            padding: 0.34rem 0.65rem;
            font-size: 0.86rem;
            font-weight: 750;
            line-height: 1.1;
            white-space: nowrap;
            text-decoration: none;
        }
        .tr-winner-locked {
            color: var(--tr-muted);
        }
        .tr-tip-risk {
            border-radius: 8px;
            padding: 0.45rem 0.65rem;
            margin-bottom: 0.45rem;
            font-size: 0.86rem;
            font-weight: 850;
            line-height: 1.25;
        }
        .tr-tip-risk-soon {
            background: #eff6ff;
            color: #1d4ed8;
            border: 1px solid #bfdbfe;
        }
        .tr-tip-risk-urgent {
            background: #fffbeb;
            color: #92400e;
            border: 1px solid #fcd34d;
        }
        .tr-tip-risk-critical {
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid #fecaca;
        }
        .tr-scoreline-preview {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            align-items: center;
            gap: 0.75rem;
            border: 1px solid var(--tr-border);
            border-radius: 8px;
            background: var(--tr-soft-bg);
            padding: 0.5rem 0.65rem;
            margin: 0.55rem 0;
        }
        .tr-scoreline-preview span {
            min-width: 0;
            color: var(--tr-muted);
            font-size: 1.25rem;
            font-weight: 850;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tr-scoreline-preview span:last-child {
            text-align: left;
        }
        .tr-scoreline-preview span:first-child {
            text-align: right;
        }
        .tr-scoreline-preview strong {
            font-size: 1.55rem;
            font-weight: 900;
            white-space: nowrap;
        }
        .tr-scoreline-needs-tip {
            background: #fffbeb;
            border-color: #f59e0b;
        }
        .tr-scoreline-needs-tip span,
        .tr-scoreline-needs-tip strong {
            color: #78350f;
        }
        .tr-scoreline-saved {
            background: var(--tr-saved-bg);
            border-color: var(--tr-saved-border);
        }
        .tr-scoreline-saved span,
        .tr-scoreline-saved strong {
            color: var(--tr-saved-text);
        }
        .tr-scoreline-open {
            background: #ecfdf5;
            border-color: #a7f3d0;
        }
        .tr-scoreline-open span,
        .tr-scoreline-open strong {
            color: #047857;
        }
        .tr-scoreline-completed {
            background: #f1f5f9;
            border-color: #64748b;
        }
        .tr-scoreline-completed span,
        .tr-scoreline-completed strong {
            color: #334155;
        }
        .tr-scoreline-locked {
            background: #f8fafc;
            border-color: #cbd5e1;
        }
        .tr-scoreline-locked span,
        .tr-scoreline-locked strong {
            color: #64748b;
        }
        .tr-scoreline-missed {
            background: #fff1f2;
            border-color: #fda4af;
        }
        .tr-scoreline-missed span,
        .tr-scoreline-missed strong {
            color: #9f1239;
        }
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-marker) {
            display: none;
        }
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-active)
            + div[data-testid="stElementContainer"] div[data-testid="stButton"] > button:not(:disabled) {
            color: #ffffff;
            background: var(--tr-saved-text);
            border-color: var(--tr-saved-text);
        }
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-active)
            + div[data-testid="stElementContainer"] div[data-testid="stButton"] > button:not(:disabled):hover {
            color: #ffffff;
            background: #172554;
            border-color: #172554;
        }
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-active)
            + div[data-testid="stElementContainer"] div[data-testid="stButton"] > button:not(:disabled):active {
            background: #1e40af;
            border-color: #1e40af;
        }
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-inactive)
            + div[data-testid="stElementContainer"] div[data-testid="stButton"] > button:disabled {
            color: var(--tr-saved-text);
            background: var(--tr-saved-bg);
            border-color: var(--tr-saved-border);
            opacity: 1;
            cursor: default;
        }
        .tr-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 84px;
            padding: 0.25rem 0.65rem;
            border-radius: 999px;
            font-size: 0.82rem;
            font-weight: 750;
            border: 1px solid transparent;
            white-space: nowrap;
        }
        .tr-badge-open {
            background: #ecfdf5;
            color: #047857;
            border-color: #a7f3d0;
        }
        .tr-badge-saved {
            background: #eff6ff;
            color: #1d4ed8;
            border-color: #bfdbfe;
        }
        .tr-badge-locked {
            background: #f3f4f6;
            color: #374151;
            border-color: #d1d5db;
        }
        .tr-badge-missed {
            background: #fef2f2;
            color: #b91c1c;
            border-color: #fecaca;
        }
        .tr-badge-completed {
            background: #fff7ed;
            color: #c2410c;
            border-color: #fed7aa;
        }
        .tr-badge-tbc {
            background: #f8fafc;
            color: #475569;
            border-color: #cbd5e1;
        }
        .tr-score-preview {
            font-size: 1.75rem;
            font-weight: 800;
            text-align: center;
            padding-top: 0.85rem;
        }
        .tr-rules-hero {
            border: 1px solid #e5e7eb;
            border-left: 6px solid #ff4b4b;
            border-radius: 8px;
            padding: 1.1rem 1.25rem;
            margin: 0.75rem 0 1.25rem;
            background: #fffafa;
        }
        .tr-rules-hero-title {
            font-size: 1.2rem;
            font-weight: 800;
            margin-bottom: 0.35rem;
        }
        .tr-rules-hero-copy {
            color: #4b5563;
            line-height: 1.45;
        }
        .tr-rule-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.75rem;
            margin: 0.8rem 0 1.25rem;
        }
        .tr-rule-tile {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 0.95rem;
            background: #ffffff;
        }
        .tr-rule-tile strong {
            display: block;
            font-size: 0.95rem;
            line-height: 1.25;
            margin-bottom: 0.45rem;
        }
        .tr-points {
            display: inline-flex;
            align-items: baseline;
            gap: 0.2rem;
            color: var(--tr-score-accent);
            font-weight: 850;
            font-size: 1.65rem;
            line-height: 1;
        }
        .tr-points span {
            color: #6b7280;
            font-size: 0.8rem;
            font-weight: 700;
        }
        .tr-rule-section-title {
            font-size: 1.15rem;
            font-weight: 850;
            margin: 1.25rem 0 0.35rem;
        }
        .tr-example-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.8rem;
            margin-top: 0.75rem;
        }
        .tr-example-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 1rem;
            background: #ffffff;
        }
        .tr-example-card h4 {
            margin: 0 0 0.65rem;
            font-size: 1rem;
        }
        .tr-example-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 0.75rem;
            padding: 0.5rem 0;
            border-top: 1px solid #f3f4f6;
        }
        .tr-example-row:first-of-type {
            border-top: 0;
        }
        .tr-example-points {
            font-weight: 850;
            color: #111827;
        }
        .tr-note {
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            background: #eff6ff;
            color: #1e3a8a;
            padding: 0.8rem 1rem;
            margin: 1rem 0;
            font-weight: 650;
        }
        .tr-leader-row {
            display: grid;
            grid-template-columns: 4rem minmax(0, 1fr) 5.5rem 5.5rem 6rem;
            align-items: center;
            gap: 0.65rem;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 0.8rem 0.95rem;
            margin: 0.5rem 0;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(17, 24, 39, 0.04);
        }
        .tr-leader-row-current {
            border-color: #ff9f9f;
            background: #fff7f7;
        }
        .tr-leader-row-bot {
            background: #f8fafc;
            border-style: dashed;
            color: #475569;
        }
        .tr-leader-row-zero .tr-leader-total strong {
            color: #6b7280;
        }
        .tr-leader-rank {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 3.2rem;
            min-height: 3rem;
            border-radius: 8px;
            font-weight: 850;
            font-size: 1rem;
            color: #111827;
            line-height: 1.1;
        }
        .tr-leader-rank-gold {
            background: #fffbeb;
            color: #92400e;
            border: 1px solid #fcd34d;
        }
        .tr-leader-rank-silver {
            background: #f8fafc;
            color: #334155;
            border: 1px solid #cbd5e1;
        }
        .tr-leader-rank-bronze {
            background: #fff7ed;
            color: #9a3412;
            border: 1px solid #fdba74;
        }
        .tr-leader-name {
            display: flex;
            align-items: center;
            gap: 0.45rem;
            flex-wrap: wrap;
            font-weight: 850;
            font-size: 1.05rem;
            color: #111827;
        }
        .tr-leader-breakdown {
            margin-top: 0.2rem;
            color: #6b7280;
            font-size: 0.86rem;
            line-height: 1.3;
        }
        .tr-leader-bot,
        .tr-leader-you {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 0.15rem 0.45rem;
            font-size: 0.72rem;
            font-weight: 850;
            line-height: 1.2;
        }
        .tr-leader-bot {
            background: #e0f2fe;
            color: #0369a1;
            border: 1px solid #bae6fd;
        }
        .tr-leader-you {
            background: #fee2e2;
            color: #b91c1c;
            border: 1px solid #fecaca;
        }
        .tr-leader-stat,
        .tr-leader-total {
            text-align: right;
        }
        .tr-leader-stat strong,
        .tr-leader-total strong {
            display: block;
            color: #111827;
            font-size: 1.15rem;
            line-height: 1.1;
        }
        .tr-leader-stat span,
        .tr-leader-total span {
            color: #6b7280;
            font-size: 0.76rem;
            font-weight: 750;
            text-transform: uppercase;
            letter-spacing: 0;
        }
        .tr-leader-total strong {
            color: var(--tr-score-accent);
            font-size: 1.45rem;
        }
        .tr-centre-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 0.95rem;
            margin: 0.6rem 0;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(17, 24, 39, 0.04);
        }
        .tr-centre-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
        }
        .tr-centre-head > div {
            width: 100%;
            min-width: 0;
        }
        .tr-centre-meta {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.45rem 0.65rem;
            color: #6b7280;
            font-size: 0.88rem;
            line-height: 1.35;
            margin-bottom: 0.5rem;
        }
        .tr-centre-scoreline {
            width: 100%;
            margin: 0.2rem 0 0.55rem;
        }
        .tr-centre-scoreline .tr-scoreline-preview {
            width: 100%;
            box-sizing: border-box;
            margin: 0;
            padding: 0.72rem 0.85rem;
        }
        .tr-centre-body {
            margin-top: 0.75rem;
            border-top: 1px solid #f3f4f6;
            padding-top: 0.7rem;
            display: block;
        }
        .tr-compare-panel {
            display: block;
        }
        .tr-compare-your {
            border: 1px solid var(--tr-personal-border);
            border-radius: 8px;
            background: var(--tr-personal-bg);
            padding: 0.65rem;
            min-width: 0;
        }
        .tr-compare-label {
            color: var(--tr-personal-text);
            font-size: 0.72rem;
            font-weight: 850;
            line-height: 1.15;
            margin-bottom: 0.35rem;
            text-transform: uppercase;
        }
        .tr-compare-note {
            color: #3730a3;
            font-size: 0.82rem;
            font-weight: 700;
            line-height: 1.3;
            margin-top: 0.45rem;
        }
        .tr-compare-groups {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.65rem;
            margin-top: 0.75rem;
        }
        .tr-compare-section {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #ffffff;
            overflow: hidden;
            min-width: 0;
        }
        .tr-compare-section-exact {
            border-color: #86efac;
            box-shadow: inset 4px 0 0 #16a34a;
        }
        .tr-compare-section-exact .tr-compare-section-title {
            background: #f0fdf4;
            color: #166534;
            border-bottom-color: #bbf7d0;
        }
        .tr-compare-section-goal-diff {
            border-color: #67e8f9;
            box-shadow: inset 4px 0 0 #0891b2;
        }
        .tr-compare-section-goal-diff .tr-compare-section-title {
            background: #ecfeff;
            color: #155e75;
            border-bottom-color: #a5f3fc;
        }
        .tr-compare-section-result,
        .tr-compare-section-advancement {
            border-color: #bfdbfe;
            box-shadow: inset 4px 0 0 #2563eb;
        }
        .tr-compare-section-result .tr-compare-section-title,
        .tr-compare-section-advancement .tr-compare-section-title {
            background: #eff6ff;
            color: #1e3a8a;
            border-bottom-color: #dbeafe;
        }
        .tr-compare-section-wrong {
            border-color: #e5e7eb;
            box-shadow: inset 4px 0 0 #94a3b8;
        }
        .tr-compare-section-wrong .tr-compare-section-title {
            background: #f8fafc;
            color: #475569;
        }
        .tr-compare-section-no-tip {
            border-color: #e5e7eb;
            border-style: dashed;
            box-shadow: inset 4px 0 0 #cbd5e1;
        }
        .tr-compare-section-no-tip .tr-compare-section-title {
            background: #f9fafb;
            color: #64748b;
        }
        .tr-compare-section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.6rem;
            border-bottom: 1px solid #eef2f7;
            background: #f8fafc;
            color: #334155;
            padding: 0.5rem 0.6rem;
            font-size: 0.78rem;
            font-weight: 900;
            line-height: 1.2;
        }
        .tr-compare-section-title span {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tr-compare-section-title strong {
            color: #111827;
            font-size: 0.9rem;
            line-height: 1;
        }
        .tr-compare-section-exact .tr-compare-section-title strong {
            color: #15803d;
        }
        .tr-compare-section-goal-diff .tr-compare-section-title strong {
            color: #0e7490;
        }
        .tr-compare-section-result .tr-compare-section-title strong,
        .tr-compare-section-advancement .tr-compare-section-title strong {
            color: #1d4ed8;
        }
        .tr-compare-section-wrong .tr-compare-section-title strong,
        .tr-compare-section-no-tip .tr-compare-section-title strong {
            color: #64748b;
        }
        .tr-compare-group-row {
            display: grid;
            grid-template-columns: minmax(4.5rem, auto) minmax(0, 1fr);
            gap: 0.55rem;
            align-items: center;
            padding: 0.52rem 0.6rem;
            border-top: 1px solid #f3f4f6;
        }
        .tr-compare-group-row:first-of-type {
            border-top: 0;
        }
        .tr-compare-group-main {
            min-width: 0;
        }
        .tr-compare-group-main strong {
            display: block;
            color: #111827;
            font-size: 0.95rem;
            font-weight: 950;
            line-height: 1.1;
            white-space: nowrap;
        }
        .tr-compare-group-main span {
            display: block;
            color: #64748b;
            font-size: 0.7rem;
            font-weight: 800;
            line-height: 1.2;
            margin-top: 0.12rem;
            white-space: nowrap;
        }
        .tr-compare-group-players {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 0.25rem;
            min-width: 0;
        }
        .tr-compare-player,
        .tr-compare-empty-chip {
            display: inline-flex;
            align-items: center;
            max-width: 100%;
            border: 1px solid #e5e7eb;
            border-radius: 999px;
            background: #ffffff;
            color: #111827;
            padding: 0.18rem 0.45rem;
            font-size: 0.76rem;
            font-weight: 850;
            line-height: 1.15;
        }
        .tr-compare-player-you {
            background: #dbeafe;
            border-color: #93c5fd;
            color: #1e3a8a;
        }
        .tr-compare-player-you::after {
            content: "You";
            margin-left: 0.32rem;
            color: #1d4ed8;
            font-size: 0.62rem;
            font-weight: 950;
            text-transform: uppercase;
        }
        .tr-compare-player-bot {
            background: #f0f9ff;
            border-color: #bae6fd;
            color: #0369a1;
        }
        .tr-compare-empty,
        .tr-compare-empty-chip {
            color: #64748b;
        }
        .tr-centre-pick-preview {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            align-items: center;
            gap: 0.34rem;
            border: 1px solid var(--tr-border);
            border-radius: 8px;
            padding: 0.3rem 0.38rem;
            margin-top: 0.28rem;
        }
        .tr-centre-pick-preview span {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--tr-muted);
            font-size: 0.76rem;
            font-weight: 800;
        }
        .tr-centre-pick-preview span:first-child {
            text-align: right;
        }
        .tr-centre-pick-preview span:last-child {
            text-align: left;
        }
        .tr-centre-pick-preview strong {
            color: #111827;
            font-size: 0.9rem;
            font-weight: 900;
            line-height: 1;
            white-space: nowrap;
        }
        .tr-compare-your .tr-centre-pick-preview {
            background: #ffffff;
            border-color: #cbd5e1;
            box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
        }
        .tr-compare-your .tr-centre-pick-preview span {
            color: #64748b;
        }
        .tr-compare-your .tr-centre-pick-preview strong {
            color: #0f172a;
        }
        .tr-centre-pick-status {
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--tr-border);
            border-radius: 8px;
            padding: 0.34rem 0.45rem;
            margin-top: 0.28rem;
            min-height: 2rem;
            color: #64748b;
            background: #f8fafc;
            font-size: 0.82rem;
            font-weight: 850;
            line-height: 1.15;
            text-align: center;
        }
        .tr-centre-pick-submitted {
            background: var(--tr-saved-bg);
            border-color: var(--tr-saved-border);
            color: var(--tr-saved-text);
        }
        .tr-centre-pick-waiting {
            background: #f8fafc;
            border-color: #cbd5e1;
            color: #64748b;
        }
        .tr-centre-advance {
            display: block;
            margin-left: 0;
            color: #6b7280;
            font-weight: 600;
            font-size: 0.78rem;
        }
        .tr-centre-empty {
            color: #6b7280;
            font-size: 0.92rem;
            font-weight: 650;
            padding: 0.35rem 0 0.15rem;
        }
        @media (max-width: 900px) {
            .tr-compare-groups {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 640px) {
            .block-container {
                padding-left: 1rem;
                padding-right: 1rem;
                padding-top: 1.2rem;
            }
            .tr-card-title {
                font-size: 1rem;
            }
            .tr-tip-risk {
                padding: 0.45rem 0.55rem;
                margin-bottom: 0.45rem;
                font-size: 0.82rem;
            }
            .tr-score-preview {
                font-size: 1.25rem;
                padding-top: 0;
            }
            .tr-card-top {
                align-items: center;
                gap: 0.4rem 0.55rem;
                margin-bottom: 0.05rem;
            }
            .tr-team-label {
                font-size: 1.12rem;
            }
            .tr-summary-stats {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 0.35rem;
                margin: 0.2rem 0 0.65rem;
            }
            .tr-summary-stat {
                min-width: 0;
                flex-direction: column-reverse;
                align-items: center;
                justify-content: center;
                gap: 0.15rem;
                padding: 0.42rem 0.25rem;
                background: var(--tr-soft-bg);
                box-shadow: none;
            }
            .tr-summary-stat span {
                max-width: 100%;
                color: #6b7280;
                font-size: 0.7rem;
                font-weight: 700;
                overflow-wrap: anywhere;
                text-align: center;
            }
            .tr-summary-stat strong {
                font-size: 0.95rem;
            }
            .tr-winner-summary {
                gap: 0.45rem;
                margin-bottom: 0;
            }
            .tr-winner-picked {
                gap: 0.45rem;
            }
            .tr-winner-picked span,
            .tr-winner-locked {
                font-size: 0.78rem;
            }
            .tr-winner-picked strong {
                font-size: 0.95rem;
            }
            .tr-winner-locked {
                padding: 0.28rem 0.5rem;
            }
            .tr-scoreline-preview {
                grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
                gap: 0.45rem;
                padding: 0.48rem 0.55rem;
                margin: 0.5rem 0;
            }
            .tr-scoreline-preview span {
                font-size: 1.05rem;
                white-space: nowrap;
            }
            .tr-scoreline-preview span:first-child {
                text-align: right;
            }
            .tr-scoreline-preview span:last-child {
                text-align: left;
            }
            .tr-scoreline-preview strong {
                font-size: 1.45rem;
            }
            .tr-rule-grid,
            .tr-example-grid {
                grid-template-columns: 1fr;
            }
            .tr-leader-row {
                grid-template-columns: 3.2rem minmax(0, 1fr) 4.6rem;
                gap: 0.5rem;
                padding: 0.8rem;
            }
            .tr-leader-stat {
                display: none;
            }
            .tr-leader-total {
                text-align: right;
            }
            .tr-centre-card {
                padding: 0.85rem;
            }
            .tr-compare-groups {
                grid-template-columns: 1fr;
            }
            .tr-compare-group-row {
                grid-template-columns: 1fr;
                gap: 0.4rem;
            }
            .tr-compare-group-players {
                justify-content: flex-start;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
