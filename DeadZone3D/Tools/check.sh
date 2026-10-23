#!/usr/bin/env bash
# Compile and test Dead Zone 3D without Unity (Linux/macOS, .NET 8 SDK).
#   DeadZone3D/Tools/check.sh            -> build Core, run NUnit tests, compile Game + Editor against Unity reference DLLs
#   DeadZone3D/Tools/check.sh --filter X -> only tests whose name contains X
# Unity references: NuGet UnityEngine.Modules 2021.3.33 and Unity3D.SDK 2021.1.14.1 (signatures only).
# Unity 6 APIs that are missing there are avoided in the code on purpose. Input System: compile stubs from Tools/Harness/packages.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
WORK="$HERE/.work"
FILTER=""
[ "${1:-}" = "--filter" ] && FILTER="${2:-}"
mkdir -p "$WORK"/{core,tests,inputstub,game,editor}
SRC="$ROOT/Assets/_Project/Scripts"
COMMON='<LangVersion>9.0</LangVersion><Nullable>disable</Nullable><NoWarn>0169;0649;0414;1701;1702;CS8981</NoWarn><EnableDefaultCompileItems>false</EnableDefaultCompileItems><TreatWarningsAsErrors>false</TreatWarningsAsErrors><GenerateDocumentationFile>false</GenerateDocumentationFile>'
UNITY_DEFINES='UNITY_6000_0_OR_NEWER;UNITY_2021_3_OR_NEWER;UNITY_STANDALONE;UNITY_STANDALONE_WIN;ENABLE_INPUT_SYSTEM;DZ_INPUT_SYSTEM;NET_STANDARD_2_1'
cat > "$WORK/core/Core.csproj" <<XML
<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>netstandard2.1</TargetFramework><AssemblyName>DeadZone.Core</AssemblyName>$COMMON</PropertyGroup>
<ItemGroup><Compile Include="$SRC/Core/**/*.cs" /></ItemGroup></Project>
XML
cat > "$WORK/tests/Tests.csproj" <<XML
<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsPackable>false</IsPackable>$COMMON<DefineConstants>UNITY_INCLUDE_TESTS</DefineConstants></PropertyGroup>
<ItemGroup><Compile Include="$ROOT/Assets/_Project/Tests/EditMode/**/*.cs" /></ItemGroup>
<ItemGroup><ProjectReference Include="../core/Core.csproj" />
<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" /><PackageReference Include="NUnit" Version="3.14.0" /><PackageReference Include="NUnit3TestAdapter" Version="4.5.0" /></ItemGroup></Project>
XML
cat > "$WORK/inputstub/InputStub.csproj" <<XML
<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>netstandard2.1</TargetFramework><AssemblyName>Unity.InputSystem</AssemblyName>$COMMON</PropertyGroup>
<ItemGroup><Compile Include="$REPO/Tools/Harness/packages/Unity.InputSystem/*.cs" /><Compile Include="$HERE/stubs/*.cs" /></ItemGroup>
<ItemGroup><PackageReference Include="UnityEngine.Modules" Version="2021.3.33" /></ItemGroup></Project>
XML
cat > "$WORK/game/Game.csproj" <<XML
<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>netstandard2.1</TargetFramework><AssemblyName>DeadZone.Game</AssemblyName>$COMMON<DefineConstants>$UNITY_DEFINES</DefineConstants></PropertyGroup>
<ItemGroup><Compile Include="$SRC/Game/**/*.cs" /></ItemGroup>
<ItemGroup><ProjectReference Include="../core/Core.csproj" /><ProjectReference Include="../inputstub/InputStub.csproj" /><PackageReference Include="UnityEngine.Modules" Version="2021.3.33" /></ItemGroup></Project>
XML
cat > "$WORK/editor/Editor.csproj" <<XML
<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>netstandard2.1</TargetFramework><AssemblyName>DeadZone.Editor</AssemblyName>$COMMON<DefineConstants>$UNITY_DEFINES;UNITY_EDITOR</DefineConstants></PropertyGroup>
<ItemGroup><Compile Include="$SRC/Editor/**/*.cs" /></ItemGroup>
<ItemGroup><ProjectReference Include="../core/Core.csproj" /><ProjectReference Include="../game/Game.csproj" /><PackageReference Include="UnityEngine.Modules" Version="2021.3.33" /><PackageReference Include="Unity3D.SDK" Version="2021.1.14.1" /></ItemGroup></Project>
XML
status=0
echo "== Core + Tests"
if [ -n "$FILTER" ]; then dotnet test "$WORK/tests/Tests.csproj" --nologo -v q --filter "Name~$FILTER" 2>&1 | grep -v "^\s*$" | tail -25 || status=1
else dotnet test "$WORK/tests/Tests.csproj" --nologo -v q 2>&1 | grep -v "^\s*$" | tail -25 || status=1; fi
for p in game editor; do
  if ls "$SRC/${p^}"/*.cs >/dev/null 2>&1 || [ -n "$(find "$SRC/${p^}" -name '*.cs' 2>/dev/null | head -1)" ]; then
    echo "== Compile $p"
    out="$(dotnet build "$WORK/$p/${p^}.csproj" --nologo -v q -clp:NoSummary 2>&1)" || status=1
    printf '%s\n' "$out" | grep -E "error|warning CS0618|Warn" | sed "s|$ROOT/||" | sort -u | head -60
  fi
done
exit $status
