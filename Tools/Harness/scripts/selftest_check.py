#!/usr/bin/env python3
"""Harness only: checks the results of ./run_checks.sh --selftest against selftest/expectations.json."""

import argparse
import json
import sys
from pathlib import Path


def row_lookup(rows):
    result = {}
    for row in rows:
        part = row.get("part")
        key = part if part in ("lint", "structure") else f"{part}/{row.get('pass')}"
        result[key] = row
    return result


def check_variant(harness: Path, variant: str, expected: dict) -> list:
    problems = []
    work = harness / ".work" / f"selftest-{variant}"
    exit_file = harness / ".work" / f"selftest-{variant}.exit"
    actual_exit = int(exit_file.read_text().strip()) if exit_file.is_file() else None
    if actual_exit != expected["exit"]:
        problems.append(f"Exit-Code {actual_exit}, erwartet {expected['exit']}")
    summary_json = work / "summary.json"
    summary_txt = work / "summary.txt"
    if not summary_json.is_file() or not summary_txt.is_file():
        return problems + ["keine summary.json/summary.txt"]
    rows = row_lookup(json.loads(summary_json.read_text(encoding="utf-8"))["rows"])
    text = summary_txt.read_text(encoding="utf-8")
    for key, checks in expected.get("rows", {}).items():
        row = rows.get(key)
        if row is None:
            problems.append(f"Zeile {key} fehlt")
            continue
        for check, value in checks.items():
            field, _, mode = check.partition("_")
            actual = row.get(field)
            if isinstance(actual, list):
                actual = len(actual)
            if actual is None:
                problems.append(f"{key}: Feld {field} fehlt")
            elif mode == "min" and actual < value:
                problems.append(f"{key}: {field} = {actual}, erwartet >= {value}")
            elif mode == "" and actual != value:
                problems.append(f"{key}: {field} = {actual}, erwartet {value}")
    for snippet in expected.get("summary_contains", []):
        if snippet not in text:
            problems.append(f"summary.txt enthaelt nicht: {snippet!r}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--harness", required=True)
    args = parser.parse_args()
    harness = Path(args.harness)
    expectations = json.loads((harness / "selftest" / "expectations.json").read_text(encoding="utf-8"))
    failed = False
    for variant in ("clean", "faulty"):
        problems = check_variant(harness, variant, expectations[variant])
        if problems:
            failed = True
            print(f"[selftest] {variant}: FEHLGESCHLAGEN")
            for problem in problems:
                print(f"    - {problem}")
        else:
            print(f"[selftest] {variant}: OK")
    print("[selftest] Ergebnis: " + ("FEHLGESCHLAGEN" if failed else "OK"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
