#!/usr/bin/env python3
"""Harness only: collects build logs, test results and lint findings; prints the summary.

Exit code: 0 = alles gruen, 1 = Fehler im Code (Compiler, Tests, Regel-Lint, Struktur),
2 = Problem der Harness-Infrastruktur (Restore, MSBuild, fehlende Ergebnisse).
"""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import csharp_text  # noqa: E402
from unity_project import PART_EDITOR, PART_LABELS, PART_OTHER, PART_RUNTIME, PART_TESTS  # noqa: E402

DIAG_RE = re.compile(
    r"^\s*(?P<file>.*?)(?:\((?P<line>\d+)(?:,(?P<col>\d+))?(?:,\d+,\d+)?\))?\s*:\s*"
    r"(?P<sev>error|warning)\s+(?P<code>[A-Za-z]+\d+)\s*:\s*(?P<msg>.*?)"
    r"(?:\s+\[(?P<proj>[^\[\]]+\.(?:csproj|sln|proj))(?:::[^\]]*)?\])?\s*$")
NODE_PREFIX_RE = re.compile(r"^\s*\d+(?::\d+)?>")
CASCADE_CODES = {"CS0006", "MSB3202", "NETSDK1004"}
UNITY_RUNTIME_RE = re.compile(r"ECall|InternalCall|SecurityException|is a Unity 6 API|AsyncOperation needs the Unity engine|UnityEngine\.\w+\.Internal_|"
                              r"MissingMethodException.*UnityEngine")
TRX_NS = {"t": "http://microsoft.com/schemas/VisualStudio/TeamTest/2010"}
DETAIL_LIMIT = 60


class Whitelist:
    """unity6_whitelist.txt: CODE[,CODE] | SYMBOL | [MECHANISMUS |] BEGRUENDUNG"""

    def __init__(self, path: Path):
        self.entries: List[dict] = []
        if not path.is_file():
            return
        for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            fields = [f.strip() for f in line.split("|")]
            if len(fields) < 3:
                continue
            codes = {c.strip() for c in fields[0].split(",") if c.strip()}
            symbol = fields[1]
            if len(fields) >= 4 and fields[2].lower() in ("patch", "shim", "filter"):
                mechanism, reason = fields[2].lower(), " | ".join(fields[3:])
            else:
                mechanism, reason = "filter", " | ".join(fields[2:])
            pattern = re.compile(r"(?<!\w)" + re.escape(symbol).replace(r"\.", r"\s*\.\s*") + r"(?!\w)")
            self.entries.append({"codes": codes, "symbol": symbol, "mechanism": mechanism, "reason": reason,
                                 "line": number, "pattern": pattern})

    def match(self, code: str, message: str) -> Optional[dict]:
        for entry in self.entries:
            if (code in entry["codes"] or "*" in entry["codes"]) and entry["pattern"].search(message):
                return entry
        return None


def parse_log(path: Path) -> List[dict]:
    result = []
    if not path.is_file():
        return result
    for raw in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        # Parallel MSBuild prefixes lines with the node/project id ("6:6>").
        raw = NODE_PREFIX_RE.sub("", raw.lstrip("\ufeff"))
        match = DIAG_RE.match(raw)
        if not match:
            continue
        result.append({
            "file": match.group("file").strip(),
            "line": int(match.group("line")) if match.group("line") else None,
            "col": int(match.group("col")) if match.group("col") else None,
            "severity": match.group("sev"),
            "code": match.group("code"),
            "message": match.group("msg").strip(),
            "project": match.group("proj"),
        })
    return result


def parse_trx(path: Path) -> dict:
    result = {"passed": 0, "failed": 0, "skipped": 0, "total": 0, "failures": [], "skips": [], "ok": False}
    if not path.is_file():
        return result
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return result
    result["ok"] = True
    for res in root.iterfind(".//t:Results/t:UnitTestResult", TRX_NS):
        outcome = res.get("outcome", "")
        name = res.get("testName", "?")
        message = (res.findtext("t:Output/t:ErrorInfo/t:Message", default="", namespaces=TRX_NS) or "").strip()
        stack = (res.findtext("t:Output/t:ErrorInfo/t:StackTrace", default="", namespaces=TRX_NS) or "").strip()
        stdout = (res.findtext("t:Output/t:StdOut", default="", namespaces=TRX_NS) or "").strip()
        result["total"] += 1
        if outcome == "Passed":
            result["passed"] += 1
        elif outcome in ("NotExecuted", "Inconclusive", "Pending", "Disconnected", "Warning"):
            result["skipped"] += 1
            result["skips"].append({"test": name, "reason": message or stdout})
        else:
            result["failed"] += 1
            unity = bool(UNITY_RUNTIME_RE.search(message + "\n" + stack))
            result["failures"].append({"test": name, "message": message, "stack": stack, "unity_runtime": unity})
    return result


