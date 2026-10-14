using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Base class of all quest objectives (architecture 11.7, GDD 02 5): held by stages as <c>[SerializeReference]</c> list.
    /// New objective types are a new subclass in this assembly (GDD 02 5.3 "Basisklasse + Erweiterung"): override
    /// <see cref="RequiredCount"/>, <see cref="ShortCode"/>, <see cref="RegisterListeners"/> and implement
    /// <see cref="IObjectiveListener{TEvent}"/> for the events it counts; the type picker shows it automatically.
    /// </summary>
    /// <remarks>
    /// <para>Objectives belong to the quest asset and are shared by every save: they never store progress. All run-time
    /// state goes through <see cref="ObjectiveRuntime"/> (architecture 7.6 rule 4).</para>
    /// <para>Same rules as conditions: <c>[Serializable]</c>, <c>sealed</c>, a German <see cref="TypeMenuAttribute"/> below
    /// <c>Ziele/</c>, a parameterless constructor without logic, names frozen from the first asset on.</para>
    /// <para>The <c>With…</c> methods are for quests built in code (tests, procedural quests) before they are used; never call
    /// them on objectives of a running quest asset.</para>
    /// </remarks>
    [Serializable]
    public abstract class QuestObjective
    {
        [Tooltip("Lokale ID innerhalb der Stage: o1, o2 … (global: <quest-id>.<stage>.o1).")]
        [SerializeField] private string id = "o1";

        [Tooltip("Optionales Ziel: kein Muss für den Stage-Abschluss, gibt beim Erfüllen die Bonus-Aktionen.")]
        [SerializeField] private bool optional;

        [Tooltip("Ziel-Text im Questlog, höchstens 50 Zeichen, z. B. „Untersuche die Weide“. Leer = automatischer Text. TODO: LocalizedString.")]
        [SerializeField] private string journalText = string.Empty;

        [Tooltip("Ziel ist nur sichtbar und erfüllbar, solange diese Bedingung gilt (GDD 02, 5.2 „Versteckte Ziele“). Leer = immer.")]
        [SerializeReference] private Condition visibleCondition;

        [Tooltip("Marker-Ziele für Kompass und Karte (Objekt-, NPC- oder Orts-IDs).")]
        [SerializeField] private List<string> markerIds = new List<string>();

        [Tooltip("Aktionen, wenn das Ziel erfüllt wird (Bonus-Belohnung optionaler Ziele, z. B. +10 Pfeile). Laufen nur einmal.")]
        [SerializeReference] private List<GameAction> onCompleted = new List<GameAction>();

        /// <summary>Creates an objective with id <c>o1</c>.</summary>
        protected QuestObjective()
        {
        }

        /// <summary>Creates an objective with the given local id.</summary>
        /// <param name="id">Local id (<c>o1</c>).</param>
        protected QuestObjective(string id)
        {
            this.id = id ?? string.Empty;
        }

        /// <summary>Local id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>True for optional objectives.</summary>
        public bool IsOptional => optional;

        /// <summary>Journal text (may be empty: the UI then uses <see cref="Describe"/>).</summary>
        public string JournalText => journalText ?? string.Empty;

        /// <summary>Visibility condition (null = always visible).</summary>
        public Condition VisibleCondition => visibleCondition;

        /// <summary>Marker targets.</summary>
        public IReadOnlyList<string> MarkerIds => markerIds;

        /// <summary>Actions run once when the objective is fulfilled.</summary>
        public IReadOnlyList<GameAction> OnCompletedActions => onCompleted;

        /// <summary>Progress needed (counter target; 1 for yes/no objectives).</summary>
        public abstract int RequiredCount { get; }

        /// <summary>Short code of GDD 02 5.1 (<c>Toete</c>, <c>Sammle</c> …) for lists and logs.</summary>
        public abstract string ShortCode { get; }

        /// <summary>True if the progress can sink again (GDD 02 5.2: "Sammle" counts the inventory).</summary>
        public virtual bool CanRegress => false;

        /// <summary>Time limit in seconds (0 = none); the quest service counts it down while the stage is active.</summary>
        public virtual float TimeLimitSeconds => 0f;

        /// <summary>
        /// True if the fulfilled objective holds a decision in <see cref="ObjectiveRuntime.Extra"/> (the chosen option) that
        /// the quest keeps for the ledger and the condition "Quest/Entscheidung ist".
        /// </summary>
        public virtual bool RecordsChoice => false;

        /// <summary>Declares the events and conditions this objective needs (called when the stage starts or is restored).</summary>
        /// <param name="registry">Registry of the stage.</param>
        public abstract void RegisterListeners(IObjectiveEventRegistry registry);

        /// <summary>Called when the stage starts, after the listeners are registered (e.g. count owned items).</summary>
        /// <param name="rt">Run-time state.</param>
        /// <param name="ctx">Quest context.</param>
        public virtual void OnStageStarted(ObjectiveRuntime rt, in QuestContext ctx)
        {
        }

        /// <summary>Called after loading a save for objectives of the active stage (reconcile with other systems).</summary>
        /// <param name="rt">Run-time state.</param>
        /// <param name="ctx">Quest context.</param>
        public virtual void OnAfterLoad(ObjectiveRuntime rt, in QuestContext ctx)
        {
        }

        /// <summary>Called when the time limit ran out. Default: the objective fails.</summary>
        /// <param name="rt">Run-time state.</param>
        /// <param name="ctx">Quest context.</param>
        public virtual void OnTimerExpired(ObjectiveRuntime rt, in QuestContext ctx)
        {
            rt.Fail();
        }

        /// <summary>German short text in the notation of GDD 02 11, e.g. <c>Toete(enemy.wolf.grauwolf, 3)</c>.</summary>
        public virtual string Describe()
        {
            return ShortCode;
        }

        /// <summary>
        /// Checks the data (V13 invalid parameters, V14 empty entries, references). Overrides call <c>base.Validate</c>.
        /// </summary>
        /// <param name="report">Report.</param>
        public virtual void Validate(IValidationReport report)
        {
            if (RequiredCount <= 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, ShortCode + ": Anzahl " + RequiredCount + " (muss mindestens 1 sein).");
            }

            if (JournalText.Length > 50)
            {
                report.Warning("W04", "Ziel-Text hat " + JournalText.Length + " Zeichen (höchstens 50).");
            }

            report.ValidateOptional(visibleCondition, "Sichtbar wenn");
            report.ValidateActions(onCompleted, "Bonus-Aktionen");
            for (int i = 0; i < markerIds.Count; i++)
            {
                report.Mentions(markerIds[i], string.Empty);
            }
        }

        /// <summary>Sets the local id (code-built quests).</summary>
        /// <param name="objectiveId">Local id.</param>
        public QuestObjective WithId(string objectiveId)
        {
            id = objectiveId ?? string.Empty;
            return this;
        }

        /// <summary>Marks the objective as optional and sets its bonus actions (code-built quests).</summary>
        /// <param name="bonusActions">Actions when fulfilled.</param>
        public QuestObjective AsOptional(params GameAction[] bonusActions)
        {
            optional = true;
            return WithCompletionActions(bonusActions);
        }

        /// <summary>Adds actions that run once when the objective is fulfilled (code-built quests).</summary>
        /// <param name="actions">Actions.</param>
        public QuestObjective WithCompletionActions(params GameAction[] actions)
        {
            if (actions != null)
            {
                onCompleted.AddRange(actions);
            }

            return this;
        }

        /// <summary>Sets the journal text (code-built quests).</summary>
        /// <param name="text">German text.</param>
        public QuestObjective WithJournalText(string text)
        {
            journalText = text ?? string.Empty;
            return this;
        }

        /// <summary>Sets the visibility condition (code-built quests).</summary>
        /// <param name="condition">Condition.</param>
        public QuestObjective VisibleWhen(Condition condition)
        {
            visibleCondition = condition;
            return this;
        }

        /// <summary>Adds marker targets (code-built quests).</summary>
        /// <param name="ids">Object, NPC or location ids.</param>
        public QuestObjective WithMarkers(params string[] ids)
        {
            if (ids != null)
            {
                markerIds.AddRange(ids);
            }

            return this;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Id + " " + Describe() + (optional ? " (optional)" : string.Empty);
        }
    }
}
