namespace Aetherfall.Stats
{
    /// <summary>
    /// Keys of all character values (GDD 03 section 10, architecture 11.5). The numbers are fixed: they may be stored in
    /// assets and saves (saves use the name). Never renumber, never reuse a removed number; append new values in a free
    /// slot of their group.
    /// </summary>
    /// <remarks>
    /// Percent values are stored as fractions (0.05 = 5 %), speed values as factors (1.0 = 100 %).
    /// The highest value must stay below <see cref="StatIds.Capacity"/>.
    /// </remarks>
    public enum StatId
    {
        /// <summary>No stat (unbound, "not set").</summary>
        None = 0,

        /// <summary>Strength: melee scaling, carry capacity (GDD 03 10.2).</summary>
        Strength = 1,

        /// <summary>Dexterity: ranged/dagger scaling, critical chance, roll cost (GDD 03 10.2).</summary>
        Dexterity = 2,

        /// <summary>Intelligence: spell power, mana (GDD 03 10.2).</summary>
        Intelligence = 3,

        /// <summary>Wisdom: healing, mana regeneration, status resistance (GDD 03 10.2).</summary>
        Wisdom = 4,

        /// <summary>Constitution: health, stamina, poise (GDD 03 10.2).</summary>
        Constitution = 5,

        /// <summary>Charisma: dialogue checks, prices, loyalty, luck (GDD 03 10.2).</summary>
        Charisma = 6,

        /// <summary>Character level (base value set by Progression, 1–80).</summary>
        Level = 10,

        /// <summary>Maximum health: 100 + 15 × E(Con) + 12 × (Level − 1) + equipment.</summary>
        MaxHealth = 20,

        /// <summary>Maximum stamina: 100 + 2 × E(Con) + 0.5 × (Level − 1).</summary>
        MaxStamina = 21,

        /// <summary>Maximum mana: 50 + 5 × E(Int) + 2 × (Level − 1).</summary>
        MaxMana = 22,

        /// <summary>Stamina regeneration per second (25, GDD 03 4.3); overload lowers it with percent modifiers.</summary>
        StaminaRegen = 23,

        /// <summary>Mana regeneration factor: 1 + 0.02 × E(Wis) (applied to 2.5 % / 6 % of max mana per second).</summary>
        ManaRegenFactor = 24,

        /// <summary>Healing factor: 1 + 0.02 × E(Wis).</summary>
        HealingFactor = 25,

        /// <summary>Spell power without magic weapon: 10 × (1 + 0.12 × (Level − 1)) × (1 + 0.025 × E(Int)).</summary>
        SpellPower = 30,

        /// <summary>Critical chance as fraction: 0.05 + 0.0025 × E(Dex) + equipment; soft cap 50 %, hard cap 75 %.</summary>
        CritChance = 31,

        /// <summary>Critical damage factor: 1.5 + equipment; hard cap 3.0.</summary>
        CritDamage = 32,

        /// <summary>Attack speed factor: 1.0 + bonuses; 0.7–1.3.</summary>
        AttackSpeed = 33,

        /// <summary>Cooldown reduction as fraction; soft cap 30 %, hard cap 40 %.</summary>
        CooldownReduction = 34,

        /// <summary>Sum of additive damage bonuses as fraction (Σ b in damage step 3, GDD 03 8.2).</summary>
        DamageBonus = 35,

        /// <summary>Armor penetration as fraction (e.g. crossbow 0.25).</summary>
        ArmorPenetration = 36,

        /// <summary>Resistance penetration (lowers only positive resistances).</summary>
        ResistancePenetration = 37,

        /// <summary>Armor: sum of armor pieces, shield and flat bonuses, then percent bonuses.</summary>
        Armor = 40,

        /// <summary>Poise (Standfestigkeit): 20 + armor class (0/15/30) + 0.5 × E(Con).</summary>
        Poise = 41,

        /// <summary>Status resistance: 1.5 × E(Wis) + equipment; player cap 200.</summary>
        StatusResistance = 42,

        /// <summary>Resistance against slash damage (fraction, player −1.0 to 0.75).</summary>
        ResistSlash = 50,

        /// <summary>Resistance against stab damage.</summary>
        ResistStab = 51,

        /// <summary>Resistance against blunt damage.</summary>
        ResistBlunt = 52,

        /// <summary>Resistance against fire damage.</summary>
        ResistFire = 53,

        /// <summary>Resistance against ice damage.</summary>
        ResistIce = 54,

        /// <summary>Resistance against lightning damage.</summary>
        ResistLightning = 55,

        /// <summary>Resistance against poison damage.</summary>
        ResistPoison = 56,

        /// <summary>Resistance against shadow damage.</summary>
        ResistShadow = 57,

        /// <summary>Resistance against aether damage.</summary>
        ResistAether = 58,

        /// <summary>Movement speed factor: 1.0 + bonuses; 0.4–1.3.</summary>
        MoveSpeed = 60,

        /// <summary>Carry capacity in kg: 60 + 2 × E(Str) + bags.</summary>
        CarryCapacity = 61,

        /// <summary>Luck: 0.5 × E(Cha) + equipment + buffs.</summary>
        Luck = 62
    }
}
