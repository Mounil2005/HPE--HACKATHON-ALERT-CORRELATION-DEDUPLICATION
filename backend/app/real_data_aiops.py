"""Loads the preprocessed real AIOps Challenge 2020 alert batch (see
data/aiops_challenge_loader.py for how it was built from the dataset's real
fault log).

Same disclosed presentation transform as app/real_data.py: shift the whole
batch so its latest real event lands at "now", preserving true relative
spacing/order. No alert content, label, or field value is changed.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "aiops_challenge_alerts.json"


def load_aiops_alerts() -> list[dict]:
    with open(DATA_PATH, encoding="utf-8") as f:
        alerts: list[dict] = json.load(f)

    if not alerts:
        return alerts

    timestamps = [datetime.fromisoformat(a["timestamp"]) for a in alerts]
    shift = datetime.now().replace(microsecond=0) - max(timestamps)

    shifted = []
    for alert, ts in zip(alerts, timestamps):
        shifted.append({**alert, "timestamp": (ts + shift).isoformat(timespec="seconds")})
    return shifted
