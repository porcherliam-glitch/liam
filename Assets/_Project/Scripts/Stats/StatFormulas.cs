using System;

namespace Aetherfall.Stats
{
    /// <summary>
    /// The formulas of GDD 03 section 10 (attribute scale, derived values) and the regeneration rules of 4.3 as pure
    /// functions. <see cref="StatFormulaSet.CreateDefault"/> builds the derived stats from these constants; systems use the
    /// functions directly where a value is not a stat (e.g. mana regeneration depends on the combat state).
    /// </summary>
    /// <remarks>All values are "Vorschlag" values of GDD 03; internal values are not rounded (GDD 03 10.3).</remarks>
    public static class StatFormulas
    {
        /// <summary>Attribute value where effective points are 0 (GDD 03 10.1: E(x) = x − 10).</summary>
        public const float AttributeNeutral = 10f;

        /// <summary>Attribute soft cap (GDD 03 10.1: above 40 only half effect).</summary>
        public const float AttributeSoftCap = 40f;

        /// <summary>Starting value of every attribute in the prologue (GDD 03 10.1).</summary>
        public const float PrologueAttributeValue = 11f;

        /// <summary>Base of maximum health (GDD 03 10.3).</summary>
        public const float HealthBase = 100f;

        /// <summary>Health per effective constitution point.</summary>
        public const float HealthPerConstitution = 15f;

        /// <summary>Health per level above 1.</summary>
        public const float HealthPerLevel = 12f;

        /// <summary>Base of maximum stamina.</summary>
        public const float StaminaBase = 100f;

        /// <summary>Stamina per effective constitution point.</summary>
        public const float StaminaPerConstitution = 2f;

        /// <summary>Stamina per level above 1.</summary>
        public const float StaminaPerLevel = 0.5f;

        /// <summary>Base of maximum mana.</summary>
        public const float ManaBase = 50f;

        /// <summary>Mana per effective intelligence point.</summary>
        public const float ManaPerIntelligence = 5f;

        /// <summary>Mana per level above 1.</summary>
        public const float ManaPerLevel = 2f;

        /// <summary>Stamina regeneration per second (GDD 03 4.3).</summary>
        public const float StaminaRegenPerSecond = 25f;

        /// <summary>Stamina regenerates this many seconds after the last use (GDD 03 4.3).</summary>
        public const float StaminaRegenDelay = 0.8f;

        /// <summary>Sprint and roll are locked this long after stamina reached 0 ("Erschoepft", GDD 03 4.3).</summary>
        public const float StaminaExhaustionDuration = 1.2f;

        /// <summary>Health regeneration outside of combat: share of max health per second (GDD 03 10.3).</summary>
        public const float HealthRegenFractionPerSecond = 0.01f;

        /// <summary>Health regenerates this many seconds after the last damage (GDD 03 10.3).</summary>
        public const float HealthRegenDelay = 8f;

        /// <summary>Mana regeneration in combat: share of max mana per second (GDD 03 10.3).</summary>
        public const float ManaRegenFractionInCombat = 0.025f;

        /// <summary>Mana regeneration outside of combat: share of max mana per second (GDD 03 10.3).</summary>
        public const float ManaRegenFractionOutOfCombat = 0.06f;

        /// <summary>Base critical chance (GDD 03 10.3: 5 %).</summary>
        public const float CritChanceBase = 0.05f;

        /// <summary>Critical chance per effective dexterity point (0.25 percentage points).</summary>
        public const float CritChancePerDexterity = 0.0025f;

        /// <summary>Base critical damage factor (GDD 03 10.3: 150 %).</summary>
        public const float CritDamageBase = 1.5f;

        /// <summary>Status resistance per effective wisdom point.</summary>
        public const float StatusResistancePerWisdom = 1.5f;

        /// <summary>Base carry capacity in kg.</summary>
        public const float CarryBase = 60f;

        /// <summary>Carry capacity per effective strength point in kg.</summary>
        public const float CarryPerStrength = 2f;

        /// <summary>Base poise (Standfestigkeit, GDD 03 4.9).</summary>
        public const float PoiseBase = 20f;

        /// <summary>Poise per effective constitution point.</summary>
        public const float PoisePerConstitution = 0.5f;

