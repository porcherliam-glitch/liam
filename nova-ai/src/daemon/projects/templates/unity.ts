// Template "unity" – Unity project skeleton (opened and completed by Unity Hub/Editor).
// Key decisions:
// - ProjectSettings/ProjectVersion.txt is NOT created (Unity creates ProjectSettings on first open, SPEC §4.8).
// - Runtime code lives in its own assembly (<Id>.Runtime.asmdef) so the EditMode test assembly can reference it;
//   pure logic (ScoreBoard, GameRules) is tested with NUnit via com.unity.test-framework.
// - Assets/Editor/NovaBuild.cs creates a main scene if none is in the build settings and builds a Windows player
//   (used by the package command). Commands are only set when a Unity editor is detected (integrations), else null
//   with a German note. Preview kind engine-external (no embedded live preview – honest).
import type { ProjectTemplate } from '../../contracts';
import { emptyCommands } from '../config';
import { unityPackageCommand, unityTestCommand } from '../unity';
import { GITIGNORE_COMMON, HONEST_LIMITS_DE, csharpIdentifier, csString, markdownParagraph, writeScaffold, xmlEscape, type ScaffoldFiles } from './common';

const RESERVED_IDS = new Set(['ScoreBoard', 'GameRules', 'NovaBuild', 'UnityEngine', 'UnityEditor', 'System', 'NUnit', 'Tests']);

export function unityIdentifier(name: string): string {
  let id = csharpIdentifier(name, 'NovaGame');
  if (RESERVED_IDS.has(id)) id = `${id}Projekt`;
  return id;
}

function runtimeAsmdef(id: string): string {
  return JSON.stringify({ name: `${id}.Runtime`, rootNamespace: id, references: [], includePlatforms: [], excludePlatforms: [], allowUnsafeCode: false, overrideReferences: false, precompiledReferences: [], autoReferenced: true, defineConstraints: [], versionDefines: [], noEngineReferences: false }, null, 4) + '\n';
}

function testsAsmdef(id: string): string {
  return (
    JSON.stringify(
      {
        name: `${id}.Tests.EditMode`,
        rootNamespace: `${id}.Tests`,
        references: ['UnityEngine.TestRunner', 'UnityEditor.TestRunner', `${id}.Runtime`],
        includePlatforms: ['Editor'],
        excludePlatforms: [],
        allowUnsafeCode: false,
        overrideReferences: true,
        precompiledReferences: ['nunit.framework.dll'],
        autoReferenced: false,
        defineConstraints: ['UNITY_INCLUDE_TESTS'],
        versionDefines: [],
        noEngineReferences: false,
      },
      null,
      4,
    ) + '\n'
  );
}

function scoreBoard(id: string): string {
  return `namespace ${id}
{
    /// <summary>Punktestand und Rekord – reine Logik ohne Unity-Abhängigkeiten (in EditMode-Tests prüfbar).</summary>
    public sealed class ScoreBoard
    {
        public int Score { get; private set; }
        public int Best { get; private set; }

        public void Add(int points)
        {
            if (points < 0)
            {
                throw new System.ArgumentOutOfRangeException(nameof(points), "Punkte dürfen nicht negativ sein.");
            }

            Score += points;
            if (Score > Best)
            {
                Best = Score;
            }
        }

        /// <summary>Neues Spiel: Punkte auf 0, der Rekord bleibt.</summary>
        public void Reset()
        {
            Score = 0;
        }
    }
}
`;
}

function gameRules(id: string): string {
  return `using UnityEngine;

namespace ${id}
{
    /// <summary>Bewegungs- und Sammelregeln als reine Funktionen (in EditMode-Tests prüfbar).</summary>
    public static class GameRules
    {
        /// <summary>Bewegt auf der XZ-Ebene; diagonal nicht schneller; bleibt innerhalb von ±halfSize.</summary>
        public static Vector3 Move(Vector3 position, Vector3 input, float speed, float deltaTime, float halfSize)
        {
            var direction = new Vector3(input.x, 0f, input.z);
            if (direction.sqrMagnitude > 1f)
            {
                direction.Normalize();
            }

            var next = position + direction * speed * deltaTime;
            next.x = Mathf.Clamp(next.x, -halfSize, halfSize);
            next.z = Mathf.Clamp(next.z, -halfSize, halfSize);
            return next;
        }

        /// <summary>True, wenn Spieler und Sammelobjekt (auf der XZ-Ebene) höchstens radius auseinander liegen.</summary>
        public static bool IsCollected(Vector3 player, Vector3 pickup, float radius)
        {
            var a = new Vector2(player.x, player.z);
            var b = new Vector2(pickup.x, pickup.z);
            return (a - b).sqrMagnitude <= radius * radius;
        }
    }
}
`;
}

