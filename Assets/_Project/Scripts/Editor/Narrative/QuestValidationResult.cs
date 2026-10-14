using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Quests;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>Result of one run of "Aetherfall > Quests pruefen": the report and the asset path of every checked quest.</summary>
    public sealed class QuestValidationResult
    {
        /// <summary>Creates the result.</summary>
        /// <param name="report">Validation report.</param>
        /// <param name="assetPathsByQuestId">Asset path per quest id.</param>
        /// <param name="questCount">Number of checked quests.</param>
        /// <param name="flagCheckSkipped">True if no flag definition exists (flag ids were not checked).</param>
        public QuestValidationResult(ValidationReport report, Dictionary<string, string> assetPathsByQuestId, int questCount, bool flagCheckSkipped)
        {
            Report = report;
            AssetPathsByQuestId = assetPathsByQuestId;
            QuestCount = questCount;
            FlagCheckSkipped = flagCheckSkipped;
        }

        /// <summary>Validation report.</summary>
        public ValidationReport Report { get; }

        /// <summary>Asset path per quest id (for "click pings the asset").</summary>
        public Dictionary<string, string> AssetPathsByQuestId { get; }

        /// <summary>Number of checked quests.</summary>
        public int QuestCount { get; }

        /// <summary>True if flag ids were not checked.</summary>
        public bool FlagCheckSkipped { get; }

        /// <summary>German one-line summary.</summary>
        public string Summary =>
            QuestCount + " Quest(s) geprüft: " + Report.ErrorCount + " Fehler, " + Report.WarningCount + " Warnung(en)" +
            (FlagCheckSkipped ? " (keine FlagDefinitions gefunden – Flag-IDs nicht geprüft)" : string.Empty) + ".";

        /// <summary>Asset path of the quest a finding belongs to (first segment of its location), or empty.</summary>
        /// <param name="issue">Finding.</param>
        public string AssetPathOf(in ValidationIssue issue)
        {
            string location = issue.Location;
            int separator = location.IndexOf(" / ", System.StringComparison.Ordinal);
            string questId = separator >= 0 ? location.Substring(0, separator) : location;
            return AssetPathsByQuestId.TryGetValue(questId, out string path) ? path : string.Empty;
        }

        /// <summary>The quest specs of the checked assets (for tests of the menu logic).</summary>
        internal List<QuestSpec> Specs { get; } = new List<QuestSpec>();
    }
}
