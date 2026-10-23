using System.Collections.Generic;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// The dialogue camera's decisions (S58, GDD 02 12.6): which setup a running full conversation shows now. The camera rig in
    /// the boot scene turns it into Cinemachine cameras. Registered by the Cinematics installer.
    /// </summary>
    public interface IDialogueCameraDirector
    {
        /// <summary>The setup now (inactive outside full conversations).</summary>
        DialogueShot Current { get; }

        /// <summary>
        /// The camera changes of the running conversation, oldest first (tests, tours; at most 32). Entry 0 is the opening two-shot
        /// (the blend into the conversation), every later entry is a cut.
        /// </summary>
        IReadOnlyList<DialogueCutRecord> Cuts { get; }

        /// <summary>What a choice shows (rig setting).</summary>
        ChoiceFraming ChoiceFraming { get; set; }
    }

    /// <summary>The setup of the dialogue camera at one moment.</summary>
    public readonly struct DialogueShot
    {
        /// <summary>No dialogue camera.</summary>
        public static readonly DialogueShot Inactive = new DialogueShot(false, DialogueSetup.Wide, string.Empty, string.Empty, 0, 0);

        /// <summary>Creates a shot.</summary>
        /// <param name="active">True while the dialogue camera is on.</param>
        /// <param name="setup">Setup.</param>
        /// <param name="partnerId">NPC id of the partner.</param>
        /// <param name="speakerId">Speaker of the line.</param>
        /// <param name="cutRevision">Counts up with every cut (the rig moves its camera then).</param>
        /// <param name="conversation">Counts up with every conversation (the rig picks the side then).</param>
        public DialogueShot(bool active, DialogueSetup setup, string partnerId, string speakerId, int cutRevision, int conversation)
        {
            Active = active;
            Setup = setup;
            PartnerId = partnerId ?? string.Empty;
            SpeakerId = speakerId ?? string.Empty;
            CutRevision = cutRevision;
            Conversation = conversation;
        }

        /// <summary>True while the dialogue camera is on.</summary>
        public bool Active { get; }

        /// <summary>Setup.</summary>
        public DialogueSetup Setup { get; }

        /// <summary>NPC id of the partner.</summary>
        public string PartnerId { get; }

        /// <summary>Speaker of the line.</summary>
        public string SpeakerId { get; }

        /// <summary>Counts up with every cut.</summary>
        public int CutRevision { get; }

        /// <summary>Counts up with every conversation.</summary>
        public int Conversation { get; }
    }

    /// <summary>One cut of the dialogue camera (tests, tours).</summary>
    public readonly struct DialogueCutRecord
    {
        /// <summary>Creates a record.</summary>
        /// <param name="time">Seconds since the conversation began.</param>
        /// <param name="setup">New setup.</param>
        /// <param name="beat">Line counter at the cut.</param>
        public DialogueCutRecord(double time, DialogueSetup setup, int beat)
        {
            Time = time;
            Setup = setup;
            Beat = beat;
        }

        /// <summary>Seconds since the conversation began.</summary>
        public double Time { get; }

        /// <summary>New setup.</summary>
        public DialogueSetup Setup { get; }

        /// <summary>Line counter at the cut.</summary>
        public int Beat { get; }

        /// <inheritdoc />
        public override string ToString()
        {
            return Setup + " @" + Time.ToString("0.00") + " s (Zeile " + Beat + ")";
        }
    }
}
