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
            bool dropsGuard)
        {
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
                DropsGuard = dropsGuard
            };
        }
    }
}
