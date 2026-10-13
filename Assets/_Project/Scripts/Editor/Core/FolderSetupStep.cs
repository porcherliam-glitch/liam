using System;
using System.Collections.Generic;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Step c) of the project setup: creates the folder structure of architecture 3.1 (§5 plus all "(V)" folders)
    /// with <c>AssetDatabase.CreateFolder</c> and writes a ".gitkeep" into every empty folder, so Git keeps the folder
    /// and its .meta file stays valid. Also creates <c>ArtSource/</c> next to <c>Assets/</c>. Never deletes anything.
    /// </summary>
    [Serializable]
    internal sealed class FolderSetupStep : SetupStep
    {
        private const int MaxListedPaths = 8;

        /// <inheritdoc />
        public override string Letter => "c";

        /// <inheritdoc />
        public override string Title => "Ordnerstruktur anlegen";

        /// <inheritdoc />
        public override string Description =>
            "Legt alle Ordner aus Architektur 3.1 unter Assets/_Project/ an (inklusive der Vorschlags-Ordner), dazu Assets/ThirdParty/ " +
            "und ArtSource/ außerhalb von Assets. Leere Ordner bekommen eine .gitkeep-Datei (Git kennt keine leeren Ordner; Unity ignoriert die Datei).";

        /// <inheritdoc />
        public override void Run(SetupLog log)
        {
            IReadOnlyList<string> assetFolders = ProjectFolderLayout.CreateAssetFolders();
            IReadOnlyList<string> externalFolders = ProjectFolderLayout.CreateExternalFolders();
            int existingBefore = 0;
            int failed = 0;

            for (int i = 0; i < assetFolders.Count; i++)
            {
                if (AssetFolderUtility.Exists(assetFolders[i]))
                {
                    existingBefore++;
                }

                if (!AssetFolderUtility.EnsureAssetFolder(assetFolders[i], log))
                {
                    failed++;
                }
            }

            for (int i = 0; i < externalFolders.Count; i++)
            {
                if (!AssetFolderUtility.EnsureExternalFolder(externalFolders[i], log))
                {
                    failed++;
                }
            }

            int keepFiles = 0;
            keepFiles += WriteMissingGitKeeps(assetFolders, log);
            keepFiles += WriteMissingGitKeeps(externalFolders, log);

            int created = assetFolders.Count - existingBefore - failed;
            log.Info("c) Ordner: " + Math.Max(0, created) + " angelegt, " + existingBefore + " waren schon vorhanden" +
                     (failed > 0 ? ", " + failed + " fehlgeschlagen" : string.Empty) + "; " + keepFiles + " .gitkeep-Datei(en) geschrieben.");
        }

        /// <inheritdoc />
        protected override void CollectItems(List<SetupCheckItem> items)
        {
            IReadOnlyList<string> assetFolders = ProjectFolderLayout.CreateAssetFolders();
            IReadOnlyList<string> externalFolders = ProjectFolderLayout.CreateExternalFolders();

            var missing = new List<string>();
            var withoutKeep = new List<string>();
            CollectProblems(assetFolders, missing, withoutKeep);
            int assetMissing = missing.Count;
            CollectProblems(externalFolders, missing, withoutKeep);

            items.Add(assetMissing == 0
                ? new SetupCheckItem("Ordner unter Assets/ (" + assetFolders.Count + ")", SetupStatus.Done, "alle vorhanden")
                : new SetupCheckItem("Ordner unter Assets/ (" + assetFolders.Count + ")", SetupStatus.Open,
                    assetMissing + " fehlen, z. B. " + JoinFirst(missing, MaxListedPaths)));

            bool externalOk = missing.Count == assetMissing;
            items.Add(new SetupCheckItem("ArtSource/ außerhalb von Assets", externalOk ? SetupStatus.Done : SetupStatus.Open,
                externalOk ? "vorhanden (Blender-/Photoshop-Quellen, LFS, Architektur 2.9 #49)" : "fehlt – wird angelegt"));

            items.Add(withoutKeep.Count == 0
                ? new SetupCheckItem(".gitkeep in leeren Ordnern", SetupStatus.Done, "alle leeren Ordner haben eine .gitkeep-Datei")
                : new SetupCheckItem(".gitkeep in leeren Ordnern", SetupStatus.Open,
                    withoutKeep.Count + " leere Ordner ohne .gitkeep, z. B. " + JoinFirst(withoutKeep, MaxListedPaths)));
        }

        private static void CollectProblems(IReadOnlyList<string> folders, List<string> missing, List<string> withoutKeep)
        {
            for (int i = 0; i < folders.Count; i++)
            {
                string folder = folders[i];
                if (!AssetFolderUtility.Exists(folder))
                {
                    missing.Add(folder);
                }
                else if (AssetFolderUtility.IsEmptyExceptPlaceholders(folder) && !AssetFolderUtility.HasGitKeep(folder))
                {
                    withoutKeep.Add(folder);
                }
            }
        }

        private static int WriteMissingGitKeeps(IReadOnlyList<string> folders, SetupLog log)
        {
            int written = 0;
            for (int i = 0; i < folders.Count; i++)
            {
                if (AssetFolderUtility.IsEmptyExceptPlaceholders(folders[i]) && AssetFolderUtility.WriteGitKeep(folders[i], log))
                {
                    written++;
                }
            }

            return written;
        }

        private static string JoinFirst(List<string> paths, int max)
        {
            if (paths.Count <= max)
            {
                return string.Join(", ", paths);
            }

            return string.Join(", ", paths.GetRange(0, max)) + " … (+" + (paths.Count - max) + ")";
        }
    }
}