function gameBehaviour(id: string, name: string): string {
  return `using UnityEngine;

namespace ${id}
{
    /// <summary>
    /// Kleines Startspiel für ${xmlEscape(name.replace(/[\r\n]/g, ' '))}: Würfel mit Pfeiltasten/WASD bewegen und Kugeln einsammeln.
    /// Hinweis: nutzt die klassische Eingabe (Input Manager). Wer das neue Input System verwendet, passt Update() an.
    /// </summary>
    public sealed class ${id}Game : MonoBehaviour
    {
        [SerializeField] private float speed = 5f;
        [SerializeField] private float arenaHalfSize = 8f;
        [SerializeField] private float pickupRadius = 0.9f;

        private readonly ScoreBoard scoreBoard = new ScoreBoard();
        private readonly System.Random random = new System.Random();
        private Transform player;
        private Transform pickup;

        public ScoreBoard Score => scoreBoard;

        private void Start()
        {
            player = GameObject.CreatePrimitive(PrimitiveType.Cube).transform;
            player.name = "Spieler";
            pickup = GameObject.CreatePrimitive(PrimitiveType.Sphere).transform;
            pickup.name = "Sammelobjekt";
            pickup.localScale = Vector3.one * 0.6f;
            MovePickup();

            var cam = Camera.main;
            if (cam != null)
            {
                cam.transform.position = new Vector3(0f, 14f, -10f);
                cam.transform.LookAt(Vector3.zero);
            }
        }

        private void Update()
        {
            if (player == null || pickup == null)
            {
                return;
            }

            var input = new Vector3(Input.GetAxisRaw("Horizontal"), 0f, Input.GetAxisRaw("Vertical"));
            player.position = GameRules.Move(player.position, input, speed, Time.deltaTime, arenaHalfSize);
            if (GameRules.IsCollected(player.position, pickup.position, pickupRadius))
            {
                scoreBoard.Add(1);
                MovePickup();
            }
        }

        private void MovePickup()
        {
            var x = (float)(random.NextDouble() * 2.0 - 1.0) * arenaHalfSize;
            var z = (float)(random.NextDouble() * 2.0 - 1.0) * arenaHalfSize;
            pickup.position = new Vector3(x, 0.3f, z);
        }

        private void OnGUI()
        {
            GUI.Label(new Rect(12f, 12f, 320f, 24f), "Punkte: " + scoreBoard.Score + "   Rekord: " + scoreBoard.Best);
        }
    }
}
`;
}

function tests(id: string): string {
  return `using NUnit.Framework;
using UnityEngine;

namespace ${id}.Tests
{
    public class ScoreBoardTests
    {
        [Test]
        public void Add_IncreasesScoreAndBest()
        {
            var board = new ScoreBoard();
            board.Add(2);
            board.Add(3);
            Assert.AreEqual(5, board.Score);
            Assert.AreEqual(5, board.Best);
        }

        [Test]
        public void Reset_KeepsBest()
        {
            var board = new ScoreBoard();
            board.Add(4);
            board.Reset();
            board.Add(1);
            Assert.AreEqual(1, board.Score);
            Assert.AreEqual(4, board.Best);
        }

        [Test]
        public void Add_RejectsNegativePoints()
        {
            Assert.Throws<System.ArgumentOutOfRangeException>(() => new ScoreBoard().Add(-1));
        }
    }

    public class GameRulesTests
    {
        [Test]
        public void Move_StaysInsideArena()
        {
            var next = GameRules.Move(new Vector3(7.9f, 0f, 0f), new Vector3(1f, 0f, 0f), 5f, 1f, 8f);
            Assert.AreEqual(8f, next.x, 1e-5f);
        }

        [Test]
        public void Move_DiagonalIsNotFaster()
        {
            var next = GameRules.Move(Vector3.zero, new Vector3(1f, 0f, 1f), 5f, 0.1f, 8f);
            Assert.AreEqual(0.5f, new Vector2(next.x, next.z).magnitude, 1e-4f);
        }

        [Test]
        public void IsCollected_UsesRadius()
        {
            Assert.IsTrue(GameRules.IsCollected(Vector3.zero, new Vector3(0.5f, 3f, 0f), 0.9f));
            Assert.IsFalse(GameRules.IsCollected(Vector3.zero, new Vector3(2f, 0f, 0f), 0.9f));
        }
    }
}
`;
}

