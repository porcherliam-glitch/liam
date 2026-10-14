using System;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>One entry of <see cref="PlayerEquipment"/>: the model shown instead of the sword for a weapon type (GDD 03 5.3).</summary>
    [Serializable]
    public sealed class WeaponTypeVisual
    {
        [Tooltip("Waffentyp der Haupthand, z. B. Zauberstab oder Streitkolben.")]
        [SerializeField] private WeaponType type = WeaponType.Staff;

        [Tooltip("Modell dieses Typs in der Waffenhand (sonst ausgeblendet).")]
        [SerializeField] private GameObject visual = null;

        /// <summary>Creates an empty entry (inspector).</summary>
        public WeaponTypeVisual()
        {
        }

        /// <summary>Creates an entry (generators, tests).</summary>
        /// <param name="type">Weapon type.</param>
        /// <param name="visual">Model of the type.</param>
        public WeaponTypeVisual(WeaponType type, GameObject visual)
        {
            this.type = type;
            this.visual = visual;
        }

        /// <summary>Weapon type.</summary>
        public WeaponType Type => type;

        /// <summary>Model of the type.</summary>
        public GameObject Visual => visual;
    }
}
