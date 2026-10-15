namespace Aetherfall.Skills
{
    /// <summary>What a skill node does, per rank (GDD 03 11.4, 11.5).</summary>
    public enum SkillEffectKind
    {
        /// <summary>Nothing.</summary>
        None = 0,

        /// <summary>A stat modifier on the player (flat or percent): armor, max stamina, max mana, mana regeneration …</summary>
        Stat = 1,

        /// <summary>Teaches an ability (active node).</summary>
        LearnAbility = 2,

        /// <summary>Damage of the abilities of one element (fire, ice, lightning …).</summary>
        ElementDamage = 3,

        /// <summary>Status build-up of the abilities of one element.</summary>
        ElementBuildup = 4,

        /// <summary>Damage of every ability.</summary>
        AbilityDamage = 5,

        /// <summary>One ability: more targets (pierce, chain).</summary>
        AbilityTargets = 6,

        /// <summary>One ability: larger explosion or area (metres).</summary>
        AbilityRadius = 7,

        /// <summary>One ability: more hits (rotations).</summary>
        AbilityHits = 8,

        /// <summary>One ability: pulls the targets in (metres).</summary>
        AbilityPull = 9,

        /// <summary>One ability: change of the stamina cost.</summary>
        AbilityStaminaCost = 10,

        /// <summary>Damage of light attacks and combo finishers.</summary>
        LightAttackDamage = 11,

        /// <summary>Poise damage of heavy attacks.</summary>
        HeavyAttackPoise = 12,

        /// <summary>Block stability in percentage points.</summary>
        BlockStability = 13,

        /// <summary>Stamina back when a combo finisher hits.</summary>
        ComboFinisherStamina = 14,

        /// <summary>Stamina back after a perfect parry.</summary>
        ParryStamina = 15,

        /// <summary>Damage of companions.</summary>
        CompanionDamage = 16
    }
}
