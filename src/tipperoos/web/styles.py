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
            background: #eff6ff;
            border-color: #93c5fd;
        }
        .tr-scoreline-saved span,
        .tr-scoreline-saved strong {
            color: #1e3a8a;
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
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-marker)
            + div[data-testid="stElementContainer"] div[data-testid="stButton"] > button:not(:disabled) {
            color: #ffffff;
            background: #2563eb;
            border-color: #2563eb;
        }
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-marker)
            + div[data-testid="stElementContainer"] div[data-testid="stButton"] > button:not(:disabled):hover {
            color: #ffffff;
            background: #1d4ed8;
            border-color: #1d4ed8;
        }
        div[data-testid="stElementContainer"]:has(.tr-update-prediction-button-marker)
            + div[data-testid="stElementContainer"] div[data-testid="stButton"] > button:not(:disabled):active {
            background: #1e40af;
            border-color: #1e40af;
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
            color: #ff4b4b;
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
            color: #ff4b4b;
            font-size: 1.45rem;
        }
        .tr-centre-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 0.78rem 0.95rem;
            margin: 0.5rem 0;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(17, 24, 39, 0.04);
        }
        .tr-centre-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
        }
        .tr-centre-meta {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.45rem 0.65rem;
            color: #6b7280;
            font-size: 0.88rem;
            line-height: 1.35;
            margin-bottom: 0.3rem;
        }
        .tr-centre-title {
            color: #111827;
            font-size: 1.1rem;
            font-weight: 850;
            line-height: 1.25;
            margin-bottom: 0.15rem;
        }
        .tr-centre-body {
            margin-top: 0.65rem;
            border-top: 1px solid #f3f4f6;
            padding-top: 0.25rem;
        }
        .tr-centre-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 8rem;
            align-items: center;
            gap: 0.75rem;
            padding: 0.65rem 0;
            border-bottom: 1px solid #f3f4f6;
        }
        .tr-centre-row:last-child {
            border-bottom: 0;
        }
        .tr-centre-player {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.4rem;
            color: #111827;
            font-size: 1rem;
            font-weight: 800;
            line-height: 1.25;
        }
        .tr-centre-tip {
            margin-top: 0.15rem;
            color: #4b5563;
            font-size: 0.95rem;
            font-weight: 650;
            line-height: 1.3;
        }
        .tr-centre-advance {
            display: inline;
            margin-left: 0.45rem;
            color: #6b7280;
            font-weight: 600;
        }
        .tr-centre-points {
            text-align: right;
        }
        .tr-centre-points strong {
            display: block;
            color: #ff4b4b;
            font-size: 1.25rem;
            line-height: 1.1;
            font-weight: 900;
        }
        .tr-centre-points span {
            display: block;
            color: #6b7280;
            font-size: 0.78rem;
            font-weight: 750;
            line-height: 1.2;
        }
        .tr-centre-points-pending strong {
            color: #6b7280;
        }
        .tr-centre-empty {
            color: #6b7280;
            font-size: 0.92rem;
            font-weight: 650;
            padding: 0.35rem 0 0.15rem;
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
            .tr-centre-title {
                font-size: 1.05rem;
            }
            .tr-centre-row {
                grid-template-columns: minmax(0, 1fr);
                gap: 0.35rem;
            }
            .tr-centre-points {
                text-align: left;
            }
            .tr-centre-points strong,
            .tr-centre-points span {
                display: inline;
            }
            .tr-centre-points span {
                margin-left: 0.35rem;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
