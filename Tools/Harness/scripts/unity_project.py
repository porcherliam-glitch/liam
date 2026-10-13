"""Harness only: model of the Unity project (asmdefs, scripts, defines).

Reads the Unity project the same way the Unity 6.3 script compilation pipeline would
(as far as it matters for compiling outside Unity):
- every .asmdef owns the .cs files of its folder and sub folders, unless a sub folder
  has its own .asmdef/.asmref,
- scripts without an asmdef go to Assembly-CSharp (or Assembly-CSharp-Editor when a
  folder on their path is called "Editor"),
- folders starting with "." or ending with "~" are ignored by Unity.
"""

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

# Parts of the harness summary.
PART_RUNTIME = "a"
PART_EDITOR = "b"
PART_TESTS = "c"
PART_OTHER = "x"

PART_LABELS = {
    PART_RUNTIME: "(a) Runtime",
    PART_EDITOR: "(b) Editor",
    PART_TESTS: "(c) Tests",
    PART_OTHER: "(x) Sonstige",
}

# Unity assemblies that the harness maps to stand-ins.
TEST_RUNNER_ASSEMBLIES = {"UnityEngine.TestRunner", "UnityEditor.TestRunner"}

# Precompiled DLLs (asmdef "precompiledReferences") that the harness can provide via NuGet.
PRECOMPILED_PACKAGES = {
    "nunit.framework.dll": None,  # provided by the test project itself (NUnit 3.14 / 3.5)
    "Newtonsoft.Json.dll": ("Newtonsoft.Json", "13.0.2"),
}

TEST_ATTRIBUTE_RE = re.compile(r"\[\s*(?:NUnit\.Framework\.)?(Test|TestCase|TestCaseSource|UnityTest|Theory)\s*[\](,]")


@dataclass
class Assembly:
    """One compilation unit (asmdef or predefined Assembly-CSharp*)."""

    name: str
    directory: Path
    asmdef: Optional[Path]
    files: List[Path] = field(default_factory=list)
    references: List[str] = field(default_factory=list)
    include_platforms: List[str] = field(default_factory=list)
    exclude_platforms: List[str] = field(default_factory=list)
    define_constraints: List[str] = field(default_factory=list)
    version_defines: List[dict] = field(default_factory=list)
    precompiled_references: List[str] = field(default_factory=list)
    override_references: bool = False
    allow_unsafe: bool = False
    auto_referenced: bool = True
    no_engine_references: bool = False
    root_namespace: str = ""
    part: str = PART_RUNTIME
    is_test: bool = False
    has_tests: bool = False
    is_predefined: bool = False
    notes: List[dict] = field(default_factory=list)

    @property
    def editor_only(self) -> bool:
        return self.include_platforms == ["Editor"]

    def note(self, level: str, text: str) -> None:
        self.notes.append({"level": level, "assembly": self.name, "text": text})


def _load_json(path: Path) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    # asmdef files are plain JSON; tolerate // comments just in case.
    text = re.sub(r"^\s*//.*$", "", text, flags=re.MULTILINE)
    return json.loads(text) if text.strip() else {}


def _is_ignored_dir(name: str) -> bool:
    return name.startswith(".") or name.endswith("~") or name.lower() == "cvs"


def _read_meta_guid(path: Path) -> Optional[str]:
    meta = Path(str(path) + ".meta")
    if not meta.is_file():
        return None
    match = re.search(r"^guid:\s*([0-9a-fA-F]{32})", meta.read_text(encoding="utf-8", errors="replace"), re.MULTILINE)
    return match.group(1).lower() if match else None


