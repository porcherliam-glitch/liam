namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Id and key conventions of dialogues (GDD 02, 12.2, 12.8 and 13.4), pure string helpers:
    /// <list type="bullet">
    /// <item>dialogue ids <c>dlg.&lt;region&gt;.&lt;npc&gt;_&lt;topic&gt;</c>, node ids <c>n010</c>, <c>n020</c> …</item>
    /// <item>line key <c>&lt;dialogue&gt;.&lt;node&gt;</c>, variant key <c>….v2</c>, option key <c>….&lt;option&gt;</c></item>
    /// <item>voice clip <c>VO_&lt;npc&gt;_&lt;dialogue&gt;.&lt;node&gt;</c> (generated, never typed)</item>
    /// <item>memory keys of the save section <c>dialogue</c>: option <c>&lt;dialogue&gt;.&lt;node&gt;.&lt;option&gt;</c>, check
    /// <c>&lt;dialogue&gt;.&lt;node&gt;</c></item>
    /// </list>
    /// </summary>
    public static class DialogueIds
    {
        /// <summary>Prefix of dialogue ids.</summary>
        public const string DialoguePrefix = "dlg.";

        /// <summary>Prefix of NPC ids (speakers).</summary>
        public const string NpcPrefix = "npc.";

        /// <summary>Prefix of conversation topics (GDD 02, 12.9).</summary>
        public const string TopicPrefix = "thema.";

        /// <summary>Prefix of voice clip ids (GDD 05, 2.6).</summary>
        public const string VoicePrefix = "VO_";

        /// <summary>Key of a node: <c>&lt;dialogue&gt;.&lt;node&gt;</c> (line text, check memory).</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id.</param>
        public static string NodeKey(string dialogueId, string nodeId)
        {
            return (dialogueId ?? string.Empty) + "." + (nodeId ?? string.Empty);
        }

        /// <summary>Key of an option: <c>&lt;dialogue&gt;.&lt;node&gt;.&lt;option&gt;</c> (option text, chosen options).</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id of the choice.</param>
        /// <param name="optionId">Option id, e.g. <c>a</c>.</param>
        public static string OptionKey(string dialogueId, string nodeId, string optionId)
        {
            return NodeKey(dialogueId, nodeId) + "." + (optionId ?? string.Empty);
        }

        /// <summary>Key of a line variant: <c>&lt;dialogue&gt;.&lt;node&gt;.v&lt;n&gt;</c> (n starts at 1).</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id.</param>
        /// <param name="variantNumber">Variant number, 1 for the first variant.</param>
        public static string VariantKey(string dialogueId, string nodeId, int variantNumber)
        {
            return NodeKey(dialogueId, nodeId) + ".v" + variantNumber;
        }

        /// <summary>Voice clip id <c>VO_&lt;speaker&gt;_&lt;dialogue&gt;.&lt;node&gt;</c> (GDD 02, 12.8).</summary>
        /// <param name="speakerId">Speaker (NPC id).</param>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id.</param>
        public static string VoiceClipId(string speakerId, string dialogueId, string nodeId)
        {
            return VoiceClipId(speakerId, NodeKey(dialogueId, nodeId));
        }

        /// <summary>
        /// Voice clip id of a line or a line variant: <c>VO_&lt;speaker&gt;_&lt;line key&gt;</c>, e.g.
        /// <c>VO_npc.eichental.bauer_hollmann_dlg.eichental.hollmann_begruessung.n010.v2</c> (every variant is its own recording).
        /// </summary>
        /// <param name="speakerId">Speaker (NPC id).</param>
        /// <param name="lineKey">Text key of the line (<see cref="NodeKey"/> or <see cref="VariantKey"/>).</param>
        public static string VoiceClipId(string speakerId, string lineKey)
        {
            return VoicePrefix + (speakerId ?? string.Empty) + "_" + (lineKey ?? string.Empty);
        }

        /// <summary>Default choice id of the <c>ChoiceMade</c> event of an option: the node key.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id of the choice.</param>
        public static string ChoiceId(string dialogueId, string nodeId)
        {
            return NodeKey(dialogueId, nodeId);
        }

        /// <summary>True if the node id follows <c>n</c> plus three digits (<c>n010</c>), the recommended form.</summary>
        /// <param name="nodeId">Node id.</param>
        public static bool IsConventionalNodeId(string nodeId)
        {
            if (string.IsNullOrEmpty(nodeId) || nodeId.Length < 4 || nodeId[0] != 'n')
            {
                return false;
            }

            for (int i = 1; i < nodeId.Length; i++)
            {
                char c = nodeId[i];
                bool digit = c >= '0' && c <= '9';
                if (i <= 3 && !digit)
                {
                    return false;
                }

                if (i > 3 && !(digit || c == '_' || (c >= 'a' && c <= 'z')))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>True if the option id is one lower-case letter or a short snake_case word (<c>a</c>, <c>b</c>, <c>zurueck</c>).</summary>
        /// <param name="optionId">Option id.</param>
        public static bool IsValidOptionId(string optionId)
        {
            if (string.IsNullOrEmpty(optionId) || optionId.Length > 24)
            {
                return false;
            }

            for (int i = 0; i < optionId.Length; i++)
            {
                char c = optionId[i];
                if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_'))
                {
                    return false;
                }
            }

            return optionId[0] >= 'a' && optionId[0] <= 'z';
        }
    }
}
