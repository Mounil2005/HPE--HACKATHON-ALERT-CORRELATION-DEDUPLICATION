"""Loghub HDFS_v1 loader — converts a real, publicly released log dataset into
the same Alert schema the synthetic generator produces, per PS10's data source
requirement ("Loghub alert datasets (GitHub)").

This is an OFFLINE preprocessing script, not part of the live app. Run it once
to produce data/loghub_hdfs_alerts.json, which backend/app/real_data.py reads
at request time. It downloads and caches HDFS_v1.zip (186.6 MB, Zenodo record
8196385) — no application form required, unlike some other Loghub datasets.

Every field on every emitted alert traces to either (a) literal content in a
real HDFS_v1 log line, or (b) the dataset's own human-annotated Normal/Anomaly
block label (Xu et al., SOSP 2009) — nothing is invented. Two disclosed
transformation rules turn that real data into Alert-shaped records:

  severity: critical if the block is Anomaly and the log Level is WARN/ERROR,
            high if the block is Anomaly and Level is INFO, info if Normal.
            (Real HDFS_v1 log lines are almost all INFO-level; severity here
            reflects whether the line belongs to a documented real failure,
            not an invented score.)
  status:   firing if the block is Anomaly, else resolved.

Timestamps are kept as the real 2008 collection dates in this file — the
"shift so the latest event lands at now" transform happens at load time in
backend/app/real_data.py, not here, so this JSON stays an honest historical
artifact.

Usage:
    python loghub_hdfs_loader.py --out loghub_hdfs_alerts.json
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import random
import re
import urllib.request
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

HDFS_V1_ZIP_URL = "https://zenodo.org/records/8196385/files/HDFS_v1.zip?download=1"

LOG_LINE_RE = re.compile(
    r"^(?P<date>\d{6})\s+(?P<time>\d{6})\s+(?P<pid>\d+)\s+(?P<level>[A-Z]+)\s+"
    r"(?P<component>[^:]+):\s*(?P<content>.*)$"
)
BLOCK_ID_RE = re.compile(r"blk_-?\d+")
IP_PORT_RE = re.compile(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?")
DIGIT_RUN_RE = re.compile(r"\d+")

# Real HDFS_v1 Component values -> a clean "service" label. Fallback logic
# (see component_to_service) handles anything not listed here.
COMPONENT_SERVICE_MAP = {
    "dfs.DataNode$DataXceiver": "hdfs-datanode",
    "dfs.DataNode$PacketResponder": "hdfs-datanode",
    "dfs.DataNode$DataTransfer": "hdfs-datanode",
    "dfs.DataNode": "hdfs-datanode",
    "dfs.FSDataset": "hdfs-datanode",
    "dfs.FSNamesystem": "hdfs-namenode",
    "dfs.NameNode": "hdfs-namenode",
    "dfs.NameSystem": "hdfs-namenode",
}

TARGET_ALERTS = 180  # kept small deliberately — the deployed backend runs on a
# memory-constrained free-tier host; a smaller real sample avoids OOM-crashing
# the whole process during embedding+clustering, while still being a real,
# honest subset (not padded/fabricated) of the same public dataset.
MAX_LINES_PER_BLOCK = 6
ANOMALY_BLOCK_CAP = 40


def component_to_service(component: str) -> str:
    component = component.strip()
    if component in COMPONENT_SERVICE_MAP:
        return COMPONENT_SERVICE_MAP[component]
    lc = component.lower()
    if "datanode" in lc or "fsdataset" in lc:
        return "hdfs-datanode"
    if "namenode" in lc or "fsnamesystem" in lc:
        return "hdfs-namenode"
    slug = re.sub(r"[^a-z0-9]+", "-", lc).strip("-")
    return f"hdfs-{slug or 'other'}"


def mask_template(content: str) -> str:
    """Real message with block IDs / IPs / numbers masked -> a template
    derived directly from the real text, not invented."""
    masked = BLOCK_ID_RE.sub("<BLOCK>", content)
    masked = IP_PORT_RE.sub("<IP>", masked)
    masked = DIGIT_RUN_RE.sub("<NUM>", masked)
    return re.sub(r"\s+", " ", masked).strip()


def download_and_extract(cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    zip_path = cache_dir / "HDFS_v1.zip"
    extract_dir = cache_dir / "extracted"

    if not zip_path.exists():
        print(f"Downloading {HDFS_V1_ZIP_URL} -> {zip_path} (186.6 MB, one-time)...")
        urllib.request.urlretrieve(HDFS_V1_ZIP_URL, zip_path)
        print("Download complete.")
    else:
        print(f"Using cached {zip_path}")

    if not extract_dir.exists() or not any(extract_dir.iterdir()):
        print(f"Extracting to {extract_dir}...")
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)
        print("Extraction complete.")
    else:
        print(f"Using cached extraction at {extract_dir}")

    return extract_dir


def find_dataset_files(extract_dir: Path) -> tuple[Path, Path]:
    """Locate the raw log file and anomaly_label.csv inside the extracted
    tree without assuming an exact internal folder layout."""
    label_candidates = list(extract_dir.rglob("*"))
    label_path = next(
        (p for p in label_candidates if p.is_file() and "anomaly_label" in p.name.lower() and p.suffix == ".csv"),
        None,
    )
    if label_path is None:
        raise FileNotFoundError(f"Could not find anomaly_label.csv under {extract_dir}")

    log_candidates = [
        p for p in extract_dir.rglob("*.log")
        if "2k" not in p.name.lower()
    ]
    if not log_candidates:
        raise FileNotFoundError(f"Could not find the raw HDFS .log file under {extract_dir}")
    log_path = max(log_candidates, key=lambda p: p.stat().st_size)

    print(f"Raw log: {log_path} ({log_path.stat().st_size / 1e6:.1f} MB)")
    print(f"Anomaly labels: {label_path}")
    return log_path, label_path


def load_anomaly_labels(label_path: Path) -> dict[str, str]:
    labels: dict[str, str] = {}
    with open(label_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            block_id = row.get("BlockId") or row.get("blockId") or list(row.values())[0]
            label = row.get("Label") or row.get("label") or list(row.values())[1]
            labels[block_id.strip()] = label.strip()
    return labels


def parse_line(line: str) -> dict | None:
    m = LOG_LINE_RE.match(line.rstrip("\n"))
    if not m:
        return None
    return m.groupdict()


def group_lines_by_block(log_path: Path, labels: dict[str, str]) -> dict[str, list[dict]]:
    """Single pass over the raw log: keep only lines whose block ID has a
    real label, grouped by block. Stops early once every real anomalous
    block (bounded by ANOMALY_BLOCK_CAP) has enough lines and the normal
    pool is comfortably oversized for sampling, so we never need to hold
    the full 11M-line file in memory."""
    anomaly_blocks: dict[str, list[dict]] = {}
    normal_blocks: dict[str, list[dict]] = {}
    normal_pool_target = TARGET_ALERTS * 4  # oversample normal pool for random.sample later

    with open(log_path, encoding="utf-8", errors="replace") as f:
        for raw_line in f:
            parsed = parse_line(raw_line)
            if not parsed:
                continue
            block_match = BLOCK_ID_RE.search(parsed["content"])
            if not block_match:
                continue
            block_id = block_match.group(0)
            label = labels.get(block_id)
            if label is None:
                continue

            if label == "Anomaly":
                bucket = anomaly_blocks.setdefault(block_id, [])
                if len(bucket) < MAX_LINES_PER_BLOCK:
                    bucket.append(parsed)
            else:
                bucket = normal_blocks.setdefault(block_id, [])
                if len(bucket) < MAX_LINES_PER_BLOCK:
                    bucket.append(parsed)

            if (
                len(anomaly_blocks) >= ANOMALY_BLOCK_CAP * 3
                and sum(len(v) for v in normal_blocks.values()) >= normal_pool_target
            ):
                break

    return {"Anomaly": anomaly_blocks, "Normal": normal_blocks}


def build_alerts(grouped: dict[str, dict[str, list[dict]]], seed: int) -> list[dict]:
    rng = random.Random(seed)

    # Fixed split of the alert budget (not the block cap) so a smaller
    # TARGET_ALERTS still keeps real background noise alongside real
    # incidents — otherwise capped anomaly blocks alone can consume the
    # whole budget and leave nothing to demonstrate noise reduction against.
    anomaly_budget = round(TARGET_ALERTS * 0.4)
    normal_budget = TARGET_ALERTS - anomaly_budget

    anomaly_block_ids = sorted(grouped["Anomaly"])
    rng.shuffle(anomaly_block_ids)
    anomaly_block_ids = anomaly_block_ids[:ANOMALY_BLOCK_CAP]

    anomaly_selected: list[str] = []
    running = 0
    for block_id in anomaly_block_ids:
        if running >= anomaly_budget:
            break
        anomaly_selected.append(block_id)
        running += len(grouped["Anomaly"][block_id])
    anomaly_block_ids = anomaly_selected

    normal_block_ids = sorted(grouped["Normal"])
    rng.shuffle(normal_block_ids)

    normal_selected: list[str] = []
    running = 0
    for block_id in normal_block_ids:
        if running >= normal_budget:
            break
        normal_selected.append(block_id)
        running += len(grouped["Normal"][block_id])

    alerts: list[dict] = []

    def emit(block_id: str, label: str, lines: list[dict]) -> None:
        for parsed in lines:
            yy, mm, dd = int(parsed["date"][:2]), int(parsed["date"][2:4]), int(parsed["date"][4:6])
            hh, mi, ss = int(parsed["time"][:2]), int(parsed["time"][2:4]), int(parsed["time"][4:6])
            ts = datetime(2000 + yy, mm, dd, hh, mi, ss)
            level = parsed["level"]
            is_anomaly = label == "Anomaly"
            severity = (
                "critical" if is_anomaly and level in ("WARN", "ERROR", "FATAL")
                else "high" if is_anomaly
                else "info"
            )
            alerts.append({
                "id": str(uuid.uuid4()),
                "service": component_to_service(parsed["component"]),
                "alertname": mask_template(parsed["content"]),
                "message": parsed["content"],
                "severity": severity,
                "status": "firing" if is_anomaly else "resolved",
                "timestamp": ts.isoformat(timespec="seconds"),
                "source": "loghub-hdfs",
                "assignee": "n/a",
                "dismissed": not is_anomaly,
                "ground_truth": label,  # real dataset label: Normal | Anomaly
                "block_id": block_id,
            })

    for block_id in anomaly_block_ids:
        emit(block_id, "Anomaly", grouped["Anomaly"][block_id])
    for block_id in normal_selected:
        emit(block_id, "Normal", grouped["Normal"][block_id])

    alerts.sort(key=lambda a: a["timestamp"])
    return alerts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cache-dir", type=str, default=str(Path(__file__).parent / ".cache" / "loghub_hdfs"))
    parser.add_argument("--out", type=str, default=str(Path(__file__).parent / "loghub_hdfs_alerts.json"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    extract_dir = download_and_extract(Path(args.cache_dir))
    log_path, label_path = find_dataset_files(extract_dir)

    labels = load_anomaly_labels(label_path)
    total_anomaly = sum(1 for v in labels.values() if v == "Anomaly")
    total_normal = sum(1 for v in labels.values() if v == "Normal")
    print(f"Real ground truth: {len(labels)} blocks total "
          f"({total_anomaly} Anomaly, {total_normal} Normal, "
          f"{100 * total_anomaly / len(labels):.2f}% anomalous)")

    print("Scanning raw log (single pass, streaming)...")
    grouped = group_lines_by_block(log_path, labels)
    print(f"Collected lines for {len(grouped['Anomaly'])} anomalous blocks, "
          f"{len(grouped['Normal'])} normal blocks")

    alerts = build_alerts(grouped, args.seed)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(alerts, f, indent=2)

    by_truth: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    blocks_used = len({a["block_id"] for a in alerts})
    for a in alerts:
        by_truth[a["ground_truth"]] = by_truth.get(a["ground_truth"], 0) + 1
        by_severity[a["severity"]] = by_severity.get(a["severity"], 0) + 1

    print(f"\nWrote {len(alerts)} real alerts from {blocks_used} blocks to {args.out}")
    print("By ground truth label:")
    for k, v in sorted(by_truth.items()):
        print(f"  {k}: {v}")
    print("By derived severity:")
    for k, v in sorted(by_severity.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
