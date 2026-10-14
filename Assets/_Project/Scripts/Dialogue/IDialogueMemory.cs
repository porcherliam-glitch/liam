using System.Collections.Generic;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The conversation memory of the player (save section <c>dialogue</c>, architecture 9.2): chosen options (greyed one-time
    /// options, 60 % opacity for repeated ones), remembered check results, known topics (GDD 02, 12.9) and known names
    /// (GDD 02, 12.7). Implemented by <see cref="DialogueService"/>; conditions and actions reach it through their context.
    /// </summary>
    public interface IDialogueMemory
    {
        /// <summary>All known topics (sorted copy).</summary>
        IReadOnlyList<string> KnownTopics { get; }

        /// <summary>True if the topic is known.</summary>
        /// <param name="topicId">Topic id, e.g. <c>thema.grimmbart</c>.</param>
        bool IsTopicKnown(string topicId);

        /// <summary>Unlocks a topic; sends <c>TopicUnlocked</c> the first time.</summary>
        /// <param name="topicId">Topic id.</param>
        /// <returns>True if it was new.</returns>
        bool UnlockTopic(string topicId);

        /// <summary>True if the player knows the name of the speaker (from the start or by "Name bekannt").</summary>
        /// <param name="speakerId">NPC id.</param>
        bool IsNameKnown(string speakerId);

        /// <summary>Marks the name of a speaker as known (subtitles switch from the role to the name).</summary>
        /// <param name="speakerId">NPC id.</param>
        /// <returns>True if it was new.</returns>
        bool RevealName(string speakerId);

        /// <summary>True if the option was chosen before.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id of the choice.</param>
        /// <param name="optionId">Option id.</param>
        bool WasOptionChosen(string dialogueId, string nodeId, string optionId);

        /// <summary>Returns a remembered check result.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id of the check.</param>
        /// <param name="success">Stored result.</param>
        /// <returns>False if the check was never decided (or is not remembered).</returns>
        bool TryGetCheckResult(string dialogueId, string nodeId, out bool success);
    }
}
