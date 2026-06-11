from __future__ import annotations

import streamlit as st


def inject_styles() -> None:
    st.markdown(
        """
        <style>
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
            font-size: 0.98rem;
            font-weight: 650;
            line-height: 1.35;
            margin-bottom: 0.8rem;
        }
        .tr-team-label {
            font-size: 1.35rem;
            font-weight: 800;
            color: #111827;
            margin-bottom: 0.35rem;
        }
        .tr-card-top {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            flex-wrap: wrap;
            gap: 0.5rem 0.75rem;
            margin-bottom: 0.35rem;
        }
        .tr-muted {
            color: #6b7280;
            font-size: 0.92rem;
            line-height: 1.35;
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
        @media (max-width: 640px) {
            .block-container {
                padding-left: 1rem;
                padding-right: 1rem;
                padding-top: 1.2rem;
            }
            .tr-card-title {
                font-size: 1rem;
            }
            .tr-score-preview {
                font-size: 1.25rem;
                padding-top: 0;
            }
            .tr-card-top {
                align-items: center;
                gap: 0.4rem 0.55rem;
            }
            .tr-team-label {
                font-size: 1.12rem;
            }
            .tr-rule-grid,
            .tr-example-grid {
                grid-template-columns: 1fr;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
