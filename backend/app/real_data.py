"""Loads the preprocessed real Loghub HDFS_v1 alert batch (see
data/loghub_hdfs_loader.py for how it was built from the raw dataset).

The committed JSON keeps real 2008 collection timestamps — this module's only
job is a disclosed presentation transform: shift the whole batch so its latest
real event lands at "now", preserving true relative spacing/order, so a live
demo run today doesn't show alerts from 17 years ago. No alert content, label,
or field value is changed.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "loghub_hdfs_alerts.json"


def load_loghub_alerts() -> list[dict]:
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
