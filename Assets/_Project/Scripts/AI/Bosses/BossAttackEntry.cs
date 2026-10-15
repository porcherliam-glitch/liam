using System;
using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>One attack of a <see cref="BossDefinition"/> (inspector entry): attack, ranges, cooldown, weight and phase.</summary>
    [Serializable]
    public sealed class BossAttackEntry
    {
        [Tooltip("Angriff (Zeitfenster, Hitbox). Ausholen = Telegrafie (Schildstoß 0,8 s, Sturmangriff ≥ 0,7 s rot).")]
        [SerializeField] private AttackDefinition attack = null;

        [Tooltip("Kleinster Abstand zum Ziel in Metern.")]
        [Min(0f)] [SerializeField] private float minRange = 0f;

        [Tooltip("Größter Abstand zum Ziel in Metern.")]
        [Min(0.1f)] [SerializeField] private float maxRange = 2.6f;

        [Tooltip("Größter Winkel zum Ziel beim Start in Grad.")]
        [Range(5f, 180f)] [SerializeField] private float maxAngle = 25f;

        [Tooltip("Abklingzeit nach dem Angriff in Sekunden.")]
        [Min(0f)] [SerializeField] private float cooldown = 2f;

        [Tooltip("Gewicht der Zufallsauswahl.")]
        [Min(0f)] [SerializeField] private float weight = 1f;

        [Tooltip("Ab dieser Phase (1 = von Anfang an).")]
        [Range(1, 5)] [SerializeField] private int minPhase = 1;

        [Tooltip("Schild unten, solange der Angriff läuft (Öffnung für den Spieler).")]
        [SerializeField] private bool dropsGuard = false;

        [Tooltip("Bis zu dieser Phase (0 = bis zum Ende), z. B. das Kriegshorn nur in Phase 1.")]
        [Range(0, 5)] [SerializeField] private int maxPhase = 0;

        [Tooltip("Sonderangriff (leer = normaler Schlag): horn, kran, brandtopf … Die Boss-Mechanik führt ihn aus, keine Hitbox.")]
        [SerializeField] private string special = string.Empty;

        /// <summary>Creates an empty entry (inspector).</summary>
        public BossAttackEntry()
        {
        }

        /// <summary>Creates an entry (generator).</summary>
        /// <param name="attack">Attack asset.</param>
        /// <param name="minRange">Minimum range.</param>
        /// <param name="maxRange">Maximum range.</param>
        /// <param name="maxAngle">Maximum start angle.</param>
        /// <param name="cooldown">Cooldown.</param>
        /// <param name="weight">Weight.</param>
        /// <param name="minPhase">First phase.</param>
        /// <param name="dropsGuard">Guard down while running.</param>
        public BossAttackEntry(AttackDefinition attack, float minRange, float maxRange, float maxAngle, float cooldown, float weight, int minPhase,
            bool dropsGuard) : this(attack, minRange, maxRange, maxAngle, cooldown, weight, minPhase, dropsGuard, 0, string.Empty)
        {
        }

        /// <summary>Creates an entry with a last phase and a special key (generator).</summary>
        /// <param name="attack">Attack asset.</param>
        /// <param name="minRange">Minimum range.</param>
        /// <param name="maxRange">Maximum range.</param>
        /// <param name="maxAngle">Maximum start angle.</param>
        /// <param name="cooldown">Cooldown.</param>
        /// <param name="weight">Weight.</param>
        /// <param name="minPhase">First phase.</param>
        /// <param name="dropsGuard">Guard down while running.</param>
        /// <param name="maxPhase">Last phase (0 = to the end).</param>
        /// <param name="special">Special key or empty.</param>
        public BossAttackEntry(AttackDefinition attack, float minRange, float maxRange, float maxAngle, float cooldown, float weight, int minPhase,
            bool dropsGuard, int maxPhase, string special)
        {
            this.maxPhase = maxPhase;
            this.special = special ?? string.Empty;
            this.attack = attack;
            this.minRange = minRange;
            this.maxRange = maxRange;
            this.maxAngle = maxAngle;
            this.cooldown = cooldown;
            this.weight = weight;
            this.minPhase = minPhase;
            this.dropsGuard = dropsGuard;
        }

        /// <summary>Attack asset.</summary>
        public AttackDefinition Attack => attack;

        /// <summary>First phase.</summary>
        public int MinPhase => minPhase;

        /// <summary>Plain option for the brain; null without attack.</summary>
        public BossAttackOption CreateOption()
        {
            if (attack == null)
            {
                return null;
            }

            return new BossAttackOption
            {
                Option = new EnemyAttackOption
                {
                    Attack = attack.CreateSpec(),
                    MinRange = minRange,
                    MaxRange = Mathf.Max(minRange, maxRange),
                    MaxAngle = maxAngle,
                    Cooldown = cooldown,
                    Weight = weight
                },
                MinPhase = Mathf.Max(1, minPhase),
                MaxPhase = maxPhase > 0 ? maxPhase : int.MaxValue,
                DropsGuard = dropsGuard,
                Special = special ?? string.Empty
            };
        }
    }
}
