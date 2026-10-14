namespace Aetherfall.Quests
{
    /// <summary>How a follow-up quest is handled after a successful end (GDD 02, 4.1 "Folgequests"). Stored in assets: never renumber.</summary>
    public enum FollowUpMode
    {
        /// <summary>Offered (German "angeboten"): becomes available through its own start conditions.</summary>
        Offer = 0,

        /// <summary>Started at once (German "automatisch gestartet").</summary>
        AutoStart = 1
    }
}
