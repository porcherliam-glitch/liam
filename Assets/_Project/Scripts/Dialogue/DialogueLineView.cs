using System.Collections.Generic;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Subtitle data of the current NPC line (GDD 02, 12.7; GDD 05 4.2): speaker name (role while the name is unknown), text
    /// (variant already chosen), pages of 2 × 45 characters, display duration by characters, emotion, camera hint, text key
    /// and voice clip id.
    /// </summary>
    public sealed class DialogueLineView
    {
        private static readonly IReadOnlyList<string> NoPages = new string[0];

        /// <summary>Creates a line view.</summary>
        /// <param name="nodeId">Node id.</param>
        /// <param name="speakerId">Speaker id.</param>
        /// <param name="speakerName">Shown speaker name.</param>
        /// <param name="text">Text.</param>
        /// <param name="textKey">Localization key.</param>
        /// <param name="voiceClipId">Voice clip id.</param>
        /// <param name="emotion">Emotion.</param>
        /// <param name="camera">Camera hint.</param>
        /// <param name="pages">Subtitle pages.</param>
        /// <param name="displaySeconds">Display duration at reading factor 1.</param>
        /// <param name="endsConversation">True if continuing ends the conversation.</param>
        public DialogueLineView(string nodeId, string speakerId, string speakerName, string text, string textKey, string voiceClipId,
            DialogueEmotion emotion, DialogueCameraHint camera, IReadOnlyList<string> pages, float displaySeconds, bool endsConversation)
        {
            NodeId = nodeId ?? string.Empty;
            SpeakerId = speakerId ?? string.Empty;
            SpeakerName = speakerName ?? string.Empty;
            Text = text ?? string.Empty;
            TextKey = textKey ?? string.Empty;
            VoiceClipId = voiceClipId ?? string.Empty;
            Emotion = emotion;
            Camera = camera;
            Pages = pages ?? NoPages;
            DisplaySeconds = displaySeconds;
            EndsConversation = endsConversation;
        }

        /// <summary>Node id.</summary>
        public string NodeId { get; }

        /// <summary>Speaker id (NPC id).</summary>
        public string SpeakerId { get; }

        /// <summary>Shown speaker name ("Harrik" or "Banditenanfuehrer").</summary>
        public string SpeakerName { get; }

        /// <summary>Full text of the line.</summary>
        public string Text { get; }

        /// <summary>Localization key <c>&lt;dialogue&gt;.&lt;node&gt;</c> (or of the variant).</summary>
        public string TextKey { get; }

        /// <summary>Voice clip id <c>VO_&lt;npc&gt;_&lt;dialogue&gt;.&lt;node&gt;</c>.</summary>
        public string VoiceClipId { get; }

        /// <summary>Emotion tag.</summary>
        public DialogueEmotion Emotion { get; }

        /// <summary>Camera hint.</summary>
        public DialogueCameraHint Camera { get; }

        /// <summary>Subtitle pages (2 lines × 45 characters each).</summary>
        public IReadOnlyList<string> Pages { get; }

        /// <summary>Display duration in seconds at reading factor 1 (auto continue).</summary>
        public float DisplaySeconds { get; }

        /// <summary>True if continuing after this line ends the conversation.</summary>
        public bool EndsConversation { get; }
    }
}
