using System.Collections.Generic;

namespace Aetherfall.UI.Screens
{
    /// <summary>One tracked quest of the HUD (GDD 05 1.2): title, category colour, focus mark and visible objectives.</summary>
    public sealed class TrackedQuestEntry
    {
        /// <summary>Quest id.</summary>
        public string QuestId { get; set; } = string.Empty;

        /// <summary>Title.</summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>Colour class of the category.</summary>
        public string CategoryClass { get; set; } = string.Empty;

        /// <summary>True for the focus quest.</summary>
        public bool IsFocus { get; set; }

        /// <summary>Visible objectives of the active stage.</summary>
        public List<QuestObjectiveLine> Objectives { get; } = new List<QuestObjectiveLine>();
    }
}