function novaBuild(id: string): string {
  return `using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>
/// Windows-Build (64 Bit), auch im Batchmode:
/// Unity.exe -batchmode -nographics -quit -projectPath . -executeMethod NovaBuild.BuildWindows -logFile -
/// Gibt es noch keine Szene in den Build-Einstellungen, wird Assets/Scenes/Main.unity mit dem Startspiel angelegt.
/// </summary>
public static class NovaBuild
{
    private const string MainScenePath = "Assets/Scenes/Main.unity";
    private const string OutputPath = ${csString(`Builds/Windows/${id}.exe`)};

    [MenuItem("NOVA/Hauptszene anlegen")]
    public static void EnsureMainScene()
    {
        if (EditorBuildSettings.scenes.Any(scene => scene.enabled))
        {
            return;
        }

        if (!File.Exists(MainScenePath))
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            new GameObject("Spiel").AddComponent<${id}.${id}Game>();
            EditorSceneManager.SaveScene(scene, MainScenePath);
        }

        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(MainScenePath, true) };
    }

    [MenuItem("NOVA/Windows-Build erstellen")]
    public static void BuildWindows()
    {
        EnsureMainScene();
        var options = new BuildPlayerOptions
        {
            scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray(),
            locationPathName = OutputPath,
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.None,
        };
        var report = BuildPipeline.BuildPlayer(options);
        var ok = report.summary.result == BuildResult.Succeeded;
        Debug.Log(ok ? "Build erfolgreich: " + OutputPath : "Build fehlgeschlagen: " + report.summary.result);
        if (Application.isBatchMode)
        {
            EditorApplication.Exit(ok ? 0 : 1);
        }
    }
}
`;
}

const MANIFEST =
  JSON.stringify(
    {
      dependencies: {
        'com.unity.test-framework': '1.4.5',
        'com.unity.modules.animation': '1.0.0',
        'com.unity.modules.audio': '1.0.0',
        'com.unity.modules.imgui': '1.0.0',
        'com.unity.modules.jsonserialize': '1.0.0',
        'com.unity.modules.physics': '1.0.0',
        'com.unity.modules.physics2d': '1.0.0',
        'com.unity.modules.ui': '1.0.0',
        'com.unity.modules.uielements': '1.0.0',
      },
    },
    null,
    2,
  ) + '\n';

const GITIGNORE_UNITY = [
  GITIGNORE_COMMON,
  '# Unity (wird vom Editor erzeugt)',
  '/[Ll]ibrary/',
  '/[Tt]emp/',
  '/[Oo]bj/',
  '/[Bb]uild/',
  '/[Bb]uilds/',
  '/[Ll]ogs/',
  '/[Uu]ser[Ss]ettings/',
  '/[Mm]emoryCaptures/',
  '/[Rr]ecordings/',
  '/TestResults/',
  '*.csproj',
  '*.unityproj',
  '*.sln',
  '*.suo',
  '*.user',
  '*.pidb',
  '*.booproj',
  '*.svd',
  '*.pdb',
  '*.mdb',
  '*.opendb',
  '*.VC.db',
  '*.apk',
  '*.aab',
  '*.unitypackage',
  '.vs/',
  '.idea/',
  'crashlytics-build.properties',
  '',
].join('\n');

