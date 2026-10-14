namespace Aetherfall.World
{
    /// <summary>When an NPC stands at a marker (JSON <c>phase</c>).</summary>
    public enum NpcMarkerPhase
    {
        /// <summary><c>always</c>: During the whole mini slice.</summary>
        Always = 0,

        /// <summary><c>prolog</c>: While the prologue quest runs.</summary>
        Prolog = 1,

        /// <summary><c>after_prolog</c>: After the prologue quest.</summary>
        AfterProlog = 2
    }
}
