#!/usr/bin/env python3
"""Harness only: keep tests checkable when an unrelated referenced assembly failed to build.

Example: Aetherfall.Tests.EditMode references Aetherfall.EditorTools.Core, which does not
compile in the harness (missing package), but no test uses it. The test project (and its
Unity-compat variant) is then copied to <dir>.Degraded without that ProjectReference, so
the remaining tests still compile and run. A failed reference is only dropped if its
namespace does not occur in the test sources (namespace = assembly name, Architektur 15.1);
a failed reference that itself got a degraded copy is redirected to that copy.

Prints the csproj files that run_checks.sh has to build (in dependency order) and records
them in model.json ("degraded").
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import csharp_text  # noqa: E402

from unity_project import PART_TESTS  # noqa: E402

PROJECT_REF_RE = re.compile(r'^(?P<indent>\s*)<ProjectReference Include="(?P<path>[^"]+)" />\s*$')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True)
    args = parser.parse_args()
    work = Path(args.work)
    model_path = work / "model.json"
    model = json.loads(model_path.read_text(encoding="utf-8"))
    configurations = {p["id"]: p["configuration"] for p in model["passes"]}
    assemblies = {a["name"]: a for a in model["assemblies"]}
    projects = model["projects"]
    sources_cache = {}

    def built(csproj: str) -> bool:
        info = projects.get(csproj)
        if info is None:
            return True
        return (Path(csproj).parent / "bin" / configurations[info["pass"]] / f"{info['assembly']}.dll").is_file()

    def sources(name: str) -> str:
        if name not in sources_cache:
            sources_cache[name] = "\n".join("\n".join(csharp_text.load(f).code_lines) for f in assemblies[name]["files"])
        return sources_cache[name]

    degraded = {}  # original csproj -> {"csproj": degraded csproj, "dropped": [...]}
    candidates = [path for path, info in projects.items()
                  if info["part"] == PART_TESTS and info["pass"] == "editor" and not built(path)]
    progress = True
    while progress:
        progress = False
        for path in candidates:
            if path in degraded:
                continue
            csproj = Path(path)
            name = projects[path]["assembly"]
            lines = csproj.read_text(encoding="utf-8").splitlines()
            failed = [m.group("path") for m in map(PROJECT_REF_RE.match, lines) if m and not built(m.group("path"))]
            if not failed:
                continue  # failed on its own errors
            drop, redirect, blocked = [], {}, False
            for ref in failed:
                if ref in degraded:
                    redirect[ref] = degraded[ref]["csproj"]
                    continue
                ref_name = projects[ref]["assembly"]
                namespace = assemblies[ref_name].get("root_namespace") or ref_name
                if ref in candidates or re.search(r"(?<![\w.])" + re.escape(namespace) + r"(?!\w)", sources(name)):
                    blocked = True  # really used, or may still get a degraded copy in a later round
                    break
                drop.append(ref)
            if blocked:
                continue
            new_lines = []
            for line in lines:
                match = PROJECT_REF_RE.match(line)
                if match and match.group("path") in drop:
                    continue
                if match and match.group("path") in redirect:
                    line = f'{match.group("indent")}<ProjectReference Include="{redirect[match.group("path")]}" />'
                new_lines.append(line)
            target_dir = csproj.parent.parent / f"{csproj.parent.name}.Degraded"
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"{csproj.stem}.Degraded.csproj"
            target.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
            dropped = [projects[ref]["assembly"] for ref in drop]
            for ref in redirect:
                dropped += degraded[ref]["dropped"]
            degraded[path] = {"csproj": str(target), "dropped": sorted(set(dropped)), "assembly": name,
                              "variant": projects[path]["variant"]}
            progress = True
            print(str(target))

    if degraded:
        model["degraded"] = degraded
        for test in model["test_projects"]:
            entry = degraded.get(test["csproj"])
            if entry:
                test["original_csproj"] = test["csproj"]
                test["csproj"] = entry["csproj"]
                test["dropped"] = entry["dropped"]
        model_path.write_text(json.dumps(model, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
