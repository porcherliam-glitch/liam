#!/usr/bin/env bash
# Renders all preview images, videos and planning diagrams of the test ground (Blender rebuild, no Unity needed)
# and the HTML rebuild of the user interface (Tools/Preview/ui).
# Usage: Tools/Preview/alles_rendern.sh [OUTPUT_DIR]
# Environment: BLENDER (path to blender), STILL_SAMPLES (default 48), VIDEO_SAMPLES (default 16),
#              MMDC and MMDC_PUPPETEER (mermaid-cli for the diagrams, optional).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$HERE/Ausgabe}"
BLENDER="${BLENDER:-blender}"
STILL_SAMPLES="${STILL_SAMPLES:-48}"
VIDEO_SAMPLES="${VIDEO_SAMPLES:-16}"
mkdir -p "$OUT"
cd "$REPO"

echo "== Bilder (Cycles, $STILL_SAMPLES Samples) =="
"$BLENDER" -b -P "$HERE/testgelaende_preview.py" -- --job alle_bilder --samples "$STILL_SAMPLES" --out "$OUT"
python3 -I "$HERE/nachbearbeiten.py" bilder --dir "$OUT"

echo "== Videos =="
# EEVEE needs a display. On Linux servers xvfb-run provides a virtual one; without any display Cycles is used
# (same look, but about 4x slower).
if [[ "$(uname)" == Linux && -z "${DISPLAY:-}" ]]; then
  if command -v xvfb-run >/dev/null 2>&1; then
    RUN=(xvfb-run -a -s "-screen 0 1920x1080x24" "$BLENDER"); ENGINE=eevee
  else
    RUN=("$BLENDER"); ENGINE=cycles
  fi
else
  RUN=("$BLENDER"); ENGINE=eevee
fi
rm -rf "$OUT/05_rundflug_frames" "$OUT/06_sprungtest_frames"
# Both videos at the same time: on 4 CPU cores this was about 10 % faster than one after the other (22 instead of 25 min).
pids=()
for job in rundflug sprungtest; do
  "${RUN[@]}" -b -P "$HERE/testgelaende_preview.py" -- --job "$job" --engine "$ENGINE" --samples "$VIDEO_SAMPLES" --out "$OUT" \
    > "$OUT/$job.log" 2>&1 &
  pids+=($!)
  sleep 20   # let the first one compile its shaders before the second starts
done
for pid in "${pids[@]}"; do wait "$pid"; done
python3 -I "$HERE/nachbearbeiten.py" video --dir "$OUT" --name 05_rundflug
python3 -I "$HERE/nachbearbeiten.py" video --dir "$OUT" --name 06_sprungtest

echo "== Diagramme =="
if [[ -n "${MMDC:-}" ]] || command -v mmdc >/dev/null 2>&1; then
  python3 -I "$HERE/diagramme_rendern.py" --out "$OUT" ${MMDC_PUPPETEER:+--puppeteer "$MMDC_PUPPETEER"}
else
  echo "mermaid-cli (mmdc) nicht gefunden - Diagramme übersprungen."
fi
echo "== Oberfläche (HTML-Nachbau) =="
if command -v node >/dev/null 2>&1; then
  node "$HERE/ui/vorschau_ui.cjs" --out "$OUT/ui" || echo "UI-Vorschau fehlgeschlagen (siehe Meldungen oben)."
else
  echo "Node.js nicht gefunden - UI-Vorschau übersprungen (siehe Tools/Preview/ui/README.md)."
fi
echo "Fertig: $OUT"
