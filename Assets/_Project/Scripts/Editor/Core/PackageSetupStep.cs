using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;
using UpmPackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Step a) of the project setup: installs the packages of architecture 1.4 / §4.2 with one
    /// <see cref="Client.AddAndRemove"/> call and optionally removes Visual Scripting and Multiplayer Center.
    /// The status is read asynchronously with <see cref="Client.List(bool, bool)"/>.
    /// </summary>
    /// <remarks>
    /// <para>Only missing packages are added (never re-added or upgraded), see <see cref="PackagePlanner"/>. After the
    /// Package Manager has resolved the change, Unity recompiles and reloads the domain.</para>
    /// <para><b>Domain reloads:</b> a reload discards the request objects and the polling callback. Therefore the
    /// requested change (packages to add and remove, start time) and a pending "run after the list was read" are kept in
    /// <see cref="SessionState"/>. After a reload the step never assumes success: it reads the package list again every
    /// <see cref="VerifyIntervalSeconds"/> seconds until the change has arrived (log "a) abgeschlossen: …") or
    /// <see cref="VerifyTimeoutSeconds"/> have passed (error with a hint to the Package Manager window). While it waits,
    /// <see cref="IsBusy"/> stays true, so no second change can be started.</para>
    /// </remarks>
    [Serializable]
    internal sealed class PackageSetupStep : SetupStep
    {
        private const string PendingChangeKey = "Aetherfall.ProjectSetup.PendingPackageChange";
        private const string PendingAddKey = "Aetherfall.ProjectSetup.PendingPackageChange.Add";
        private const string PendingRemoveKey = "Aetherfall.ProjectSetup.PendingPackageChange.Remove";
        private const string PendingSinceKey = "Aetherfall.ProjectSetup.PendingPackageChange.Since";
        private const string RunAfterListKey = "Aetherfall.ProjectSetup.RunPackagesAfterList";
        private const char ListSeparator = '\n';
        private const double VerifyIntervalSeconds = 5.0;
        private const double VerifyTimeoutSeconds = 15.0 * 60.0;

        [SerializeField] private bool removeTemplatePackages = true;

        private ListRequest _listRequest;
        private AddAndRemoveRequest _changeRequest;
        private List<InstalledPackage> _installed;
        private string _listError;
        private bool _runAfterList;
        private bool _verifying;
        private bool _waitingLogged;
        private double _nextVerifyTime;
        private bool _pollingSubscribed;
        private SetupLog _log;

        /// <inheritdoc />
        public override string Letter => "a";

        /// <inheritdoc />
        public override string Title => "Pakete installieren";

        /// <inheritdoc />
        public override string Description =>
            "Installiert fehlende Pakete aus Architektur 1.4 in der Version, die der Package Manager für diesen Editor empfiehlt, " +
            "und trägt sie mit exakter Version in Packages/manifest.json ein. Vorhandene Pakete werden nicht verändert. " +
            "Danach kompiliert Unity neu (dauert einige Minuten).";

        /// <inheritdoc />
        public override bool IsBusy => _listRequest != null || _changeRequest != null || _verifying || _runAfterList;

        /// <inheritdoc />
        public override void Invalidate()
        {
            if (!IsBusy)
            {
                _installed = null;
                _listError = null;
            }
        }

        /// <inheritdoc />
        public override void OnWindowEnabled(SetupLog log)
        {
            _log = log;
            _waitingLogged = false;

            // Requests are started from the polling callback, not here: OnEnable also runs during domain reloads.
            if (SessionState.GetBool(PendingChangeKey, false))
            {
                _verifying = true;
                _nextVerifyTime = 0.0;
                StartPolling();
                log.Info("a) Unity hat neu geladen, während eine Paketänderung lief. Das Fenster prüft jetzt, ob sie angekommen ist …");
            }

            if (SessionState.GetBool(RunAfterListKey, false))
            {
                _runAfterList = true;
                StartPolling();
            }
        }

        /// <inheritdoc />
        public override void OnWindowDisabled()
        {
            // Only the in-memory state is dropped; the SessionState entries continue the work after a domain reload.
            StopPolling();
            _listRequest = null;
            _changeRequest = null;
            _runAfterList = false;
            _verifying = false;
        }

        /// <inheritdoc />
        public override void OnWindowClosed()
        {
            // Closing the window cancels a pending start; the check of an already requested change continues next time.
            SessionState.EraseBool(RunAfterListKey);
        }

        /// <inheritdoc />
        public override void Run(SetupLog log)
        {
            _log = log;
            if (IsBusy)
            {
                log.Warning("a) Der Package Manager arbeitet noch. Bitte warten, bis die laufende Anfrage fertig ist.");
                return;
            }

            if (_installed == null)
            {
                log.Info("a) Lese die installierten Pakete (Client.List) …");
                SetRunAfterList(true);
                StartList();
                return;
            }

            StartChanges(log);
        }

        /// <inheritdoc />
        public override void DrawOptions()
        {
            removeTemplatePackages = EditorGUILayout.ToggleLeft(
                new GUIContent("Visual Scripting und Multiplayer Center entfernen (Empfehlung, Architektur 1.4)",
                               "Beide Pakete kommen mit dem Template, werden nicht verwendet und verlängern die Kompilierzeit. Vor dem Entfernen fragt das Werkzeug nach."),
                removeTemplatePackages);

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button(new GUIContent("Package Manager öffnen", "Window > Package Manager"), GUILayout.Width(180f)))
            {
                UnityEditor.PackageManager.UI.Window.Open(string.Empty);
            }

            GUILayout.FlexibleSpace();
            EditorGUILayout.EndHorizontal();

            if (IsBusy)
            {
                EditorGUILayout.HelpBox(_changeRequest != null
                    ? "Der Package Manager installiert bzw. entfernt Pakete … Danach kompiliert Unity neu. Fenster bitte offen lassen."
                    : _verifying
                        ? "Die Paketänderung wird geprüft: Das Fenster liest die Paketliste alle " + VerifyIntervalSeconds.ToString("0") +
                          " s, bis alles angekommen ist (höchstens " + (VerifyTimeoutSeconds / 60.0).ToString("0") + " Minuten). Fenster bitte offen lassen."
                        : "Paketliste wird gelesen …", MessageType.Info);
            }
        }

        /// <inheritdoc />
        protected override void CollectItems(List<SetupCheckItem> items)
        {
            if (_installed == null)
            {
                if (!IsBusy && _listError == null)
                {
                    StartList();
                }

                items.Add(_listError != null
                    ? new SetupCheckItem("Paketliste konnte nicht gelesen werden", SetupStatus.Unknown, _listError + " – \"Status aktualisieren\" versucht es erneut.", "Window > Package Manager")
                    : new SetupCheckItem("Paketliste wird gelesen …", SetupStatus.Unknown));
                return;
            }

            IReadOnlyList<PackageRequirement> required = PackageCatalog.CreateRequiredPackages();
            for (int i = 0; i < required.Count; i++)
            {
                items.Add(DescribeRequirement(required[i]));
            }

            items.Add(PackagePlanner.TryFind(_installed, PackageCatalog.UniversalRenderPipelineId, out InstalledPackage urp)
                ? new SetupCheckItem(PackageCatalog.UniversalRenderPipelineId, SetupStatus.Done, "Version " + urp.Version + " (kommt mit dem Template „Universal 3D“)")
                : new SetupCheckItem(PackageCatalog.UniversalRenderPipelineId, SetupStatus.Open,
                    "URP fehlt. Das Projekt muss mit dem Template „Universal 3D“ angelegt werden (Anleitung 01). Nicht nachträglich installieren.",
                    "Unity Hub > Projects > New project > Universal 3D"));

            IReadOnlyList<string> removable = PackageCatalog.CreateRemovablePackages();
            for (int i = 0; i < removable.Count; i++)
            {
                string name = removable[i];
                if (!PackagePlanner.TryFind(_installed, name, out InstalledPackage package))
                {
                    items.Add(new SetupCheckItem(name, SetupStatus.Done, "nicht installiert"));
                }
                else if (!removeTemplatePackages)
                {
                    items.Add(new SetupCheckItem(name, SetupStatus.Unknown, "installiert (" + package.Version + "), Entfernen ist abgewählt"));
                }
                else if (package.IsDirectDependency)
                {
                    items.Add(new SetupCheckItem(name, SetupStatus.Open, "installiert (" + package.Version + ") – wird entfernt"));
                }
                else
                {
                    items.Add(new SetupCheckItem(name, SetupStatus.Unknown, "nur indirekt installiert (ein anderes Paket braucht es) – kann nicht direkt entfernt werden"));
                }
            }
        }

        private SetupCheckItem DescribeRequirement(PackageRequirement requirement)
        {
            string planned = "Planung: " + PackagePlanner.DescribeVersionLine(requirement.ExpectedVersionLine);
            if (!PackagePlanner.TryFind(_installed, requirement.PackageId, out InstalledPackage package))
            {
                return new SetupCheckItem(requirement.PackageId, SetupStatus.Open,
                    requirement.Purpose + " · fehlt – wird installiert · " + planned);
            }

            string detail = requirement.Purpose + " · Version " + package.Version + " · " + planned;
            if (!PackagePlanner.MatchesVersionLine(package.Version, requirement.ExpectedVersionLine))
            {
                detail += " · Hinweis: weicht von der Planung ab. Im Package Manager prüfen, welche Version für Unity 6.3 freigegeben ist, " +
                          "und das Ergebnis in docs/Technik/03 (Nicht verifiziert) eintragen.";
            }

            if (!package.IsDirectDependency)
            {
                return new SetupCheckItem(requirement.PackageId, SetupStatus.Open, detail + " · nur indirekt installiert – wird als direkte Abhängigkeit eingetragen");
            }

            return new SetupCheckItem(requirement.PackageId, SetupStatus.Done, detail);
        }

        private void StartList()
        {
            if (_listRequest != null)
            {
                return;
            }

            _listError = null;
            _listRequest = Client.List(true, true);
            StartPolling();
        }

        private void StartChanges(SetupLog log)
        {
            SetRunAfterList(false);
            PackagePlan plan = PackagePlanner.CreatePlan(_installed, PackageCatalog.CreateRequiredPackages(), PackageCatalog.CreateRemovablePackages(), removeTemplatePackages);
            for (int i = 0; i < plan.Notes.Count; i++)
            {
                log.Info("a) " + plan.Notes[i]);
            }

            var toRemove = new List<string>(plan.PackagesToRemove);
            if (toRemove.Count > 0)
            {
                bool confirmed = EditorUtility.DisplayDialog(
                    "Pakete entfernen?",
                    "Diese Template-Pakete werden aus dem Projekt entfernt:\n\n" + string.Join("\n", toRemove) +
                    "\n\nSie werden in Aetherfall nicht verwendet (Architektur 1.4). Eigene Inhalte, die sie nutzen, funktionieren danach nicht mehr. " +
                    "Rückgängig: im Package Manager wieder installieren.",
                    "Entfernen",
                    "Nicht entfernen");
                if (!confirmed)
                {
                    log.Info("a) Entfernen abgelehnt: " + string.Join(", ", toRemove) + " bleiben installiert.");
                    toRemove.Clear();
                }
            }

            var toAdd = new List<string>(plan.PackagesToAdd);
            if (toAdd.Count == 0 && toRemove.Count == 0)
            {
                log.Info("a) Alle Pakete sind bereits eingerichtet. Nichts zu tun.");
                return;
            }

            if (toAdd.Count > 0)
            {
                log.Info("a) Installiere: " + string.Join(", ", toAdd));
            }

            if (toRemove.Count > 0)
            {
                log.Info("a) Entferne: " + string.Join(", ", toRemove));
            }

            _changeRequest = Client.AddAndRemove(toAdd.Count > 0 ? toAdd.ToArray() : null, toRemove.Count > 0 ? toRemove.ToArray() : null);
            SavePendingChange(toAdd, toRemove);
            StartPolling();
            log.Info("a) Der Package Manager arbeitet (je nach Internetverbindung einige Minuten). Danach kompiliert Unity neu; " +
                     "das Fenster liest den Paketstatus anschließend selbst neu.");
        }

        private void StartPolling()
        {
            if (_pollingSubscribed)
            {
                return;
            }

            EditorApplication.update += Poll;
            _pollingSubscribed = true;
        }

        private void StopPolling()
        {
            if (!_pollingSubscribed)
            {
                return;
            }

            EditorApplication.update -= Poll;
            _pollingSubscribed = false;
        }

        private void Poll()
        {
            if (_listRequest != null && _listRequest.IsCompleted)
            {
                CompleteList();
            }

            if (_changeRequest != null && _changeRequest.IsCompleted)
            {
                CompleteChange();
            }

            // Restored after a domain reload, or waiting for the next check of a requested change.
            if (_listRequest == null && _changeRequest == null &&
                (_runAfterList || (_verifying && EditorApplication.timeSinceStartup >= _nextVerifyTime)))
            {
                StartList();
            }

            if (!IsBusy)
            {
                StopPolling();
            }
        }

        private void CompleteList()
        {
            ListRequest request = _listRequest;
            _listRequest = null;

            if (request.Status == StatusCode.Success)
            {
                var installed = new List<InstalledPackage>();
                foreach (UpmPackageInfo info in request.Result)
                {
                    installed.Add(new InstalledPackage(info.name, info.version, info.isDirectDependency));
                }

                _installed = installed;
                _listError = null;
            }
            else
            {
                _installed = null;
                _listError = request.Error != null ? request.Error.message : "unbekannter Fehler";
                if (!_verifying)
                {
                    // While verifying, a failed read is simply retried (the Package Manager may still be busy).
                    SetRunAfterList(false);
                    if (_log != null)
                    {
                        _log.Error("a) Paketliste konnte nicht gelesen werden: " + _listError);
                    }
                }
            }

            Refresh();

            if (_verifying && _changeRequest == null)
            {
                VerifyPendingChange();
                return;
            }

            if (_runAfterList && _installed != null)
            {
                SetRunAfterList(false);
                if (_log != null)
                {
                    StartChanges(_log);
                }
            }
        }

        private void CompleteChange()
        {
            AddAndRemoveRequest request = _changeRequest;
            _changeRequest = null;
            _installed = null;

            if (request.Status == StatusCode.Success)
            {
                // Confirmed against Client.List like after a domain reload, so both paths end with the same log line.
                WriteLog("a) Package Manager fertig. Das Ergebnis wird mit der Paketliste abgeglichen …", false);
                _verifying = true;
                _nextVerifyTime = 0.0;
                return;
            }

            ClearPendingChange();
            string message = request.Error != null ? request.Error.message : "unbekannter Fehler";
            WriteLog("a) Paketänderung fehlgeschlagen: " + message +
                " – Internetverbindung und Unity-Anmeldung im Hub prüfen, dann erneut ausführen (Anleitung 01, Abschnitt 10).", true);
            StartList();
        }

        private void VerifyPendingChange()
        {
            double now = EditorApplication.timeSinceStartup;
            double since = SessionState.GetFloat(PendingSinceKey, (float)now);
            List<string> added = ReadList(PendingAddKey);
            List<string> removed = ReadList(PendingRemoveKey);

            List<string> outstanding = null;
            if (_installed != null)
            {
                outstanding = PackagePlanner.FindOutstandingChanges(_installed, added, removed);
                if (outstanding.Count == 0)
                {
                    ClearPendingChange();
                    WriteLog("a) abgeschlossen: " + DescribeAppliedChange(added, removed) + ".", false);
                    return;
                }
            }

            string open = outstanding != null ? string.Join(", ", outstanding) : "Paketliste nicht lesbar (" + _listError + ")";
            if (now - since > VerifyTimeoutSeconds)
            {
                ClearPendingChange();
                WriteLog("a) Paketänderung nach " + (VerifyTimeoutSeconds / 60.0).ToString("0") + " Minuten nicht bestätigt. Noch offen: " + open +
                    ". Bitte Window > Package Manager öffnen und dort nach Fehlermeldungen sehen (Internet, Anmeldung im Hub), " +
                    "dann a) erneut ausführen (Anleitung 01, Abschnitt 10).", true);
                return;
            }

            if (!_waitingLogged)
            {
                _waitingLogged = true;
                WriteLog("a) Noch nicht angekommen: " + open + ". Das Fenster prüft alle " + VerifyIntervalSeconds.ToString("0") + " s erneut (höchstens " +
                    (VerifyTimeoutSeconds / 60.0).ToString("0") + " Minuten).", false);
            }

            _nextVerifyTime = now + VerifyIntervalSeconds;
        }

        private string DescribeAppliedChange(List<string> added, List<string> removed)
        {
            var parts = new List<string>();
            if (added.Count > 0)
            {
                var names = new List<string>(added.Count);
                for (int i = 0; i < added.Count; i++)
                {
                    string name = PackagePlanner.GetPackageName(added[i]);
                    names.Add(PackagePlanner.TryFind(_installed, name, out InstalledPackage package) ? name + "@" + package.Version : name);
                }

                parts.Add("installiert " + string.Join(", ", names));
            }

            if (removed.Count > 0)
            {
                parts.Add("entfernt " + string.Join(", ", removed));
            }

            return parts.Count > 0 ? string.Join(" · ", parts) : "keine Änderung";
        }

        private void SavePendingChange(List<string> added, List<string> removed)
        {
            SessionState.SetString(PendingAddKey, string.Join(ListSeparator.ToString(), added));
            SessionState.SetString(PendingRemoveKey, string.Join(ListSeparator.ToString(), removed));
            SessionState.SetFloat(PendingSinceKey, (float)EditorApplication.timeSinceStartup);
            SessionState.SetBool(PendingChangeKey, true);
            _waitingLogged = false;
        }

        private void ClearPendingChange()
        {
            SessionState.EraseBool(PendingChangeKey);
            SessionState.EraseString(PendingAddKey);
            SessionState.EraseString(PendingRemoveKey);
            SessionState.EraseFloat(PendingSinceKey);
            _verifying = false;
            _waitingLogged = false;
        }

        private void SetRunAfterList(bool value)
        {
            _runAfterList = value;
            if (value)
            {
                SessionState.SetBool(RunAfterListKey, true);
            }
            else
            {
                SessionState.EraseBool(RunAfterListKey);
            }
        }

        private static List<string> ReadList(string key)
        {
            string text = SessionState.GetString(key, string.Empty);
            return new List<string>(text.Split(new[] { ListSeparator }, StringSplitOptions.RemoveEmptyEntries));
        }

        private void WriteLog(string message, bool isError)
        {
            if (_log == null)
            {
                return;
            }

            if (isError)
            {
                _log.Error(message);
            }
            else
            {
                _log.Info(message);
            }
        }
    }
}
