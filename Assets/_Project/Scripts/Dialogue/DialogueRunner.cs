using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Utilities;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Runs one conversation (architecture 11.8 "DialogueRunner (reine C#-Logik)"): walks the nodes, stops at lines and choices
    /// for the player, evaluates switches, checks and random nodes, runs actions, follows jumps (with return) and ends with an
    /// exit. Builds the <see cref="DialogueView"/> the dialogue screen shows. Pure C#; everything comes in through the
    /// <see cref="DialogueRunContext"/>.
    /// </summary>
    /// <remarks>
    /// <para><b>Events</b> (architecture 4.3): start → <c>NPCTalkedTo</c> (with a partner), <c>DialogueStarted</c>; choice →
    /// <c>ChoiceMade</c>; check → <c>SkillCheckResolved</c> (not for a remembered result); end → <c>DialogOutcome</c> with the
    /// exit id (empty when cancelled). <see cref="Ended"/> is raised before <c>DialogOutcome</c>, so the service has released
    /// the game state when quests react to the outcome.</para>
    /// <para><b>Order of a step:</b> actions of the chosen option, then the target node; actions of a line run before it is
    /// shown (the line "Ich bin Harrik" already shows the name). At most <see cref="DialogueRules.MaxAutomaticSteps"/> nodes
    /// without player input per step; more ends the conversation with an error (cycle protection).</para>
    /// <para><b>Re-entrancy:</b> commands while a step runs (e.g. an action cancels the conversation) are deferred: a cancel
    /// is carried out when the step reaches the next node; continue and choose are ignored.</para>
    /// </remarks>
    public sealed class DialogueRunner
    {
        private readonly DialogueRunContext _context;
        private readonly DialogueView _view = new DialogueView();
        private readonly List<ReturnFrame> _returns = new List<ReturnFrame>();
        private readonly List<DialogueOptionView> _optionScratch = new List<DialogueOptionView>();
        private readonly List<int> _optionIndices = new List<int>();
        private DialogueSpec _root;
        private DialogueSpec _spec;
        private string _npcId = string.Empty;
        private DialogueNode _current;
        private DialogueSpec _lastChoiceSpec;
        private string _lastChoiceNodeId = string.Empty;
        private bool _running;
        private bool _advancing;
        private bool _cancelRequested;

        /// <summary>Creates the runner.</summary>
        /// <param name="context">Run context.</param>
        public DialogueRunner(DialogueRunContext context)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
        }

        /// <summary>Raised after every change of <see cref="View"/>.</summary>
        public event Action Changed;

        /// <summary>Raised when the conversation ended (before <c>DialogOutcome</c> is published). Not raised by <see cref="Abort"/>.</summary>
        public event Action<DialogueEndInfo> Ended;

        /// <summary>What the dialogue screen shows.</summary>
        public DialogueView View => _view;

        /// <summary>True while a conversation runs.</summary>
        public bool IsRunning => _running;

        /// <summary>The started dialogue (null if none).</summary>
        public DialogueSpec Dialogue => _root;

        /// <summary>Conversation partner of the running conversation.</summary>
        public string NpcId => _npcId;

        /// <summary>How the last conversation ended.</summary>
        public DialogueEndInfo LastEnd { get; private set; }

        /// <summary>Starts a conversation.</summary>
        /// <param name="spec">Dialogue.</param>
        /// <param name="request">Partner and optional start node.</param>
        /// <returns>False if a conversation runs already or the dialogue has no start node.</returns>
        public bool Start(DialogueSpec spec, in DialogueStartRequest request)
        {
            if (spec == null || _running)
            {
                return false;
            }

            string startNode = request.StartNodeId.Length > 0 ? request.StartNodeId : spec.StartNodeId;
            if (!spec.HasNode(startNode))
            {
                Log.Error(LogCategory.Dialogue, "Dialogue '" + spec.Id + "' has no start node '" + startNode + "'.");
                return false;
            }

            _root = spec;
            _spec = spec;
            _npcId = request.NpcId;
            _returns.Clear();
            _lastChoiceSpec = null;
            _lastChoiceNodeId = string.Empty;
            _cancelRequested = false;
            _running = true;
            _view.Begin(spec.Id, _npcId, spec.Mode);
            if (_npcId.Length > 0)
            {
                _context.Bus.Publish(new NPCTalkedTo(_npcId, spec.Id));
            }

            _context.Bus.Publish(new DialogueStarted(spec.Id, _npcId, spec.Mode));
            if (_running)
            {
                Advance(startNode, null);
            }

            return true;
        }

        /// <summary>Continues after a line (confirm).</summary>
        /// <returns>False if no line is shown.</returns>
        public bool Continue()
        {
            if (!_running || _advancing || _view.State != DialogueViewState.Line || !(_current is LineNode line))
            {
                return false;
            }

            if (line.EndsAfter)
            {
                FinishOrReturn(line.ExitId, line.FollowUp);
            }
            else
            {
                Advance(line.NextNodeId, null);
            }

            return true;
        }

        /// <summary>Chooses a visible option.</summary>
        /// <param name="index">Index in <see cref="DialogueView.Options"/>.</param>
        /// <returns>False if no choice is shown, the index is invalid or the option is greyed.</returns>
        public bool Choose(int index)
        {
            if (!_running || _advancing || _view.State != DialogueViewState.Choice || !(_current is ChoiceNode choice))
            {
                return false;
            }

            if (index < 0 || index >= _view.Options.Count || !_view.Options[index].IsEnabled)
            {
                return false;
            }

            DialogueOption option = choice.Options[_optionIndices[index]];
            _context.Memory.MarkChosen(DialogueIds.OptionKey(_spec.Id, choice.Id, option.Id));
            string choiceId = option.ChoiceIdOverride.Length > 0 ? option.ChoiceIdOverride : DialogueIds.ChoiceId(_spec.Id, choice.Id);
            string optionId = option.ChoiceOptionIdOverride.Length > 0 ? option.ChoiceOptionIdOverride : option.Id;
            _context.Bus.Publish(new ChoiceMade(choiceId, optionId));
            if (_running)
            {
                Advance(option.TargetNodeId, option.Actions);
            }

            return true;
        }

        /// <summary>
        /// Cancels the conversation (exit empty, <c>DialogOutcome</c> with empty exit). While a step runs, the cancel happens
        /// at the next node.
        /// </summary>
        /// <returns>False if no conversation runs.</returns>
        public bool Cancel()
        {
            if (!_running)
            {
                return false;
            }

            if (_advancing)
            {
                _cancelRequested = true;
                return true;
            }

            End(string.Empty, DialogueFollowUp.Gameplay, true);
            return true;
        }

        /// <summary>
        /// Stops the conversation without events (a save is loaded: architecture 9.1 "Load sendet keine Gameplay-Events").
        /// </summary>
        public void Abort()
        {
            if (!_running && _view.State == DialogueViewState.None)
            {
                return;
            }

            _running = false;
            _cancelRequested = false;
            _returns.Clear();
            _current = null;
            _root = null;
            _spec = null;
            _npcId = string.Empty;
            _view.Clear();
            Changed?.Invoke();
        }

        /// <summary>Rebuilds the options of the current choice (e.g. the gold changed while the choice is shown).</summary>
        public void RefreshChoice()
        {
            if (_running && !_advancing && _current is ChoiceNode choice)
            {
                ShowChoice(choice);
            }
        }

        private void Advance(string nodeId, IReadOnlyList<GameAction> leadingActions)
        {
            _advancing = true;
            try
            {
                if (leadingActions != null && leadingActions.Count > 0)
                {
                    RunActions(leadingActions);
                }

                string id = nodeId;
                for (int step = 0; ; step++)
                {
                    if (HandleInterruption())
                    {
                        return;
                    }

                    if (step >= _context.Rules.MaxAutomaticSteps)
                    {
                        Log.Error(LogCategory.Dialogue, "Dialogue '" + _root.Id + "': more than " + _context.Rules.MaxAutomaticSteps +
                                                        " nodes without player input (cycle?) - conversation ended.");
                        End(string.Empty, DialogueFollowUp.Gameplay, true);
                        return;
                    }

                    if (!_spec.TryGetNode(id, out DialogueNode node) || node == null)
                    {
                        Log.Error(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "': node '" + id + "' does not exist - conversation ended.");
                        End(string.Empty, DialogueFollowUp.Gameplay, true);
                        return;
                    }

                    _current = node;
                    id = Step(node);
                    if (id == null)
                    {
                        return;
                    }
                }
            }
            finally
            {
                _advancing = false;
            }
        }

        /// <summary>Handles one node; returns the next node id, or null if the step stops here (input needed or ended).</summary>
        private string Step(DialogueNode node)
        {
            switch (node)
            {
                case LineNode line:
                    RunActions(line.Actions);
                    if (HandleInterruption())
                    {
                        return null;
                    }

                    ShowLine(line);
                    return null;
                case ChoiceNode choice:
                    _lastChoiceSpec = _spec;
                    _lastChoiceNodeId = choice.Id;
                    ShowChoice(choice);
                    if (_view.Options.Count == 0)
                    {
                        Log.Error(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "', " + choice.Id + ": no visible option - conversation ended.");
                        End(string.Empty, DialogueFollowUp.Gameplay, true);
                    }

                    return null;
                case BranchNode branch:
                    return PickBranch(branch);
                case ActionNode action:
                    RunActions(action.Actions);
                    if (HandleInterruption())
                    {
                        return null;
                    }

                    return action.EndsAfter ? FinishOrReturnInStep(action.ExitId, action.FollowUp) : action.NextNodeId;
                case CheckNode check:
                    return ResolveCheck(check);
                case RandomNode random:
                    return PickRandom(random);
                case JumpNode jump:
                    return Jump(jump);
                case EndNode end:
                    return FinishOrReturnInStep(end.ExitId, end.FollowUp);
                default:
                    Log.Error(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "': unknown node type " + node.GetType().Name + " - conversation ended.");
                    End(string.Empty, DialogueFollowUp.Gameplay, true);
                    return null;
            }
        }

        private bool HandleInterruption()
        {
            if (!_running)
            {
                return true;
            }

            if (_cancelRequested)
            {
                _cancelRequested = false;
                End(string.Empty, DialogueFollowUp.Gameplay, true);
                return true;
            }

            return false;
        }

        private string PickBranch(BranchNode branch)
        {
            ConditionContext ctx = _context.ConditionContextFor(_npcId, _spec.Id);
            for (int i = 0; i < branch.Branches.Count; i++)
            {
                DialogueBranch entry = branch.Branches[i];
                if (entry != null && ConditionEvaluator.Evaluate(entry.Condition, ctx))
                {
                    return entry.TargetNodeId;
                }
            }

            return branch.DefaultNodeId;
        }

        private string ResolveCheck(CheckNode check)
        {
            SkillCheckResult result = SkillCheckEvaluator.Evaluate(_context, check, _spec.Id, _npcId);
            if (!result.Remembered)
            {
                if (check.RememberResult)
                {
                    _context.Memory.SetCheck(DialogueIds.NodeKey(_spec.Id, check.Id), result.Success);
                }

                _context.Bus.Publish(new SkillCheckResolved(_spec.Id, check.CheckType, result.Success));
                if (HandleInterruption())
                {
                    return null;
                }
            }

            if (result.Success)
            {
                return check.SuccessNodeId;
            }

            if (check.FailureNodeId.Length > 0)
            {
                return check.FailureNodeId;
            }

            if (ReferenceEquals(_lastChoiceSpec, _spec) && _lastChoiceNodeId.Length > 0)
            {
                Log.Warning(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "', " + check.Id + ": check failed without failure exit - back to " + _lastChoiceNodeId + ".");
                return _lastChoiceNodeId;
            }

            Log.Error(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "', " + check.Id + ": check failed without failure exit and without a choice to return to - conversation ended.");
            End(string.Empty, DialogueFollowUp.Gameplay, true);
            return null;
        }

        private string PickRandom(RandomNode random)
        {
            int total = random.TotalWeight;
            if (total <= 0)
            {
                Log.Error(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "', " + random.Id + ": random node without weights - conversation ended.");
                End(string.Empty, DialogueFollowUp.Gameplay, true);
                return null;
            }

            var generator = new Pcg32Random(DialogueSeeds.For(_npcId, _context.CurrentDay, _spec.Id, random.Id));
            return random.Pick(generator.Range(0, total));
        }

        private string Jump(JumpNode jump)
        {
            DialogueSpec target = _spec;
            if (jump.IsExternal && !_context.Catalog.TryGet(jump.TargetDialogueId, out target))
            {
                Log.Error(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "', " + jump.Id + ": target dialogue '" + jump.TargetDialogueId + "' does not exist - conversation ended.");
                End(string.Empty, DialogueFollowUp.Gameplay, true);
                return null;
            }

            if (jump.ReturnAfter)
            {
                if (_returns.Count >= JumpNode.MaxReturnDepth)
                {
                    Log.Error(LogCategory.Dialogue, "Dialogue '" + _spec.Id + "', " + jump.Id + ": more than " + JumpNode.MaxReturnDepth + " nested jumps with return - conversation ended.");
                    End(string.Empty, DialogueFollowUp.Gameplay, true);
                    return null;
                }

                _returns.Add(new ReturnFrame(_spec, jump.ReturnNodeId));
            }

            _spec = target;
            return jump.TargetNodeId.Length > 0 ? jump.TargetNodeId : target.StartNodeId;
        }

        private string FinishOrReturnInStep(string exitId, DialogueFollowUp followUp)
        {
            if (_returns.Count == 0)
            {
                End(exitId, followUp, false);
                return null;
            }

            ReturnFrame frame = _returns[_returns.Count - 1];
            _returns.RemoveAt(_returns.Count - 1);
            _spec = frame.Spec;
            return frame.NodeId;
        }

        private void FinishOrReturn(string exitId, DialogueFollowUp followUp)
        {
            if (_returns.Count == 0)
            {
                End(exitId, followUp, false);
                return;
            }

            ReturnFrame frame = _returns[_returns.Count - 1];
            _returns.RemoveAt(_returns.Count - 1);
            _spec = frame.Spec;
            Advance(frame.NodeId, null);
        }

        private void RunActions(IReadOnlyList<GameAction> actions)
        {
            if (actions != null && actions.Count > 0)
            {
                ActionRunner.Run(actions, _context.ActionContextFor(_npcId, _spec.Id));
            }
        }

        private void ShowLine(LineNode line)
        {
            string speakerId = line.SpeakerId.Length > 0 ? line.SpeakerId : _spec.SpeakerId.Length > 0 ? _spec.SpeakerId : _npcId;
            string text = line.Text;
            string key = DialogueIds.NodeKey(_spec.Id, line.Id);
            ConditionContext ctx = _context.ConditionContextFor(_npcId, _spec.Id);
            for (int i = 0; i < line.Variants.Count; i++)
            {
                LineVariant variant = line.Variants[i];
                if (variant != null && ConditionEvaluator.IsMet(variant.Condition, ctx))
                {
                    text = variant.Text;
                    key = DialogueIds.VariantKey(_spec.Id, line.Id, i + 1);
                    break;
                }
            }

            var view = new DialogueLineView(line.Id, speakerId, _context.SpeakerName(speakerId), text, key,
                DialogueIds.VoiceClipId(speakerId, _spec.Id, line.Id), line.Emotion, line.Camera, SubtitlePager.Paginate(text),
                SubtitleTiming.DisplaySeconds(text.Length), line.EndsAfter && _returns.Count == 0);
            _view.ShowLine(_spec.Id, view, _root.Cancelable);
            Changed?.Invoke();
        }

        private void ShowChoice(ChoiceNode choice)
        {
            _optionScratch.Clear();
            _optionIndices.Clear();
            for (int i = 0; i < choice.Options.Count; i++)
            {
                DialogueOptionView option = DialogueOptionAnalyzer.Analyze(_context, _spec, choice, choice.Options[i], _npcId);
                if (option != null)
                {
                    _optionScratch.Add(option);
                    _optionIndices.Add(i);
                }
            }

            _view.ShowChoice(_spec.Id, choice.Id, _optionScratch, _root.Cancelable);
            Changed?.Invoke();
        }

        private void End(string exitId, DialogueFollowUp followUp, bool cancelled)
        {
            if (!_running)
            {
                return;
            }

            string dialogueId = _root != null ? _root.Id : string.Empty;
            var info = new DialogueEndInfo(dialogueId, _npcId, exitId, followUp, cancelled);
            _running = false;
            _cancelRequested = false;
            _returns.Clear();
            _current = null;
            LastEnd = info;
            _view.ShowEnded(exitId);
            Ended?.Invoke(info);
            _context.Bus.Publish(new DialogOutcome(dialogueId, info.NpcId, info.ExitId));
            Changed?.Invoke();
        }

        private readonly struct ReturnFrame
        {
            public readonly DialogueSpec Spec;
            public readonly string NodeId;

            public ReturnFrame(DialogueSpec spec, string nodeId)
            {
                Spec = spec;
                NodeId = nodeId ?? string.Empty;
            }
        }
    }
}
