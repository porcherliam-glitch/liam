using System;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>One option of a decision objective (GDD 02, 5.1 type 23 "Waehle"): id <c>a</c>, <c>b</c> … and a German label.</summary>
    [Serializable]
    public sealed class ChoiceOption
    {
        [Tooltip("Options-ID: a, b, c …")]
        [SerializeField] private string id = "a";

        [Tooltip("Kurztext für das Questlog, z. B. „Harrik verschonen“.")]
        [SerializeField] private string label = string.Empty;

        /// <summary>Creates an empty option.</summary>
        public ChoiceOption()
        {
        }

        /// <summary>Creates an option.</summary>
        /// <param name="id">Option id.</param>
        /// <param name="label">German label.</param>
        public ChoiceOption(string id, string label)
        {
            this.id = id ?? string.Empty;
            this.label = label ?? string.Empty;
        }

        /// <summary>Option id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>German label.</summary>
        public string Label => label ?? string.Empty;
    }
}
