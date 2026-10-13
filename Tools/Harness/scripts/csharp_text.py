"""Harness only: light-weight C# text helpers for the lint and the report.

Not a parser. It strips comments and string/char literals (keeping line numbers),
tracks #if regions and finds type declarations with brace counting. Good enough for
heuristic rule checks; the compiler does the real work.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class SourceText:
    path: str
    original_lines: List[str]
    code_lines: List[str]          # comments and literals replaced by spaces
    comment_lines: List[str]       # only comment text (rest blank)
    region_defines: List[List[str]] = field(default_factory=list)  # per line: symbols of enclosing #if blocks


def strip(text: str) -> Tuple[str, str]:
    """Returns (code, comments): both with the same length/line structure as text."""
    code = []
    comments = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            end = text.find("\n", i)
            end = n if end < 0 else end
            segment = text[i:end]
            code.append(" " * len(segment))
            comments.append(segment)
            i = end
            continue
        if ch == "/" and nxt == "*":
            end = text.find("*/", i + 2)
            end = n if end < 0 else end + 2
            segment = text[i:end]
            code.append(_blank(segment))
            comments.append(segment)
            i = end
            continue
        if ch == '"' or (ch in "@$" and nxt == '"') or (ch in "@$" and nxt in "@$" and i + 2 < n and text[i + 2] == '"'):
            start = i
            verbatim = False
            while text[i] in "@$":
                verbatim = verbatim or text[i] == "@"
                i += 1
            i += 1  # opening quote
            while i < n:
                if verbatim:
                    if text[i] == '"' and i + 1 < n and text[i + 1] == '"':
                        i += 2
                        continue
                    if text[i] == '"':
                        i += 1
                        break
                else:
                    if text[i] == "\\":
                        i += 2
                        continue
                    if text[i] == '"' or text[i] == "\n":
                        i += 1
                        break
                i += 1
            segment = text[start:i]
            code.append('"' + _blank(segment[1:-1]) + '"' if len(segment) >= 2 else _blank(segment))
            comments.append(_blank(segment))
            continue
        if ch == "'":
            end = i + 1
            while end < n and end - i < 12:
                if text[end] == "\\":
                    end += 2
                    continue
                if text[end] == "'":
                    break
                end += 1
            if end < n and text[end] == "'":
                segment = text[i:end + 1]
                code.append("'" + _blank(segment[1:-1]) + "'")
                comments.append(_blank(segment))
                i = end + 1
                continue
        code.append(ch)
        comments.append(ch if ch == "\n" else " ")
        i += 1
    return "".join(code), "".join(comments)


def _blank(segment: str) -> str:
    return "".join("\n" if c == "\n" else " " for c in segment)


IF_RE = re.compile(r"^\s*#\s*(if|elif|else|endif)\b(.*)$")
SYMBOL_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def load(path: str) -> SourceText:
    with open(path, encoding="utf-8-sig", errors="replace") as handle:
        text = handle.read()
    code, comments = strip(text)
    source = SourceText(path, text.split("\n"), code.split("\n"), comments.split("\n"))
    stack: List[List[str]] = []
    for line in source.code_lines:
        match = IF_RE.match(line)
        if match:
            kind, expr = match.group(1), match.group(2)
            symbols = [s for s in SYMBOL_RE.findall(expr) if s not in ("true", "false")]
            if kind == "if":
                stack.append(symbols)
            elif kind in ("elif", "else") and stack:
                # The else branch of "#if UNITY_EDITOR" is NOT editor code.
                stack[-1] = ["!" + s for s in stack[-1]] + symbols if kind == "elif" else ["!" + s for s in stack[-1]]
            elif kind == "endif" and stack:
                stack.pop()
            source.region_defines.append([s for block in stack for s in block])
            continue
        source.region_defines.append([s for block in stack for s in block])
    return source


def in_region(source: SourceText, line_index: int, symbols: Tuple[str, ...]) -> bool:
    """True if the line is inside an #if block that requires one of the symbols."""
    active = source.region_defines[line_index] if line_index < len(source.region_defines) else []
    return any(s in active for s in symbols)


@dataclass
class TypeDecl:
    kind: str
    name: str
    line: int          # 0-based
    top_level: bool
    is_public: bool
    generic: bool
    modifiers: str


TOKEN_RE = re.compile(
    r"\bnamespace\s+(?P<ns>[\w.]+)"
    r"|\b(?P<kind>class|struct|interface|enum|record)\s+(?P<name>[A-Za-z_]\w*)(?P<gen>\s*<)?"
    r"|\bdelegate\s+[\w<>\[\],.?\s]+?\s+(?P<dname>[A-Za-z_]\w*)\s*(?P<dgen><)?\s*\("
    r"|(?P<open>\{)|(?P<close>\})|(?P<semi>;)"
)


def scan_types(source: SourceText) -> Tuple[List[str], List[TypeDecl]]:
    """Namespaces and type declarations of a file."""
    code = "\n".join(source.code_lines)
    line_starts = [0]
    for idx, ch in enumerate(code):
        if ch == "\n":
            line_starts.append(idx + 1)

    def line_of(pos: int) -> int:
        lo, hi = 0, len(line_starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_starts[mid] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return lo

    namespaces: List[str] = []
    types: List[TypeDecl] = []
    stack: List[str] = []
    pending: Optional[str] = None
    file_scoped_ns = False
    for match in TOKEN_RE.finditer(code):
        if match.group("ns"):
            namespaces.append(match.group("ns"))
            pending = "ns"
            rest = code[match.end():match.end() + 200].lstrip()
            if rest.startswith(";"):
                file_scoped_ns = True
                pending = None
            continue
        if match.group("kind") or match.group("dname"):
            if match.group("kind") and _is_constraint(code, match.start()):
                continue
            kind = match.group("kind") or "delegate"
            name = match.group("name") or match.group("dname")
            generic = bool(match.group("gen") or match.group("dgen"))
            top = all(entry == "ns" for entry in stack)
            modifiers = _modifiers_before(code, match.start())
            types.append(TypeDecl(kind, name, line_of(match.start()), top, "public" in modifiers.split(), generic, modifiers))
            pending = "type" if kind != "delegate" else None
            continue
        if match.group("open"):
            stack.append(pending or "other")
            pending = None
            continue
        if match.group("close"):
            if stack:
                stack.pop()
            continue
        if match.group("semi"):
            if pending == "type":
                pending = None
    if file_scoped_ns:
        namespaces = [ns + " (file-scoped)" for ns in namespaces]
    return namespaces, types


def _is_constraint(code: str, pos: int) -> bool:
    """'class'/'struct' used in a generic constraint (where T : class)."""
    before = code[max(0, pos - 120):pos]
    return re.search(r"\bwhere\s+\w+\s*:\s*(?:[\w<>,.\s]*,\s*)?$", before) is not None or before.rstrip().endswith((",", ":"))


def _modifiers_before(code: str, pos: int) -> str:
    start = pos
    while start > 0 and code[start - 1] not in ";{}]":
        start -= 1
    return code[start:pos].strip()