class UnityProject:
    """Discovers assemblies and scripts of a Unity project."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.assets = self.root / "Assets"
        self.project_dir = self.assets / "_Project"
        self.scripts_dir = self.project_dir / "Scripts"
        self.tests_dir = self.project_dir / "Tests"
        self.editor_scripts_dir = self.scripts_dir / "Editor"
        self.assemblies: Dict[str, Assembly] = {}
        self.guid_to_name: Dict[str, str] = {}
        self.notes: List[dict] = []
        self.packages = self._read_packages()

    # ------------------------------------------------------------------ discovery
    def discover(self) -> None:
        if not self.assets.is_dir():
            self.notes.append({"level": "info", "assembly": "", "text": f"Kein Assets/-Ordner unter {self.root}"})
            return

        owners: Dict[Path, str] = {}  # folder -> assembly name (asmdef/asmref folders)
        asmrefs: List[Path] = []
        for dirpath, dirnames, filenames in os.walk(self.assets):
            dirnames[:] = sorted(d for d in dirnames if not _is_ignored_dir(d))
            for filename in sorted(filenames):
                path = Path(dirpath) / filename
                if filename.endswith(".asmdef"):
                    asm = self._read_asmdef(path)
                    if asm.name in self.assemblies:
                        self.notes.append({"level": "error", "assembly": asm.name,
                                           "text": f"Assembly-Name doppelt: {self._rel(path)} und {self._rel(self.assemblies[asm.name].asmdef)}"})
                        continue
                    if Path(dirpath) in owners:
                        self.notes.append({"level": "error", "assembly": asm.name,
                                           "text": f"Mehr als eine .asmdef/.asmref im Ordner {self._rel(Path(dirpath))}"})
                    self.assemblies[asm.name] = asm
                    owners[Path(dirpath)] = asm.name
                    guid = _read_meta_guid(path)
                    if guid:
                        self.guid_to_name[guid] = asm.name
                elif filename.endswith(".asmref"):
                    asmrefs.append(path)

        for path in asmrefs:
            data = _load_json(path)
            ref = str(data.get("reference", ""))
            name = self._resolve_reference_name(ref)
            if name is None:
                self.notes.append({"level": "error", "assembly": "", "text": f"{self._rel(path)}: Ziel '{ref}' nicht gefunden"})
                continue
            owners[path.parent] = name

        predefined: Dict[str, Assembly] = {}
        for dirpath, dirnames, filenames in os.walk(self.assets):
            dirnames[:] = sorted(d for d in dirnames if not _is_ignored_dir(d))
            for filename in sorted(filenames):
                if not filename.endswith(".cs"):
                    continue
                path = Path(dirpath) / filename
                owner = self._owner_of(path.parent, owners)
                if owner is not None:
                    self.assemblies[owner].files.append(path)
                    continue
                if not self._is_inside(path, self.project_dir):
                    continue  # third-party code without asmdef is not ours to check
                is_editor = any(part == "Editor" for part in path.relative_to(self.assets).parts[:-1])
                name = "Assembly-CSharp-Editor" if is_editor else "Assembly-CSharp"
                if name not in predefined:
                    asm = Assembly(name=name, directory=self.assets, asmdef=None, is_predefined=True)
                    if is_editor:
                        asm.include_platforms = ["Editor"]
                    predefined[name] = asm
                predefined[name].files.append(path)

        for name, asm in predefined.items():
            asm.note("warning", f"{len(asm.files)} Skript(e) ohne .asmdef landen in {name} "
                                f"(Regel 3.1: je Ordner unter Scripts/ genau eine Assembly), z. B. {self._rel(asm.files[0])}")
            self.assemblies[name] = asm

        for asm in self.assemblies.values():
            self._classify(asm)

        # Predefined assemblies reference every auto-referenced asmdef (as in Unity).
        if "Assembly-CSharp-Editor" in self.assemblies and "Assembly-CSharp" in self.assemblies:
            self.assemblies["Assembly-CSharp-Editor"].references.append("Assembly-CSharp")
        for asm in predefined.values():
            for other in self.assemblies.values():
                if other.is_predefined or other.is_test or not other.auto_referenced or other.name in asm.references:
                    continue
                if asm.name == "Assembly-CSharp" and other.editor_only:
                    continue
                asm.references.append(other.name)

    # ------------------------------------------------------------------ helpers
    def _read_asmdef(self, path: Path) -> Assembly:
        data = _load_json(path)
        name = str(data.get("name") or path.stem)
        asm = Assembly(name=name, directory=path.parent, asmdef=path)
        if name != path.stem:
            asm.note("warning", f"Dateiname {path.name} weicht vom Assembly-Namen '{name}' ab")
        asm.references = [str(r) for r in data.get("references", [])]
        asm.include_platforms = [str(p) for p in data.get("includePlatforms", [])]
        asm.exclude_platforms = [str(p) for p in data.get("excludePlatforms", [])]
        asm.define_constraints = [str(c) for c in data.get("defineConstraints", [])]
        asm.version_defines = list(data.get("versionDefines", []))
        asm.precompiled_references = [str(p) for p in data.get("precompiledReferences", [])]
        asm.override_references = bool(data.get("overrideReferences", False))
        asm.allow_unsafe = bool(data.get("allowUnsafeCode", False))
        asm.auto_referenced = bool(data.get("autoReferenced", True))
        asm.no_engine_references = bool(data.get("noEngineReferences", False))
        asm.root_namespace = str(data.get("rootNamespace", ""))
        if data.get("optionalUnityReferences"):
            # Legacy "TestAssemblies" flag (Unity converts it the same way).
            asm.references += sorted(TEST_RUNNER_ASSEMBLIES)
            asm.precompiled_references.append("nunit.framework.dll")
            asm.define_constraints.append("UNITY_INCLUDE_TESTS")
            asm.override_references = True
            asm.auto_referenced = False
        return asm

    def _classify(self, asm: Assembly) -> None:
        location = asm.asmdef.parent if asm.asmdef else (asm.files[0].parent if asm.files else self.assets)
        asm.is_test = (
            "UNITY_INCLUDE_TESTS" in asm.define_constraints
            or any(r in TEST_RUNNER_ASSEMBLIES for r in asm.references)
            or "nunit.framework.dll" in asm.precompiled_references
            or self._is_inside(location, self.tests_dir)
        )
        if asm.is_test:
            asm.part = PART_TESTS
            asm.has_tests = any(TEST_ATTRIBUTE_RE.search(_read_text(f)) for f in asm.files)
        elif self._is_inside(location, self.editor_scripts_dir) or asm.editor_only:
            asm.part = PART_EDITOR
        elif self._is_inside(location, self.scripts_dir) or asm.is_predefined:
            asm.part = PART_RUNTIME
        else:
            asm.part = PART_OTHER

    def _resolve_reference_name(self, ref: str) -> Optional[str]:
        if ref.startswith("GUID:"):
            return self.guid_to_name.get(ref[5:].lower())
        return ref if ref in self.assemblies else None

    def resolve_reference(self, ref: str) -> Optional[str]:
        """Name of a project assembly for an asmdef reference (name or GUID), else None."""
        return self._resolve_reference_name(ref)

    @staticmethod
    def _owner_of(folder: Path, owners: Dict[Path, str]) -> Optional[str]:
        current = folder
        while True:
            if current in owners:
                return owners[current]
            if current.parent == current:
                return None
            current = current.parent

    @staticmethod
    def _is_inside(path: Path, folder: Path) -> bool:
        try:
            path.resolve().relative_to(folder.resolve())
            return True
        except ValueError:
            return False

    def _rel(self, path: Optional[Path]) -> str:
        if path is None:
            return "?"
        try:
            return str(path.resolve().relative_to(self.root))
        except ValueError:
            return str(path)

    def rel(self, path: Path) -> str:
        return self._rel(path)

    # ------------------------------------------------------------------ settings
    def _read_packages(self) -> Dict[str, str]:
        manifest = self.root / "Packages" / "manifest.json"
        if not manifest.is_file():
            return {}
        try:
            data = _load_json(manifest)
        except (ValueError, OSError):
            return {}
        return {str(k): str(v) for k, v in data.get("dependencies", {}).items()}

    def project_defines(self) -> List[str]:
        """Scripting define symbols of the Standalone target + Assets/csc.rsp."""
        defines: List[str] = []
        settings = self.root / "ProjectSettings" / "ProjectSettings.asset"
        if settings.is_file():
            text = settings.read_text(encoding="utf-8", errors="replace")
            block = re.search(r"^\s*scriptingDefineSymbols:\s*\n((?:\s{4,}\S.*\n)*)", text, re.MULTILINE)
            if block:
                for line in block.group(1).splitlines():
                    match = re.match(r"\s*(Standalone|1)\s*:\s*(.*)$", line)
                    if match:
                        defines += [d.strip() for d in match.group(2).split(";") if d.strip()]
        rsp = self.assets / "csc.rsp"
        if rsp.is_file():
            for token in rsp.read_text(encoding="utf-8", errors="replace").split():
                match = re.match(r"[-/](?:define|d):(.+)$", token)
                if match:
                    defines += [d.strip() for d in re.split(r"[;,]", match.group(1)) if d.strip()]
        return defines

    def version_defines_for(self, asm: Assembly) -> List[str]:
        """versionDefines: defined when the package/module is present (version expression not evaluated)."""
        result = []
        for entry in asm.version_defines:
            name = str(entry.get("name", ""))
            define = str(entry.get("define", ""))
            if not define:
                continue
            if name == "Unity" or name in self.packages or name.startswith("com.unity.modules."):
                result.append(define)
        return result


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return ""


def constraints_satisfied(constraints: List[str], defines: List[str]) -> bool:
    """Unity semantics: every entry must hold; an entry is an OR list ("A || !B")."""
    defined = set(defines)
    for constraint in constraints:
        terms = [t.strip() for t in constraint.split("||") if t.strip()]
        if not terms:
            continue
        ok = False
        for term in terms:
            if term.startswith("!"):
                ok = ok or term[1:] not in defined
            else:
                ok = ok or term in defined
        if not ok:
            return False
    return True
