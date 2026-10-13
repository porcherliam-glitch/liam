namespace Aetherfall.Combat
{
    /// <summary>
    /// How noticeable a combatant is right now (GDD 03 9.2 "Haltung des Spielers" and hearing radii). Set by the owner
    /// (player controller) on its <see cref="Combatant"/>, read by enemy perception in Aetherfall.AI.
    /// </summary>
    public enum PerceptionStance
    {
        /// <summary>Standing still (no footsteps).</summary>
        Still = 0,

        /// <summary>Sneaking: sight ×0.5, noise 2 m.</summary>
        Sneak = 1,

        /// <summary>Walking: sight ×0.8, noise 5 m.</summary>
        Walk = 2,

        /// <summary>Running: sight ×1.0, noise 10 m.</summary>
        Run = 3,

        /// <summary>Sprinting: sight ×1.3, noise 15 m.</summary>
        Sprint = 4,

        /// <summary>Fighting or casting: sight ×1.5, noise 25 m.</summary>
        Combat = 5
    }
}
