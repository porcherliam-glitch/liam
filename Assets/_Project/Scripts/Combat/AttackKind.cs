namespace Aetherfall.Combat
{
    /// <summary>
    /// Kind of an attack (GDD 03 4.4–4.10). Selects cancel rules, hit feedback (4.11) and which defensive rules apply.
    /// Stored in attack assets: never renumber.
    /// </summary>
    public enum AttackKind
    {
        /// <summary>Step of the light combo (GDD 03 4.4).</summary>
        Light = 0,

        /// <summary>Last step of the light combo (damage ×1.2, poise ×1.5).</summary>
        ComboFinisher = 1,

        /// <summary>Heavy attack, chargeable (GDD 03 4.5).</summary>
        Heavy = 2,

        /// <summary>Sprint attack (GDD 03 4.6).</summary>
        Sprint = 3,

        /// <summary>Jump attack (GDD 03 4.6).</summary>
        Jump = 4,

        /// <summary>Counter after a perfect parry (GDD 03 4.8).</summary>
        Counter = 5,

        /// <summary>Finisher against a target with broken poise (GDD 03 4.10).</summary>
        Finisher = 6,

        /// <summary>Attack of an enemy (wolf bite, pounce …).</summary>
        Enemy = 7
    }
}
