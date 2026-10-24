using System.IO;
using DeadZone.Game;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace DeadZone.EditorTools
{
    /// <summary>
    /// Automatic play test with screenshots: opens the main scene, enters Play Mode and lets <see cref="AutoTest"/> play a
    /// scripted round, then leaves Play Mode again. Menu: Dead Zone > Automatischer Test (mit Bildern).
    /// Batchmode (with graphics, i.e. without -nographics, and without -quit; exit code 0 = no errors or exceptions):
    /// -executeMethod DeadZone.EditorTools.PlayTest.RunBatch
    /// Entering Play Mode reloads the scripting domain and clears all statics, so the run state lives in SessionState and
    /// [InitializeOnLoad] picks it up again on the other side.
    /// </summary>
    [InitializeOnLoad]
    public static class PlayTest
    {
        private const string KeyRunning = "DZ.PlayTest.Running", KeyBatch = "DZ.PlayTest.Batch", KeyStart = "DZ.PlayTest.Start";
        private const string KeyStopping = "DZ.PlayTest.Stopping", KeyProblems = "DZ.PlayTest.Problems", KeyReport = "DZ.PlayTest.Report";
        /// <summary>Longest run including Play Mode start and world building before the test counts as hanging.</summary>
        private const double TimeoutSeconds = 300;

        static PlayTest()
        {
            if (!SessionState.GetBool(KeyRunning, false)) return;
            // the domain was reloaded for Play Mode: the driver in the game reads this flag when the scene loads
            if (!SessionState.GetBool(KeyStopping, false)) AutoTest.Requested = true;
            Hook();
        }

        [MenuItem("Dead Zone/Automatischer Test (mit Bildern)", priority = 3)]
        public static void RunMenu() => Begin(false);

        /// <summary>Batchmode: -executeMethod DeadZone.EditorTools.PlayTest.RunBatch</summary>
        public static void RunBatch() => Begin(true);

        private static void Begin(bool batch)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                if (batch) EditorApplication.Exit(1);
                else EditorUtility.DisplayDialog("Dead Zone", "Bitte zuerst das laufende Spiel beenden (oben auf ▶ klicken) und den Test dann neu starten.", "OK");
                return;
            }
            if (NeedsSetup() && !ProjectSetup.Setup(false))
            {
                Debug.LogError(AutoTest.LogTag + " Projekt-Einrichtung abgebrochen – der Test startet nicht.");
                if (batch) EditorApplication.Exit(1);
                return;
            }
            if (SceneManager.GetActiveScene().path != ProjectSetup.ScenePath)
            {
                if (!batch && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
                EditorSceneManager.OpenScene(ProjectSetup.ScenePath, OpenSceneMode.Single);
            }
            SessionState.SetBool(KeyRunning, true);
            SessionState.SetBool(KeyBatch, batch);
            SessionState.SetBool(KeyStopping, false);
            SessionState.SetFloat(KeyStart, (float)EditorApplication.timeSinceStartup);
            SessionState.EraseInt(KeyProblems);
            SessionState.EraseString(KeyReport);
            // also set here for projects that enter Play Mode without a domain reload
            AutoTest.Requested = true;
            Hook();
            Debug.Log(AutoTest.LogTag + " Automatischer Test startet. Bilder und Bericht: " + AutoTest.OutputFolder());
            EditorApplication.isPlaying = true;
        }

        /// <summary>Same check as the automatic setup: main scene missing or materials made for the other render pipeline.</summary>
        private static bool NeedsSetup()
        {
            var lit = AssetDatabase.LoadAssetAtPath<Material>("Assets/_Project/Resources/DZMaterials/Lit.mat");
            bool urp = GraphicsSettings.currentRenderPipeline != null;
            bool shaderOk = lit != null && lit.shader != null && lit.shader.name.StartsWith("Universal Render Pipeline") == urp;
            return AssetDatabase.LoadAssetAtPath<SceneAsset>(ProjectSetup.ScenePath) == null || !shaderOk;
        }

        private static void Hook()
        {
            EditorApplication.update -= Poll;
            EditorApplication.update += Poll;
            EditorApplication.playModeStateChanged -= OnPlayModeChanged;
            EditorApplication.playModeStateChanged += OnPlayModeChanged;
        }

        private static void Unhook()
        {
            EditorApplication.update -= Poll;
            EditorApplication.playModeStateChanged -= OnPlayModeChanged;
        }

        private static double Elapsed => EditorApplication.timeSinceStartup - SessionState.GetFloat(KeyStart, 0f);

        private static void Poll()
        {
            if (!SessionState.GetBool(KeyRunning, false)) { Unhook(); return; }
            bool stopping = SessionState.GetBool(KeyStopping, false);
            if (EditorApplication.isPlaying)
            {
                if (stopping) return;
                if (AutoTest.Finished) Stop(AutoTest.Problems);
                else if (Elapsed > TimeoutSeconds)
                {
                    Debug.LogError(AutoTest.LogTag + " Zeitlimit überschritten – der Test hängt.");
                    Stop(-1);
                }
                return;
            }
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            // back in Edit Mode without the event, or Play Mode never started (compile errors, a run left over from before)
            if (stopping || Elapsed > 60) Complete();
        }

        private static void Stop(int problems)
        {
            SessionState.SetBool(KeyStopping, true);
            SessionState.SetInt(KeyProblems, problems);
            SessionState.SetString(KeyReport, AutoTest.ReportPath ?? "");
            EditorApplication.isPlaying = false;
        }

        private static void OnPlayModeChanged(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredEditMode && SessionState.GetBool(KeyRunning, false)) Complete();
        }

        private static void Complete()
        {
            bool batch = SessionState.GetBool(KeyBatch, false);
            // not stopped by Poll: Play Mode was ended by hand or never started
            int problems = SessionState.GetBool(KeyStopping, false) ? SessionState.GetInt(KeyProblems, -1) : -1;
            string report = SessionState.GetString(KeyReport, "");
            if (string.IsNullOrEmpty(report)) report = Path.Combine(AutoTest.OutputFolder(), "report.txt");
            foreach (var k in new[] { KeyRunning, KeyBatch, KeyStopping }) SessionState.EraseBool(k);
            SessionState.EraseFloat(KeyStart);
            SessionState.EraseInt(KeyProblems);
            SessionState.EraseString(KeyReport);
            AutoTest.Requested = false;
            Unhook();
            string msg = problems == 0 ? "Automatischer Test fertig: keine Fehler."
                : problems > 0 ? "Automatischer Test fertig: " + problems + " Problem(e) gefunden."
                : "Automatischer Test abgebrochen oder hängen geblieben.";
            if (problems == 0) Debug.Log(AutoTest.LogTag + " " + msg + " Bericht: " + report);
            else Debug.LogWarning(AutoTest.LogTag + " " + msg + " Bericht: " + report);
            if (batch) { EditorApplication.Exit(problems == 0 ? 0 : 1); return; }
            if (EditorUtility.DisplayDialog("Dead Zone", msg + "\n\nBilder und Bericht (report.txt) liegen im Ordner\n" + Path.GetDirectoryName(report), "Ordner öffnen", "OK"))
                EditorUtility.RevealInFinder(File.Exists(report) ? report : Path.GetDirectoryName(report));
        }
    }
}
