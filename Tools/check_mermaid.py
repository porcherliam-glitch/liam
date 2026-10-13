#!/usr/bin/env python3
"""Extract every ```mermaid block from Markdown files and render it with mmdc.

Usage: python3 -I check_mermaid.py <file-or-dir> [...]
Prints one line per block (OK/FAIL) and the mmdc error for failures.
Exit code 1 if any block fails.
"""
import os
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
MMDC = HERE / "node_modules" / ".bin" / "mmdc"
PCONF = HERE / "puppeteer.json"
FENCE = re.compile(r"^```mermaid\s*$")


def blocks(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        if FENCE.match(lines[i].strip()):
            start = i + 1
            j = start
            while j < len(lines) and lines[j].strip() != "```":
                j += 1
            yield start + 1, "\n".join(lines[start:j])
            i = j + 1
        else:
            i += 1


def files(args):
    for a in args:
        p = pathlib.Path(a)
        if p.is_dir():
            yield from sorted(p.rglob("*.md"))
        else:
            yield p


def main():
    failed = 0
    total = 0
    for f in files(sys.argv[1:]):
        for line, src in blocks(f):
            total += 1
            with tempfile.TemporaryDirectory() as td:
                inp = pathlib.Path(td) / "in.mmd"
                out = pathlib.Path(td) / "out.svg"
                inp.write_text(src, encoding="utf-8")
                r = subprocess.run(
                    [str(MMDC), "-q", "-p", str(PCONF), "-i", str(inp), "-o", str(out)],
                    capture_output=True, text=True, timeout=120,
                )
                ok = r.returncode == 0 and out.exists()
            if ok:
                print(f"OK   {f}:{line}")
            else:
                failed += 1
                err = (r.stderr or r.stdout).strip().splitlines()
                msg = "\n       ".join(err[:8])
                print(f"FAIL {f}:{line}\n       {msg}")
    print(f"\n{total - failed}/{total} Mermaid-Bloecke OK")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
