namespace Aetherfall.Input
{
    /// <summary>Result of <see cref="PauseRouting.Resolve"/>: what the pause input asks the game state to do.</summary>
    public enum PauseCommand
    {
        /// <summary>Nothing to do.</summary>
        None = 0,

        /// <summary>Push <see cref="Aetherfall.Core.GameState.Paused"/>.</summary>
        PushPaused = 1,

        /// <summary>Pop <see cref="Aetherfall.Core.GameState.Paused"/> (resume).</summary>
        PopPaused = 2
    }
}
