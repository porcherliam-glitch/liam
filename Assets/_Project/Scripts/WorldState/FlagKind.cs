namespace Aetherfall.WorldState
{
    /// <summary>
    /// Kind of a world state entry (architecture 8.1). All kinds are stored as <c>int</c>; the kind only decides the editor
    /// display, the clamping and the validator rules. Values are stored in assets: never renumber.
    /// </summary>
    public enum FlagKind
    {
        /// <summary>Yes/no, stored as 0/1 (German "Bool"), e.g. <c>flag.eichental.dorf_zerstoert</c>.</summary>
        Bool = 0,

        /// <summary>Counter, at least 0 (German "Zaehler"), e.g. <c>stat.global.banditen_getoetet</c>.</summary>
        Counter = 1,

        /// <summary>Named state 0-n with a value list; 0 = unknown/start (German "Enum"), e.g. <c>flag.eichental.muehlbach_ausgang</c>.</summary>
        Enum = 2,

        /// <summary>Story number with min/max (German "Story-Zahl"), e.g. <c>stat.player.leere_resonanz</c> (0-100).</summary>
        StoryNumber = 3
    }
}
