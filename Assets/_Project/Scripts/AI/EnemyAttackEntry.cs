using System;
using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// One attack of an enemy type in the inspector (architecture 11.10 "attacks[]": range, angle, cooldown, weight). The
    /// wind-up of the attack asset is the telegraph (GDD 03 9.5: at least 0.4 s).
    /// </summary>
    [Serializable]
    public sealed class EnemyAttackEntry
    {
        [Tooltip("Angriff (Zeitfenster, Hitbox, Multiplikatoren). Ausholen = Telegrafie (mindestens 0,4 s).")]
        [SerializeField] private AttackDefinition attack = null;

        [Tooltip("Kleinster Abstand zum Ziel in Metern.")]
        [Min(0f)] [SerializeField] private float minRange = 0f;

        [Tooltip("Größter Abstand zum Ziel in Metern.")]
        [Min(0.1f)] [SerializeField] private float maxRange = 2.2f;

        [Tooltip("Größter Winkel zwischen Blickrichtung und Ziel beim Start in Grad.")]
        [Range(5f, 180f)] [SerializeField] private float maxAngle = 30f;

        [Tooltip("Abklingzeit nach dem Angriff in Sekunden.")]
        [Min(0f)] [SerializeField] private float cooldown = 1.5f;

        [Tooltip("Gewicht der Zufallsauswahl.")]
        [Min(0f)] [SerializeField] private float weight = 1f;

        /// <summary>The attack asset.</summary>
        public AttackDefinition Attack => attack;

        /// <summary>Creates the plain data for the brain; null if the attack asset is missing.</summary>
        public EnemyAttackOption CreateOption()
        {
            if (attack == null)
            {
                return null;
            }

            return new EnemyAttackOption
            {
                Attack = attack.CreateSpec(),
                MinRange = minRange,
                MaxRange = Mathf.Max(minRange, maxRange),
                MaxAngle = maxAngle,
                Cooldown = cooldown,
                Weight = weight
            };
        }
    }
}
