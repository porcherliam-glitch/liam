#!/usr/bin/env bash
# Downloads OANDA XAUUSD 1-minute candles 2006-today (~170 MB, UTC timestamps) from the Hugging Face
# dataset bunqi/OANDA_XAUUSD_Gold into ./data/oanda (used by step7 and step8).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data/oanda
curl -sS "https://huggingface.co/api/datasets/bunqi/OANDA_XAUUSD_Gold/tree/main/1" \
  | python3 -c "import sys, json; [print(f['path']) for f in json.load(sys.stdin) if f['path'].endswith('.parquet')]" \
  | while read -r f; do
      out="data/oanda/$(basename "$f")"
      [ -s "$out" ] || curl -sSL --retry 3 -o "$out" "https://huggingface.co/datasets/bunqi/OANDA_XAUUSD_Gold/resolve/main/$f"
    done
ls data/oanda | wc -l
