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
    /// Only missing packages are added (never re-added or upgraded), see <see cref="PackagePlanner"/>. After the
    /// Package Manager has resolved the change, Unity recompiles and reloads the domain; the window then reads the
    /// package list again on its own.
    /// </remarks>
    [Serializable]
    internal sealed class PackageSetupStep : SetupStep
    {
        private const string PendingChangeKey = "Aetherfall.ProjectSetup.PackageChangePending";

        [SerializeField] private bool removeTemplatePackages = true;

        private ListRequest _listRequest;
        private AddAndRemoveRequest _changeRequest;
        private List<InstalledPackage> _installed;
        private string _listError;
        private bool _runAfterList;
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
        public override bool IsBusy => _listRequest != null || _changeRequest != null;

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
            if (SessionState.GetBool(PendingChangeKey, false))
            {
                SessionState.EraseBool(PendingChangeKey);
                log.Info("a) Unity hat nach der Paketänderung neu kompiliert. Die Paketliste wird neu gelesen – bitte den Status unten prüfen.");
            }
        }

        /// <inheritdoc />
        public override void OnWindowDisabled()
        {
            StopPolling();
            _listRequest = null;
            _changeRequest = null;
            _runAfterList = false;
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
                _runAfterList = true;
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
            SessionState.SetBool(PendingChangeKey, true);
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
                _runAfterList = false;
                if (_log != null)
                {
                    _log.Error("a) Paketliste konnte nicht gelesen werden: " + _listError);
                }
            }

            Refresh();

            if (_runAfterList && _installed != null)
            {
                _runAfterList = false;
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
            SessionState.EraseBool(PendingChangeKey);

            if (_log != null)
            {
                if (request.Status == StatusCode.Success)
                {
                    var names = new List<string>();
                    foreach (UpmPackageInfo info in request.Result)
                    {
                        if (info.isDirectDependency)
                        {
                            names.Add(info.name + "@" + info.version);
                        }
                    }

                    _log.Info("a) Package Manager fertig. Gemeldete direkte Pakete: " + (names.Count > 0 ? string.Join(", ", names) : "-") +
                              ". Unity kompiliert jetzt neu.");
                }
                else
                {
                    string message = request.Error != null ? request.Error.message : "unbekannter Fehler";
                    _log.Error("a) Paketänderung fehlgeschlagen: " + message +
                               " – Internetverbindung und Unity-Anmeldung im Hub prüfen, dann erneut ausführen (Anleitung 01, Fehlerbehebung).");
                }
            }

            _installed = null;
            StartList();
        }
    }
}
