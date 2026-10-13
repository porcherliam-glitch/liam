#!/usr/bin/env python3
"""Harness only: heuristic checks of project rules (Master-Prompt section 32, Architektur 3.3/15).

Text based, so it can be wrong; every finding names the rule so a reviewer can decide.
Errors (exit relevant): banned APIs and structural violations. Warnings: style/conventions.
Writes <work>/lint.json.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

import csharp_text  # noqa: E402
from unity_project import PART_EDITOR, PART_RUNTIME, PART_TESTS  # noqa: E402

FIND_RE = re.compile(r"\b(FindObjectOfType|FindObjectsOfType|FindFirstObjectByType|FindAnyObjectByType|FindObjectsByType|"
                     r"FindGameObjectsWithTag|FindGameObjectWithTag|FindWithTag|FindSceneObjectsOfType)\b|\bGameObject\s*\.\s*Find\s*\(")
TRANSFORM_FIND_RE = re.compile(r"\b(transform|Transform)\s*\.\s*Find\s*\(")
OLD_INPUT_RE = re.compile(r"\bUnityEngine\s*\.\s*Input\b|(?<![\w.])Input\s*\.\s*(Get\w+|any\w*|mouse\w*|touch\w*|acceleration|compass|gyro|"
                          r"location|imeCompositionMode|inputString|multiTouchEnabled|simulateMouseWithTouches|ResetInputAxes)\b")
SEND_MESSAGE_RE = re.compile(r"\b(SendMessage|SendMessageUpwards|BroadcastMessage)\s*\(|\bResources\s*\.\s*Load(All|Async)?\b")
BINARY_FORMATTER_RE = re.compile(r"\bBinaryFormatter\b")
ASYNC_VOID_RE = re.compile(r"\basync\s+void\b")
CAMERA_MAIN_RE = re.compile(r"\bCamera\s*\.\s*main\b")
INSTANCE_ID_RE = re.compile(r"\bGetInstanceID\s*\(")
DEBUG_LOG_RE = re.compile(r"\bDebug\s*\.\s*(Log|LogWarning|LogError|LogException|LogFormat|LogWarningFormat|LogErrorFormat|LogAssertion)\b")
UMLAUT_RE = re.compile(r"[äöüÄÖÜß]")
TYPE_PATTERN = r"[A-Za-z_][\w.]*(?:\s*<[^;=(){}]*>)?(?:\s*\[\s*,*\s*\])*\??"
STATIC_FIELD_RE = re.compile(
    r"^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|new|volatile|unsafe)\s+)*static\s+"
    r"(?!readonly\b|class\b|void\b|extern\b|implicit\b|explicit\b|operator\b|async\b|partial\b|bool\s+operator|[\w<>\[\],.?\s]+\s+operator\b)"
    r"(?:(?:volatile|unsafe|new)\s+)*(?P<type>" + TYPE_PATTERN + r")\s+(?P<name>[A-Za-z_]\w*)\s*(?P<end>=(?!>)|;|\{)")
STATIC_EVENT_RE = re.compile(r"^\s*(?:(?:public|private|protected|internal)\s+)*static\s+event\b")
STATIC_READONLY_COLLECTION_RE = re.compile(
    r"\bstatic\s+readonly\s+(?:System\.Collections\.Generic\.)?(List|Dictionary|HashSet|Queue|Stack|SortedDictionary|SortedList|"
    r"LinkedList|ConcurrentDictionary|ConcurrentQueue|ConcurrentBag)\s*<")
PUBLIC_FIELD_RE = re.compile(
    r"^\s*public\s+(?!static\b|const\b|readonly\b|override\b|abstract\b|virtual\b|event\b|delegate\b|class\b|struct\b|interface\b|"
    r"enum\b|sealed\b|partial\b|async\b|extern\b|unsafe\b|new\b|implicit\b|explicit\b|record\b)"
    + TYPE_PATTERN + r"\s+[A-Za-z_]\w*\s*(=(?!>)|;)")
UNITY_OBJECT_BASE_RE = re.compile(r":\s*(MonoBehaviour|ScriptableObject|ServiceInstaller|StateMachineBehaviour)\b")
RECORD_INIT_RE = re.compile(r"\brecord\s+(class\s+|struct\s+)?[A-Za-z_]\w*|\binit\s*;")
SERIALIZED_HINT_RE = re.compile(r"\[\s*(System\.)?Serializable\s*\]|\[\s*SerializeField\b|\[\s*SerializeReference\b|:\s*(MonoBehaviour|ScriptableObject)\b")
FORBIDDEN_NS_SEGMENTS = {"Camera", "Editor", "Debug", "Time", "Physics", "Random", "Object"}
RESET_MARKER = "RuntimeInitializeLoadType.SubsystemRegistration"


class Linter:
    def __init__(self, model: dict, arch_doc: Optional[Path]):
        self.model = model
        self.findings: List[dict] = []
        self.layers = parse_layer_table(arch_doc) if arch_doc and arch_doc.is_file() else {}

    def add(self, level: str, rule: str, path: Optional[str], line: Optional[int], message: str, assembly: str, part: str) -> None:
        self.findings.append({"level": level, "rule": rule, "file": path, "line": line, "message": message,
                              "assembly": assembly, "part": part})

    def run(self) -> List[dict]:
        for asm in self.model["assemblies"]:
            self.check_asmdef(asm)
            for path in asm["files"]:
                self.check_file(path, asm)
        return self.findings

    # ------------------------------------------------------------------ files
    def check_file(self, path: str, asm: dict) -> None:
        part = asm["part"]
        name = asm["name"]
        src = csharp_text.load(path)
        runtime = part == PART_RUNTIME
        devtools = name.endswith(".DevTools")

        def emit(level: str, rule: str, idx: int, message: str) -> None:
            self.add(level, rule, path, idx + 1, message, name, part)

        has_reset = any(RESET_MARKER in line for line in src.code_lines)
        static_state = []
        for idx, line in enumerate(src.code_lines):
            editor_region = csharp_text.in_region(src, idx, ("UNITY_EDITOR",))
            debug_region = csharp_text.in_region(src, idx, ("AETHERFALL_DEV", "DEVELOPMENT_BUILD", "AETHERFALL_CHEATS"))

            if OLD_INPUT_RE.search(line):
                emit("error", "R-INPUT", idx, "Altes Input-System (UnityEngine.Input) ist verboten - Input System Package nutzen (Regel 15.2 #7)")
            if BINARY_FORMATTER_RE.search(line):
                emit("error", "R-BINFMT", idx, "BinaryFormatter ist verboten (Regel 15.2 #12)")
            if part in (PART_RUNTIME,) and not editor_region:
                match = FIND_RE.search(line)
                if match:
                    if devtools or debug_region:
                        emit("warning", "R-FIND", idx, f"{match.group(0).strip()} im Debug-Code - nur FindAnyObjectByType/FindObjectsByType erlaubt (Regel 15.2 #3)")
                    else:
                        emit("error", "R-FIND", idx, f"{match.group(0).strip()} im Laufzeitcode verboten - ServiceLocator oder [SerializeField] nutzen (Regel 15.2 #3)")
                if TRANSFORM_FIND_RE.search(line):
                    emit("warning", "R-FIND", idx, "Transform.Find im Laufzeitcode - Referenz per [SerializeField] bevorzugen (Regel 15.2 #3)")
                if SEND_MESSAGE_RE.search(line):
                    emit("error", "R-SENDMSG", idx, "SendMessage/BroadcastMessage/Resources.Load sind verboten (Regel 15.2 #4)")
                if CAMERA_MAIN_RE.search(line):
                    emit("warning", "R-CAMMAIN", idx, "Camera.main - Referenz cachen, nie in Schleifen (Regel 15.2 #4)")
                if DEBUG_LOG_RE.search(line) and not _is_log_adapter(path):
                    emit("warning", "R-LOG", idx, "Debug.Log* direkt - Log-Fassade nutzen (Architektur 14.4, A38); nur Adapter wie UnityLogSink duerfen Debug.Log aufrufen")
            if part in (PART_RUNTIME, PART_EDITOR) and ASYNC_VOID_RE.search(line) and not _body_has_try_catch(src.code_lines, idx):
                emit("warning", "R-ASYNCVOID", idx, "async void ohne try/catch - nur in Unity-Ereignis-Adaptern mit try/catch erlaubt (Regel 15.2 #10)")
            if part != PART_TESTS and INSTANCE_ID_RE.search(line):
                emit("warning", "R-INSTANCEID", idx, "GetInstanceID() nie speichern oder als stabilen Schluessel nutzen (Regel 15.2 #5)")
            if runtime:
                match = STATIC_FIELD_RE.match(line)
                if match and match.group("end") in ("=", ";") or (match and match.group("end") == "{" and re.search(r"\bset\s*;", line)):
                    if "const " not in line:
                        static_state.append((idx, match.group("name")))
                elif STATIC_EVENT_RE.match(line):
                    static_state.append((idx, "event"))
                if STATIC_READONLY_COLLECTION_RE.search(line) and not has_reset:
                    emit("warning", "R-STATIC", idx, "static readonly Collection ist veraenderlicher Zustand - mit SubsystemRegistration-Reset leeren (Regel 15.2 #11)")
            if UMLAUT_RE.search(src.comment_lines[idx]):
                emit("warning", "R-LANG", idx, "Kommentar enthaelt Umlaute - Code-Kommentare auf Englisch (Architektur 15.3)")

        if static_state and not has_reset:
            for idx, field_name in static_state:
                emit("error", "R-STATIC", idx, f"Statischer Zustand '{field_name}' ohne Reset per [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)] (Domain Reload ist aus, Regel 15.2 #11)")

        text = "\n".join(src.code_lines)
        if runtime and UNITY_OBJECT_BASE_RE.search(text):
            for idx, line in enumerate(src.code_lines):
                if PUBLIC_FIELD_RE.match(line):
                    emit("warning", "R-PUBFIELD", idx, "Oeffentliches Feld in MonoBehaviour/ScriptableObject - [SerializeField] private verwenden (Regel 15.2 #1)")
        if RECORD_INIT_RE.search(text) and SERIALIZED_HINT_RE.search(text):
            idx = next(i for i, line in enumerate(src.code_lines) if RECORD_INIT_RE.search(line))
            emit("error", "R-RECORD", idx, "record/init in einer Datei mit serialisierten Typen (Regel 15.2 #17)")

        namespaces, types = csharp_text.scan_types(src)
        self.check_namespaces(path, asm, namespaces)
        self.check_types(path, asm, src, types)

    def check_namespaces(self, path: str, asm: dict, namespaces: List[str]) -> None:
        name = asm["name"]
        root = asm.get("root_namespace") or name
        layer = self.layers.get(name)
        if layer and layer.get("namespace"):
            root = layer["namespace"]
        if not namespaces:
            if Path(path).name != "AssemblyInfo.cs":
                self.add("warning", "R-NAMESPACE", path, 1, "Datei ohne Namespace (Namespace = Assembly-Name, Architektur 15.1)", name, asm["part"])
            return
        for ns in namespaces:
            clean = ns.replace(" (file-scoped)", "")
            if asm.get("asmdef") and not (clean == root or clean.startswith(root + ".")):
                self.add("warning", "R-NAMESPACE", path, None, f"Namespace '{clean}' passt nicht zu '{root}' (Architektur 15.1)", name, asm["part"])
            bad = [seg for seg in clean.split(".") if seg in FORBIDDEN_NS_SEGMENTS]
            if bad:
                self.add("error", "R-NAMESPACE", path, None, f"Namespace-Segment {', '.join(bad)} verdeckt Unity-Typen (Architektur 15.1, A05b)", name, asm["part"])

    def check_types(self, path: str, asm: dict, src: csharp_text.SourceText, types: List[csharp_text.TypeDecl]) -> None:
        name = asm["name"]
        part = asm["part"]
        stem = Path(path).stem
        top = [t for t in types if t.top_level]
        if top:
            names = {t.name for t in top}
            events_file = stem.endswith("Events") and all(t.kind == "struct" for t in top)
            matches = events_file or any(stem == t.name or stem.startswith(t.name + ".") or (t.generic and stem.startswith(t.name)) for t in top)
            if not matches:
                self.add("warning", "R-FILENAME", path, top[0].line + 1,
                         f"Dateiname '{stem}' entspricht keinem Typ ({', '.join(sorted(names))}) (Regel: Dateiname = Klassenname)", name, part)
            distinct = sorted(names)
            if len(distinct) > 1:
                if not events_file:
                    self.add("warning", "R-ONECLASS", path, top[1].line + 1,
                             f"Mehrere Typen in einer Datei: {', '.join(distinct)} (Regel: eine Klasse pro Datei; Ausnahme Event-Structs in *Events.cs)", name, part)
        if part == PART_TESTS:
            return
        for decl in types:
            if not decl.is_public:
                continue
            if not _has_xml_doc(src.original_lines, decl.line):
                self.add("warning", "R-XMLDOC", path, decl.line + 1, f"Oeffentlicher Typ '{decl.name}' ohne XML-Doku (///) (Architektur 15.3)", name, part)

    # ------------------------------------------------------------------ asmdefs
    def check_asmdef(self, asm: dict) -> None:
        if not asm.get("asmdef"):
            return
        name = asm["name"]
        part = asm["part"]
        path = str(Path(self.model["project"]) / asm["asmdef"])
        if part == PART_RUNTIME and asm.get("auto_referenced", True):
            self.add("warning", "R-ASMDEF", path, None, "Auto Referenced sollte aus sein (Architektur 2.7 #41, A05)", name, part)
        if part == PART_EDITOR and not asm.get("editor_only"):
            self.add("error", "R-ASMDEF", path, None, "Editor-Assembly ohne includePlatforms = [\"Editor\"] (Architektur 2.7 #41)", name, part)
        if not asm.get("root_namespace"):
            self.add("warning", "R-ASMDEF", path, None, "Root Namespace nicht gesetzt (Architektur 3.3)", name, part)
        layer = self.layers.get(name)
        if not self.layers:
            return
        if layer is None:
            if part != "x":
                self.add("info", "R-LAYER", path, None, "Assembly steht nicht in Tabelle 3.3 der Architektur", name, part)
            return
        if layer.get("namespace") and asm.get("root_namespace") and asm["root_namespace"] != layer["namespace"]:
            self.add("warning", "R-ASMDEF", path, None, f"Root Namespace '{asm['root_namespace']}' statt '{layer['namespace']}' (Tabelle 3.3)", name, part)
        expected_folder = layer.get("folder")
        if expected_folder:
            actual = str(Path(asm["asmdef"]).parent)
            if not actual.endswith(expected_folder):
                self.add("warning", "R-LAYER", path, None, f"Ordner '{actual}' statt '.../{expected_folder}' (Tabelle 3.3)", name, part)
        for ref in asm["references"]:
            other = self.layers.get(ref)
            if other is None:
                continue
            if other["number"] >= layer["number"]:
                self.add("error", "R-LAYER", path, None,
                         f"Schichtverletzung: Nr. {layer['number']} {name} referenziert Nr. {other['number']} {ref} (nur kleinere Nummern erlaubt, Architektur 3.2)", name, part)


def _body_has_try_catch(code_lines: List[str], start: int) -> bool:
    """True if the method starting at line 'start' contains try and catch."""
    text = "\n".join(code_lines[start:start + 400])
    open_index = text.find("{")
    if open_index < 0:
        return False
    depth = 0
    for index in range(open_index, len(text)):
        ch = text[index]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                body = text[open_index:index]
                return re.search(r"\btry\b", body) is not None and re.search(r"\bcatch\b", body) is not None
    return False


def _is_log_adapter(path: str) -> bool:
    stem = Path(path).stem
    return stem in ("Log", "UnityLogSink") or stem.endswith("LogSink") or stem.endswith("LogHandler")


def _has_xml_doc(lines: List[str], decl_line: int) -> bool:
    idx = decl_line - 1
    while idx >= 0:
        stripped = lines[idx].strip()
        if stripped.startswith("///"):
            return True
        if stripped == "" or stripped.startswith("[") or stripped.startswith("#"):
            idx -= 1
            continue
        return False
    return False


def parse_layer_table(doc: Path) -> Dict[str, dict]:
    """Assembly table of Architektur section 3.3: | Nr. | `Name` | `Namespace` | `Ordner` | ..."""
    result: Dict[str, dict] = {}
    row_re = re.compile(r"^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|")
    in_section = False
    for line in doc.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("### 3.3"):
            in_section = True
            continue
        if in_section and line.startswith("### "):
            break
        if in_section:
            match = row_re.match(line)
            if match:
                folder = match.group(4)
                folder = folder[len("Scripts/"):] if folder.startswith("Scripts/") else folder
                result[match.group(2)] = {"number": int(match.group(1)), "namespace": match.group(3),
                                          "folder": ("Scripts/" + folder) if not folder.startswith("Tests/") else folder}
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True)
    parser.add_argument("--arch-doc", default=None)
    args = parser.parse_args()
    work = Path(args.work)
    model = json.loads((work / "model.json").read_text(encoding="utf-8"))
    arch = Path(args.arch_doc) if args.arch_doc else None
    findings = Linter(model, arch).run()
    (work / "lint.json").write_text(json.dumps(findings, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
