#!/usr/bin/env python3
"""Render selected Mermaid planning diagrams from docs/ as PNG images.

The diagrams are read straight from the Markdown documents (first ```mermaid block after a given heading), so the images
always show what the documents currently say. Rendering uses mermaid-cli (mmdc) with a headless Chromium.

Usage:
    python3 -I Tools/Preview/diagramme_rendern.py --mmdc /path/to/mmdc [--puppeteer /path/to/puppeteer.json] \
        [--out OUTPUT_DIR] [--repo REPO_ROOT]

Without --mmdc the environment variable MMDC is used, then "mmdc" from PATH.
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

# (output file, Markdown file relative to the repo, heading that starts the section, short German description, mermaid config)
# The state diagram and the region graph use the ELK layout: with the default layout (dagre) several edge labels overlap
# or sit on the wrong edge.
DIAGRAMS = [
    ("07_spielzustaende.png", "docs/Technik/01_Architektur.md", "### 4.4 GameStateManager",
     "Spielzustände (GameStateManager)", {"layout": "elk"}),
    ("08_assembly_graph.png", "docs/Technik/01_Architektur.md", "### 3.4 Assembly-Graph",
     "Assembly-Graph", None),
    ("09_regionen.png", "docs/GDD/01_Welt_Story_Fraktionen.md", "### 3.2 Nachbarschaft der Regionen",
     "Nachbarschaft der Regionen", {"layout": "elk"}),
    ("10_session_loop.png", "docs/GDD/00_Vision_und_Ueberblick.md", "### Session (~1–2 h)",
     "Session-Loop (Core Loops)", None),
]


def first_mermaid_after(path, heading):
    """Returns the source of the first mermaid block after the heading, before the next heading of the same or a higher level."""
    lines = path.read_text(encoding="utf-8").splitlines()
    level = len(heading) - len(heading.lstrip("#"))
    start = None
    for i, line in enumerate(lines):
        if line.strip().startswith(heading):
            start = i + 1
            break
    if start is None:
        raise ValueError("Überschrift nicht gefunden: " + heading + " in " + str(path))

    i = start
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped.startswith("#") and not stripped.startswith("#" * (level + 1)):
            break
        if stripped == "```mermaid":
            j = i + 1
            while j < len(lines) and lines[j].strip() != "```":
                j += 1
            return "\n".join(lines[i + 1:j])
        i += 1
    raise ValueError("Kein Mermaid-Block nach " + heading + " in " + str(path))


def main():
    here = pathlib.Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Mermaid-Diagramme aus docs/ als PNG rendern.")
    parser.add_argument("--repo", default=str(here.parent.parent), help="Wurzel des Repos")
    parser.add_argument("--out", default=str(here / "Ausgabe"), help="Ausgabeordner")
    parser.add_argument("--mmdc", default=os.environ.get("MMDC") or shutil.which("mmdc") or "mmdc", help="Pfad zu mmdc")
    parser.add_argument("--puppeteer", default=os.environ.get("MMDC_PUPPETEER"), help="puppeteer.json für mmdc (optional)")
    parser.add_argument("--width", type=int, default=1600, help="Breite in Pixeln")
    parser.add_argument("--scale", type=float, default=2.0, help="Pixeldichte (2 = scharf beim Zoomen)")
    args = parser.parse_args()

    repo = pathlib.Path(args.repo)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name, rel, heading, title, config in DIAGRAMS:
            source = first_mermaid_after(repo / rel, heading)
            src = pathlib.Path(tmp) / (name + ".mmd")
            src.write_text(source + "\n", encoding="utf-8")
            target = out / name
            command = [args.mmdc, "-i", str(src), "-o", str(target), "-w", str(args.width), "-b", "white", "-s", str(args.scale)]
            if args.puppeteer:
                command[1:1] = ["-p", args.puppeteer]
            if config:
                config_file = pathlib.Path(tmp) / (name + ".json")
                config_file.write_text(json.dumps(config), encoding="utf-8")
                command[1:1] = ["-c", str(config_file)]
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode != 0 or not target.exists():
                failed += 1
                print("FEHLER", name, result.stderr.strip()[-800:])
            else:
                print("OK", target, "<-", rel, heading, "(" + title + ")")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
