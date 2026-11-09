#!/usr/bin/env bash
# Downloads XAUUSD M1 bars 2009-2026 (HistData format, ~390 MB) from the Hugging Face dataset
# fokan/xauusd-2009-2026 into ./data and converts them to German time (data/xau_m1_de.pkl).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data
for y in 2009 2010 2011 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 202601; do
  [ -s "data/XAU_$y.csv" ] || curl -sSL --retry 3 -o "data/XAU_$y.csv" \
    "https://huggingface.co/datasets/fokan/xauusd-2009-2026/resolve/main/DAT_MT_XAUUSD_M1_$y.csv" &
done
wait
python3 prepare_data.py data
