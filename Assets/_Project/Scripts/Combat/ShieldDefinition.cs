using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// A shield as data (GDD 03 4.7): covered angle, damage reduction physical/elemental, stability. Lives in
    /// <c>Assets/_Project/Data/Combat/Weapons/</c>. Without a shield the weapon blocks with its own values.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Kampf/Schild", fileName = "Shield", order = 13)]
    public sealed class ShieldDefinition : ScriptableObject
    {
        [Tooltip("ID des Schilds, z. B. item.shield.holzschild.")]
        [SerializeField] private string shieldId = "item.shield.neu";

        [Tooltip("Abgedeckter Winkel in Grad (Holzschild 150°, Turmschild 170°).")]
        [Range(30f, 360f)] [SerializeField] private float blockAngle = 150f;

        [Tooltip("Schadensminderung gegen physischen Schaden (Holzschild 0,8 = 80 %).")]
        [Range(0f, 1f)] [SerializeField] private float physicalReduction = 0.8f;

        [Tooltip("Schadensminderung gegen Elementarschaden (Holzschild 0,2 = 20 %).")]
        [Range(0f, 1f)] [SerializeField] private float elementalReduction = 0.2f;

        [Tooltip("Stabilität: senkt die Ausdauerkosten geblockter Treffer (Holzschild 0,4 = 40 %).")]
        [Range(0f, 1f)] [SerializeField] private float stability = 0.4f;

        /// <summary>Id of the shield.</summary>
        public string ShieldId => shieldId;

        /// <summary>Block values of the shield.</summary>
        public BlockSpec CreateBlockSpec()
        {
            return new BlockSpec(blockAngle, physicalReduction, elementalReduction, stability);
        }
    }
}
