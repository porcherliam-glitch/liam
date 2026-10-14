using System;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Id rules and helpers of quests (GDD 02, 2.3): quest ids <c>quest.&lt;kategorie&gt;…</c>, local stage ids
    /// <c>s10</c>/<c>s50_kampf</c>, objective ids <c>o1</c>, ledger ids <c>ledger.c1</c>, quest-local helper flags
    /// <c>&lt;quest-id&gt;.lokal.*</c>. Pure logic.
    /// </summary>
    public static class QuestIds
    {
        /// <summary>Prefix of quest ids.</summary>
        public const string QuestPrefix = "quest.";

        /// <summary>Segment of quest-local helper flags (deleted at the end of the quest).</summary>
        public const string LocalFlagSegment = ".lokal.";

        /// <summary>True for <c>s</c> + digits, optionally <c>_</c> + lower case suffix (<c>s10</c>, <c>s50_zerstoert</c>).</summary>
        /// <param name="id">Local stage id.</param>
        public static bool IsValidStageId(string id)
        {
            return IsLetterDigitsSuffix(id, 's');
        }

        /// <summary>True for <c>o</c> + digits, optionally with suffix (<c>o1</c>, <c>o2_bonus</c>).</summary>
        /// <param name="id">Local objective id.</param>
        public static bool IsValidObjectiveId(string id)
        {
            return IsLetterDigitsSuffix(id, 'o');
        }

        /// <summary>True for <c>ledger.c</c> + digits (<c>ledger.c1</c>).</summary>
        /// <param name="id">Local ledger id.</param>
        public static bool IsValidLedgerId(string id)
        {
            const string prefix = "ledger.c";
            if (string.IsNullOrEmpty(id) || !id.StartsWith(prefix, StringComparison.Ordinal) || id.Length == prefix.Length)
            {
                return false;
            }

            for (int i = prefix.Length; i < id.Length; i++)
            {
                if (id[i] < '0' || id[i] > '9')
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>Prefix of the quest-local helper flags: <c>&lt;quest-id&gt;.lokal.</c></summary>
        /// <param name="questId">Quest id.</param>
        public static string LocalFlagPrefix(string questId)
        {
            return (questId ?? string.Empty) + LocalFlagSegment;
        }

        /// <summary>Stage-qualified objective id <c>&lt;stage&gt;.&lt;objective&gt;</c> (payload of <c>ObjectiveProgressed</c>).</summary>
        /// <param name="stageId">Local stage id.</param>
        /// <param name="objectiveId">Local objective id.</param>
        public static string StageObjectiveKey(string stageId, string objectiveId)
        {
            return (stageId ?? string.Empty) + "." + (objectiveId ?? string.Empty);
        }

        /// <summary>Global objective id <c>&lt;quest&gt;.&lt;stage&gt;.&lt;objective&gt;</c> (choice id of <c>ChoiceMade</c>).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageId">Local stage id.</param>
        /// <param name="objectiveId">Local objective id.</param>
        public static string GlobalObjectiveId(string questId, string stageId, string objectiveId)
        {
            return (questId ?? string.Empty) + "." + StageObjectiveKey(stageId, objectiveId);
        }

        private static bool IsLetterDigitsSuffix(string id, char letter)
        {
            if (string.IsNullOrEmpty(id) || id.Length < 2 || id[0] != letter)
            {
                return false;
            }

            int i = 1;
            int digits = 0;
            while (i < id.Length && id[i] >= '0' && id[i] <= '9')
            {
                i++;
                digits++;
            }

            if (digits == 0)
            {
                return false;
            }

            if (i == id.Length)
            {
                return true;
            }

            if (id[i] != '_' || i == id.Length - 1)
            {
                return false;
            }

            for (i++; i < id.Length; i++)
            {
                char c = id[i];
                bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
                if (!ok)
                {
                    return false;
                }
            }

            return true;
        }
    }
}
