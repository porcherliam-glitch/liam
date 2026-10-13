#!/usr/bin/env bash
# =============================================================================
# Unity-Harness fuer "Chroniken von Aetherfall" - Kompilier- und Testpruefung
# des Unity-C#-Codes OHNE Unity (nur dotnet 8 SDK + python3).
#
#   (a) Runtime-Skripte   Assets/_Project/Scripts/** (ohne Editor/)  -> netstandard2.1, C# 9
#       Durchlaeufe: Editor (UNITY_EDITOR, DEVELOPMENT_BUILD, Dev-Defines) und
#                    Player Windows Release (ohne UNITY_EDITOR/DEVELOPMENT_BUILD)
#   (b) Editor-Skripte    Assets/_Project/Scripts/Editor/**         -> gegen UnityEditor.dll
#   (c) Tests             Assets/_Project/Tests/**                  -> net8.0 + NUnit 3.14, dotnet test
#                         + Kompatibilitaets-Build netstandard2.1 + NUnit 3.5 (Basis von Unitys NUnit)
#   (d) Zusammenfassung   Fehler/Warnungen je Teil, Testergebnis, Regel-Lint; Exit-Code != 0 bei Fehlern
#
# Aufruf:  ./run_checks.sh [Optionen]        (Hilfe: ./run_checks.sh --help)
# Exit:    0 = OK, 1 = Fehler im Code, 2 = Harness-/Infrastrukturproblem
# =============================================================================
set -uo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Default: repository root (this script lives in <repo>/Tools/Harness)
PROJECT_DIR="$(cd "$HARNESS_DIR/../.." && pwd)"
PASSES="editor,player-win"
DEV_DEFINES="AETHERFALL_DEV;AETHERFALL_CHEATS;AETHERFALL_TELEMETRY"
EXTRA_DEFINES=""
WORK_DIR=""
TEST_FILTER=""
NO_TESTS=0
NO_LINT=0
NO_COMPAT=0
NO_ANALYZERS=0
NO_PATCH=0
NO_EDITOR=0
VERBOSE=0
CLEAN=0
SELFTEST=0
WITHOUT_PACKAGES=""
PACKAGE_MATRIX=1

usage() {
  cat <<'EOF'
Aufruf: run_checks.sh [Optionen]

  --project DIR        Unity-Projektwurzel (Standard: /home/user/liam)
  --passes LISTE       Kompilier-Durchlaeufe, kommagetrennt (Standard: editor,player-win)
                       moeglich: editor, player-win, player-osx, player-win-dev
  --dev-defines "A;B"  Defines der Dev-Durchlaeufe (Standard: AETHERFALL_DEV;AETHERFALL_CHEATS;AETHERFALL_TELEMETRY)
  --define SYMBOL      zusaetzliches Define fuer alle Durchlaeufe (mehrfach moeglich)
  --filter AUSDRUCK    dotnet-test-Filter, z. B. "FullyQualifiedName~EventBus"
  --no-tests           Tests nur bauen, nicht ausfuehren
  --no-compat          keinen NUnit-3.5-/netstandard2.1-Kompatibilitaets-Build der Tests
  --no-lint            Regel-Lint auslassen
  --no-analyzers       Microsoft.Unity.Analyzers nicht ausfuehren
  --no-patch           Unity-6-Member NICHT in die Referenzen patchen (nur Whitelist-Filter)
  --no-editor          ohne UnityEditor-Referenzen (Editor-Code wird nur gelistet)
  --without-packages L Unity-Pakete als FEHLEND simulieren, kommagetrennt (z. B. com.unity.cinemachine);
                       "stubs" = alle Pakete aus packages/packages.json (Stubs und NuGet-DLLs)
  --no-package-matrix  keinen zweiten Lauf "ohne Pakete" anhaengen (Standard: Hauptlauf mit Paket-Stubs,
                       danach Lauf ohne alle Stub-Pakete - beweist, dass fehlende Pakete nichts kaputt machen)
  --work DIR           Arbeitsordner (Standard: <harness>/.work/<Projektname>)
  --clean              Caches (.cache, .work) loeschen und neu aufbauen
  --selftest           Harness gegen selftest/clean und selftest/faulty pruefen
  --verbose            alle Warnungen/Details ausgeben
  -h, --help           diese Hilfe
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT_DIR="$2"; shift 2 ;;
    --passes) PASSES="$2"; shift 2 ;;
    --dev-defines) DEV_DEFINES="$2"; shift 2 ;;
    --define) EXTRA_DEFINES="${EXTRA_DEFINES:+$EXTRA_DEFINES;}$2"; shift 2 ;;
    --filter) TEST_FILTER="$2"; shift 2 ;;
    --work) WORK_DIR="$2"; shift 2 ;;
    --no-tests) NO_TESTS=1; shift ;;
    --no-compat) NO_COMPAT=1; shift ;;
    --no-lint) NO_LINT=1; shift ;;
    --no-analyzers) NO_ANALYZERS=1; shift ;;
    --no-patch) NO_PATCH=1; shift ;;
    --no-editor) NO_EDITOR=1; shift ;;
    --without-packages) WITHOUT_PACKAGES="$2"; shift 2 ;;
    --no-package-matrix) PACKAGE_MATRIX=0; shift ;;
    --clean) CLEAN=1; shift ;;
    --selftest) SELFTEST=1; shift ;;
    --verbose) VERBOSE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 MSBUILDDISABLENODEREUSE=1

