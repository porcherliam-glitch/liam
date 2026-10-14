using System;
using Aetherfall.Combat;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>One entry of <see cref="PlayerCombatController"/>: the moveset of a weapon type (GDD 03 5.3).</summary>
    [Serializable]
    public sealed class WeaponMoveset
    {
        [Tooltip("Waffentyp der Haupthand, z. B. Zauberstab.")]
        [SerializeField] private WeaponType type = WeaponType.Staff;

        [Tooltip("Bewegungsset dieses Typs (Angriffe, Kombo, Blockwerte ohne Schild).")]
        [SerializeField] private WeaponDefinition weapon = null;

        /// <summary>Creates an empty entry (inspector).</summary>
        public WeaponMoveset()
        {
        }

        /// <summary>Creates an entry (generators, tests).</summary>
        /// <param name="type">Weapon type.</param>
        /// <param name="weapon">Moveset.</param>
        public WeaponMoveset(WeaponType type, WeaponDefinition weapon)
        {
            this.type = type;
            this.weapon = weapon;
        }

        /// <summary>Weapon type.</summary>
        public WeaponType Type => type;

        /// <summary>Moveset.</summary>
        public WeaponDefinition Weapon => weapon;
    }
}
