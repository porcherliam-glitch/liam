using System;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>Resistance of an enemy type against one damage type (GDD 03 8.2 step 7: −1.0 to +0.9, or immune).</summary>
    [Serializable]
    public sealed class ResistanceEntry
    {
        [Tooltip("Schadensart.")]
        [SerializeField] private DamageType damageType = DamageType.Fire;

        [Tooltip("Resistenz: 0,5 = halber Schaden, −0,5 = Schwäche (150 %).")]
        [Range(-1f, 0.9f)] [SerializeField] private float value = 0f;

        [Tooltip("Immun: kein Schaden dieser Art.")]
        [SerializeField] private bool immune = false;

        /// <summary>Damage type.</summary>
        public DamageType DamageType => damageType;

        /// <summary>Resistance value.</summary>
        public float Value => value;

        /// <summary>True if immune.</summary>
        public bool Immune => immune;
    }
}