CACHE_DIR="$HARNESS_DIR/.cache"
REFS_DIR="$CACHE_DIR/unity-refs"
PY="python3"

log() { printf '[harness] %s\n' "$*"; }
die() { printf '[harness] FEHLER: %s\n' "$*" >&2; exit 2; }

command -v dotnet >/dev/null 2>&1 || die "dotnet nicht gefunden (benoetigt .NET 8 SDK)"
command -v "$PY" >/dev/null 2>&1 || die "python3 nicht gefunden"

# --------------------------------------------------------------------- selftest
if [ "$SELFTEST" = 1 ]; then
  rc=0
  mkdir -p "$HARNESS_DIR/.work"
  for variant in clean faulty; do
    log "Selbsttest: selftest/$variant"
    args=(--project "$HARNESS_DIR/selftest/$variant" --work "$HARNESS_DIR/.work/selftest-$variant" --passes "$PASSES" --no-package-matrix
          --without-packages stubs)  # selftest/faulty checks the behaviour of MISSING packages
    [ "$NO_PATCH" = 1 ] && args+=(--no-patch)
    [ "$VERBOSE" = 1 ] && args+=(--verbose)
    "$0" "${args[@]}" > "$HARNESS_DIR/.work/selftest-$variant.out" 2>&1
    echo "$?" > "$HARNESS_DIR/.work/selftest-$variant.exit"
    tail -n 30 "$HARNESS_DIR/.work/selftest-$variant.out"
  done
  "$PY" "$HARNESS_DIR/scripts/selftest_check.py" --harness "$HARNESS_DIR" || rc=1
  exit $rc
fi

[ -d "$PROJECT_DIR" ] || die "Projektordner nicht gefunden: $PROJECT_DIR"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
[ -n "$WORK_DIR" ] || WORK_DIR="$HARNESS_DIR/.work/$(basename "$PROJECT_DIR")"
mkdir -p "$WORK_DIR" || die "Arbeitsordner nicht anlegbar: $WORK_DIR"
WORK_DIR="$(cd "$WORK_DIR" && pwd)"

if [ "$CLEAN" = 1 ]; then
  log "Loesche Caches"
  rm -rf "$CACHE_DIR" "$WORK_DIR"
  find "$HARNESS_DIR/shims" "$HARNESS_DIR/patches" "$HARNESS_DIR/tools" -type d \( -name bin -o -name obj \) -prune -exec rm -rf {} + 2>/dev/null
  mkdir -p "$WORK_DIR"
fi