        /// <summary>Luck per effective charisma point.</summary>
        public const float LuckPerCharisma = 0.5f;

        /// <summary>Healing and mana regeneration factor per effective wisdom point (+2 %).</summary>
        public const float WisdomFactorPerPoint = 0.02f;

        /// <summary>Spell power without magic weapon at level 1 (GDD 03 10.3).</summary>
        public const float SpellPowerBase = 10f;

        /// <summary>Spell power growth per level above 1 (12 %).</summary>
        public const float SpellPowerPerLevel = 0.12f;

        /// <summary>Spell power per effective intelligence point (+2.5 %).</summary>
        public const float SpellPowerPerIntelligence = 0.025f;

        /// <summary>Weapon damage scaling per weighted effective attribute point (+2.5 %, GDD 03 8.2 step 2).</summary>
        public const float AttackScalingPerPoint = 0.025f;

        /// <summary>Roll stamina cost reduction per effective dexterity point (1 %).</summary>
        public const float RollCostReductionPerDexterity = 0.01f;

        /// <summary>Highest roll stamina cost reduction (30 %).</summary>
        public const float RollCostReductionMax = 0.3f;

        /// <summary>
        /// Effective points of an attribute (GDD 03 10.1): <c>x − 10</c> up to 40, above that <c>30 + 0.5 × (x − 40)</c>.
        /// Below 10 the result is negative. Examples: E(8) = −2, E(20) = 10, E(41) = 30.5, E(60) = 40.
        /// </summary>
        /// <param name="attributeValue">Attribute value.</param>
        public static float EffectivePoints(float attributeValue)
        {
            if (attributeValue <= AttributeSoftCap)
            {
                return attributeValue - AttributeNeutral;
            }

            return AttributeSoftCap - AttributeNeutral + 0.5f * (attributeValue - AttributeSoftCap);
        }

        /// <summary>Maximum health without equipment: 100 + 15 × E(Con) + 12 × (Level − 1).</summary>
        /// <param name="constitution">Constitution.</param>
        /// <param name="level">Character level.</param>
        public static float MaxHealth(float constitution, float level)
        {
            return HealthBase + HealthPerConstitution * EffectivePoints(constitution) + HealthPerLevel * (level - 1f);
        }

        /// <summary>Maximum stamina: 100 + 2 × E(Con) + 0.5 × (Level − 1).</summary>
        /// <param name="constitution">Constitution.</param>
        /// <param name="level">Character level.</param>
        public static float MaxStamina(float constitution, float level)
        {
            return StaminaBase + StaminaPerConstitution * EffectivePoints(constitution) + StaminaPerLevel * (level - 1f);
        }

        /// <summary>Maximum mana: 50 + 5 × E(Int) + 2 × (Level − 1).</summary>
        /// <param name="intelligence">Intelligence.</param>
        /// <param name="level">Character level.</param>
        public static float MaxMana(float intelligence, float level)
        {
            return ManaBase + ManaPerIntelligence * EffectivePoints(intelligence) + ManaPerLevel * (level - 1f);
        }

        /// <summary>Mana regeneration per second: 2.5 % (combat) or 6 % of max mana × (1 + 0.02 × E(Wis)).</summary>
        /// <param name="maxMana">Maximum mana.</param>
        /// <param name="wisdom">Wisdom.</param>
        /// <param name="inCombat">True in combat.</param>
        public static float ManaRegenPerSecond(float maxMana, float wisdom, bool inCombat)
        {
            float fraction = inCombat ? ManaRegenFractionInCombat : ManaRegenFractionOutOfCombat;
            return maxMana * fraction * WisdomFactor(wisdom);
        }

        /// <summary>Health regeneration per second: 0 in combat, otherwise 1 % of max health (after 8 s without damage).</summary>
        /// <param name="maxHealth">Maximum health.</param>
        /// <param name="inCombat">True in combat.</param>
        public static float HealthRegenPerSecond(float maxHealth, bool inCombat)
        {
            return inCombat ? 0f : maxHealth * HealthRegenFractionPerSecond;
        }

