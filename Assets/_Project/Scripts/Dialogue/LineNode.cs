using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// NPC line (GDD 02, 12.2 "NPC-Zeile"): a speaker says a line; the player continues with confirm. Fields: speaker (empty =
    /// the speaker of the dialogue), text (at most 180 characters = 2 subtitle pages), variants with conditions, emotion, camera
    /// hint, actions that run when the line is shown (e.g. "Name bekannt" on the line where the NPC says his name), and the
    /// continuation (next node or end with exit id).
    /// </summary>
    /// <remarks>
    /// Text key <c>&lt;dialogue&gt;.&lt;node&gt;</c> (variants <c>.v1</c> …) and voice clip id <c>VO_&lt;npc&gt;_&lt;text key&gt;</c>
    /// are generated (<see cref="DialogueIds"/>), authors normally never type them; the optional clip field overrides the clip
    /// id. TODO (localization step): LocalizedString instead of the German text field.
    /// </remarks>
    [Serializable]
    [TypeMenu("Knoten/NPC-Zeile", 0)]
    public sealed class LineNode : FlowNode
    {
        /// <summary>Longest line in German (GDD 02, 12.7 and 13.2: 2 subtitle pages of 90 characters).</summary>
        public const int MaxLength = 180;

        [Tooltip("Sprecher (NPC-ID). Leer = Sprecher des Dialogs.")]
        [IdRef("npc.")] [SerializeField] private string speakerId = string.Empty;

        [Tooltip("Text der Zeile (Deutsch), höchstens 180 Zeichen. Längere Zeilen auf zwei Knoten verteilen.")]
        [TextArea(2, 5)] [SerializeField] private string text = string.Empty;

        [Tooltip("Varianten: die erste erfüllte Bedingung ersetzt den Text (Stimmung, Beziehung, Flags).")]
        [SerializeField] private List<LineVariant> variants = new List<LineVariant>();

        [Tooltip("Emotion (steuert später Regie, Gesicht und Nahaufnahme).")]
        [SerializeField] private DialogueEmotion emotion = DialogueEmotion.Neutral;

        [Tooltip("Kamera-Hinweis: Auto, Nah, Totale, Über-die-Schulter, Objekt, Eröffnung.")]
        [SerializeField] private DialogueCameraHint camera = DialogueCameraHint.Auto;

        [Tooltip("Aktionen, wenn die Zeile erscheint (z. B. Dialog/Name bekannt, Dialog/Thema freischalten, Welt/Flag setzen).")]
        [SerializeReference] private List<GameAction> actions = new List<GameAction>();

        [Tooltip("Sprachausgabe-Clip-ID (optional). Leer = automatisch VO_<Sprecher>_<Dialog>.<Knoten>, Varianten mit .v1 … " +
                 "(GDD 02, 12.8). Nur ausfüllen, wenn mehrere Zeilen denselben Clip nutzen sollen.")]
        [SerializeField] private string voiceClipId = string.Empty;

        /// <summary>Creates an empty line (inspector).</summary>
        public LineNode()
        {
        }

        /// <summary>Creates a line.</summary>
        /// <param name="id">Node id.</param>
        /// <param name="text">German text.</param>
        /// <param name="speakerId">Speaker; empty = speaker of the dialogue.</param>
        public LineNode(string id, string text, string speakerId = "") : base(id)
        {
            this.text = text ?? string.Empty;
            this.speakerId = speakerId ?? string.Empty;
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.Line;

        /// <summary>Speaker id; empty = speaker of the dialogue.</summary>
        public string SpeakerId => speakerId ?? string.Empty;

        /// <summary>Default German text.</summary>
        public string Text => text ?? string.Empty;

        /// <summary>Variants in priority order.</summary>
        public IReadOnlyList<LineVariant> Variants => variants;

        /// <summary>Emotion tag.</summary>
        public DialogueEmotion Emotion => emotion;

        /// <summary>Camera hint.</summary>
        public DialogueCameraHint Camera => camera;

        /// <summary>Actions that run when the line is shown.</summary>
        public IReadOnlyList<GameAction> Actions => actions;

        /// <summary>Voice clip id set by the author; empty = generated (<see cref="DialogueIds.VoiceClipId(string, string)"/>).</summary>
        public string VoiceClipOverride => voiceClipId ?? string.Empty;

        /// <summary>Continues with a node (chainable).</summary>
        /// <param name="nodeId">Next node.</param>
        public LineNode To(string nodeId)
        {
            SetNext(nodeId);
            return this;
        }

        /// <summary>Ends the conversation after this line (chainable).</summary>
        /// <param name="exit">Exit id.</param>
        /// <param name="followUp">Follow-up.</param>
        public LineNode EndWith(string exit, DialogueFollowUp followUp = DialogueFollowUp.Gameplay)
        {
            SetEnd(exit, followUp);
            return this;
        }

        /// <summary>Adds actions that run when the line is shown (chainable).</summary>
        /// <param name="lineActions">Actions.</param>
        public LineNode Do(params GameAction[] lineActions)
        {
            if (lineActions != null)
            {
                actions.AddRange(lineActions);
            }

            return this;
        }

        /// <summary>Adds a variant (chainable).</summary>
        /// <param name="condition">Condition.</param>
        /// <param name="variantText">Text.</param>
        public LineNode Variant(Condition condition, string variantText)
        {
            variants.Add(new LineVariant(condition, variantText));
            return this;
        }

        /// <summary>Uses a fixed voice clip instead of the generated id (chainable).</summary>
        /// <param name="clipId">Clip id, e.g. <c>VO_npc.eichental.wirt_ulf_gruss_kurz</c>.</param>
        public LineNode Voice(string clipId)
        {
            voiceClipId = clipId ?? string.Empty;
            return this;
        }

        /// <summary>Sets emotion and camera hint (chainable).</summary>
        /// <param name="lineEmotion">Emotion.</param>
        /// <param name="cameraHint">Camera hint.</param>
        public LineNode Staging(DialogueEmotion lineEmotion, DialogueCameraHint cameraHint)
        {
            emotion = lineEmotion;
            camera = cameraHint;
            return this;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(text) || text.Trim().Length == 0)
            {
                report.Error(DialogueValidator.MissingTextCode, "Die Zeile hat keinen Text.");
            }
            else if (text.Length > MaxLength)
            {
                report.Warning(DialogueValidator.TextLengthCode, "Zeile hat " + text.Length + " Zeichen (höchstens " + MaxLength + "): auf zwei Knoten verteilen.");
            }

            if (!string.IsNullOrEmpty(speakerId))
            {
                report.Mentions(speakerId, DialogueIds.NpcPrefix);
            }

            for (int i = 0; i < variants.Count; i++)
            {
                using (report.Scope("Variante " + (i + 1)))
                {
                    LineVariant variant = variants[i];
                    if (variant == null)
                    {
                        report.Error(ValidationReportExtensions.MissingTypeCode, "Leere Variante.");
                        continue;
                    }

                    if (variant.Text.Trim().Length == 0)
                    {
                        report.Error(DialogueValidator.MissingTextCode, "Die Variante hat keinen Text.");
                    }
                    else if (variant.Text.Length > MaxLength)
                    {
                        report.Warning(DialogueValidator.TextLengthCode, "Variante hat " + variant.Text.Length + " Zeichen (höchstens " + MaxLength + ").");
                    }

                    report.ValidateOptional(variant.Condition, "Bedingung");
                }
            }

            report.ValidateActions(actions, "Aktionen");
        }

        /// <inheritdoc />
        public override string Describe()
        {
            string shortText = Text.Length > 40 ? Text.Substring(0, 40) + "…" : Text;
            return Id + " Zeile: „" + shortText + "“ " + DescribeContinuation();
        }
    }
}
