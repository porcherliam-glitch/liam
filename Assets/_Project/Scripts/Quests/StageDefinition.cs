using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// One stage of a quest as data (GDD 02 4.2, §16.3, architecture 11.7): journal text, exploration hint, objectives
    /// (<c>[SerializeReference]</c>), completion mode (all / one / n of m), optional objectives with bonus actions, actions on
    /// start and on completion, branches (condition → next stage, first true wins, else default exit), stage-local fail
    /// rules, end stage type, ledger entry, save lock and map markers. Part of <see cref="QuestDefinition"/>; read-only at
    /// run time (code-built quests use <see cref="StageBuilder"/>).
    /// </summary>
    [Serializable]
    public sealed class StageDefinition
    {
        [Tooltip("Lokale Stage-ID: s10, s20 … oder mit Ausgang s50_kampf (GDD 02, 2.3). Ab „Fertig“ eingefroren.")]
        [SerializeField] private string id = "s10";

        [Tooltip("Questlog-Text: was ist passiert, was ist zu tun. 1–2 Sätze, höchstens 200 Zeichen. TODO: LocalizedString.")]
        [TextArea(2, 4)] [SerializeField] private string journalText = string.Empty;

        [Tooltip("Erkundungshinweis (ersetzt im Erkundungsmodus den Marker): Landmarke + Richtung, höchstens 140 Zeichen.")]
        [TextArea(2, 3)] [SerializeField] private string explorationHint = string.Empty;

        [Tooltip("Ziele der Stage (Typ-Menü „Ziele/…“).")]
        [SerializeReference] private List<QuestObjective> objectives = new List<QuestObjective>();

        [Tooltip("Wann die Stage erfüllt ist: alle Pflichtziele, eines oder mindestens n.")]
        [SerializeField] private StageCompletionMode completionMode = StageCompletionMode.All;

        [Tooltip("Nur bei „mindestens n“: benötigte Anzahl Pflichtziele.")]
        [Min(1)] [SerializeField] private int requiredCount = 1;

        [Tooltip("Reine Aktionsstage: hat keine Ziele und ist sofort erfüllt (z. B. nur Aktionen und Verzweigung).")]
        [SerializeField] private bool actionOnly;

        [Tooltip("Aktionen beim Betreten der Stage (in Listenreihenfolge).")]
        [SerializeReference] private List<GameAction> onStart = new List<GameAction>();

        [Tooltip("Aktionen beim Abschluss der Stage (vor der Verzweigung).")]
        [SerializeReference] private List<GameAction> onComplete = new List<GameAction>();

        [Tooltip("Verzweigungen: von oben nach unten geprüft, die erste erfüllte gewinnt.")]
        [SerializeField] private List<StageBranch> branches = new List<StageBranch>();

        [Tooltip("Standard-Ausgang, wenn keine Verzweigung zutrifft (leer bei Endstages).")]
        [SerializeField] private string defaultNextStageId = string.Empty;

        [Tooltip("Stage-lokale Fehlschlag-Bedingungen, z. B. eskortierter NPC stirbt → s90_gescheitert.")]
        [SerializeField] private List<QuestFailRule> failRules = new List<QuestFailRule>();

        [Tooltip("Endstage: keiner, Erfolg oder Misserfolg. Nach ihrem Abschluss endet die Quest.")]
        [SerializeField] private StageEndType endType = StageEndType.None;

        [Tooltip("Ledger-Eintrag (z. B. ledger.c1), der beim Abschluss der Stage geschrieben wird. Leer = keiner.")]
        [SerializeField] private string ledgerEntryId = string.Empty;

        [Tooltip("Speichersperre, solange die Stage läuft (zeitkritische Stages, GDD 05 5.2).")]
        [SerializeField] private bool saveLock;

        [Tooltip("Marker-Ziele der Stage für Kompass und Karte (zusätzlich zu den Markern der Ziele).")]
        [SerializeField] private List<string> markerIds = new List<string>();

        [Tooltip("Radius des Suchgebiets in Metern (Erkundungsmodus, 50–150 m).")]
        [Min(0f)] [SerializeField] private float searchRadius = 50f;

        /// <summary>Creates an empty stage <c>s10</c>.</summary>
        public StageDefinition()
        {
        }

        /// <summary>Creates a stage with the given id (use <see cref="StageBuilder"/> for the rest).</summary>
        /// <param name="id">Local stage id.</param>
        public StageDefinition(string id)
        {
            this.id = id ?? string.Empty;
        }

        /// <summary>Local stage id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>Journal text.</summary>
        public string JournalText => journalText ?? string.Empty;

        /// <summary>Exploration hint.</summary>
        public string ExplorationHint => explorationHint ?? string.Empty;

        /// <summary>Objectives (entries may be null: unknown type after a renamed class).</summary>
        public IReadOnlyList<QuestObjective> Objectives => objectives;

        /// <summary>Completion mode.</summary>
        public StageCompletionMode CompletionMode => completionMode;

        /// <summary>Required number of objectives for <see cref="StageCompletionMode.AtLeast"/>.</summary>
        public int RequiredCount => requiredCount;

        /// <summary>True for a pure action stage.</summary>
        public bool IsActionOnly => actionOnly;

        /// <summary>Actions on start.</summary>
        public IReadOnlyList<GameAction> OnStart => onStart;

        /// <summary>Actions on completion.</summary>
        public IReadOnlyList<GameAction> OnComplete => onComplete;

        /// <summary>Branches in check order.</summary>
        public IReadOnlyList<StageBranch> Branches => branches;

        /// <summary>Default exit or empty.</summary>
        public string DefaultNextStageId => defaultNextStageId ?? string.Empty;

        /// <summary>Stage-local fail rules.</summary>
        public IReadOnlyList<QuestFailRule> FailRules => failRules;

        /// <summary>End stage type.</summary>
        public StageEndType EndType => endType;

        /// <summary>True for success and failure end stages.</summary>
        public bool IsEndStage => endType != StageEndType.None;

        /// <summary>Ledger entry written on completion, or empty.</summary>
        public string LedgerEntryId => ledgerEntryId ?? string.Empty;

        /// <summary>True if saving is blocked while the stage runs.</summary>
        public bool SaveLock => saveLock;

        /// <summary>Stage marker targets.</summary>
        public IReadOnlyList<string> MarkerIds => markerIds;

        /// <summary>Search area radius in meters.</summary>
        public float SearchRadius => searchRadius;

        /// <summary>Index of an objective by local id, or -1.</summary>
        /// <param name="objectiveId">Local objective id.</param>
        public int IndexOfObjective(string objectiveId)
        {
            for (int i = 0; i < objectives.Count; i++)
            {
                if (objectives[i] != null && objectives[i].Id == objectiveId)
                {
                    return i;
                }
            }

            return -1;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Id + " (" + objectives.Count + " Ziel(e), " + completionMode + (IsEndStage ? ", Ende " + endType : string.Empty) + ")";
        }

        internal void SetJournal(string text, string hint)
        {
            journalText = text ?? string.Empty;
            explorationHint = hint ?? string.Empty;
        }

        internal void AddObjective(QuestObjective objective)
        {
            objectives.Add(objective);
        }

        internal void SetMode(StageCompletionMode mode, int count)
        {
            completionMode = mode;
            requiredCount = count;
        }

        internal void SetActionOnly(bool value)
        {
            actionOnly = value;
        }

        internal void AddStartActions(GameAction[] actions)
        {
            onStart.AddRange(actions);
        }

        internal void AddCompleteActions(GameAction[] actions)
        {
            onComplete.AddRange(actions);
        }

        internal void AddBranch(StageBranch branch)
        {
            branches.Add(branch);
        }

        internal void SetDefaultNext(string stageId)
        {
            defaultNextStageId = stageId ?? string.Empty;
        }

        internal void AddFailRule(QuestFailRule rule)
        {
            failRules.Add(rule);
        }

        internal void SetEnd(StageEndType type)
        {
            endType = type;
        }

        internal void SetLedgerEntry(string entryId)
        {
            ledgerEntryId = entryId ?? string.Empty;
        }

        internal void SetSaveLock(bool value)
        {
            saveLock = value;
        }

        internal void AddMarkers(string[] ids, float radius)
        {
            markerIds.AddRange(ids);
            searchRadius = radius;
        }
    }
}
