using System;
using UnityEngine;

namespace Aetherfall.Classes
{
    /// <summary>Clothes of one class on the player model: material slots of the model and the material that replaces each.</summary>
    [Serializable]
    public sealed class ClassLook
    {
        [Tooltip("Klasse, z. B. class.magier.")]
        [SerializeField] private string classId = "";

        [Tooltip("Namen der Material-Plätze des Modells (z. B. Krieger_Wams).")]
        [SerializeField] private string[] slots = new string[0];

        [Tooltip("Ersatz je Platz (gleiche Reihenfolge).")]
        [SerializeField] private Material[] materials = new Material[0];

        /// <summary>Class id.</summary>
        public string ClassId => classId ?? string.Empty;

        /// <summary>The material for a slot, or null if the class keeps it.</summary>
        /// <param name="slot">Material name of the model.</param>
        public Material Replacement(string slot)
        {
            for (int i = 0; i < slots.Length && i < materials.Length; i++)
            {
                if (slots[i] == slot)
                {
                    return materials[i];
                }
            }

            return null;
        }
    }
}