# --------------------------------------------------------------------- 1. Unity-Referenzen
prepare_refs() {
  local out engine editor
  log "Unity-Referenzen beschaffen (NuGet: UnityEngine.Modules 2021.3.33, Unity3D.SDK 2021.1.14.1)"
  out="$(cd "$HARNESS_DIR/tools/UnityRefs" && dotnet restore --nologo -v:q --configfile "$HARNESS_DIR/nuget.config" 2>&1)" || { echo "$out"; die "NuGet-Restore der Unity-Referenzen fehlgeschlagen"; }
  out="$(cd "$HARNESS_DIR/tools/UnityRefs" && dotnet msbuild -nologo -v:m -t:PrintUnityRefPaths 2>&1)"
  engine="$(printf '%s\n' "$out" | sed -n 's/^ *ENGINE=//p' | head -n1)"
  editor="$(printf '%s\n' "$out" | sed -n 's/^ *EDITOR=//p' | head -n1)"
  [ -f "$engine/UnityEngine.CoreModule.dll" ] || die "UnityEngine-Module nicht gefunden ($engine)"
  rm -rf "$REFS_DIR/original"
  mkdir -p "$REFS_DIR/original/engine" "$REFS_DIR/original/editor"
  cp "$engine"/*.dll "$REFS_DIR/original/engine/"
  if [ -f "$editor/UnityEditor.dll" ]; then
    cp "$editor/UnityEditor.dll" "$REFS_DIR/original/editor/"
  fi
  chmod 644 "$REFS_DIR"/original/*/*.dll
}

build_tool() { # $1 project dir, $2 output dir, $3 label
  local out
  out="$(dotnet build "$1" -c Release -nologo -v:q -clp:NoSummary -o "$2" 2>&1)" || { echo "$out"; die "$3 konnte nicht gebaut werden"; }
}

