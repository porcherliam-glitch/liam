using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Hit zone on a body part (§9.8 "Hurtboxen fuer unterschiedliche Koerperteile", architecture 11.4): a trigger collider on
    /// the layer "Hurtbox" (architecture 2.8: collides with nothing, only queried by hitboxes) with a zone (head ×1.5, body
    /// ×1.0, weak point ×2.0, GDD 03 8.2) pointing to the <see cref="Combatant"/> of the root.
    /// </summary>
    /// <remarks>GameObject: a child of the fighter with a Collider (Box/Sphere/Capsule, "Is Trigger" on).</remarks>
    [RequireComponent(typeof(Collider))]
    [DisallowMultipleComponent]
    public sealed class Hurtbox : MonoBehaviour
    {
        [Tooltip("Die Figur, zu der diese Trefferzone gehört. Leer = nächste Combatant-Komponente in den Eltern-Objekten.")]
        [SerializeField] private Combatant owner = null;

        [Tooltip("Zone: Körper ×1,0 · Glied ×0,9 · Kopf ×1,5 (Fernkampf ×1,75) · Schwachpunkt ×2,0 (GDD 03, 8.2).")]
        [SerializeField] private HitZone zone = HitZone.Body;

        /// <summary>The combatant this zone belongs to.</summary>
        public Combatant Owner => owner;

        /// <summary>The zone.</summary>
        public HitZone Zone => zone;

        /// <summary>
        /// Decides which zone counts when one swing touches several zones of the same target: the zone whose centre is
        /// nearest to the centre of the swing; within <paramref name="tolerance"/> the higher <see cref="PriorityOf"/> wins.
        /// Without animations the placeholder hitboxes are large, so "highest priority" alone would make almost every hit a
        /// head or weak point hit.
        /// </summary>
        /// <param name="distance">Distance of the new zone's centre to the swing centre.</param>
        /// <param name="zone">The new zone.</param>
        /// <param name="currentDistance">Distance of the zone chosen so far.</param>
        /// <param name="currentZone">The zone chosen so far.</param>
        /// <param name="tolerance">Distances closer than this count as equal (metres).</param>
        /// <returns>True if the new zone should replace the current one.</returns>
        public static bool IsBetterZone(float distance, HitZone zone, float currentDistance, HitZone currentZone, float tolerance = 0.05f)
        {
            if (distance < currentDistance - tolerance)
            {
                return true;
            }

            return distance <= currentDistance + tolerance && PriorityOf(zone) > PriorityOf(currentZone);
        }

        /// <summary>Priority between zones at about the same distance: weak point &gt; head &gt; body &gt; limb.</summary>
        /// <param name="value">Zone.</param>
        public static int PriorityOf(HitZone value)
        {
            switch (value)
            {
                case HitZone.WeakPoint: return 3;
                case HitZone.Head: return 2;
                case HitZone.Body: return 1;
                default: return 0;
            }
        }

        private void Awake()
        {
            if (owner == null)
            {
                owner = GetComponentInParent<Combatant>();
            }

            if (owner == null)
            {
                Log.Warning(LogCategory.Combat, "Hurtbox '" + name + "' finds no Combatant in its parents; it cannot be hit.");
            }
        }
    }
}