        /// <summary>Healing and mana regeneration factor: 1 + 0.02 × E(Wis).</summary>
        /// <param name="wisdom">Wisdom.</param>
        public static float WisdomFactor(float wisdom)
        {
            return 1f + WisdomFactorPerPoint * EffectivePoints(wisdom);
        }

        /// <summary>Critical chance without equipment: 5 % + 0.25 % × E(Dex) (fraction, before caps).</summary>
        /// <param name="dexterity">Dexterity.</param>
        public static float CritChance(float dexterity)
        {
            return CritChanceBase + CritChancePerDexterity * EffectivePoints(dexterity);
        }

        /// <summary>Status resistance without equipment: 1.5 × E(Wis).</summary>
        /// <param name="wisdom">Wisdom.</param>
        public static float StatusResistance(float wisdom)
        {
            return StatusResistancePerWisdom * EffectivePoints(wisdom);
        }

        /// <summary>Carry capacity without bags: 60 kg + 2 kg × E(Str).</summary>
        /// <param name="strength">Strength.</param>
        public static float CarryCapacity(float strength)
        {
            return CarryBase + CarryPerStrength * EffectivePoints(strength);
        }

        /// <summary>Poise (Standfestigkeit): 20 + armor class bonus (0 / 15 / 30) + 0.5 × E(Con).</summary>
        /// <param name="armorClassBonus">0 light, 15 medium, 30 heavy (GDD 03 4.9).</param>
        /// <param name="constitution">Constitution.</param>
        public static float Poise(float armorClassBonus, float constitution)
        {
            return PoiseBase + armorClassBonus + PoisePerConstitution * EffectivePoints(constitution);
        }

        /// <summary>Luck without equipment and buffs: 0.5 × E(Cha).</summary>
        /// <param name="charisma">Charisma.</param>
        public static float Luck(float charisma)
        {
            return LuckPerCharisma * EffectivePoints(charisma);
        }

        /// <summary>Spell power without magic weapon: 10 × (1 + 0.12 × (Level − 1)) × (1 + 0.025 × E(Int)).</summary>
        /// <param name="level">Character level.</param>
        /// <param name="intelligence">Intelligence.</param>
        public static float SpellPowerWithoutWeapon(float level, float intelligence)
        {
            return SpellPowerBase * (1f + SpellPowerPerLevel * (level - 1f)) * (1f + SpellPowerPerIntelligence * EffectivePoints(intelligence));
        }

        /// <summary>Spell power with a magic weapon: weapon spell power × (1 + 0.025 × E(Int)).</summary>
        /// <param name="weaponSpellPower">Spell power of the weapon.</param>
        /// <param name="intelligence">Intelligence.</param>
        public static float SpellPower(float weaponSpellPower, float intelligence)
        {
            return weaponSpellPower * (1f + SpellPowerPerIntelligence * EffectivePoints(intelligence));
        }

        /// <summary>
        /// Weapon scaling factor (GDD 03 8.2 step 2): <c>1 + 0.025 × Σ wᵢ × E(Attributeᵢ)</c>.
        /// </summary>
        /// <param name="weightedEffectivePoints">Σ wᵢ × E(Attributeᵢ) of the weapon's scaling weights.</param>
        public static float AttackScaling(float weightedEffectivePoints)
        {
            return 1f + AttackScalingPerPoint * weightedEffectivePoints;
        }

        /// <summary>Displayed attack: weapon damage × scaling factor (GDD 03 10.3; display rounds down).</summary>
        /// <param name="weaponDamage">Weapon damage.</param>
        /// <param name="weightedEffectivePoints">Σ wᵢ × E(Attributeᵢ).</param>
        public static float AttackDisplay(float weaponDamage, float weightedEffectivePoints)
        {
            return weaponDamage * AttackScaling(weightedEffectivePoints);
        }

        /// <summary>Roll stamina cost factor: 1 − 1 % × E(Dex), at most −30 % (GDD 03 3.2, 10.2); never above 1.</summary>
        /// <param name="dexterity">Dexterity.</param>
        public static float RollCostFactor(float dexterity)
        {
            float reduction = Math.Min(RollCostReductionMax, Math.Max(0f, RollCostReductionPerDexterity * EffectivePoints(dexterity)));
            return 1f - reduction;
        }
    }
}