class Report:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.work = Path(args.work)
        self.model = json.loads((self.work / "model.json").read_text(encoding="utf-8"))
        self.project_root = Path(self.model["project"])
        self.whitelist = Whitelist(Path(args.whitelist))
        self.lines: List[str] = []
        self.rows: List[dict] = []
        self.exit_code = 0
        self.infra_errors: List[str] = []

    # ------------------------------------------------------------------ helpers
    def rel(self, path: str) -> str:
        try:
            return str(Path(path).resolve().relative_to(self.project_root))
        except (ValueError, OSError):
            return path

    def out(self, text: str = "") -> None:
        self.lines.append(text)

    def fmt_diag(self, diag: dict, passes: List[str]) -> str:
        location = self.rel(diag["file"]) if diag["file"] else "?"
        if diag["line"]:
            location += f"({diag['line']},{diag['col'] or 0})"
        suffix = f"  [{', '.join(passes)}]" if passes else ""
        return f"  {location}: {diag['severity']} {diag['code']}: {diag['message']}{suffix}"

    # ------------------------------------------------------------------ collect
    def collect_build(self) -> Dict[Tuple[str, str], dict]:
        """(row_key) -> {'errors': OrderedDict, 'warnings': OrderedDict, 'whitelisted': [...], 'cascade': [...]}"""
        rows: Dict[Tuple[str, str], dict] = OrderedDict()
        projects = dict(self.model["projects"])
        log_sets = []
        for pass_info in self.model["passes"]:
            pass_id = pass_info["id"]
            if not pass_info.get("solution"):
                continue
            status_file = self.work / pass_id / "build.status"
            status = status_file.read_text().strip() if status_file.is_file() else "missing"
            if status == "missing":
                self.infra_errors.append(f"Build-Durchlauf '{pass_id}' wurde nicht ausgefuehrt")
            log_sets.append((pass_id, self.work / pass_id))
        # Degraded test projects (scripts/degrade_tests.py) count for their original project.
        for original, entry in self.model.get("degraded", {}).items():
            projects[entry["csproj"]] = self.model["projects"][original]
            log_sets.append(("editor", Path(entry["csproj"]).parent))
        for pass_id, log_dir in log_sets:
            diags = parse_log(log_dir / "build.errors.log") + parse_log(log_dir / "build.warnings.log")
            for diag in diags:
                info = projects.get(diag["project"] or "")
                if info is None and diag["project"]:
                    info = projects.get(str(Path(diag["project"]).resolve()))
                if info is None:
                    if diag["severity"] == "error":
                        key = ("infra", pass_id)
                    else:
                        key = ("infra-warn", pass_id)
                elif info["variant"] == "compat":
                    key = ("compat", PART_TESTS)
                elif info["part"] == PART_TESTS:
                    key = ("build", PART_TESTS)
                else:
                    key = (pass_id, info["part"])
                row = rows.setdefault(key, {"errors": OrderedDict(), "warnings": OrderedDict(), "whitelisted": OrderedDict(),
                                            "cascade": OrderedDict()})
                ident = (diag["file"], diag["line"], diag["col"], diag["code"], diag["message"])
                label = pass_id + ("/unity-kompat" if key[0] == "compat" else "")
                if diag["severity"] == "error":
                    entry = self.whitelist.match(diag["code"], diag["message"])
                    if entry:
                        row["whitelisted"].setdefault(ident, (diag, entry, set()))[2].add(label)
                    elif diag["code"] in CASCADE_CODES:
                        row["cascade"].setdefault(ident, (diag, set()))[1].add(label)
                    else:
                        row["errors"].setdefault(ident, (diag, set()))[1].add(label)
                else:
                    row["warnings"].setdefault(ident, (diag, set()))[1].add(label)
        self.collect_not_built(rows)
        return rows

    def collect_not_built(self, rows) -> None:
        """Projects without output DLL and without own errors: skipped because a dependency failed."""
        configurations = {p["id"]: p["configuration"] for p in self.model["passes"]}
        failed_projects = set()
        for row in rows.values():
            for diag, _ in list(row["errors"].values()) + list(row["cascade"].values()):
                failed_projects.add(diag.get("project"))
            for diag, _, _ in row["whitelisted"].values():
                failed_projects.add(diag.get("project"))
        self.not_built = []

        def is_built(path: str) -> bool:
            info = self.model["projects"].get(path)
            if info is None:
                return True
            return (Path(path).parent / "bin" / configurations[info["pass"]] / f"{info['assembly']}.dll").is_file()

        ref_re = re.compile(r'<ProjectReference Include="([^"]+)"')
        for csproj, info in self.model["projects"].items():
            pass_id = info["pass"]
            if not (self.work / pass_id / "build.status").is_file():
                continue
            if is_built(csproj) or csproj in failed_projects:
                continue
            refs = ref_re.findall(Path(csproj).read_text(encoding="utf-8")) if Path(csproj).is_file() else []
            if not any(not is_built(ref) for ref in refs):
                self.infra_errors.append(f"Assembly '{info['assembly']}' ({pass_id}, {info['variant']}) wurde ohne Compilerfehler "
                                         f"nicht gebaut - siehe {self.work / pass_id / 'build.console.log'}")
                continue
            if info["variant"] == "compat":
                key = ("compat", PART_TESTS)
            elif info["part"] == PART_TESTS:
                key = ("build", PART_TESTS)
            else:
                key = (pass_id, info["part"])
            row = rows.setdefault(key, {"errors": OrderedDict(), "warnings": OrderedDict(), "whitelisted": OrderedDict(),
                                        "cascade": OrderedDict()})
            label = pass_id + ("/unity-kompat" if info["variant"] == "compat" else "")
            diag = {"file": csproj, "line": None, "col": None, "severity": "error", "code": "HARNESS",
                    "message": f"Assembly '{info['assembly']}' nicht gebaut - eine referenzierte Assembly ist fehlgeschlagen",
                    "project": csproj}
            row["cascade"].setdefault((csproj, None, None, "HARNESS", diag["message"]), (diag, set()))[1].add(label)
            self.not_built.append(info["assembly"])

    def collect_tests(self) -> List[dict]:
        results = []
        for test in self.model["test_projects"]:
            trx = self.work / "test-results" / f"{test['assembly']}.trx"
            status_file = self.work / "test-results" / f"{test['assembly']}.status"
            status = status_file.read_text().strip() if status_file.is_file() else "not-run"
            data = parse_trx(trx)
            data["assembly"] = test["assembly"]
            data["status"] = status
            data["dropped"] = test.get("dropped", [])
            results.append(data)
        return results

    def missing_packages(self) -> Dict[str, List[str]]:
        """assembly -> package assemblies it references that the harness does not have."""
        result: Dict[str, List[str]] = {}
        for note in self.model.get("notes", []):
            match = re.match(r"Paket-/Unity-Assembly '([^']+)'", note.get("text", ""))
            if match and note.get("assembly"):
                result.setdefault(note["assembly"], [])
                if match.group(1) not in result[note["assembly"]]:
                    result[note["assembly"]].append(match.group(1))
        return result

    def excluded_by_constraints(self) -> List[str]:
        """Assemblies with scripts that the editor pass skipped because of their defineConstraints."""
        result = []
        for asm in self.model["assemblies"]:
            reason = (asm.get("passes") or {}).get("editor")
            if asm.get("files") and reason and reason.startswith("defineConstraints"):
                result.append(asm["name"])
        return sorted(result)

    def unity6_usage(self) -> List[Tuple[dict, List[Tuple[str, int]]]]:
        entries = [e for e in self.whitelist.entries if e["mechanism"] in ("patch", "shim")]
        if not entries:
            return []
        hits = {id(e): [] for e in entries}
        seen_symbols = {}
        for entry in entries:
            seen_symbols.setdefault(entry["symbol"], entry)
        for asm in self.model["assemblies"]:
            for path in asm["files"]:
                src = csharp_text.load(path)
                for idx, line in enumerate(src.code_lines):
                    for symbol, entry in seen_symbols.items():
                        if entry["pattern"].search(line):
                            hits[id(entry)].append((self.rel(path), idx + 1))
        return [(e, hits[id(e)]) for e in seen_symbols.values() if hits[id(e)]]

    # ------------------------------------------------------------------ output
    def run(self) -> int:
        rows = self.collect_build()
        tests = self.collect_tests() if not self.args.no_tests else []
        lint = []
        lint_path = self.work / "lint.json"
        if not self.args.no_lint and lint_path.is_file():
            lint = json.loads(lint_path.read_text(encoding="utf-8"))
        notes = self.model.get("notes", [])

        self.print_details(rows, tests, lint, notes)
        self.print_summary(rows, tests, lint, notes)

        text = "\n".join(self.lines)
        print(text)
        (self.work / "summary.txt").write_text(text + "\n", encoding="utf-8")
        (self.work / "summary.json").write_text(json.dumps({"exit_code": self.exit_code, "rows": self.rows},
                                                           indent=2, ensure_ascii=False), encoding="utf-8")
        return self.exit_code

    def print_details(self, rows, tests, lint, notes) -> None:
        verbose = self.args.verbose
        all_errors, all_warnings, all_white, all_cascade = [], [], [], []
        for key, row in rows.items():
            all_errors += [(d, sorted(p)) for d, p in row["errors"].values()]
            all_warnings += [(d, sorted(p)) for d, p in row["warnings"].values()]
            all_white += [(d, e, sorted(p)) for d, e, p in row["whitelisted"].values()]
            all_cascade += [(d, sorted(p)) for d, p in row["cascade"].values()]

        def unique_by_text(items):
            seen = OrderedDict()
            for item in items:
                diag, passes = item[0], item[-1]
                ident = (diag["file"], diag["line"], diag["col"], diag["code"], diag["message"])
                if ident in seen:
                    seen[ident] = (seen[ident][0], sorted(set(seen[ident][-1]) | set(passes)))
                else:
                    seen[ident] = (diag, passes)
            return list(seen.values())

        errors = unique_by_text(all_errors)
        warnings = unique_by_text(all_warnings)
        if errors:
            self.out("=== Compiler-Fehler ===")
            player_only = 0
            for diag, passes in errors:
                self.out(self.fmt_diag(diag, passes))
                if passes and not any(p.startswith("editor") for p in passes):
                    player_only += 1
            if player_only:
                self.out(f"  Hinweis: {player_only} Fehler nur im Player-Build - UnityEditor-Code ohne #if UNITY_EDITOR "
                         "oder Referenz auf eine Editor-Assembly?")
            missing = self.missing_packages()
            projects = self.model["projects"]
            in_package_asms = [d for d, _ in errors
                               if projects.get(d.get("project") or "", {}).get("assembly") in missing]
            if in_package_asms:
                names = sorted({p for d in in_package_asms for p in missing[projects[d["project"]]["assembly"]]})
                self.out(f"  Hinweis: {len(in_package_asms)} Fehler in Assemblies, die Unity-Pakete referenzieren "
                         f"({', '.join(names)}) - diese Pakete fehlen im Harness.")
            self.out()
        if all_cascade:
            self.out("=== Folgefehler (Assembly nicht gebaut, weil eine Abhaengigkeit fehlschlug) ===")
            for diag, passes in unique_by_text(all_cascade)[:20]:
                if diag["code"] == "HARNESS":
                    self.out(f"  {diag['message']}  [{', '.join(passes)}]")
                else:
                    self.out(self.fmt_diag(diag, passes))
            self.out()
        if warnings:
            self.out("=== Compiler-/Analyzer-Warnungen ===")
            shown = warnings if verbose else warnings[:DETAIL_LIMIT]
            for diag, passes in shown:
                self.out(self.fmt_diag(diag, passes))
            if len(shown) < len(warnings):
                self.out(f"  ... {len(warnings) - len(shown)} weitere (--verbose)")
            self.out()
        if all_white:
            self.out("=== Whitelist (Unity-6-APIs, nicht gezaehlt) ===")
            merged = OrderedDict()
            for diag, entry, passes in all_white:
                ident = (diag["file"], diag["line"], diag["col"], diag["code"], diag["message"])
                if ident in merged:
                    merged[ident][2].update(passes)
                else:
                    merged[ident] = (diag, entry, set(passes))
            for diag, entry, passes in merged.values():
                self.out(self.fmt_diag(diag, sorted(passes)))
                self.out(f"      -> Whitelist Zeile {entry['line']}: {entry['symbol']} - {entry['reason']}")
            self.out("  Hinweis: eine Assembly mit gefilterten Fehlern wird trotzdem nicht gebaut (Folgefehler moeglich);")
            self.out("           dauerhaft besser als Shim (shims/) oder Patch (patches/Unity6Patches) ergaenzen.")
            self.out()

        usage = self.unity6_usage()
        if usage:
            self.out("=== Unity-6-APIs im Code (per Shim/Patch kompiliert - Verhalten nur in Unity 6.3 pruefbar) ===")
            for entry, hits in usage:
                files = OrderedDict()
                for path, line in hits:
                    files.setdefault(path, []).append(line)
                where = "; ".join(f"{p}:{','.join(map(str, ls[:6]))}" for p, ls in list(files.items())[:4])
                more = f" (+{len(files) - 4} Dateien)" if len(files) > 4 else ""
                self.out(f"  {entry['symbol']} [{entry['mechanism']}]: {len(hits)} Stelle(n) - {where}{more}")
            self.out()

        failures = [(t, f) for t in tests for f in t["failures"]]
        if failures:
            self.out("=== Fehlgeschlagene Tests ===")
            for test, failure in failures:
                first = failure["message"].splitlines()[0] if failure["message"] else "(keine Meldung)"
                hint = "  [ruft Unity-Laufzeit auf - nur in Unity ausfuehrbar; reine Logik verletzt?]" if failure["unity_runtime"] else ""
                self.out(f"  {test['assembly']}: {failure['test']}: {first}{hint}")
                if verbose and failure["stack"]:
                    for line in failure["stack"].splitlines()[:8]:
                        self.out("      " + line.strip())
            self.out()
        skips = [(t, s) for t in tests for s in t["skips"]]
        if skips:
            self.out("=== Uebersprungene Tests ===")
            for test, skip in skips[: (None if verbose else 20)]:
                reason = skip["reason"].splitlines()[0] if skip["reason"] else ""
                self.out(f"  {test['assembly']}: {skip['test']}: {reason}")
            if not verbose and len(skips) > 20:
                self.out(f"  ... {len(skips) - 20} weitere (--verbose)")
            self.out()

        lint_shown = [f for f in lint if f["level"] in ("error", "warning") or verbose]
        if lint_shown:
            self.out("=== Regel-Lint (heuristisch) ===")
            order = {"error": 0, "warning": 1, "info": 2}
            lint_shown.sort(key=lambda f: (order.get(f["level"], 3), f["file"] or "", f["line"] or 0))
            limit = None if verbose else DETAIL_LIMIT
            for finding in lint_shown[:limit]:
                location = self.rel(finding["file"]) if finding["file"] else finding["assembly"]
                if finding["line"]:
                    location += f"({finding['line']})"
                self.out(f"  {location}: {finding['level']} {finding['rule']}: {finding['message']}")
            if limit and len(lint_shown) > limit:
                self.out(f"  ... {len(lint_shown) - limit} weitere (--verbose)")
            self.out()

        shown_notes = [n for n in notes if n["level"] in ("error", "warning") or verbose]
        infos = [n for n in notes if n["level"] == "info"]
        if shown_notes or infos:
            self.out("=== Hinweise zu Assemblies/Referenzen ===")
            seen = set()
            for note in shown_notes + infos:
                ident = (note["level"], note.get("assembly"), note["text"])
                if ident in seen:
                    continue
                seen.add(ident)
                where = note.get("assembly") or "-"
                pass_id = f" ({note['pass']})" if note.get("pass") else ""
                self.out(f"  {note['level']}: {where}{pass_id}: {note['text']}")
            self.out()

        if self.infra_errors:
            self.out("=== Harness-Infrastruktur ===")
            for text in self.infra_errors:
                self.out("  " + text)
            self.out()

    def print_summary(self, rows, tests, lint, notes) -> None:
        width = 78
        passes = {p["id"]: p for p in self.model["passes"]}
        self.out("=" * width)
        self.out(" Unity-Harness - Zusammenfassung")
        self.out(f" Projekt: {self.project_root}")
        refs = "Unity-6-Patches aktiv" if self.model.get("refs_mode") == "patched" else "ohne Unity-6-Patches (nur Whitelist)"
        self.out(f" Referenzen: UnityEngine 2021.3.33 + UnityEditor 2021.1.14 + Shims, {refs}")
        packages = self.model.get("packages") or {}
        versions = packages.get("stub_versions", {})
        if packages.get("stubbed"):
            self.out(" Pakete (Harness-Stubs, nur Signaturen): "
                     + ", ".join(f"{p} {versions.get(p, '')}".strip() for p in packages["stubbed"]))
        if packages.get("nuget"):
            nuget_versions = packages.get("nuget_versions", {})
            self.out(" Pakete per NuGet (echte DLL): "
                     + ", ".join(f"{p} {versions.get(p, '')} ({nuget_versions.get(p, '')})".replace("  ", " ") for p in packages["nuget"]))
        if packages.get("simulated_missing"):
            self.out(" Pakete simuliert FEHLEND: " + ", ".join(packages["simulated_missing"]))
        excluded = self.excluded_by_constraints()
        if excluded:
            self.out(" Wegen defineConstraints nicht kompiliert: " + ", ".join(excluded))
        self.out("=" * width)
        self.out(f" {'Teil':<44}{'Asm':>5}{'Fehler':>8}{'Warn.':>7}{'Whitel.':>9}")

        any_error = False
        any_assembly = False

        def row_counts(key):
            row = rows.get(key)
            if not row:
                return 0, 0, 0, 0
            return len(row["errors"]), len(row["warnings"]), len(row["whitelisted"]), len(row["cascade"])

        def assemblies_in(pass_id, part):
            return [a for a in self.model["assemblies"] if a["part"] == part and a["passes"].get(pass_id) is None]

        for part in (PART_RUNTIME, PART_EDITOR, PART_OTHER):
            for pass_id, info in passes.items():
                count = len(assemblies_in(pass_id, part))
                if count == 0:
                    if part == PART_EDITOR and pass_id == "editor" and not self.model.get("editor_refs", True):
                        review = [a for a in self.model["assemblies"] if a["part"] == PART_EDITOR and a["files"]]
                        files = sum(len(a["files"]) for a in review)
                        self.out(f" {PART_LABELS[part]}: Editor-Code nicht kompilierbar – nur Review "
                                 f"({len(review)} Assemblies, {files} Dateien)")
                        for asm in review:
                            self.out(f"     {asm['name']}: " + ", ".join(self.rel(f) for f in asm["files"][:5])
                                     + (" ..." if len(asm["files"]) > 5 else ""))
                    elif part in (PART_RUNTIME, PART_EDITOR) and pass_id == "editor":
                        self.out(f" {PART_LABELS[part] + ' - keine Skripte gefunden':<44}")
                    continue
                any_assembly = True
                errors, warnings, white, cascade = row_counts((pass_id, part))
                any_error = any_error or errors > 0 or cascade > 0
                label = f"{PART_LABELS[part]} - {info['label']}"
                extra = f"  (+{cascade} Folgefehler)" if cascade else ""
                self.out(f" {label:<44}{count:>5}{errors:>8}{warnings:>7}{white:>9}{extra}")
                self.rows.append({"part": part, "pass": pass_id, "assemblies": count, "errors": errors,
                                  "warnings": warnings, "whitelisted": white, "cascade": cascade})

        test_asms = [a for a in self.model["assemblies"] if a["part"] == PART_TESTS and a["passes"].get("editor") is None]
        if test_asms:
            any_assembly = True
            errors, warnings, white, cascade = row_counts(("build", PART_TESTS))
            any_error = any_error or errors > 0 or cascade > 0
            extra = f"  (+{cascade} Folgefehler)" if cascade else ""
            self.out(f" {PART_LABELS[PART_TESTS] + ' - Build (net8.0, NUnit 3.14)':<44}{len(test_asms):>5}{errors:>8}{warnings:>7}{white:>9}{extra}")
            self.rows.append({"part": PART_TESTS, "pass": "build", "errors": errors, "warnings": warnings, "whitelisted": white})
            if not self.args.no_compat:
                errors, warnings, white, cascade = row_counts(("compat", PART_TESTS))
                any_error = any_error or errors > 0 or cascade > 0
                extra = f"  (+{cascade} Folgefehler)" if cascade else ""
                self.out(f" {PART_LABELS[PART_TESTS] + ' - Unity-Kompat. (ns2.1, NUnit 3.5)':<44}{len(test_asms):>5}{errors:>8}{warnings:>7}{white:>9}{extra}")
                self.rows.append({"part": PART_TESTS, "pass": "compat", "errors": errors, "warnings": warnings, "whitelisted": white})
            if self.args.no_tests:
                self.out(f" {PART_LABELS[PART_TESTS] + ' - Lauf':<44} uebersprungen (--no-tests)")
            else:
                passed = sum(t["passed"] for t in tests)
                failed = sum(t["failed"] for t in tests)
                skipped = sum(t["skipped"] for t in tests)
                broken = [t["assembly"] for t in tests if not t["ok"]]
                unity = sum(1 for t in tests for f in t["failures"] if f["unity_runtime"])
                detail = f"{passed} bestanden, {failed} fehlgeschlagen, {skipped} uebersprungen"
                if unity:
                    detail += f" ({unity} brauchen Unity)"
                if broken:
                    detail += f"; KEIN Ergebnis: {', '.join(broken)}"
                dropped = sorted({d for t in tests for d in t.get("dropped", [])})
                if dropped:
                    detail += f"; ohne Referenz auf {', '.join(dropped)} (nicht gebaut, von Tests ungenutzt)"
                self.out(f" {PART_LABELS[PART_TESTS] + ' - Lauf':<44} {detail}")
                any_error = any_error or failed > 0 or bool(broken)
                self.rows.append({"part": PART_TESTS, "pass": "run", "passed": passed, "failed": failed,
                                  "skipped": skipped, "no_result": broken})
        else:
            self.out(f" {PART_LABELS[PART_TESTS] + ' - keine Test-Assemblies gefunden':<44}")

        if not self.args.no_lint:
            lint_errors = sum(1 for f in lint if f["level"] == "error")
            lint_warnings = sum(1 for f in lint if f["level"] == "warning")
            any_error = any_error or lint_errors > 0
            self.out(f" {'(d) Regel-Lint (heuristisch)':<44}{'':>5}{lint_errors:>8}{lint_warnings:>7}")
            self.rows.append({"part": "lint", "errors": lint_errors, "warnings": lint_warnings})

        note_errors = sum(1 for n in notes if n["level"] == "error")
        note_warnings = len({(n.get("assembly"), n["text"]) for n in notes if n["level"] == "warning"})
        any_error = any_error or note_errors > 0
        self.out(f" {'Struktur (asmdefs, Referenzen)':<44}{'':>5}{note_errors:>8}{note_warnings:>7}")
        self.rows.append({"part": "structure", "errors": note_errors, "warnings": note_warnings})

        infra = list(self.infra_errors)
        for key, row in rows.items():
            if key[0] == "infra":
                infra += [d["message"] for d, _ in row["errors"].values()]
        if infra:
            self.out(f" {'Harness-Infrastruktur':<44}{'':>5}{len(infra):>8}")
        self.out("-" * width)
        if infra:
            self.exit_code = 2
            verdict = "HARNESS-PROBLEM (Exit-Code 2) - Ergebnisse unvollstaendig"
        elif any_error:
            self.exit_code = 1
            verdict = "FEHLER (Exit-Code 1)"
        else:
            self.exit_code = 0
            verdict = "OK (Exit-Code 0)" if any_assembly else "OK (Exit-Code 0) - noch kein Code zum Pruefen"
        self.out(f" Ergebnis: {verdict}")
        self.out(f" Details: {self.work / 'summary.txt'}")
        self.out("=" * width)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True)
    parser.add_argument("--whitelist", required=True)
    parser.add_argument("--no-tests", action="store_true")
    parser.add_argument("--no-lint", action="store_true")
    parser.add_argument("--no-compat", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    return Report(args).run()


if __name__ == "__main__":
    sys.exit(main())
