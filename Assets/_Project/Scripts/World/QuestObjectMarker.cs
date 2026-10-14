using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Placeholder of a quest object in a blockout scene: clue, straw target, door, fallen beam (GDD 02 11.1, 11.2). Holds the
    /// object id, the group id the quest counts (e.g. <c>clue.eichental.verbrannte_runen</c>) and the quest. Interaction comes
    /// with the quests of the mini slice.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class QuestObjectMarker : MonoBehaviour
    {
        [Tooltip("Objekt-ID, z. B. obj.eichental.balken_tobold oder clue.eichental.weide_schaf.")]
        [SerializeField] private string objectId = "obj.region.name";

        [Tooltip("ID, die die Quest zählt (z. B. clue.eichental.verbrannte_runen für zwei Runen-Stellen). Leer = wie die Objekt-ID.")]
        [SerializeField] private string groupId = string.Empty;

        [Tooltip("Quest-ID, z. B. quest.main.asche_ueber_eichental.")]
        [SerializeField] private string questId = string.Empty;

        [Tooltip("Orts-ID.")]
        [SerializeField] private string locationId = string.Empty;

        /// <summary>Object id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Id the quest counts (falls back to the object id).</summary>
        public string GroupId => string.IsNullOrEmpty(groupId) ? ObjectId : groupId;

        /// <summary>Quest id.</summary>
        public string QuestId => questId ?? string.Empty;

        /// <summary>Location id.</summary>
        public string LocationId => locationId ?? string.Empty;

        private void OnDrawGizmos()
        {
            Gizmos.color = new Color(0.96f, 0.82f, 0.42f);
            Gizmos.DrawWireCube(transform.position + Vector3.up * 0.5f, new Vector3(0.8f, 1f, 0.8f));
        }
    }
}
