using System.Collections.Generic;
using Aetherfall.WorldState;

namespace Aetherfall.Quests
{
    /// <summary>
    /// What the <see cref="QuestValidator"/> knows about content outside the validated quests: all definition ids (NPCs,
    /// items, enemy types, dialogues, quests …) and the flag definitions. The editor menu fills it from the project assets;
    /// tests pass small sets. Without content ids the checks of foreign ids are skipped (only intra-quest references).
    /// </summary>
    public interface IQuestValidationLookup
    {
        /// <summary>True if <see cref="ContentIds"/> is complete enough to report unknown ids.</summary>
        bool HasContentIds { get; }

        /// <summary>True if flag definitions are known (unknown flag ids are reported).</summary>
        bool HasFlagDefinitions { get; }

        /// <summary>All known definition ids (for "does not exist" and spelling suggestions).</summary>
        IReadOnlyCollection<string> ContentIds { get; }

        /// <summary>True if a definition with the id exists.</summary>
        /// <param name="id">Id.</param>
        bool ContentExists(string id);

        /// <summary>Finds a flag definition.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="spec">Spec or null.</param>
        bool TryGetFlag(string flagId, out FlagSpec spec);
    }
}
