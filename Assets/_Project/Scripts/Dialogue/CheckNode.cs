using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Skill check (GDD 02, 12.2 "Probe" and 12.3): kind (persuade, intimidate, lie), difficulty tier, situation modifiers,
    /// optional level advantage (+2 per 3 levels above the NPC, at most +6), "remember the result", a success and an optional
    /// failure exit. Deterministic by default: value = attribute + 2 × rank + situation bonus (at most ±6), success if the value
    /// reaches the threshold (<see cref="SkillCheckRules"/>).
    /// </summary>
    /// <remarks>
    /// With deterministic checks an option that leads straight to a check is greyed while the value is too low, so the failure
    /// exit is only needed if the check is reached without such an option (or in the dice mode). Without a failure exit a
    /// failed check returns to the last choice (logged).
    /// </remarks>
    [Serializable]
    [TypeMenu("Knoten/Probe", 4)]
    public sealed class CheckNode : DialogueNode
    {
        [Tooltip("Art der Probe: Überzeugen (Charisma), Einschüchtern (max. Charisma/Stärke), Lügen (Charisma).")]
        [SerializeField] private SkillCheckType checkType = SkillCheckType.Persuade;

        [Tooltip("Schwierigkeits-Stufe (in den Daten steht die Stufe, nicht die Zahl): Leicht 10, Leicht+ 12, Mittel 14 …")]
        [SerializeField] private CheckDifficulty difficulty = CheckDifficulty.EasyPlus;

        [Tooltip("Situationsboni und -mali mit Bedingung (zusammen höchstens ±6).")]
        [SerializeField] private List<CheckModifier> modifiers = new List<CheckModifier>();

        [Tooltip("Level-Vorsprung zählt: +2 je 3 Level über dem NPC (höchstens +6). Typisch für Einschüchtern.")]
        [SerializeField] private bool levelAdvantage;

        [Tooltip("Ergebnis merken: Die Probe wird beim nächsten Mal nicht neu ausgewertet (wird gespeichert).")]
        [SerializeField] private bool rememberResult = true;

        [Tooltip("Ziel-Knoten bei Erfolg (Pflicht).")]
        [SerializeField] private string successNodeId = string.Empty;

        [Tooltip("Ziel-Knoten bei Misserfolg (optional; im deterministischen Modus nur nötig, wenn die Probe ohne Option erreicht wird).")]
        [SerializeField] private string failureNodeId = string.Empty;

        /// <summary>Creates an empty check (inspector).</summary>
        public CheckNode()
        {
        }

        /// <summary>Creates a check.</summary>
        /// <param name="id">Node id.</param>
        /// <param name="type">Kind of check.</param>
        /// <param name="tier">Difficulty tier.</param>
        /// <param name="successNodeId">Target on success.</param>
        /// <param name="failureNodeId">Target on failure (optional).</param>
        public CheckNode(string id, SkillCheckType type, CheckDifficulty tier, string successNodeId, string failureNodeId = "") : base(id)
        {
            checkType = type;
            difficulty = tier;
            this.successNodeId = successNodeId ?? string.Empty;
            this.failureNodeId = failureNodeId ?? string.Empty;
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.Check;

        /// <summary>Kind of check.</summary>
        public SkillCheckType CheckType => checkType;

        /// <summary>Difficulty tier.</summary>
        public CheckDifficulty Difficulty => difficulty;

        /// <summary>Situation modifiers.</summary>
        public IReadOnlyList<CheckModifier> Modifiers => modifiers;

        /// <summary>True if the level advantage over the NPC counts.</summary>
        public bool LevelAdvantage => levelAdvantage;

        /// <summary>True if the result is stored and reused.</summary>
        public bool RememberResult => rememberResult;

        /// <summary>Target on success.</summary>
        public string SuccessNodeId => successNodeId ?? string.Empty;

        /// <summary>Target on failure; empty = back to the last choice.</summary>
        public string FailureNodeId => failureNodeId ?? string.Empty;

        /// <summary>Adds a situation modifier (chainable).</summary>
        /// <param name="condition">Condition (null = always).</param>
        /// <param name="bonus">Bonus or malus.</param>
        /// <param name="label">Short reason.</param>
        public CheckNode Modifier(Condition condition, int bonus, string label = "")
        {
            modifiers.Add(new CheckModifier(condition, bonus, label));
            return this;
        }

        /// <summary>Lets the level advantage over the NPC count (chainable).</summary>
        public CheckNode WithLevelAdvantage()
        {
            levelAdvantage = true;
            return this;
        }

        /// <summary>Sets whether the result is remembered (chainable).</summary>
        /// <param name="remember">True = store the result.</param>
        public CheckNode Remember(bool remember)
        {
            rememberResult = remember;
            return this;
        }

        /// <inheritdoc />
        public override void CollectTargets(List<string> targets)
        {
            AddTarget(targets, successNodeId);
            AddTarget(targets, failureNodeId);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(successNodeId))
            {
                report.Error(DialogueValidator.DeadEndCode, "Die Probe hat keinen Erfolgs-Ausgang.");
            }

            if (!Enum.IsDefined(typeof(CheckDifficulty), difficulty) || !Enum.IsDefined(typeof(SkillCheckType), checkType))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Unbekannte Proben-Art oder Schwierigkeit.");
            }

            for (int i = 0; i < modifiers.Count; i++)
            {
                using (report.Scope("Modifikator " + (i + 1)))
                {
                    CheckModifier modifier = modifiers[i];
                    if (modifier == null)
                    {
                        report.Error(ValidationReportExtensions.MissingTypeCode, "Leerer Modifikator.");
                        continue;
                    }

                    if (modifier.Bonus == 0)
                    {
                        report.Warning(ValidationReportExtensions.InvalidParameterCode, "Modifikator mit Bonus 0 wirkt nicht.");
                    }

                    report.ValidateOptional(modifier.Condition, "Bedingung");
                }
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return Id + " Probe " + SkillCheckRules.GermanName(checkType) + " " + SkillCheckRules.ThresholdOf(difficulty) + " → " +
                   (SuccessNodeId.Length > 0 ? SuccessNodeId : "?") + (FailureNodeId.Length > 0 ? " / " + FailureNodeId : string.Empty);
        }
    }
}