prepare_cache() {
  local stamp current
  current="$("$PY" -B - "$HARNESS_DIR" <<'PYEOF'
import hashlib, os, sys
root = sys.argv[1]
digest = hashlib.sha256()
for top in ("shims", "patches", "packages", "tools/RefPatcher", "tools/UnityRefs", "msbuild", "nuget.config"):
    path = os.path.join(root, top)
    files = [path] if os.path.isfile(path) else [
        os.path.join(d, f) for d, dirs, fs in os.walk(path) for f in fs
        if "/obj" not in d and "/bin" not in d and f.endswith((".cs", ".csproj", ".props", ".targets", ".config", ".json"))]
    for name in sorted(files):
        digest.update(name[len(root):].encode())
        with open(name, "rb") as handle:
            digest.update(handle.read())
print(digest.hexdigest())
PYEOF
)"
  stamp="$CACHE_DIR/prepare.stamp"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$current" ] \
     && [ -f "$REFS_DIR/engine/UnityEngine.CoreModule.dll" ] && [ -f "$REFS_DIR/engine/Harness.Unity6Shims.Engine.dll" ] \
     && [ -f "$REFS_DIR/testrunner/Harness.UnityTestRunnerShims.dll" ] \
     && [ -f "$REFS_DIR/packages/Unity.InputSystem.dll" ] && [ -f "$REFS_DIR/packages/Unity.Cinemachine.dll" ] \
     && { [ ! -f "$REFS_DIR/original/editor/UnityEditor.dll" ] || [ -f "$REFS_DIR/editor/UnityEditor.dll" ]; }; then
    return 0
  fi
  prepare_refs
  log "Shims, Unity-6-Patches und RefPatcher bauen"
  rm -rf "$CACHE_DIR/shims" "$CACHE_DIR/shims-testrunner" "$CACHE_DIR/patches" "$REFS_DIR/engine" "$REFS_DIR/editor" \
         "$REFS_DIR/testrunner" "$REFS_DIR/unpatched" "$CACHE_DIR/packages" "$REFS_DIR/packages"
  build_tool "$HARNESS_DIR/shims/Unity6Shims.Engine" "$CACHE_DIR/shims" "Unity6Shims.Engine"
  local maps=(--map "$REFS_DIR/original/engine=$REFS_DIR/engine")
  if [ -f "$REFS_DIR/original/editor/UnityEditor.dll" ]; then
    build_tool "$HARNESS_DIR/shims/Unity6Shims.Editor" "$CACHE_DIR/shims" "Unity6Shims.Editor"
    maps+=(--map "$REFS_DIR/original/editor=$REFS_DIR/editor")
  fi
  build_tool "$HARNESS_DIR/shims/UnityTestRunnerShims" "$CACHE_DIR/shims-testrunner" "UnityTestRunnerShims"
  if [ -f "$REFS_DIR/original/editor/UnityEditor.dll" ]; then
    build_tool "$HARNESS_DIR/patches/Unity6Patches" "$CACHE_DIR/patches" "Unity6Patches"
  else
    die "UnityEditor.dll fehlt - Unity6Patches braucht sie (mit --no-editor wird nur der Editor-Teil uebersprungen)"
  fi
  build_tool "$HARNESS_DIR/tools/RefPatcher" "$CACHE_DIR/tools/RefPatcher" "RefPatcher"
  log "Unity-Referenzen patchen (Unity-6-Member, Obsolete-Markierungen von 6.3)"
  dotnet "$CACHE_DIR/tools/RefPatcher/RefPatcher.dll" --patches "$CACHE_DIR/patches/Harness.Unity6Patches.dll" \
    "${maps[@]}" --search "$CACHE_DIR/shims" --manifest "$REFS_DIR/patch-manifest.txt" > "$REFS_DIR/patch.log" 2>&1 \
    || { cat "$REFS_DIR/patch.log"; die "RefPatcher fehlgeschlagen"; }
  mkdir -p "$REFS_DIR/testrunner" "$REFS_DIR/unpatched/engine" "$REFS_DIR/unpatched/editor"
  cp "$CACHE_DIR/shims/Harness.Unity6Shims.Engine.dll" "$REFS_DIR/engine/"
  cp "$REFS_DIR/original/engine/"*.dll "$CACHE_DIR/shims/Harness.Unity6Shims.Engine.dll" "$REFS_DIR/unpatched/engine/"
  if [ -f "$CACHE_DIR/shims/Harness.Unity6Shims.Editor.dll" ]; then
    cp "$CACHE_DIR/shims/Harness.Unity6Shims.Editor.dll" "$REFS_DIR/editor/"
    cp "$REFS_DIR/original/editor/UnityEditor.dll" "$CACHE_DIR/shims/Harness.Unity6Shims.Editor.dll" "$REFS_DIR/unpatched/editor/"
  fi
  cp "$CACHE_DIR/shims-testrunner/Harness.UnityTestRunnerShims.dll" "$REFS_DIR/testrunner/"
  # Compile-only stubs of Unity packages (packages/packages.json), e.g. Unity.InputSystem, Unity.Cinemachine.
  log "Paket-Stubs bauen (nur Signaturen): $(cd "$HARNESS_DIR/packages" && ls -d */ | tr -d '/' | tr '\n' ' ')"
  mkdir -p "$REFS_DIR/packages"
  local stub
  for stub in "$HARNESS_DIR"/packages/*/*.csproj; do
    build_tool "$stub" "$CACHE_DIR/packages/$(basename "$stub" .csproj)" "Paket-Stub $(basename "$stub" .csproj)"
    cp "$CACHE_DIR/packages/$(basename "$stub" .csproj)/$(basename "$stub" .csproj).dll" "$REFS_DIR/packages/"
  done
  echo "$current" > "$stamp"
}

mkdir -p "$CACHE_DIR"
prepare_cache

EDITOR_FLAG=()
if [ "$NO_EDITOR" = 1 ] || [ ! -f "$REFS_DIR/editor/UnityEditor.dll" ]; then
  EDITOR_FLAG=(--no-editor-refs)
  log "Editor-Code nicht kompilierbar – nur Review (keine UnityEditor-Referenzen)"
fi

# --------------------------------------------------------------------- 2. Projekte erzeugen
log "Projekt: $PROJECT_DIR"
rm -rf "$WORK_DIR/test-results" "$WORK_DIR"/*/*.Degraded "$WORK_DIR"/*/build.*.log "$WORK_DIR"/*/build.status "$WORK_DIR/lint.json" \
       "$WORK_DIR/summary.txt" "$WORK_DIR/summary.json" "$WORK_DIR/model.json"
