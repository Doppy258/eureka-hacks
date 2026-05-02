#!/usr/bin/env python3
"""Print export REMOTE_TRIBE_URL=.../api/analyze from a running ngrok agent.

Requires the ngrok agent to be running locally (e.g. `ngrok http 8000`).
The agent exposes http://127.0.0.1:4040/api/tunnels (see ngrok docs).

Usage:
  python scripts/ngrok_print_analyze_url.py
  python scripts/ngrok_print_analyze_url.py --api http://127.0.0.1:4040
"""

from __future__ import annotations

import argparse
import json
import sys
from urllib.error import URLError
from urllib.request import urlopen


def pick_https_base(tunnels: list[dict]) -> str | None:
    for t in tunnels:
        u = (t.get("public_url") or "").strip()
        if u.startswith("https://"):
            return u.rstrip("/")
    return None


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--api",
        default="http://127.0.0.1:4040/api/tunnels",
        help="ngrok local inspect API URL",
    )
    args = p.parse_args()

    try:
        with urlopen(args.api, timeout=5) as resp:
            data = json.load(resp)
    except URLError as e:
        print(
            "Could not reach ngrok local API (is `ngrok http 8000` running on this machine?).",
            e,
            file=sys.stderr,
        )
        return 1
    except Exception as e:
        print("Failed to read tunnels:", e, file=sys.stderr)
        return 1

    tunnels = data.get("tunnels") or []
    base = pick_https_base(tunnels)
    if not base:
        print("No https:// tunnel found. Raw tunnels:", tunnels, file=sys.stderr)
        return 1

    analyze = f"{base}/api/analyze"
    print(f'export REMOTE_TRIBE_URL="{analyze}"')
    print("# Paste the export line above into the terminal where you run the Mac backend.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
