using System.Collections.Generic;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// The package list of the project setup (architecture 1.4, §4.2) and the template packages that are removed
    /// (architecture 1.4, "Bewusst nicht verwendet"). Pure data; every call returns a new list.
    /// </summary>
    /// <remarks>
    /// Packages are added without a version, so the Package Manager installs the version it recommends for the
    /// installed editor (architecture 1.4: what the Package Manager offers as "released" for 6.3 is authoritative).
    /// It writes that exact version into Packages/manifest.json. <see cref="PackageRequirement.ExpectedVersionLine"/>
    /// is only compared and reported, never forced.
    /// </remarks>
    public static class PackageCatalog
    {
        /// <summary>Universal Render Pipeline; comes with the "Universal 3D" template and is only checked.</summary>
        public const string UniversalRenderPipelineId = "com.unity.render-pipelines.universal";

        /// <summary>Visual Scripting: part of the template, not used (architecture 1.4).</summary>
        public const string VisualScriptingId = "com.unity.visualscripting";

        /// <summary>Multiplayer Center: part of the template, not used (architecture 1.4).</summary>
        public const string MultiplayerCenterId = "com.unity.multiplayer.center";

        /// <summary>Creates the list of required packages in display order.</summary>
        public static IReadOnlyList<PackageRequirement> CreateRequiredPackages()
        {
            return new List<PackageRequirement>
            {
                new PackageRequirement("com.unity.inputsystem", "Eingabe: neues Input System, Controller und Tastatur (§4.2, §7)", "1.20"),
                new PackageRequirement("com.unity.cinemachine", "Kameras: Cinemachine 3 (§8.1)", "3.1"),
                new PackageRequirement("com.unity.probuilder", "Level-Blocking (§4.2)", "6.1"),
                new PackageRequirement("com.unity.terrain-tools", "Werkzeuge für die offene Welt (§4.2)", "5.3"),
                new PackageRequirement("com.unity.ai.navigation", "NavMesh für Gegner und NPCs (§4.2)", "2.0"),
                new PackageRequirement("com.unity.addressables", "Laden und Entladen großer Inhalte (§4.2, §27)", "2"),
                new PackageRequirement("com.unity.timeline", "Zwischensequenzen (§4.2)", "1.8"),
                new PackageRequirement("com.unity.animation.rigging", "IK für Blick und Hände (§4.2)", "1.4"),
                new PackageRequirement("com.unity.localization", "Deutsch und Englisch (§4.2)", "1.5"),
                new PackageRequirement("com.unity.test-framework", "Automatische Tests (§30), an den Editor gebunden", string.Empty),
                new PackageRequirement("com.unity.nuget.newtonsoft-json", "JSON für das Speichersystem (§25)", "3.2.2"),
                new PackageRequirement("com.unity.ugui", "uGUI und TextMeshPro (in Unity 6 ein Paket, §4.2)", string.Empty)
            };
        }

        /// <summary>Creates the list of template packages that the setup removes when the option is enabled.</summary>
        public static IReadOnlyList<string> CreateRemovablePackages()
        {
            return new List<string> { VisualScriptingId, MultiplayerCenterId };
        }
    }
}
