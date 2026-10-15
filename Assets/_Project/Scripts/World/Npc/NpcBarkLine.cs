using System;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// One short line an NPC says in passing (GDD 01 7.4 "Bark"), optionally only in some parts of the day.
    /// </summary>
    [Serializable]
    public sealed class NpcBarkLine
    {
        [Tooltip("Text (deutsch, eine Zeile).")]
        [SerializeField] private string text = string.Empty;

        [Tooltip("Nur zu diesen Tageszeiten (leer = immer).")]
        [SerializeField] private DayPhase[] phases = Array.Empty<DayPhase>();

        /// <summary>Creates an empty line (inspector).</summary>
        public NpcBarkLine()
        {
        }

        /// <summary>Creates a line (generator).</summary>
        /// <param name="text">Text.</param>
        /// <param name="phases">Parts of the day (none = always).</param>
        public NpcBarkLine(string text, params DayPhase[] phases)
        {
            this.text = text ?? string.Empty;
            this.phases = phases ?? Array.Empty<DayPhase>();
        }

        /// <summary>Text.</summary>
        public string Text => text ?? string.Empty;

        /// <summary>True if the line fits the part of the day.</summary>
        /// <param name="phase">Current part of the day.</param>
        public bool Fits(DayPhase phase)
        {
            if (phases == null || phases.Length == 0)
            {
                return true;
            }

            for (int i = 0; i < phases.Length; i++)
            {
                if (phases[i] == phase)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