function readme(name: string, description: string, id: string, unityFound: boolean): string {
  return `# ${name}

${description ? markdownParagraph(description) + '\n\n' : ''}Ein Unity-Projekt mit einem kleinen Startspiel (Würfel steuern, Kugeln sammeln), EditMode-Tests und einem
Build-Skript für Windows. Angelegt mit NOVA AI aus der Vorlage „Unity-Projekt“.

## In Unity öffnen

1. **Unity Hub** starten (Download: https://unity.com/download).
2. „Hinzufügen“ → „Projekt vom Datenträger hinzufügen“ → diesen Ordner wählen.
3. Eine Unity-Version auswählen und öffnen. Beim ersten Öffnen legt Unity die Ordner \`ProjectSettings/\`, \`Library/\`
   und die \`.meta\`-Dateien an – das dauert einige Minuten.
4. Menü **NOVA → Hauptszene anlegen** erstellt \`Assets/Scenes/Main.unity\` mit dem Startspiel. Mit „Play“ ausprobieren.

## Aufbau

- \`Assets/Scripts/${id}Game.cs\` – Spielablauf (MonoBehaviour)
- \`Assets/Scripts/ScoreBoard.cs\`, \`Assets/Scripts/GameRules.cs\` – Regeln als reine Logik
- \`Assets/Tests/EditMode/\` – EditMode-Tests (NUnit, Unity Test Framework)
- \`Assets/Editor/NovaBuild.cs\` – Windows-Build (Menü **NOVA → Windows-Build erstellen**)
- \`Packages/manifest.json\` – benötigte Unity-Pakete (u. a. \`com.unity.test-framework\`)

## Tests und Build ohne Editor-Fenster

NOVA führt die Tests im Hintergrund aus (Unity im Batchmode):

\`\`\`
"<Pfad zu Unity.exe>" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults TestResults/editmode.xml -logFile -
\`\`\`

Der Windows-Build landet in \`Builds/Windows/\`.
${unityFound ? '' : '\n**Hinweis:** Beim Anlegen wurde kein Unity-Editor gefunden. Die Test- und Build-Befehle werden eingetragen, sobald Unity installiert ist („Projekt erkennen“ in NOVA).\n'}
## Grenzen (ehrlich)

- Unity-Projekte haben keine eingebettete Live-Vorschau in NOVA. Zum Ansehen das Projekt in Unity öffnen.
- Tests laufen nur, wenn die zum Projekt passende Unity-Version installiert ist und das Projekt **nicht** gleichzeitig
  im Editor geöffnet ist (Unity sperrt das Projekt).
- Die Paketversion von \`com.unity.test-framework\` kann Unity beim ersten Öffnen an die Editor-Version anpassen.
${HONEST_LIMITS_DE}
`;
}

export function createUnityTemplate(resolveUnity: () => Promise<string | null>): ProjectTemplate {
  return {
    info: {
      id: 'unity',
      name: 'Unity-Projekt',
      description: 'Unity-Projekt (C#) mit kleinem Startspiel, EditMode-Tests und Windows-Build – wird in Unity geöffnet.',
      kind: 'unity',
      technologies: ['Unity', 'C#'],
      requiredTools: ['unity'],
      previewKind: 'engine-external',
    },
    async scaffold(dir, opts) {
      const id = unityIdentifier(opts.name);
      let unity: string | null = null;
      try {
        unity = await resolveUnity();
      } catch {
        unity = null;
      }
      const files: ScaffoldFiles = {
        [`Assets/Scripts/${id}.Runtime.asmdef`]: runtimeAsmdef(id),
        'Assets/Scripts/ScoreBoard.cs': scoreBoard(id),
        'Assets/Scripts/GameRules.cs': gameRules(id),
        [`Assets/Scripts/${id}Game.cs`]: gameBehaviour(id, opts.name),
        [`Assets/Tests/EditMode/${id}.Tests.EditMode.asmdef`]: testsAsmdef(id),
        'Assets/Tests/EditMode/GameTests.cs': tests(id),
        'Assets/Editor/NovaBuild.cs': novaBuild(id),
        'Packages/manifest.json': MANIFEST,
        'README.md': readme(opts.name, opts.description, id, unity !== null),
        '.gitignore': GITIGNORE_UNITY,
      };
      const notes: string[] = [];
      if (!unity) {
        notes.push('Es wurde kein Unity-Editor gefunden. Tests und Builds sind erst möglich, wenn Unity (über Unity Hub) installiert ist; danach „Projekt erkennen“ ausführen.');
      }
      return {
        files: writeScaffold(dir, files),
        config: {
          commands: emptyCommands({
            test: unity ? unityTestCommand(unity) : null,
            package: unity ? unityPackageCommand(unity, { novaBuildScript: true, productName: id }) : null,
          }),
          preview: { kind: 'engine-external', entry: null, url: null },
          artifactGlobs: ['Builds/**'],
          engineVersion: null,
          conventions: `Spiellogik als reine C#-Klassen in Assets/Scripts (Namespace ${id}) mit EditMode-Tests in Assets/Tests/EditMode absichern. Keine .meta-Dateien von Hand anlegen.`,
        },
        notes,
      };
    },
  };
}
