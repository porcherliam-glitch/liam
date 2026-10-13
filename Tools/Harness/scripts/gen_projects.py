#!/usr/bin/env python3
"""Harness only: generates one MSBuild project per Unity assembly and compile pass.

Output (under --work):
  <pass>/<Assembly>/<Assembly>.csproj          library (netstandard2.1) or runnable test project (net8.0)
  editor/<Assembly>.UnityCompat/...csproj       test assemblies again as netstandard2.1 + NUnit 3.5
                                                (closest to Unity's com.unity.ext.nunit; compile only)
  <pass>/build.sln                              everything that is built in that pass
  model.json                                    description for report.py / run_checks.sh
"""

import argparse
import json
import sys
import uuid
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

from unity_project import (  # noqa: E402
    PART_EDITOR,
    PART_OTHER,
    PART_RUNTIME,
    PART_TESTS,
    PRECOMPILED_PACKAGES,
    TEST_RUNNER_ASSEMBLIES,
    Assembly,
    UnityProject,
    constraints_satisfied,
)

NUNIT_RUN_VERSION = "3.14.0"
NUNIT_COMPAT_VERSION = "3.5.0"
NUNIT_ADAPTER_VERSION = "4.6.0"
TEST_SDK_VERSION = "17.11.1"

DEFAULT_DEV_DEFINES = "AETHERFALL_DEV;AETHERFALL_CHEATS;AETHERFALL_TELEMETRY"


def unity_version_defines() -> List[str]:
    """UNITY_x_y_OR_NEWER symbols that Unity 6000.3 defines."""
    result = [f"UNITY_5_{minor}_OR_NEWER" for minor in range(3, 7)]
    for year, last_minor in ((2017, 4), (2018, 4), (2019, 4), (2020, 3), (2021, 3), (2022, 3), (2023, 3)):
        result += [f"UNITY_{year}_{minor}_OR_NEWER" for minor in range(1, last_minor + 1)]
    result += [f"UNITY_6000_{minor}_OR_NEWER" for minor in range(0, 4)]
    result += ["UNITY_6000", "UNITY_6000_3"]
    return result


COMMON_DEFINES = unity_version_defines() + [
    "UNITY_64", "NET_STANDARD_2_1", "NET_STANDARD", "NETSTANDARD2_1", "NETSTANDARD",
    "CSHARP_7_3_OR_NEWER", "ENABLE_INPUT_SYSTEM",
]

PASSES = {
    "editor": {
        "label": "Editor macOS, Dev",
        "platform": "Editor",
        "configuration": "Debug",
        "defines": ["UNITY_EDITOR", "UNITY_EDITOR_64", "UNITY_EDITOR_OSX", "UNITY_STANDALONE_OSX", "UNITY_STANDALONE",
                    "ENABLE_MONO", "UNITY_ASSERTIONS", "DEVELOPMENT_BUILD", "UNITY_INCLUDE_TESTS", "ENABLE_PROFILER",
                    "DEBUG", "TRACE"],
        "dev": True,
        "parts": [PART_RUNTIME, PART_EDITOR, PART_TESTS, PART_OTHER],
    },
    "player-win": {
        "label": "Player Windows, Release",
        "platform": "WindowsStandalone64",
        "configuration": "Release",
        "defines": ["UNITY_STANDALONE_WIN", "UNITY_STANDALONE", "ENABLE_IL2CPP"],
        "dev": False,
        "parts": [PART_RUNTIME, PART_OTHER],
    },
    "player-osx": {
        "label": "Player macOS, Release",
        "platform": "macOSStandalone",
        "configuration": "Release",
        "defines": ["UNITY_STANDALONE_OSX", "UNITY_STANDALONE", "ENABLE_IL2CPP"],
        "dev": False,
        "parts": [PART_RUNTIME, PART_OTHER],
    },
    "player-win-dev": {
        "label": "Player Windows, Development",
        "platform": "WindowsStandalone64",
        "configuration": "Debug",
        "defines": ["UNITY_STANDALONE_WIN", "UNITY_STANDALONE", "ENABLE_MONO", "UNITY_ASSERTIONS", "DEVELOPMENT_BUILD"],
        "dev": True,
        "parts": [PART_RUNTIME, PART_OTHER],
    },
}

SDK_PROJECT_TYPE = "{9A19103F-16F7-4668-BE54-9A1E7A4F7556}"


