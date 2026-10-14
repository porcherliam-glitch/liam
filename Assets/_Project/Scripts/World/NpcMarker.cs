using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Placeholder of an NPC in a blockout scene (e.g. Eichental): holds the NPC id from GDD 01 4.1.3 / GDD 02 11.0, the location
    /// and the phase in which the NPC stands here. The NPC step replaces markers by real NPCs; until then they only show where
    /// someone will stand (orange capsule with a name).
    /// </summary>
    /// <remarks>GameObject: one per marker, created by the menu "Aetherfall > Eichental erstellen" from the layout file.</remarks>
    [DisallowMultipleComponent]
    public sealed class NpcMarker : MonoBehaviour
    {
        [Tooltip("NPC-ID, z. B. npc.eichental.dorfvorsteherin_hedda (GDD 01, 4.1.3).")]
        [SerializeField] private string npcId = "npc.region.name";

        [Tooltip("Anzeigename (Platzhalter-Schild).")]
        [SerializeField] private string displayName = string.Empty;

        [Tooltip("Orts-ID, an der der NPC steht, z. B. loc.eichental.dorfplatz.")]
        [SerializeField] private string locationId = string.Empty;

        [Tooltip("Wann der NPC hier steht: immer, im Prolog oder nach dem Prolog.")]
        [SerializeField] private NpcMarkerPhase phase = NpcMarkerPhase.Always;

        /// <summary>NPC id.</summary>
        public string NpcId => npcId ?? string.Empty;

        /// <summary>Display name.</summary>
        public string DisplayName => displayName ?? string.Empty;

        /// <summary>Location id.</summary>
        public string LocationId => locationId ?? string.Empty;

        /// <summary>Phase in which the NPC stands here.</summary>
        public NpcMarkerPhase Phase => phase;

        private void OnDrawGizmos()
        {
            Gizmos.color = phase == NpcMarkerPhase.Always ? new Color(0.95f, 0.64f, 0.23f) : new Color(0.95f, 0.85f, 0.3f);
            Vector3 position = transform.position;
            Gizmos.DrawWireSphere(position + Vector3.up * 0.9f, 0.45f);
            Gizmos.DrawLine(position, position + transform.forward * 0.8f);
        }
    }
}
