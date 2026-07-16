"""AIOps Challenge 2020 loader — PS10's second named data source
("AIOps Challenge datasets (publicly released)"). Converts the dataset's real
fault log into the same Alert schema the Loghub loader and synthetic
generator produce.

This is an OFFLINE preprocessing script. Run with --inspect first to see the
real fault CSV header/rows before any field-mapping code is trusted (the
dataset ships with no documented schema and Chinese column names).

Source: https://github.com/NetManAIOps/AIOps-Challenge-2020-Data (README
points at a single bundled archive on Google Drive, id below, md5
fac7fe1b4e048c81ef88874334b73534, real size 2.9 GB — confirmed via the
Drive "can't scan for viruses" interstitial: AIOps挑战赛2020预赛数据.zip).
The archive bundles several days of raw business/infrastructure metrics and
traces (业务指标/平台指标/调用链指标) alongside the one file this script
actually wants: 故障整理（预赛）.csv, a real pre-labeled fault log ("each
line describes a failure with its time, fault type, fault location").
Turning the raw metrics into alerts would require building real
anomaly-detection from scratch — exactly the fabrication risk this project
avoids — so this script never touches them.

Downloading all 2.9 GB for one small CSV would be wasteful and slow, so this
uses HTTP Range requests (Google Drive's endpoint advertises
`Accept-Ranges: bytes`) to read the ZIP's central directory and pull out only
the fault CSV's compressed bytes — the same technique tools like `remotezip`
use, implemented here with the standard library only.

Usage:
    python aiops_challenge_loader.py --inspect   # fetch + show real schema only
    python aiops_challenge_loader.py             # fetch + write alerts json
"""

from __future__ import annotations

import argparse
import csv
import http.cookiejar
import io
import json
import re
import sys
import urllib.parse
import urllib.request
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

GDRIVE_FILE_ID = "1nkEsD1g7THm_T58KwUQZ7o-b174fdx-n"
FAULT_CSV_NAME_FRAGMENT = "故障整理"


def gdrive_resolve_download_url(file_id: str) -> tuple[str, urllib.request.OpenerDirector]:
    """Google Drive's large-file flow: the first request returns an HTML
    interstitial (can't scan for viruses) with a form whose action + hidden
    inputs carry the real confirm token. Returns the final direct-download
    URL and the cookie-carrying opener needed to actually fetch it."""
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    base = "https://drive.google.com/uc?export=download"

    resp = opener.open(f"{base}&id={file_id}", timeout=60)
    content_type = resp.headers.get("Content-Type", "")
    if "text/html" not in content_type:
        return resp.geturl(), opener

    html = resp.read().decode("utf-8", errors="ignore")
    action_match = re.search(r'action="([^"]*drive\.usercontent\.google\.com/download[^"]*)"', html)
    if not action_match:
        raise RuntimeError(
            "Could not find the Google Drive download form — the interstitial "
            "flow may have changed. First 500 chars:\n" + html[:500]
        )
    action_url = action_match.group(1).replace("&amp;", "&")
    inputs = dict(re.findall(r'<input type="hidden" name="([^"]+)" value="([^"]*)"', html))
    qs = urllib.parse.urlencode(inputs)
    final_url = f"{action_url}&{qs}" if "?" in action_url else f"{action_url}?{qs}"
    return final_url, opener


class HTTPRangeFile(io.RawIOBase):
    """A read-only, seekable file-like object backed by HTTP Range requests
    — lets zipfile.ZipFile read a remote archive's central directory and one
    specific entry's bytes without downloading the whole file."""

    def __init__(self, url: str, opener: urllib.request.OpenerDirector, size: int):
        self.url = url
        self.opener = opener
        self.size = size
        self.pos = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        return self.pos

    def tell(self) -> int:
        return self.pos

    def readinto(self, b) -> int:
        n = len(b)
        if n == 0 or self.pos >= self.size:
            return 0
        end = min(self.pos + n, self.size) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        data = self.opener.open(req, timeout=60).read()
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


def open_remote_zip(file_id: str) -> zipfile.ZipFile:
    url, opener = gdrive_resolve_download_url(file_id)
    head = opener.open(urllib.request.Request(url, method="HEAD"), timeout=60)
    size = int(head.headers.get("Content-Length", 0))
    accepts_ranges = head.headers.get("Accept-Ranges", "").lower() == "bytes"
    print(f"Remote archive: {size / 1e9:.2f} GB, Accept-Ranges={accepts_ranges}")
    if not accepts_ranges or not size:
        raise RuntimeError(
            f"Server does not support byte-range requests (Accept-Ranges={accepts_ranges!r}, "
            f"size={size}) — cannot read just the central directory without downloading "
            "the full 2.9GB archive."
        )
    return zipfile.ZipFile(HTTPRangeFile(url, opener, size))