def msbuild_escape(text: str) -> str:
    out = []
    for ch in text:
        if ch in "%$@;'?*":
            out.append("%{:02X}".format(ord(ch)))
        else:
            out.append(ch)
    return "".join(out)


def xml_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def unique(items: List[str]) -> List[str]:
    seen = set()
    result = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


class Generator:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.harness = Path(args.harness).resolve()
        self.work = Path(args.work).resolve()
        self.project = UnityProject(Path(args.project))
        self.setup_packages()
        self.project.discover()
        self.passes = [p for p in args.passes.split(",") if p]
        for pass_id in self.passes:
            if pass_id not in PASSES:
                raise SystemExit(f"Unbekannter Durchlauf '{pass_id}'. Moeglich: {', '.join(PASSES)}")
        if "editor" not in self.passes:
            self.passes.insert(0, "editor")
        self.dev_defines = [d for d in args.dev_defines.split(";") if d]
        self.extra_defines = [d for d in args.extra_defines.split(";") if d]
        self.project_defines = self.project.project_defines()
        self.notes: List[dict] = list(self.project.notes)
        self.model: dict = {
            "project": str(self.project.root),
            "harness": str(self.harness),
            "editor_refs": not args.no_editor_refs,
            "refs_mode": args.refs_mode,
            "passes": [],
            "assemblies": [],
            "projects": {},
            "test_projects": [],
            "notes": self.notes,
            "packages": self.package_info,
        }
        leaked = sorted(set(self.project_defines) & set(self.dev_defines))
        if leaked:
            self.notes.append({"level": "warning", "assembly": "",
                               "text": "ProjectSettings/csc.rsp enthalten Dev-Defines (" + ", ".join(leaked)
                                       + "): sie gelten auch im Release-Build (Architektur 2.7 #43: nur ueber Build-Profile setzen)"})

    # ------------------------------------------------------------------ packages
    def setup_packages(self) -> None:
        """Unity packages: Packages/manifest.json plus packages with a harness stub, minus --without-packages.

        A stubbed package counts as installed (versionDefines fire, its assemblies can be referenced) unless it is
        simulated as missing. Package assemblies without a stub stay unavailable (code that uses them fails, as before).
        """
        self.stub_assemblies: Dict[str, Path] = {}  # asmdef name -> stub dll (available packages only)
        # Precompiled DLLs (asmdef "precompiledReferences") -> NuGet package; packages.json "nuget" entries override the
        # defaults. A DLL of a package simulated as missing is not available (as in Unity without the package).
        self.precompiled_packages: Dict[str, Optional[tuple]] = dict(PRECOMPILED_PACKAGES)
        self.missing_precompiled: Dict[str, str] = {}  # dll -> package id simulated as missing
        nuget_packages = []
        nuget_versions = {}
        stubs = {}
        if self.args.package_stubs and Path(self.args.package_stubs).is_file():
            data = json.loads(Path(self.args.package_stubs).read_text(encoding="utf-8"))
            stubs = {k: v for k, v in data.items() if not k.startswith("_")}
        requested = [p.strip() for p in self.args.without_packages.split(",") if p.strip()]
        missing = set()
        for name in requested:
            if name == "stubs":
                missing.update(stubs)
            else:
                missing.add(name)
        manifest = dict(self.project.packages)
        packages = dict(manifest)
        stubbed = []
        for package_id, entry in sorted(stubs.items()):
            nuget = entry.get("nuget") or {}
            if nuget:
                # Real DLLs from NuGet (e.g. com.unity.nuget.newtonsoft-json -> Newtonsoft.Json 13.0.2).
                nuget_versions[package_id] = ", ".join(f"{v[0]} {v[1]}" for v in nuget.values())
                if package_id in missing:
                    for dll in nuget:
                        self.missing_precompiled[dll] = package_id
                    continue
                for dll, value in nuget.items():
                    self.precompiled_packages[dll] = (str(value[0]), str(value[1]))
                packages.setdefault(package_id, str(entry.get("version", "nuget")))
                nuget_packages.append(package_id)
                continue
            if package_id in missing:
                continue
            dlls = {}
            for asm_name in entry.get("assemblies", {}):
                dll = Path(self.args.package_refs) / f"{asm_name}.dll"
                if dll.is_file():
                    dlls[asm_name] = dll
            if not dlls:
                continue
            self.stub_assemblies.update(dlls)
            packages.setdefault(package_id, str(entry.get("version", "stub")))
            stubbed.append(package_id)
        for package_id in missing:
            packages.pop(package_id, None)
        self.project.packages = packages
        self.package_info = {
            "stubbed": stubbed,
            "simulated_missing": sorted(missing),
            "manifest": sorted(manifest),
            "stub_assemblies": sorted(self.stub_assemblies),
            "stub_versions": {k: str(v.get("version", "")) for k, v in stubs.items()},
            "nuget": nuget_packages,
            "nuget_versions": nuget_versions,
        }

    # ------------------------------------------------------------------ defines / selection
    def defines_for(self, pass_id: str, asm: Assembly) -> List[str]:
        spec = PASSES[pass_id]
        defines = COMMON_DEFINES + spec["defines"] + self.project_defines + self.extra_defines
        if spec["dev"]:
            defines = defines + self.dev_defines
        if pass_id == "editor" and self.args.no_editor_refs:
            defines = [d for d in defines if not d.startswith("UNITY_EDITOR")]
        return unique(defines + self.project.version_defines_for(asm))

    def mark_unreferenced_other(self) -> None:
        """Code outside Assets/_Project (third party) is only compiled when our code references it."""
        reachable = set()
        stack = [a.name for a in self.project.assemblies.values() if a.part != PART_OTHER]
        while stack:
            name = stack.pop()
            if name in reachable:
                continue
            reachable.add(name)
            for ref in self.project.assemblies[name].references:
                target = self.project.resolve_reference(ref)
                if target and target not in reachable:
                    stack.append(target)
        self.unreferenced_other = {a.name for a in self.project.assemblies.values()
                                   if a.part == PART_OTHER and a.name not in reachable}

    def included(self, pass_id: str, asm: Assembly) -> Optional[str]:
        """None if the assembly is compiled in the pass, otherwise the reason."""
        spec = PASSES[pass_id]
        if asm.name in getattr(self, "unreferenced_other", set()):
            return "Drittanbieter-Code, nicht von Aetherfall-Code referenziert"
        if asm.part not in spec["parts"]:
            return "nicht Teil dieses Durchlaufs"
        if not asm.files:
            return "keine Skripte"
        platform = spec["platform"]
        if asm.include_platforms and platform not in asm.include_platforms:
            return f"includePlatforms ohne {platform}"
        if platform in asm.exclude_platforms:
            return f"excludePlatforms enthaelt {platform}"
        if asm.part == PART_EDITOR and self.args.no_editor_refs:
            return "Editor-Code nicht kompilierbar – nur Review (keine UnityEditor-Referenzen)"
        base_defines = self.defines_for(pass_id, asm)
        if not constraints_satisfied(asm.define_constraints, base_defines):
            return "defineConstraints nicht erfuellt: " + ", ".join(asm.define_constraints)
        return None

    # ------------------------------------------------------------------ generation
    def run(self) -> None:
        self.work.mkdir(parents=True, exist_ok=True)
        # Stop MSBuild's upward search for Directory.Build.*/Directory.Packages.props, so
        # files in parent folders cannot change how the generated projects compile.
        for guard in ("Directory.Build.props", "Directory.Build.targets", "Directory.Packages.props"):
            (self.work / guard).write_text("<Project>\n  <!-- Harness only: isolation guard. -->\n</Project>\n", encoding="utf-8")
        self.mark_unreferenced_other()
        compiled: Dict[str, Dict[str, Path]] = {}  # pass -> asm -> csproj
        for pass_id in self.passes:
            compiled[pass_id] = {}
            for asm in self.project.assemblies.values():
                if self.included(pass_id, asm) is None:
                    compiled[pass_id][asm.name] = self.work / pass_id / asm.name / f"{asm.name}.csproj"

        for asm in sorted(self.project.assemblies.values(), key=lambda a: (a.part, a.name)):
            self.model["assemblies"].append({
                "name": asm.name,
                "part": asm.part,
                "asmdef": self.project.rel(asm.asmdef) if asm.asmdef else None,
                "root_namespace": asm.root_namespace,
                "files": [str(f) for f in asm.files],
                "references": asm.references,
                "is_test": asm.is_test,
                "has_tests": asm.has_tests,
                "editor_only": asm.editor_only,
                "auto_referenced": asm.auto_referenced,
                "passes": {p: self.included(p, asm) for p in self.passes},
            })
            self.notes.extend(asm.notes)

        for pass_id in self.passes:
            spec = PASSES[pass_id]
            projects: List[Path] = []
            for name, csproj in sorted(compiled[pass_id].items()):
                asm = self.project.assemblies[name]
                runnable = asm.is_test and asm.has_tests and pass_id == "editor"
                self.write_project(pass_id, asm, csproj, compiled[pass_id], variant="test" if runnable else "lib")
                projects.append(csproj)
                if pass_id == "editor" and asm.is_test and not self.args.no_compat:
                    compat = self.work / pass_id / f"{name}.UnityCompat" / f"{name}.UnityCompat.csproj"
                    self.write_project(pass_id, asm, compat, compiled[pass_id], variant="compat")
                    projects.append(compat)
            sln = self.work / pass_id / "build.sln"
            self.write_solution(sln, projects)
            self.model["passes"].append({
                "id": pass_id,
                "label": spec["label"],
                "configuration": spec["configuration"],
                "solution": str(sln) if projects else None,
                "assemblies": sorted(compiled[pass_id]),
                "defines_example": self.defines_for(pass_id, Assembly(name="-", directory=self.project.root, asmdef=None)),
            })

        (self.work / "model.json").write_text(json.dumps(self.model, indent=2, ensure_ascii=False), encoding="utf-8")

    def write_project(self, pass_id: str, asm: Assembly, csproj: Path, compiled: Dict[str, Path], variant: str) -> None:
        csproj.parent.mkdir(parents=True, exist_ok=True)
        spec = PASSES[pass_id]
        defines = self.defines_for(pass_id, asm)
        if asm.no_engine_references:
            unity_refs = "none"
        elif pass_id == "editor" and not self.args.no_editor_refs:
            unity_refs = "editor"  # in the editor every assembly sees UnityEditor.dll
        else:
            unity_refs = "engine"

        props = {
            "TargetFramework": "net8.0" if variant == "test" else "netstandard2.1",
            "AssemblyName": asm.name,
            "RootNamespace": asm.root_namespace or asm.name,
            "DefineConstants": ";".join(defines),
            "AllowUnsafeBlocks": "true" if asm.allow_unsafe else "false",
            "Optimize": "true" if spec["configuration"] == "Release" else "false",
            "HarnessUnityRefs": unity_refs,
            "HarnessAnalyzers": "false" if self.args.no_analyzers or variant == "compat" else "true",
            "HarnessPart": asm.part,
            "HarnessPass": pass_id,
            "HarnessVariant": variant,
        }
        if self.args.refs_mode == "unpatched":
            props["HarnessEngineRefDir"] = "$(HarnessCacheDir)/unity-refs/unpatched/engine"
            props["HarnessEditorRefDir"] = "$(HarnessCacheDir)/unity-refs/unpatched/editor"
        if variant == "test":
            props["IsTestProject"] = "true"
            props["IsPackable"] = "false"
            props["HarnessCopyUnityRefs"] = "true"
            props["GenerateDocumentationFile"] = "false"
        if variant == "compat":
            props["GenerateDocumentationFile"] = "false"

        uses_test_runner = any(r in TEST_RUNNER_ASSEMBLIES for r in asm.references)
        if uses_test_runner:
            props["HarnessTestRunnerShims"] = "true"

        packages: List[tuple] = []
        declares_nunit = "nunit.framework.dll" in asm.precompiled_references or uses_test_runner
        if variant == "compat":
            if declares_nunit:
                packages.append(("NUnit", NUNIT_COMPAT_VERSION))
        elif variant == "test":
            packages += [("NUnit", NUNIT_RUN_VERSION), ("NUnit3TestAdapter", NUNIT_ADAPTER_VERSION),
                         ("Microsoft.NET.Test.Sdk", TEST_SDK_VERSION)]
            if not declares_nunit:
                self.note(asm, pass_id, "warning", "Test-Assembly referenziert nunit.framework.dll nicht (precompiledReferences) "
                                                   "und nicht UnityEngine/UnityEditor.TestRunner - in Unity fehlt NUnit")
        elif declares_nunit:
            packages.append(("NUnit", NUNIT_RUN_VERSION))

        precompiled: List[tuple] = []
        for dll in asm.precompiled_references:
            if dll in self.missing_precompiled:
                self.note(asm, pass_id, "warning", f"precompiledReference '{dll}' fehlt: Paket {self.missing_precompiled[dll]} "
                                                   f"wird als fehlend simuliert (defineConstraints der Assembly pruefen)")
            elif dll in self.precompiled_packages:
                package = self.precompiled_packages[dll]
                if package:
                    precompiled.append(package)
            else:
                self.note(asm, pass_id, "warning", f"precompiledReference '{dll}' ist im Harness nicht verfuegbar")

        project_refs: List[Path] = []
        package_refs: List[Path] = []
        for ref in asm.references:
            if ref in TEST_RUNNER_ASSEMBLIES:
                continue
            name = self.project.resolve_reference(ref)
            if name is None and ref in self.stub_assemblies:
                package_refs.append(self.stub_assemblies[ref])
                continue
            if name is None:
                if ref.startswith("GUID:"):
                    self.note(asm, pass_id, "error", f"Referenz '{ref}' per GUID nicht aufloesbar (Regel: asmdef-Referenzen per Name)")
                else:
                    self.note(asm, pass_id, "info", f"Paket-/Unity-Assembly '{ref}' ist im Harness nicht verfuegbar; "
                                                    f"Code, der sie nutzt, erzeugt Fehler")
                continue
            if name == asm.name:
                continue
            if name not in compiled:
                reason = self.included(pass_id, self.project.assemblies[name])
                self.note(asm, pass_id, "warning" if pass_id == "editor" else "info",
                          f"Referenz '{name}' wird in diesem Durchlauf nicht kompiliert ({reason})")
                continue
            target = compiled[name]
            ref_asm = self.project.assemblies[name]
            if variant == "compat" and ref_asm.is_test:
                target = self.work / pass_id / f"{name}.UnityCompat" / f"{name}.UnityCompat.csproj"
            project_refs.append(target)
            if ref.startswith("GUID:"):
                self.note(asm, pass_id, "warning", f"Referenz auf '{name}' per GUID (Regel: per Name)")

        lines = ['<Project Sdk="Microsoft.NET.Sdk">',
                 f"  <!-- Generated by the Unity harness ({pass_id}, {variant}). Do not edit. -->",
                 f'  <Import Project="{xml_escape(str(self.harness / "msbuild" / "Harness.Common.props"))}" />',
                 "  <PropertyGroup>"]
        for key, value in props.items():
            lines.append(f"    <{key}>{xml_escape(value)}</{key}>")
        lines.append("  </PropertyGroup>")
        lines.append("  <ItemGroup>")
        for path in asm.files:
            link = self.project.rel(path)
            lines.append(f'    <Compile Include="{xml_escape(msbuild_escape(str(path)))}" Link="{xml_escape(msbuild_escape(link))}" />')
        lines.append("  </ItemGroup>")
        if project_refs:
            lines.append("  <ItemGroup>")
            for ref_path in project_refs:
                lines.append(f'    <ProjectReference Include="{xml_escape(str(ref_path))}" />')
            lines.append("  </ItemGroup>")
        if package_refs:
            # Harness package stubs (compile-only signatures), visible only to assemblies that reference them.
            lines.append("  <ItemGroup>")
            for dll in package_refs:
                lines.append(f'    <Reference Include="{xml_escape(str(dll))}" Private="$(HarnessCopyUnityRefs)" />')
            lines.append("  </ItemGroup>")
        if variant == "test":
            # Runnable tests load referenced assemblies at run time: copy the stubs of all transitively referenced
            # packages into the output without making them visible to the compiler.
            runtime_only = [d for d in self.transitive_package_dlls(asm) if d not in package_refs]
            if runtime_only:
                lines.append("  <ItemGroup>")
                for dll in runtime_only:
                    lines.append(f'    <None Include="{xml_escape(str(dll))}" Link="{dll.name}" CopyToOutputDirectory="PreserveNewest" />')
                lines.append("  </ItemGroup>")
        if packages or precompiled:
            lines.append("  <ItemGroup>")
            for package_id, version in unique_packages(packages):
                lines.append(f'    <PackageReference Include="{package_id}" Version="{version}" />')
            # Precompiled DLLs are visible only to the asmdef that lists them (as in Unity with Override References):
            # the compile asset does not flow to referencing projects, the runtime copy does (tests load it).
            plain = {p for p, _ in unique_packages(packages)}
            for package_id, version in unique_packages(precompiled):
                if package_id not in plain:
                    lines.append(f'    <PackageReference Include="{package_id}" Version="{version}" PrivateAssets="compile" />')
            lines.append("  </ItemGroup>")
        lines.append(f'  <Import Project="{xml_escape(str(self.harness / "msbuild" / "Harness.Unity.targets"))}" />')
        lines.append("</Project>")
        csproj.write_text("\n".join(lines) + "\n", encoding="utf-8")

        self.model["projects"][str(csproj)] = {"pass": pass_id, "assembly": asm.name, "part": asm.part, "variant": variant}
        if variant == "test":
            self.model["test_projects"].append({
                "assembly": asm.name,
                "csproj": str(csproj),
                "configuration": spec["configuration"],
                "editor_only": asm.editor_only,
            })

    def transitive_package_dlls(self, asm: Assembly) -> List[Path]:
        """Stub DLLs of all package assemblies referenced by the assembly or its project references (recursively)."""
        result: List[Path] = []
        seen = set()
        stack = [asm.name]
        while stack:
            name = stack.pop()
            if name in seen or name not in self.project.assemblies:
                continue
            seen.add(name)
            for ref in self.project.assemblies[name].references:
                if ref in self.stub_assemblies and self.stub_assemblies[ref] not in result:
                    result.append(self.stub_assemblies[ref])
                target = self.project.resolve_reference(ref)
                if target:
                    stack.append(target)
        return result

    def note(self, asm: Assembly, pass_id: str, level: str, text: str) -> None:
        entry = {"level": level, "assembly": asm.name, "pass": pass_id, "text": text}
        if entry not in self.notes:
            self.notes.append(entry)

    @staticmethod
    def write_solution(sln: Path, projects: List[Path]) -> None:
        sln.parent.mkdir(parents=True, exist_ok=True)
        lines = ["", "Microsoft Visual Studio Solution File, Format Version 12.00", "# Visual Studio Version 17",
                 "VisualStudioVersion = 17.0.31903.59", "MinimumVisualStudioVersion = 10.0.40219.1"]
        guids = []
        for project in projects:
            guid = "{" + str(uuid.uuid5(uuid.NAMESPACE_URL, str(project))).upper() + "}"
            guids.append(guid)
            rel = project.relative_to(sln.parent)
            lines.append(f'Project("{SDK_PROJECT_TYPE}") = "{project.stem}", "{rel}", "{guid}"')
            lines.append("EndProject")
        lines += ["Global", "\tGlobalSection(SolutionConfigurationPlatforms) = preSolution",
                  "\t\tDebug|Any CPU = Debug|Any CPU", "\t\tRelease|Any CPU = Release|Any CPU", "\tEndGlobalSection",
                  "\tGlobalSection(ProjectConfigurationPlatforms) = postSolution"]
        for guid in guids:
            for config in ("Debug", "Release"):
                lines.append(f"\t\t{guid}.{config}|Any CPU.ActiveCfg = {config}|Any CPU")
                lines.append(f"\t\t{guid}.{config}|Any CPU.Build.0 = {config}|Any CPU")
        lines += ["\tEndGlobalSection", "EndGlobal", ""]
        sln.write_text("\r\n".join(lines), encoding="utf-8")


def unique_packages(packages: List[tuple]) -> List[tuple]:
    seen = {}
    for package_id, version in packages:
        seen.setdefault(package_id, version)
    return sorted(seen.items())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Unity-Projektwurzel (enthaelt Assets/)")
    parser.add_argument("--harness", required=True)
    parser.add_argument("--work", required=True)
    parser.add_argument("--passes", default="editor,player-win")
    parser.add_argument("--dev-defines", default=DEFAULT_DEV_DEFINES)
    parser.add_argument("--extra-defines", default="")
    parser.add_argument("--refs-mode", choices=["patched", "unpatched"], default="patched")
    parser.add_argument("--no-analyzers", action="store_true")
    parser.add_argument("--no-compat", action="store_true")
    parser.add_argument("--no-editor-refs", action="store_true")
    parser.add_argument("--package-stubs", default="", help="packages/packages.json (Unity-Pakete mit Harness-Stub)")
    parser.add_argument("--package-refs", default="", help="Ordner mit den gebauten Stub-DLLs")
    parser.add_argument("--without-packages", default="",
                        help="kommagetrennte Paket-IDs, die als fehlend simuliert werden ('stubs' = alle mit Stub)")
    args = parser.parse_args()
    Generator(args).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
