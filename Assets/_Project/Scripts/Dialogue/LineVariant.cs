using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// A variant of an NPC line (GDD 02, 12.2 and 12.5): if its condition holds, its text replaces the default text. The first
    /// matching variant wins; greetings have variants by mood and relationship, other lines at most three.
    /// </summary>
    [Serializable]
    public sealed class LineVariant
    {
        [Tooltip("Bedingung (UND/ODER/NICHT über „Logik/…“). Leer = gilt immer.")]
        [SerializeReference] private Condition condition;

        [Tooltip("Text der Variante (Deutsch), höchstens 180 Zeichen.")]
        [TextArea(2, 4)] [SerializeField] private string text = string.Empty;

        /// <summary>Creates an empty variant (inspector).</summary>
        public LineVariant()
        {
        }

        /// <summary>Creates a variant.</summary>
        /// <param name="condition">Condition (null = always).</param>
        /// <param name="text">Text.</param>
        public LineVariant(Condition condition, string text)
        {
            this.condition = condition;
            this.text = text ?? string.Empty;
        }

        /// <summary>Condition; null means always.</summary>
        public Condition Condition => condition;

        /// <summary>German text.</summary>
        public string Text => text ?? string.Empty;
    }
}
