namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Autosave on world triggers (GDD 05 5.3: "Vor dem Betreten und nach dem Verlassen von Dungeons", "Vor einem Bosskampf
    /// (Vorkammer, nicht in der Arena) und nach dem Sieg"). Interface low, implementation high (architecture 3.5): World may not
    /// reference the save system's types; the save bridge in <c>Aetherfall.World.Gameplay</c> implements it and registers it.
    /// Without it, checkpoints only move the respawn point.
    /// </summary>
    public interface IWorldAutosave
    {
        /// <summary>
        /// Requests an autosave. While saving is not allowed (combat, boss arena, loading) it waits and runs as soon as saving
        /// is allowed again (newest request wins; dropped after 30 s or when a save is loaded).
        /// </summary>
        /// <param name="reason">Short English reason for the log, e.g. <c>checkpoint.gruft.vorkammer</c>.</param>
        void RequestAutosave(string reason);
    }
}
