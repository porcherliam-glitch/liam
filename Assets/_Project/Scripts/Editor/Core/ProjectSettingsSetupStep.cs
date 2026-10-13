using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Step b) of the project setup: editor and player settings of architecture 2.3 and 2.4 that have a public
    /// Unity API (Force Text, Visible Meta Files, Enter Play Mode Options, Linear, .NET Standard 2.1, Incremental GC,
    /// company and product name …). Settings without a public API (Active Input Handling) are only checked where
    /// possible and come with manual instructions; no internal or serialized fields are written.
    /// </summary>
    [Serializable]
    internal sealed class ProjectSettingsSetupStep : SetupStep
    {
        private const string VisibleMetaFiles = "Visible Meta Files";
        private const string ActiveInputHandlingMenu = "Edit > Project Settings > Player > Other Settings > Configuration > Active Input Handling";

        [SerializeField] private string companyName = string.Empty;
        [SerializeField] private string productName = string.Empty;
        [SerializeField] private bool identityInitialized;

        /// <summary>
        /// True if Active Input Handling is "Input System Package (New)" (only the new input system is enabled). Read from the
        /// compiler defines of the editor, which follow this player setting.
        /// </summary>
        public static bool IsNewInputSystemOnly
        {
            get
            {
#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
                return true;
#else
                return false;
#endif
            }
        }

        /// <inheritdoc />
        public override string Letter => "b";

        /// <inheritdoc />
        public override string Title => "Editor- und Player-Einstellungen";

        /// <inheritdoc />
        public override string Description =>
            "Setzt die Einstellungen aus Architektur 2.3/2.4 über öffentliche Unity-APIs. Einstellungen ohne öffentliche API " +
            "(z. B. Active Input Handling) werden nur geprüft – die Liste zeigt dann Menüpfad und Wert zum Selbst-Einstellen.";

        /// <inheritdoc />
        public override void Run(SetupLog log)
        {
            List<SettingRule> rules = CreateRules();
            for (int i = 0; i < rules.Count; i++)
            {
                SettingRule rule = rules[i];
                SetupCheckItem before = rule.Evaluate();
                if (before.Status != SetupStatus.Open)
                {
                    continue;
                }

                if (!rule.CanApply)
                {
                    log.Warning("b) Manuell erledigen: " + rule.Label + " – " + before.Detail + " (Menü: " + rule.MenuPath + ")");
                    continue;
                }

                try
                {
                    rule.Apply(log);
                }
                catch (Exception exception)
                {
                    log.Error("b) " + rule.Label + " konnte nicht gesetzt werden: " + exception.GetType().Name + ": " + exception.Message +
                              " – bitte von Hand einstellen (Menü: " + rule.MenuPath + ").");
                }
            }

            ApplyIdentity(log);

            // Writes ProjectSettings/*.asset now, so the values are on disk for the first commit.
            AssetDatabase.SaveAssets();
            log.Info("b) Einstellungen gespeichert (ProjectSettings/).");
        }

        /// <inheritdoc />
        public override void DrawOptions()
        {
            EnsureIdentityInitialized();

            EditorGUILayout.LabelField("Firmen- und Produktname", EditorStyles.boldLabel);
            companyName = EditorGUILayout.TextField(
                new GUIContent("Firmenname (Company Name)", "Wird Teil des Speicherpfads. Vorschlag: " + ProductIdentity.SuggestedCompanyName +
                                                            " – besser deinen eigenen Namen oder ein Label ohne Sonderzeichen eintragen."),
                companyName);
            productName = EditorGUILayout.TextField(
                new GUIContent("Produktname (Product Name)", "Wird Teil des Speicherpfads und ist der Name des Spiels im Build. Vorschlag: " +
                                                             ProductIdentity.SuggestedProductName + " (kurz, unabhängig vom späteren Verkaufstitel)."),
                productName);

            if (!ProductIdentity.IsValidName(companyName, out string companyProblem))
            {
                EditorGUILayout.HelpBox("Firmenname: " + companyProblem, MessageType.Error);
            }

            if (!ProductIdentity.IsValidName(productName, out string productProblem))
            {
                EditorGUILayout.HelpBox("Produktname: " + productProblem, MessageType.Error);
            }

            EditorGUILayout.HelpBox(
                "Firmen- und Produktname bestimmen den Speicherpfad der Spielstände (Application.persistentDataPath).\n" +
                ProductIdentity.DescribeSavePaths(companyName, productName) + "\n" +
                "Nach dem ersten Build, der das Haus verlässt, NIE mehr ändern – sonst „verschwinden“ Spielstände und Cloud-Saves " +
                "(Architektur 2.1 #1, Offene Fragen 2 (c)). Der Schritt fragt vor dem Übernehmen nach.",
                MessageType.Warning);

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Vorschlag einsetzen", GUILayout.Width(160f)))
            {
                companyName = ProductIdentity.SuggestedCompanyName;
                productName = ProductIdentity.SuggestedProductName;
                GUI.FocusControl(null);
            }

            if (GUILayout.Button("Aktuelle Werte laden", GUILayout.Width(160f)))
            {
                companyName = PlayerSettings.companyName;
                productName = PlayerSettings.productName;
                GUI.FocusControl(null);
            }

            GUILayout.FlexibleSpace();
            EditorGUILayout.EndHorizontal();
        }

        /// <inheritdoc />
        protected override void CollectItems(List<SetupCheckItem> items)
        {
            List<SettingRule> rules = CreateRules();
            for (int i = 0; i < rules.Count; i++)
            {
                items.Add(rules[i].Evaluate());
            }

            items.Add(EvaluateIdentity());
        }

        private static List<SettingRule> CreateRules()
        {
            var rules = new List<SettingRule>
            {
                new SettingRule(
                    "Asset Serialization: Force Text",
                    "Edit > Project Settings > Editor > Asset Serialization > Mode",
                    () => EditorSettings.serializationMode == SerializationMode.ForceText
                        ? (SetupStatus.Done, "Force Text")
                        : (SetupStatus.Open, "aktuell: " + EditorSettings.serializationMode + " – wird auf Force Text gestellt (Unity schreibt danach alle Assets als Text neu)"),
                    log =>
                    {
                        EditorSettings.serializationMode = SerializationMode.ForceText;
                        log.Info("b) Asset Serialization = Force Text.");
                    }),

                new SettingRule(
                    "Version Control: Visible Meta Files",
                    "Edit > Project Settings > Version Control > Mode",
                    () => VersionControlSettings.mode == VisibleMetaFiles
                        ? (SetupStatus.Done, VisibleMetaFiles)
                        : (SetupStatus.Open, "aktuell: " + VersionControlSettings.mode + " – wird auf Visible Meta Files gestellt"),
                    log =>
                    {
                        VersionControlSettings.mode = VisibleMetaFiles;
                        log.Info("b) Version Control Mode = Visible Meta Files.");
                    }),

                new SettingRule(
                    "Enter Play Mode: Domain Reload aus, Scene Reload an",
                    "Edit > Project Settings > Editor > Enter Play Mode Settings > When entering Play Mode = Reload Scene only",
                    EvaluateEnterPlayMode,
                    log =>
                    {
                        EditorSettings.enterPlayModeOptionsEnabled = true;
                        EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
                        log.Info("b) Enter Play Mode Options: Domain Reload aus, Scene Reload an.");
                    }),

                new SettingRule(
                    "Zeilenenden neuer Skripte: Unix (LF)",
                    "Edit > Project Settings > Editor > Line Endings For New Scripts",
                    () => EditorSettings.lineEndingsForNewScripts == LineEndingsMode.Unix
                        ? (SetupStatus.Done, "Unix")
                        : (SetupStatus.Open, "aktuell: " + EditorSettings.lineEndingsForNewScripts),
                    log =>
                    {
                        EditorSettings.lineEndingsForNewScripts = LineEndingsMode.Unix;
                        log.Info("b) Line Endings For New Scripts = Unix.");
                    }),

                new SettingRule(
                    "Color Space: Linear",
                    "Edit > Project Settings > Player > Other Settings > Rendering > Color Space",
                    () => PlayerSettings.colorSpace == ColorSpace.Linear
                        ? (SetupStatus.Done, "Linear")
                        : (SetupStatus.Open, "aktuell: " + PlayerSettings.colorSpace + " – Umstellen löst einen Re-Import der Texturen aus"),
                    log =>
                    {
                        PlayerSettings.colorSpace = ColorSpace.Linear;
                        log.Info("b) Color Space = Linear.");
                    }),

                new SettingRule(
                    "API Compatibility Level: .NET Standard 2.1 (Standalone)",
                    "Edit > Project Settings > Player > Other Settings > Configuration > Api Compatibility Level",
                    () => PlayerSettings.GetApiCompatibilityLevel(NamedBuildTarget.Standalone) == ApiCompatibilityLevel.NET_Standard
                        ? (SetupStatus.Done, ".NET Standard 2.1")
                        : (SetupStatus.Open, "aktuell: " + PlayerSettings.GetApiCompatibilityLevel(NamedBuildTarget.Standalone)),
                    log =>
                    {
                        PlayerSettings.SetApiCompatibilityLevel(NamedBuildTarget.Standalone, ApiCompatibilityLevel.NET_Standard);
                        log.Info("b) API Compatibility Level (Standalone) = .NET Standard 2.1. Unity kompiliert neu.");
                    }),

                new SettingRule(
                    "Scripting Backend (Standalone): Mono für die Entwicklung",
                    "Edit > Project Settings > Player > Other Settings > Configuration > Scripting Backend",
                    () => PlayerSettings.GetScriptingBackend(NamedBuildTarget.Standalone) == ScriptingImplementation.Mono2x
                        ? (SetupStatus.Done, "Mono (IL2CPP kommt später über die Release-Build-Profile, Architektur 2.6 #36)")
                        : (SetupStatus.Open, "aktuell: " + PlayerSettings.GetScriptingBackend(NamedBuildTarget.Standalone)),
                    log =>
                    {
                        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
                        log.Info("b) Scripting Backend (Standalone) = Mono.");
                    }),

                new SettingRule(
                    "Use Incremental GC: an",
                    "Edit > Project Settings > Player > Other Settings > Configuration > Use incremental GC",
                    () => PlayerSettings.gcIncremental ? (SetupStatus.Done, "an") : (SetupStatus.Open, "aus – wird eingeschaltet"),
                    log =>
                    {
                        PlayerSettings.gcIncremental = true;
                        log.Info("b) Use Incremental GC = an.");
                    }),

                new SettingRule(
                    "Allow 'unsafe' Code: aus",
                    "Edit > Project Settings > Player > Other Settings > Script Compilation > Allow 'unsafe' Code",
                    () => !PlayerSettings.allowUnsafeCode ? (SetupStatus.Done, "aus") : (SetupStatus.Open, "an – wird ausgeschaltet"),
                    log =>
                    {
                        PlayerSettings.allowUnsafeCode = false;
                        log.Info("b) Allow 'unsafe' Code = aus.");
                    }),

                new SettingRule(
                    "Fullscreen Mode: Fullscreen Window",
                    "Edit > Project Settings > Player > Resolution and Presentation > Fullscreen Mode",
                    () => PlayerSettings.fullScreenMode == FullScreenMode.FullScreenWindow
                        ? (SetupStatus.Done, "Fullscreen Window")
                        : (SetupStatus.Open, "aktuell: " + PlayerSettings.fullScreenMode),
                    log =>
                    {
                        PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow;
                        log.Info("b) Fullscreen Mode = Fullscreen Window.");
                    }),

                new SettingRule(
                    "Grafik-API Windows: Direct3D12, Direct3D11 (Auto aus)",
                    "Edit > Project Settings > Player > Reiter „Windows, Mac, Linux“ (Bildschirm-Symbol) > Other Settings > Rendering > Auto Graphics API for Windows (aus), darunter die Liste",
                    EvaluateWindowsGraphicsApis,
                    log =>
                    {
                        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneWindows64, false);
                        PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneWindows64, new[] { GraphicsDeviceType.Direct3D12, GraphicsDeviceType.Direct3D11 });
                        log.Info("b) Grafik-API Windows = Direct3D12, Direct3D11 (Auto Graphics API aus).");
                    }),

                new SettingRule(
                    "Active Input Handling: Input System Package (New)",
                    ActiveInputHandlingMenu,
                    EvaluateActiveInputHandling,
                    null),

                new SettingRule(
                    "Scripting Define Symbols (Standalone) ohne Aetherfall-Defines",
                    "Edit > Project Settings > Player > Other Settings > Script Compilation > Scripting Define Symbols",
                    EvaluateProjectDefines,
                    null)
            };

            return rules;
        }

        private static (SetupStatus Status, string Detail) EvaluateEnterPlayMode()
        {
            bool enabled = EditorSettings.enterPlayModeOptionsEnabled;
            EnterPlayModeOptions options = EditorSettings.enterPlayModeOptions;
            bool domainReloadOff = (options & EnterPlayModeOptions.DisableDomainReload) != 0;
            bool sceneReloadOff = (options & EnterPlayModeOptions.DisableSceneReload) != 0;
            if (enabled && domainReloadOff && !sceneReloadOff)
            {
                return (SetupStatus.Done, "Domain Reload aus, Scene Reload an");
            }

            string current = enabled ? "Optionen: " + options : "Optionen aus (Domain und Szene werden jedes Mal neu geladen)";
            return (SetupStatus.Open, "aktuell: " + current + " – Ziel: nur „Reload Scene“ (Architektur P7, statische Felder werden per Code zurückgesetzt)");
        }

        private static (SetupStatus Status, string Detail) EvaluateWindowsGraphicsApis()
        {
            bool automatic = PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.StandaloneWindows64);
            GraphicsDeviceType[] apis = PlayerSettings.GetGraphicsAPIs(BuildTarget.StandaloneWindows64);
            bool ok = !automatic && apis != null && apis.Length == 2 &&
                      apis[0] == GraphicsDeviceType.Direct3D12 && apis[1] == GraphicsDeviceType.Direct3D11;
            if (ok)
            {
                return (SetupStatus.Done, "Direct3D12, Direct3D11");
            }

            string current = automatic ? "Auto Graphics API an" : (apis == null || apis.Length == 0 ? "leer" : string.Join(", ", apis));
            return (SetupStatus.Open, "aktuell: " + current + " – Vulkan vorerst nicht (Architektur 2.4 #19)");
        }

        private static (SetupStatus Status, string Detail) EvaluateActiveInputHandling()
        {
            // The compiler defines reflect the player setting of the active platform (documented by the Input System package).
#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
            return (SetupStatus.Done, "Input System Package (New) – das alte Input-System ist abgeschaltet");
#elif ENABLE_INPUT_SYSTEM
            return (SetupStatus.Open, "aktuell: Both – auf „Input System Package (New)“ stellen und den Editor-Neustart bestätigen (vorher Schritt a ausführen)");
#else
            return (SetupStatus.Open, "aktuell: Input Manager (Old) – erst Schritt a ausführen, dann auf „Input System Package (New)“ stellen und den Editor-Neustart bestätigen");
#endif
        }

        private static (SetupStatus Status, string Detail) EvaluateProjectDefines()
        {
            string defines = PlayerSettings.GetScriptingDefineSymbols(NamedBuildTarget.Standalone) ?? string.Empty;
            var found = new List<string>();
            string[] forbidden = { "AETHERFALL_DEV", "AETHERFALL_CHEATS", "AETHERFALL_TELEMETRY", "URP_COMPATIBILITY_MODE" };
            string[] tokens = defines.Split(new[] { ';', ',', ' ' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < tokens.Length; i++)
            {
                if (Array.IndexOf(forbidden, tokens[i].Trim()) >= 0)
                {
                    found.Add(tokens[i].Trim());
                }
            }

            if (found.Count == 0)
            {
                return (SetupStatus.Done, defines.Length == 0 ? "leer" : "enthält keine Aetherfall-Defines und kein URP_COMPATIBILITY_MODE");
            }

            return (SetupStatus.Open, "enthält " + string.Join(", ", found) + " – entfernen. Dev-Defines gehören in die Build-Profile " +
                                      "(Architektur 2.7 #43), URP_COMPATIBILITY_MODE ist verboten (Architektur 1.2)");
        }

        private SetupCheckItem EvaluateIdentity()
        {
            string currentCompany = PlayerSettings.companyName;
            string currentProduct = PlayerSettings.productName;
            string current = "aktuell: " + currentCompany + " / " + currentProduct;
            const string menu = "Edit > Project Settings > Player > Company Name / Product Name";

            if (ProductIdentity.IsUndecidedCompany(currentCompany))
            {
                return new SetupCheckItem("Firmen- und Produktname", SetupStatus.Open,
                    current + " – noch Unity-Standard. Namen oben eintragen; „Ausführen“ übernimmt sie nach Rückfrage.", menu);
            }

            if (!ProductIdentity.IsValidName(currentProduct, out string problem))
            {
                return new SetupCheckItem("Firmen- und Produktname", SetupStatus.Open, current + " – Produktname ungültig: " + problem, menu);
            }

            string detail = current + " · Speicherpfad: " + ProductIdentity.DescribeSavePaths(currentCompany, currentProduct);
            if (identityInitialized && (companyName != currentCompany || productName != currentProduct))
            {
                detail += " · Hinweis: Die Eingabefelder oben weichen davon ab; „Ausführen“ fragt vor dem Ändern nach.";
            }

            return new SetupCheckItem("Firmen- und Produktname", SetupStatus.Done, detail, menu);
        }

        private void ApplyIdentity(SetupLog log)
        {
            EnsureIdentityInitialized();
            string company = companyName ?? string.Empty;
            string product = productName ?? string.Empty;
            string currentCompany = PlayerSettings.companyName;
            string currentProduct = PlayerSettings.productName;

            if (company == currentCompany && product == currentProduct)
            {
                log.Info("b) Firmen- und Produktname unverändert: " + currentCompany + " / " + currentProduct + ".");
                return;
            }

            if (!ProductIdentity.IsValidName(company, out string companyProblem))
            {
                log.Error("b) Firmenname nicht übernommen: " + companyProblem + " Bitte das Eingabefeld in Schritt b) korrigieren.");
                return;
            }

            if (!ProductIdentity.IsValidName(product, out string productProblem))
            {
                log.Error("b) Produktname nicht übernommen: " + productProblem + " Bitte das Eingabefeld in Schritt b) korrigieren.");
                return;
            }

            bool firstTime = ProductIdentity.IsUndecidedCompany(currentCompany);
            string message = (firstTime
                                 ? "Firmen- und Produktname jetzt festlegen?\n\n"
                                 : "ACHTUNG: Firmen- und Produktname sind bereits festgelegt und sollen sich nach dem ersten externen Build nie mehr ändern.\n\n") +
                             "Bisher: " + currentCompany + " / " + currentProduct + "\n" +
                             "Neu: " + company + " / " + product + "\n\n" +
                             "Die Namen bestimmen den Speicherpfad der Spielstände:\n" + ProductIdentity.DescribeSavePaths(company, product);
            if (!EditorUtility.DisplayDialog("Firmen- und Produktname", message, firstTime ? "Übernehmen" : "Trotzdem ändern", "Abbrechen"))
            {
                log.Info("b) Firmen- und Produktname nicht geändert (abgebrochen).");
                return;
            }

            PlayerSettings.companyName = company;
            PlayerSettings.productName = product;
            log.Info("b) Company Name = " + company + ", Product Name = " + product + ".");
        }

        private void EnsureIdentityInitialized()
        {
            if (identityInitialized)
            {
                return;
            }

            bool undecided = ProductIdentity.IsUndecidedCompany(PlayerSettings.companyName);
            companyName = undecided ? ProductIdentity.SuggestedCompanyName : PlayerSettings.companyName;
            productName = undecided ? ProductIdentity.SuggestedProductName : PlayerSettings.productName;
            identityInitialized = true;
        }
    }
}
