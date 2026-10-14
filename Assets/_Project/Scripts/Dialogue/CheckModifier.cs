using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// A situation bonus or malus of a skill check (GDD 02, 12.3), e.g. "+4 Klinge an der Kehle", "+2 wenn Wenna gerettet",
    /// "-5 Harrik hat die Luege bemerkt". All situation values of a check together are limited to -6 .. +6.
    /// </summary>
    [Serializable]
    public sealed class CheckModifier
    {
        [Tooltip("Bedingung. Leer = gilt immer.")]
        [SerializeReference] private Condition condition;

        [Tooltip("Bonus (positiv) oder Malus (negativ) auf den Probewert.")]
        [SerializeField] private int bonus = 2;

        [Tooltip("Kurzer Grund für Prüfwerkzeuge und spätere Anzeige, z. B. „Klinge an der Kehle“.")]
        [SerializeField] private string label = string.Empty;

        /// <summary>Creates an empty modifier (inspector).</summary>
        public CheckModifier()
        {
        }

        /// <summary>Creates a modifier.</summary>
        /// <param name="condition">Condition (null = always).</param>
        /// <param name="bonus">Bonus or malus.</param>
        /// <param name="label">Short reason.</param>
        public CheckModifier(Condition condition, int bonus, string label = "")
        {
            this.condition = condition;
            this.bonus = bonus;
            this.label = label ?? string.Empty;
        }

        /// <summary>Condition (null = always).</summary>
        public Condition Condition => condition;

        /// <summary>Bonus (positive) or malus (negative).</summary>
        public int Bonus => bonus;

        /// <summary>Short reason.</summary>
        public string Label => label ?? string.Empty;
    }
}
