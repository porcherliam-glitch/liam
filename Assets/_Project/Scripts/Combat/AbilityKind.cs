namespace Aetherfall.Combat
{
    /// <summary>How an active ability takes effect (GDD 03 6.4: projectile, area, self-buff; 6.5: the cone of the Aether-Stoß).</summary>
    public enum AbilityKind
    {
        /// <summary>Cone in front of the caster (360° = all around, e.g. Frostnova).</summary>
        Cone = 0,

        /// <summary>A flying projectile (Feuerball with explosion, Eislanze that pierces).</summary>
        Projectile = 1,

        /// <summary>Instant chain from a target to the next ones (Kettenblitz).</summary>
        Chain = 2,

        /// <summary>A lasting area on the ground that hits everyone inside at intervals (Flammenteppich).</summary>
        GroundArea = 3,

        /// <summary>Several strikes from above around a point (Gewitterruf).</summary>
        Strikes = 4,

        /// <summary>A timed buff on the caster (Glutmantel, Eispanzer, Sturmschritt).</summary>
        SelfBuff = 5,

        /// <summary>A shout around the caster without damage: taunt, weaken, stagger (Spott, Kriegsschrei).</summary>
        Shout = 6
    }

    /// <summary>Timed buffs of <see cref="AbilityKind.SelfBuff"/> abilities (GDD 03 6.4, column "Selbstverstärkung").</summary>
    public enum AbilityBuffKind
    {
        /// <summary>No buff.</summary>
        None = 0,

        /// <summary>Glutmantel: melee hits deal +value as fire and build up burning; a fire aura burns enemies close by.</summary>
        FireMantle = 1,

        /// <summary>Eispanzer: armor +value; attackers that hit the caster in melee build up freezing.</summary>
        IceArmor = 2,

        /// <summary>Sturmschritt: movement speed +value; a roll leaves a shock pulse.</summary>
        StormStep = 3,

        /// <summary>Spott: armor +value while the enemies are taunted.</summary>
        Guard = 4
    }
}