GEN_ARGS=(--project "$PROJECT_DIR" --harness "$HARNESS_DIR" --work "$WORK_DIR" --passes "$PASSES"
          --dev-defines "$DEV_DEFINES" --extra-defines "$EXTRA_DEFINES"
          --package-stubs "$HARNESS_DIR/packages/packages.json" --package-refs "$REFS_DIR/packages"
          --without-packages "$WITHOUT_PACKAGES")
[ "$NO_PATCH" = 1 ] && GEN_ARGS+=(--refs-mode unpatched)
[ "$NO_ANALYZERS" = 1 ] && GEN_ARGS+=(--no-analyzers)
[ "$NO_COMPAT" = 1 ] && GEN_ARGS+=(--no-compat)
[ "${#EDITOR_FLAG[@]}" -gt 0 ] && GEN_ARGS+=("${EDITOR_FLAG[@]}")
"$PY" -B "$HARNESS_DIR/scripts/gen_projects.py" "${GEN_ARGS[@]}" || die "Projekterzeugung fehlgeschlagen"

model_query() { # prints lines from model.json
  "$PY" -B - "$WORK_DIR/model.json" "$1" <<'PYEOF'
import json, sys
model = json.load(open(sys.argv[1], encoding="utf-8"))
if sys.argv[2] == "passes":
    for p in model["passes"]:
        if p.get("solution"):
            print(p["id"], p["configuration"], p["solution"], sep="\t")
elif sys.argv[2] == "tests":
    for t in model["test_projects"]:
        print(t["assembly"], t["csproj"], t["configuration"], sep="\t")
PYEOF
}

# --------------------------------------------------------------------- 3. Bauen
while IFS=$'\t' read -r pass config sln; do
  [ -n "$pass" ] || continue
  log "Kompilieren: Durchlauf '$pass' ($config)"
  # Old outputs must not hide a failed build (the report checks for the DLLs).
  find "$WORK_DIR/$pass" -mindepth 2 -maxdepth 2 -type d -name bin -prune -exec rm -rf {} + 2>/dev/null
  dotnet build "$sln" -c "$config" --no-incremental -nologo -v:q -clp:NoSummary -nodeReuse:false \
    -fl1 "-flp1:logfile=$WORK_DIR/$pass/build.errors.log;errorsonly;encoding=utf-8" \
    -fl2 "-flp2:logfile=$WORK_DIR/$pass/build.warnings.log;warningsonly;encoding=utf-8" \
    > "$WORK_DIR/$pass/build.console.log" 2>&1
  echo "exit=$?" > "$WORK_DIR/$pass/build.status"
done < <(model_query passes)

# --------------------------------------------------------------------- 4. Tests
if [ "$NO_TESTS" = 0 ]; then
  # Test projects that only failed because of a referenced assembly the tests do not use
  # are rebuilt without that reference (see scripts/degrade_tests.py).
  while IFS= read -r degraded; do
    [ -n "$degraded" ] || continue
    log "Tests ohne ungenutzte, fehlgeschlagene Referenzen bauen: $(basename "$degraded" .csproj)"
    dotnet build "$degraded" -c Debug -nologo -v:q -clp:NoSummary -nodeReuse:false \
      -fl1 "-flp1:logfile=$(dirname "$degraded")/build.errors.log;errorsonly;encoding=utf-8" \
      -fl2 "-flp2:logfile=$(dirname "$degraded")/build.warnings.log;warningsonly;encoding=utf-8" \
      > "$(dirname "$degraded")/build.console.log" 2>&1
  done < <("$PY" -B "$HARNESS_DIR/scripts/degrade_tests.py" --work "$WORK_DIR")

  mkdir -p "$WORK_DIR/test-results"
  while IFS=$'\t' read -r asm csproj config; do
    [ -n "$asm" ] || continue
    dll="$(dirname "$csproj")/bin/$config/$asm.dll"
    if [ ! -f "$dll" ]; then
      echo "not-built" > "$WORK_DIR/test-results/$asm.status"
      log "Tests: $asm nicht gebaut - kein Testlauf"
      continue
    fi
    log "Tests ausfuehren: $asm"
    test_args=("$csproj" -c "$config" --no-build --nologo --results-directory "$WORK_DIR/test-results"
               --logger "trx;LogFileName=$asm.trx")
    [ -n "$TEST_FILTER" ] && test_args+=(--filter "$TEST_FILTER")
    # A hanging test (e.g. an Awaitable that never completes) fails alone instead of stopping the run.
    test_args+=(-- NUnit.DefaultTimeout=60000)
    if command -v timeout >/dev/null 2>&1; then
      timeout 900 dotnet test "${test_args[@]}" > "$WORK_DIR/test-results/$asm.console.log" 2>&1
    else
      dotnet test "${test_args[@]}" > "$WORK_DIR/test-results/$asm.console.log" 2>&1
    fi
    echo "exit=$?" > "$WORK_DIR/test-results/$asm.status"
  done < <(model_query tests)
