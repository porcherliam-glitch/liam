using System;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// One arrow type of <see cref="PlayerBow"/> (GDD 03 6.2): the item it takes from the bag, the share of the bow damage that
    /// is fire, the burning build-up and whether the arrow can be gathered again (wooden arrows 50 %, special arrows never).
    /// </summary>
    [Serializable]
    public sealed class ArrowAmmo
    {
        [Tooltip("Gegenstand, den jeder Schuss aus der Tasche nimmt, z. B. item.ammo.pfeil_holz.")]
        [SerializeField] private string itemId = "item.ammo.pfeil_holz";

        [Tooltip("Name in der Anzeige, z. B. Holzpfeil.")]
        [SerializeField] private string displayName = "Holzpfeil";

        [Tooltip("Anteil Feuerschaden (Feuerpfeil 0,4 = 60 % Stich + 40 % Feuer).")]
        [Range(0f, 1f)] [SerializeField] private float fireShare = 0f;

        [Tooltip("Brennen-Aufbau je Treffer (Feuerpfeil 35).")]
        [Min(0f)] [SerializeField] private float burningBuildup = 0f;

        [Tooltip("Kann zu 50 % wieder aufgesammelt werden (Holzpfeil ja, Spezialpfeile nie).")]
        [SerializeField] private bool recoverable = true;

        /// <summary>Creates an empty entry (inspector).</summary>
        public ArrowAmmo()
        {
        }

        /// <summary>Creates an entry (generators, tests).</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="displayName">Display name.</param>
        /// <param name="fireShare">Fire share 0–1.</param>
        /// <param name="burningBuildup">Burning build-up per hit.</param>
        /// <param name="recoverable">True if it can be gathered again.</param>
        public ArrowAmmo(string itemId, string displayName, float fireShare, float burningBuildup, bool recoverable)
        {
            this.itemId = itemId;
            this.displayName = displayName;
            this.fireShare = fireShare;
            this.burningBuildup = burningBuildup;
            this.recoverable = recoverable;
        }

        /// <summary>Item id.</summary>
        public string ItemId => itemId ?? string.Empty;

        /// <summary>Display name.</summary>
        public string DisplayName => displayName ?? string.Empty;

        /// <summary>Share of the damage that is fire.</summary>
        public float FireShare => fireShare;

        /// <summary>Burning build-up per hit.</summary>
        public float BurningBuildup => burningBuildup;

        /// <summary>True if it can be gathered again (50 %).</summary>
        public bool Recoverable => recoverable;
    }
}
