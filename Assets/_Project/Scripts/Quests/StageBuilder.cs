using System;
using Aetherfall.Conditions;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Fluent construction of a <see cref="StageDefinition"/> in code (tests, procedural quests, test fixtures), e.g.
    /// <c>new StageBuilder("s30").Text("…").Objective(new GoToObjective("o1", "loc.x")).Next("s40").Build()</c>.
    /// </summary>
    public sealed class StageBuilder
    {
        private readonly StageDefinition _stage;
        private bool _built;

        /// <summary>Starts a stage.</summary>
        /// <param name="stageId">Local stage id.</param>
        public StageBuilder(string stageId)
        {
            _stage = new StageDefinition(stageId);
        }

        /// <summary>Journal text and optional exploration hint.</summary>
        /// <param name="journalText">German text.</param>
        /// <param name="explorationHint">German hint.</param>
        public StageBuilder Text(string journalText, string explorationHint = "")
        {
            _stage.SetJournal(journalText, explorationHint);
            return this;
        }

        /// <summary>Adds an objective (required unless it was marked optional).</summary>
        /// <param name="objective">Objective.</param>
        public StageBuilder Objective(QuestObjective objective)
        {
            _stage.AddObjective(objective);
            return this;
        }

        /// <summary>Adds an optional objective with bonus actions.</summary>
        /// <param name="objective">Objective.</param>
        /// <param name="bonusActions">Actions when fulfilled.</param>
        public StageBuilder Optional(QuestObjective objective, params GameAction[] bonusActions)
        {
            _stage.AddObjective(objective != null ? objective.AsOptional(bonusActions) : null);
            return this;
        }

        /// <summary>Completion mode "one objective".</summary>
        public StageBuilder AnyObjective()
        {
            _stage.SetMode(StageCompletionMode.Any, 1);
            return this;
        }

        /// <summary>Completion mode "at least n objectives".</summary>
        /// <param name="count">n.</param>
        public StageBuilder AtLeast(int count)
        {
            _stage.SetMode(StageCompletionMode.AtLeast, count);
            return this;
        }

        /// <summary>Marks the stage as pure action stage (no objectives, done at once).</summary>
        public StageBuilder ActionOnly()
        {
            _stage.SetActionOnly(true);
            return this;
        }

        /// <summary>Adds actions on start.</summary>
        /// <param name="actions">Actions.</param>
        public StageBuilder OnStart(params GameAction[] actions)
        {
            _stage.AddStartActions(actions ?? Array.Empty<GameAction>());
            return this;
        }

        /// <summary>Adds actions on completion.</summary>
        /// <param name="actions">Actions.</param>
        public StageBuilder OnComplete(params GameAction[] actions)
        {
            _stage.AddCompleteActions(actions ?? Array.Empty<GameAction>());
            return this;
        }

        /// <summary>Adds a branch (checked in the order of the calls).</summary>
        /// <param name="condition">Condition.</param>
        /// <param name="targetStageId">Next stage.</param>
        /// <param name="label">Optional label.</param>
        public StageBuilder Branch(Condition condition, string targetStageId, string label = "")
        {
            _stage.AddBranch(new StageBranch(condition, targetStageId, label));
            return this;
        }

        /// <summary>Sets the default exit.</summary>
        /// <param name="stageId">Next stage.</param>
        public StageBuilder Next(string stageId)
        {
            _stage.SetDefaultNext(stageId);
            return this;
        }

        /// <summary>Adds a stage-local fail rule.</summary>
        /// <param name="condition">Fail condition.</param>
        /// <param name="targetStageId">Stage to jump to, or empty to fail at once.</param>
        /// <param name="reasonId">Reason id.</param>
        public StageBuilder FailWhen(Condition condition, string targetStageId, string reasonId)
        {
            _stage.AddFailRule(new QuestFailRule(condition, targetStageId, reasonId));
            return this;
        }

        /// <summary>Makes it a success end stage.</summary>
        public StageBuilder EndSuccess()
        {
            _stage.SetEnd(StageEndType.Success);
            return this;
        }

        /// <summary>Makes it a failure end stage.</summary>
        public StageBuilder EndFailure()
        {
            _stage.SetEnd(StageEndType.Failure);
            return this;
        }

        /// <summary>Ledger entry written on completion.</summary>
        /// <param name="entryId">Local ledger id.</param>
        public StageBuilder Ledger(string entryId)
        {
            _stage.SetLedgerEntry(entryId);
            return this;
        }

        /// <summary>Blocks saving while the stage runs.</summary>
        public StageBuilder SaveLock()
        {
            _stage.SetSaveLock(true);
            return this;
        }

        /// <summary>Stage markers and search radius.</summary>
        /// <param name="radius">Search radius in meters.</param>
        /// <param name="ids">Marker targets.</param>
        public StageBuilder Markers(float radius, params string[] ids)
        {
            _stage.AddMarkers(ids ?? Array.Empty<string>(), radius);
            return this;
        }

        /// <summary>Returns the stage. The builder cannot be used afterwards.</summary>
        public StageDefinition Build()
        {
            if (_built)
            {
                throw new InvalidOperationException("StageBuilder.Build was already called for '" + _stage.Id + "'.");
            }

            _built = true;
            return _stage;
        }
    }
}
