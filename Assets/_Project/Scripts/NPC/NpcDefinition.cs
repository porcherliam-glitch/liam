using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// A named NPC as data (§15.1, GDD 01 7, GDD 02 11.0 "Verwendete NPCs"): id, name, role (shown until the name is known),
    /// default dialogue, level, greed and the tag "unbestechlich" (bribes, GDD 02 12.3), relationship at the start (GDD 01 7.5)
    /// and notes on the way of speaking (GDD 02 13.1). Lives in <c>Assets/_Project/Data/NPCs/</c> and must be in the content
    /// catalog.
    /// </summary>
    /// <remarks>TODO (later steps): daily schedule (architecture 11.11), protection level (GDD 02 6.6), form of address, barks.</remarks>
    [CreateAssetMenu(menuName = "Aetherfall/NPCs/NPC", fileName = "Npc", order = 70)]
    public sealed class NpcDefinition : GameDefinition
    {
        [Header("Anzeige")]
        [Tooltip("Name, z. B. Harrik.")]
        [SerializeField] private string displayName = string.Empty;

        [Tooltip("Rolle, z. B. Banditenanführer. Erscheint im Untertitel, bis der Name bekannt ist (Aktion Dialog/Name bekannt).")]
        [SerializeField] private string roleName = string.Empty;

        [Tooltip("Name von Anfang an bekannt (Dorfbewohner, die man kennt).")]
        [SerializeField] private bool nameKnownFromStart;

        [Header("Gespräch")]
        [Tooltip("Dialog beim Ansprechen (Taste E / A).")]
        [IdRef("dlg.")] [SerializeField] private string defaultDialogueId = string.Empty;

        [Tooltip("Level des NPC (Einschüchtern: +2 je 3 Level Vorsprung). 0 = unbekannt.")]
        [Min(0)] [SerializeField] private int level = 1;

        [Tooltip("Gier für Bestechungen (1 = normal, 1,5 = teuer).")]
        [Min(0.1f)] [SerializeField] private float greed = 1f;

        [Tooltip("Unbestechlich: Bestechungs-Optionen erscheinen nicht.")]
        [SerializeField] private bool unbribable;

        [Tooltip("Gruppe, z. B. group.banditen_muehlbach. Wird die Gruppe feindlich (NPC/Kampf beginnen), ist es auch dieser NPC – " +
                 "dann kann man ihn nicht mehr ansprechen.")]
        [SerializeField] private string groupId = string.Empty;

        [Header("Beziehung")]
        [Tooltip("Beziehung zum Spieler bei Spielbeginn (−100 bis +100; Neutral −9 bis +9).")]
        [Range(RelationshipRules.Min, RelationshipRules.Max)] [SerializeField] private int startRelationship;

        [Header("Produktion")]
        [Tooltip("Sprechmerkmale und Notizen für Autoren (GDD 02, 13.1), z. B. „kurze Sätze, Fuhrmanns-Bilder“.")]
        [TextArea(2, 5)] [SerializeField] private string notes = string.Empty;

        /// <summary>Name.</summary>
        public string DisplayName => displayName;

        /// <summary>Role.</summary>
        public string RoleName => roleName;

        /// <summary>Dialogue when the player talks to the NPC.</summary>
        public string DefaultDialogueId => defaultDialogueId;

        /// <summary>Creates the read-only spec.</summary>
        public NpcSpec CreateSpec()
        {
            return new NpcSpec(Id, displayName, roleName, nameKnownFromStart, defaultDialogueId, level, greed, unbribable, startRelationship, groupId);
        }
    }
}