fi

# --------------------------------------------------------------------- 5. Regel-Lint
if [ "$NO_LINT" = 0 ]; then
  "$PY" -B "$HARNESS_DIR/scripts/lint.py" --work "$WORK_DIR" --arch-doc "$PROJECT_DIR/docs/Technik/01_Architektur.md" \
    || log "Regel-Lint fehlgeschlagen (wird in der Zusammenfassung ausgelassen)"
fi

# --------------------------------------------------------------------- 6. Zusammenfassung
REPORT_ARGS=(--work "$WORK_DIR" --whitelist "$HARNESS_DIR/unity6_whitelist.txt")
[ "$NO_TESTS" = 1 ] && REPORT_ARGS+=(--no-tests)
[ "$NO_LINT" = 1 ] && REPORT_ARGS+=(--no-lint)
[ "$NO_COMPAT" = 1 ] && REPORT_ARGS+=(--no-compat)
[ "$VERBOSE" = 1 ] && REPORT_ARGS+=(--verbose)
"$PY" -B "$HARNESS_DIR/scripts/report.py" "${REPORT_ARGS[@]}"
rc=$?

# --------------------------------------------------------------------- 7. Lauf "ohne Pakete"
# Simulates the first opening of the project from the "Universal 3D" template: the packages with harness stubs
# (Input System, Cinemachine) are missing. Assemblies that need them must be excluded by their defineConstraints;
# everything else (including the remaining tests) must still compile and pass.
if [ "$PACKAGE_MATRIX" = 1 ] && [ -z "$WITHOUT_PACKAGES" ]; then
  log "Zweiter Lauf: Pakete mit Harness-Stub fehlen (simuliert) - beweist, dass fehlende Pakete nichts kaputt machen"
  matrix_args=(--project "$PROJECT_DIR" --work "${WORK_DIR}-ohne-pakete" --passes "$PASSES" --dev-defines "$DEV_DEFINES"
               --without-packages stubs --no-package-matrix)
  [ -n "$EXTRA_DEFINES" ] && matrix_args+=(--define "$EXTRA_DEFINES")
  [ -n "$TEST_FILTER" ] && matrix_args+=(--filter "$TEST_FILTER")
  [ "$NO_TESTS" = 1 ] && matrix_args+=(--no-tests)
  [ "$NO_LINT" = 1 ] && matrix_args+=(--no-lint)
  [ "$NO_COMPAT" = 1 ] && matrix_args+=(--no-compat)
  [ "$NO_ANALYZERS" = 1 ] && matrix_args+=(--no-analyzers)
  [ "$NO_PATCH" = 1 ] && matrix_args+=(--no-patch)
  [ "$NO_EDITOR" = 1 ] && matrix_args+=(--no-editor)
  "$0" "${matrix_args[@]}" > "${WORK_DIR}-ohne-pakete.out" 2>&1
  matrix_rc=$?
  sed -n '/Unity-Harness - Zusammenfassung/,$p' "${WORK_DIR}-ohne-pakete.out" | sed 's/^/  [ohne Pakete] /'
  if [ "$matrix_rc" -ne 0 ]; then
    log "Lauf OHNE Pakete: Exit-Code $matrix_rc - Details: ${WORK_DIR}-ohne-pakete.out"
    [ "$rc" -lt "$matrix_rc" ] && rc=$matrix_rc
  fi
  log "Gesamtergebnis (mit Paket-Stubs + ohne Pakete): Exit-Code $rc"
fi
exit $rc
