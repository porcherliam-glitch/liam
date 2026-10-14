namespace Aetherfall.UI.Screens
{
    /// <summary>Kind of a line in the history part of the quest details.</summary>
    public enum QuestDetailLineKind
    {
        /// <summary>Journal text of an earlier stage.</summary>
        Stage = 0,

        /// <summary>A decision of the ledger (GDD 02 6.4).</summary>
        Decision = 1,

        /// <summary>A consequence of the ledger ("Folgen bisher").</summary>
        Consequence = 2
    }
}
