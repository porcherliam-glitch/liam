namespace Aetherfall.World
{
    /// <summary>
    /// An enemy group in a scene that the <see cref="ISpawnGroupRegistry"/> switches on and off (implemented by
    /// <see cref="SpawnGroupMarker"/>).
    /// </summary>
    public interface ISpawnGroup
    {
        /// <summary>Spawner id, e.g. <c>spawn.eichental.nordhang_rudel</c>.</summary>
        string SpawnId { get; }

        /// <summary>Always there (wildlife) or switched on by a quest.</summary>
        SpawnActivation Activation { get; }

        /// <summary>Shows or hides the enemies of the group.</summary>
        /// <param name="active">True to show them.</param>
        void SetGroupActive(bool active);
    }
}