def find_fault_csv_bytes(zf: zipfile.ZipFile) -> bytes:
    names = zf.namelist()
    print(f"Remote archive contains {len(names)} entries. First 20:")
    for n in names[:20]:
        print(f"  {n}")
    match = next((n for n in names if FAULT_CSV_NAME_FRAGMENT in n), None)
    if match is None:
        for n in names:
            try:
                fixed = n.encode("cp437").decode("gbk")
            except (UnicodeDecodeError, UnicodeEncodeError):
                continue
            if FAULT_CSV_NAME_FRAGMENT in fixed:
                match = n
                break
    if match is None:
        raise FileNotFoundError(
            f"No entry containing '{FAULT_CSV_NAME_FRAGMENT}' found. All entries: {names}"
        )
    print(f"Found fault CSV entry: {match} ({zf.getinfo(match).file_size} bytes uncompressed)")
    return zf.read(match)


# Real header, confirmed by --inspect against the live dataset:
#   index, object, fault_desrcibtion, kpi, name, container, log_time,
#   log_block, block, start_time, duration
# object in {docker, os, db}; fault_desrcibtion in {CPU fault, network delay,
# network loss, db connection limit, db  close}; duration is always "5min"
# (every row is a real 5-minute fault-injection event, not a synthetic guess).
#
# There is no severity column in the source data, so severity is a disclosed
# rule keyed on the real fault category — not a per-row invented value:
SEVERITY_BY_FAULT = {
    "CPU fault": "high",
    "network delay": "info",
    "network loss": "high",
    "db connection limit": "critical",
    "db  close": "critical",  # DB availability toggled off — most severe category
}


def build_alerts(rows: list[dict]) -> list[dict]:
    alerts = []
    for row in rows:
        fault = row["fault_desrcibtion"].strip()
        name = row["name"].strip()
        obj = row["object"].strip()
        container = row["container"].strip()
        kpi = row["kpi"].strip()
        duration = row["duration"].strip()

        ts = datetime.strptime(row["log_time"].strip(), "%Y/%m/%d %H:%M")

        detail_bits = []
        if container:
            detail_bits.append(f"container {container}")
        if kpi:
            detail_bits.append(f"kpi: {kpi}")
        if duration:
            detail_bits.append(f"duration {duration}")
        detail = f" ({', '.join(detail_bits)})" if detail_bits else ""
        message = f"{fault} injected on {name}{detail}"

        alerts.append({
            "id": str(uuid.uuid4()),
            "service": name,
            "alertname": fault,
            "message": message,
            "severity": SEVERITY_BY_FAULT.get(fault, "info"),
            "status": "resolved",  # documented past fault-injection event with known duration
            "timestamp": ts.isoformat(timespec="seconds"),
            "source": "aiops-challenge-2020",
            "assignee": "n/a",
            "dismissed": True,
            "ground_truth": fault,  # real dataset label: the injected fault category
            "fault_object": obj,  # real category: docker | os | db
        })

    alerts.sort(key=lambda a: a["timestamp"])
    return alerts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cache-dir", type=str, default=str(Path(__file__).parent / ".cache" / "aiops_challenge"))
    parser.add_argument("--out", type=str, default=str(Path(__file__).parent / "aiops_challenge_alerts.json"))
    parser.add_argument("--inspect", action="store_true", help="download + print real schema, write nothing")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    fault_csv_cache = cache_dir / "fault_log_raw.csv.bin"

    if fault_csv_cache.exists():
        print(f"Using cached fault CSV bytes {fault_csv_cache}")
        csv_bytes = fault_csv_cache.read_bytes()
    else:
        print(f"Opening remote AIOps Challenge 2020 archive (Google Drive id={GDRIVE_FILE_ID}) "
              "via HTTP range requests — reading only the central directory + fault CSV, "
              "not the full 2.9GB...")
        zf = open_remote_zip(GDRIVE_FILE_ID)
        csv_bytes = find_fault_csv_bytes(zf)
        fault_csv_cache.write_bytes(csv_bytes)
        print(f"Cached {len(csv_bytes)} bytes -> {fault_csv_cache}")

    # Try common encodings for a Chinese-origin CSV.
    text = None
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
        try:
            text = csv_bytes.decode(enc)
            print(f"Decoded fault CSV as {enc}")
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise RuntimeError("Could not decode fault CSV with utf-8/gbk/gb18030")

    raw_rows = list(csv.reader(io.StringIO(text)))
    print(f"\nFault CSV: {len(raw_rows)} rows total (including header)")
    print("Header:", raw_rows[0])
    print("First 5 data rows:")
    for r in raw_rows[1:6]:
        print(" ", r)

    if args.inspect:
        print("\n--inspect mode: stopping before writing alerts.json")
        return

    rows = list(csv.DictReader(io.StringIO(text)))
    alerts = build_alerts(rows)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(alerts, f, indent=2, ensure_ascii=False)

    by_truth: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    for a in alerts:
        by_truth[a["ground_truth"]] = by_truth.get(a["ground_truth"], 0) + 1
        by_severity[a["severity"]] = by_severity.get(a["severity"], 0) + 1

    print(f"\nWrote {len(alerts)} real alerts to {args.out}")
    print("By real fault category (ground truth):")
    for k, v in sorted(by_truth.items()):
        print(f"  {k}: {v}")
    print("By derived severity:")
    for k, v in sorted(by_severity.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
