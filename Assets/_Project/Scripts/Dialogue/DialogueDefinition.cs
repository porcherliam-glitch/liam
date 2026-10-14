using System.Collections.Generic;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// A dialogue as data (§17, GDD 02 12.2, architecture 11.8): id, mode (full or short), default speaker, start node and the
    /// nodes as <c>[SerializeReference]</c> list (NPC line, player choice, condition switch, action, skill check, random, jump,
    /// end). Lives in <c>Assets/_Project/Data/Dialogues/</c> and must be in the content catalog.
    /// </summary>
    /// <remarks>
    /// <para>Read-only at run time: the runner works with the spec from <see cref="CreateSpec"/>. Check assets with the menu
    /// "Aetherfall > Dialoge pruefen" (<see cref="DialogueValidator"/>).</para>
    /// <para>Adding nodes in the inspector: right-click the asset header (or the three dots) > "Knoten hinzufuegen/…". The type
    /// picker of the node list follows with the integration step (architecture 7.4).</para>
    /// <para>TODO (localization step): texts as LocalizedString (DE/EN) with the keys of <see cref="DialogueIds"/>.</para>
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Dialoge/Dialog", fileName = "Dialog", order = 60)]
    public sealed class DialogueDefinition : GameDefinition
    {
        [Header("Allgemein")]
        [Tooltip("Arbeitstitel für Listen, z. B. „Verhandlung mit Harrik“.")]
        [SerializeField] private string title = string.Empty;

        [Tooltip("Gesprächsmodus: Voll (Dialogkamera, Uhr steht) oder Kurz (Händler, Wachen; Uhr läuft).")]
        [SerializeField] private DialogueMode mode = DialogueMode.Full;

        [Tooltip("Sprecher der NPC-Zeilen (NPC-ID), wenn eine Zeile keinen eigenen Sprecher hat.")]
        [IdRef("npc.")] [SerializeField] private string speakerId = string.Empty;

        [Tooltip("Start-Knoten. Leer = erster Knoten der Liste.")]
        [SerializeField] private string startNodeId = string.Empty;

        [Tooltip("Abbrechen mit B / Esc erlaubt, wo es keine „[Ende]“-Option gibt (Kurz-Dialoge). Quest-Dialoge: aus.")]
        [SerializeField] private bool cancelable;

        [Header("Quest")]
        [Tooltip("Quest, zu der der Dialog gehört (nur Information für Editor und Prüfung).")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Ausgänge, die die Quest weiterbringen. Optionen, die direkt dorthin führen, bekommen die Raute ◆.")]
        [SerializeField] private List<string> questExitIds = new List<string>();

        [Header("Knoten")]
        [Tooltip("Knoten n010, n020 … (NPC-Zeile, Spieler-Auswahl, Bedingungsweiche, Aktion, Probe, Zufall, Sprung, Ende).")]
        [SerializeReference] private List<DialogueNode> nodes = new List<DialogueNode>();

        [Header("Produktion")]
        [Tooltip("Notizen für Autoren (Ton, Sprechmerkmale, Kontext).")]
        [TextArea(2, 6)] [SerializeField] private string notes = string.Empty;

        /// <summary>Internal title.</summary>
        public string Title => title;

        /// <summary>Conversation mode.</summary>
        public DialogueMode Mode => mode;

        /// <summary>Nodes.</summary>
        public IReadOnlyList<DialogueNode> Nodes => nodes;

        /// <summary>Creates the read-only spec used by the runner and the validator.</summary>
        public DialogueSpec CreateSpec()
        {
            return new DialogueSpec(Id, title, mode, speakerId, startNodeId, cancelable, questId, questExitIds, nodes);
        }

        [ContextMenu("Knoten hinzufügen/NPC-Zeile")]
        private void AddLine()
        {
            AddNode(new LineNode(NextNodeId(), string.Empty));
        }

        [ContextMenu("Knoten hinzufügen/Spieler-Auswahl")]
        private void AddChoice()
        {
            AddNode(new ChoiceNode(NextNodeId()));
        }

        [ContextMenu("Knoten hinzufügen/Bedingungsweiche")]
        private void AddBranch()
        {
            AddNode(new BranchNode(NextNodeId(), string.Empty));
        }

        [ContextMenu("Knoten hinzufügen/Aktion")]
        private void AddAction()
        {
            AddNode(new ActionNode(NextNodeId()));
        }

        [ContextMenu("Knoten hinzufügen/Probe")]
        private void AddCheck()
        {
            AddNode(new CheckNode(NextNodeId(), SkillCheckType.Persuade, CheckDifficulty.EasyPlus, string.Empty));
        }

        [ContextMenu("Knoten hinzufügen/Zufall")]
        private void AddRandom()
        {
            AddNode(new RandomNode(NextNodeId()));
        }

        [ContextMenu("Knoten hinzufügen/Sprung")]
        private void AddJump()
        {
            AddNode(new JumpNode(NextNodeId(), string.Empty, string.Empty));
        }

        [ContextMenu("Knoten hinzufügen/Ende")]
        private void AddEnd()
        {
            AddNode(new EndNode(NextNodeId(), string.Empty));
        }

        private void AddNode(DialogueNode node)
        {
#if UNITY_EDITOR
            UnityEditor.Undo.RecordObject(this, "Knoten hinzufügen");
#endif
            nodes.Add(node);
#if UNITY_EDITOR
            UnityEditor.EditorUtility.SetDirty(this);
#endif
        }

        private string NextNodeId()
        {
            // Highest "nNNN" id plus 10, so new nodes follow the 10-step convention of GDD 02, 12.2.
            int highest = 0;
            for (int i = 0; i < nodes.Count; i++)
            {
                string id = nodes[i] != null ? nodes[i].Id : string.Empty;
                if (id.Length >= 4 && id[0] == 'n' && int.TryParse(id.Substring(1, 3), out int number) && number > highest)
                {
                    highest = number;
                }
            }

            return "n" + (highest + 10).ToString("000", System.Globalization.CultureInfo.InvariantCulture);
        }
    }
}
