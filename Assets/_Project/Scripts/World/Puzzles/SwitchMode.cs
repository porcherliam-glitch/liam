namespace Aetherfall.World.Puzzles
{
    /// <summary>How a <see cref="PuzzleSwitch"/> behaves. Stored in scenes: never renumber.</summary>
    public enum SwitchMode
    {
        /// <summary>Grave slab or button: goes down on use; the puzzle decides when it springs back.</summary>
        Momentary = 0,

        /// <summary>Lever: flips between off and on; the state is saved under the switch id.</summary>
        Toggle = 1,

        /// <summary>Lever that stays on once pulled (one-way shortcut).</summary>
        OneWay = 2
    }
}
