using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Light combo of a weapon type as data (§9.2 "Leichte Angriffe als Kombo (3–5 Schlaege)", GDD 03 4.4): the attack steps
    /// in order; the last step is the combo finisher. Lives in <c>Assets/_Project/Data/Combat/Combos/</c>.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Kampf/Kombo", fileName = "Combo", order = 11)]
    public sealed class ComboDefinition : ScriptableObject
    {
        [Tooltip("ID der Kombo, z. B. combo.einhandschwert.leicht.")]
        [SerializeField] private string comboId = "combo.neu";

        [Tooltip("Schläge der Kombo in Reihenfolge (3–5). Der letzte ist der Kombo-Abschluss (Art „ComboFinisher“).")]
        [SerializeField] private List<AttackDefinition> steps = new List<AttackDefinition>();

        /// <summary>Id of the combo.</summary>
        public string ComboId => comboId;

        /// <summary>Number of steps.</summary>
        public int StepCount => steps.Count;

        /// <summary>Creates the plain data of all steps; null if a step is missing.</summary>
        public AttackSpec[] CreateSpecs()
        {
            var result = new AttackSpec[steps.Count];
            for (int i = 0; i < steps.Count; i++)
            {
                if (steps[i] == null)
                {
                    return null;
                }

                result[i] = steps[i].CreateSpec();
            }

            return result;
        }
    }
}
