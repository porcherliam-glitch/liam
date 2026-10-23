namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Ids of the cutscenes (S58; GDD 02 11.1: the prologue of "Asche über Eichental" has three hooks). Only the first one has a
    /// recorded sequence so far; the others are named for the quest data.
    /// </summary>
    public static class CutsceneIds
    {
        /// <summary>Prefix of every cutscene id.</summary>
        public const string Prefix = "cs.";

        /// <summary>The rift opens over the harvest festival, Lina is pulled into the light, the player wakes up (stage s10).</summary>
        public const string PrologueAwakening = "cs.prolog.erwachen";

        /// <summary>The grey figure at the rift (stage s40; not recorded yet).</summary>
        public const string PrologueFigure = "cs.prolog.gestalt";

        /// <summary>The Aether touches the player (end of stage s50; not recorded yet).</summary>
        public const string PrologueAetherTouch = "cs.prolog.aether_beruehrung";

        /// <summary>All known ids (tests).</summary>
        public static readonly string[] All = { PrologueAwakening, PrologueFigure, PrologueAetherTouch };
    }
}
