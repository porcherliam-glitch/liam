using System;
using Aetherfall.Events;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Skills
{
    /// <summary>
    /// One effect of a skill node, per rank (GDD 03 11.4, 11.5): a stat modifier, an ability to learn, an element bonus, an
    /// upgrade of one ability or a combat bonus. A node with 3 ranks applies <see cref="Value"/> × rank.
    /// </summary>
    [Serializable]
    public sealed class SkillEffect
    {
        [Tooltip("Art der Wirkung.")]
        [SerializeField] private SkillEffectKind kind = SkillEffectKind.None;

        [Tooltip("Wert je Rang (Prozent als Anteil: 0,05 = 5 %).")]
        [SerializeField] private float value = 0f;

        [Tooltip("Wert (nur bei Art „Wert“).")]
        [SerializeField] private StatId stat = StatId.None;

        [Tooltip("An: Prozent auf den Wert; aus: fester Betrag (nur bei Art „Wert“).")]
        [SerializeField] private bool percent = false;

        [Tooltip("Element (Element-Schaden und -Aufbau).")]
        [SerializeField] private DamageType element = DamageType.Fire;

        [Tooltip("Fähigkeit (Fähigkeit lernen und Verbesserungen), z. B. ability.feuer.flammenteppich.")]
        [SerializeField] private string abilityId = "";

        /// <summary>Creates an empty effect (inspector).</summary>
        public SkillEffect()
        {
        }

        /// <summary>Creates an effect.</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="value">Value per rank.</param>
        /// <param name="stat">Stat (kind Stat).</param>
        /// <param name="percent">Percent modifier (kind Stat).</param>
        /// <param name="element">Element (element kinds).</param>
        /// <param name="abilityId">Ability (learn and upgrade kinds).</param>
        public SkillEffect(SkillEffectKind kind, float value, StatId stat = StatId.None, bool percent = false, DamageType element = DamageType.Fire,
            string abilityId = "")
        {
            this.kind = kind;
            this.value = value;
            this.stat = stat;
            this.percent = percent;
            this.element = element;
            this.abilityId = abilityId ?? string.Empty;
        }

        /// <summary>Kind.</summary>
        public SkillEffectKind Kind => kind;

        /// <summary>Value per rank.</summary>
        public float Value => value;

        /// <summary>Stat of a stat effect.</summary>
        public StatId Stat => stat;

        /// <summary>True: percent modifier; false: flat.</summary>
        public bool Percent => percent;

        /// <summary>Element of an element effect.</summary>
        public DamageType Element => element;

        /// <summary>Ability of a learn or upgrade effect.</summary>
        public string AbilityId => abilityId ?? string.Empty;

        /// <summary>A stat modifier per rank.</summary>
        /// <param name="stat">Stat.</param>
        /// <param name="value">Value per rank.</param>
        /// <param name="percent">Percent (0.05 = +5 %) instead of flat.</param>
        public static SkillEffect ForStat(StatId stat, float value, bool percent)
        {
            return new SkillEffect(SkillEffectKind.Stat, value, stat, percent);
        }

        /// <summary>Teaches an ability.</summary>
        /// <param name="abilityId">Ability id.</param>
        public static SkillEffect Learn(string abilityId)
        {
            return new SkillEffect(SkillEffectKind.LearnAbility, 1f, abilityId: abilityId);
        }

        /// <summary>An element bonus per rank (damage or build-up).</summary>
        /// <param name="kind">ElementDamage or ElementBuildup.</param>
        /// <param name="element">Element.</param>
        /// <param name="value">Bonus per rank.</param>
        public static SkillEffect ForElement(SkillEffectKind kind, DamageType element, float value)
        {
            return new SkillEffect(kind, value, element: element);
        }

        /// <summary>An upgrade of one ability.</summary>
        /// <param name="kind">One of the ability kinds (targets, radius, hits, pull, stamina cost).</param>
        /// <param name="abilityId">Ability id.</param>
        /// <param name="value">Value per rank.</param>
        public static SkillEffect ForAbility(SkillEffectKind kind, string abilityId, float value)
        {
            return new SkillEffect(kind, value, abilityId: abilityId);
        }

        /// <summary>A combat bonus per rank (light attacks, heavy poise, block, stamina back, companions, all abilities).</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="value">Value per rank.</param>
        public static SkillEffect Bonus(SkillEffectKind kind, float value)
        {
            return new SkillEffect(kind, value);
        }
    }
}
