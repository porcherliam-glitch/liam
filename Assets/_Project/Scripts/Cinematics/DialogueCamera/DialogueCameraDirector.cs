using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Events;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Default <see cref="IDialogueCameraDirector"/> (S58): follows the running conversation and lets the
    /// <see cref="DialogueShotPlanner"/> decide the setup per line. Only full conversations get the dialogue camera (the short
    /// mode keeps the game camera, barks have none). It runs on scaled time, so it stands still while the pause menu lies over a
    /// conversation, and it switches off when the conversation ends or leaves the Dialogue state (a cutscene replaces it, a fight
    /// or death ends it).
    /// </summary>
    public sealed class DialogueCameraDirector : IDialogueCameraDirector, ITickable, IPostInitializable, IDisposable
    {
        /// <summary>Most cuts kept per conversation.</summary>
        public const int MaxCuts = 32;

        private readonly IDialogueService _dialogues;
        private readonly IGameStateService _state;
        private readonly DialogueShotPlanner _planner = new DialogueShotPlanner();
        private readonly List<DialogueCutRecord> _cuts = new List<DialogueCutRecord>();
        private double _now;
        private double _start;
        private int _cutRevision;
        private int _conversation;
        private bool _subscribed;

        /// <summary>Creates the director.</summary>
        /// <param name="dialogues">Dialogue service.</param>
        /// <param name="state">Game state service.</param>
        public DialogueCameraDirector(IDialogueService dialogues, IGameStateService state)
        {
            _dialogues = dialogues ?? throw new ArgumentNullException(nameof(dialogues));
            _state = state ?? throw new ArgumentNullException(nameof(state));
        }

        /// <inheritdoc />
        public DialogueShot Current { get; private set; } = DialogueShot.Inactive;

        /// <inheritdoc />
        public IReadOnlyList<DialogueCutRecord> Cuts => _cuts;

        /// <inheritdoc />
        public ChoiceFraming ChoiceFraming { get; set; }

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_subscribed)
            {
                return;
            }

            _dialogues.Changed += Evaluate;
            _dialogues.Ended += OnEnded;
            _subscribed = true;
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (!_subscribed)
            {
                return;
            }

            _dialogues.Changed -= Evaluate;
            _dialogues.Ended -= OnEnded;
            _subscribed = false;
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            _now += deltaTime > 0f ? deltaTime : 0f;
            Evaluate();
        }

        private void OnEnded(DialogueEndInfo info)
        {
            Stop();
        }

        private void Evaluate()
        {
            DialogueView view = _dialogues.View;
            if (!_dialogues.IsRunning || view == null || view.Mode != DialogueMode.Full ||
                (view.State != DialogueViewState.Line && view.State != DialogueViewState.Choice))
            {
                Stop();
                return;
            }

            GameState state = _state.Current;
            if (state == GameState.Paused && _planner.IsActive && OverDialogue())
            {
                // The pause menu lies over the conversation: the camera holds.
                return;
            }

            if (state != GameState.Dialogue)
            {
                Stop();
                return;
            }

            DialogueLineView line = view.Line;
            if (!_planner.IsActive)
            {
                _planner.Begin(_now);
                _start = _now;
                _cuts.Clear();
                _conversation++;
                Cut(view, line);
            }

            DialogueCameraHint hint = line != null ? line.Camera : DialogueCameraHint.Auto;
            if (_planner.Update(view.Revision, view.State == DialogueViewState.Choice, hint, SpeakerOf(line, view.NpcId), ChoiceFraming, _now))
            {
                Cut(view, line);
            }
        }

        private bool OverDialogue()
        {
            int count = _state.ModalCount;
            return count >= 2 && _state.GetModalAt(count - 2) == GameState.Dialogue;
        }

        private void Cut(DialogueView view, DialogueLineView line)
        {
            _cutRevision++;
            Current = new DialogueShot(true, _planner.Current, view.NpcId, line != null ? line.SpeakerId : string.Empty, _cutRevision, _conversation);
            if (_cuts.Count < MaxCuts)
            {
                _cuts.Add(new DialogueCutRecord(_now - _start, _planner.Current, view.Revision));
            }
        }

        private void Stop()
        {
            if (!_planner.IsActive && !Current.Active)
            {
                return;
            }

            _planner.End();
            Current = DialogueShot.Inactive;
        }

        private static DialogueSpeaker SpeakerOf(DialogueLineView line, string partnerId)
        {
            if (line == null || string.IsNullOrEmpty(line.SpeakerId) || line.SpeakerId == partnerId)
            {
                return DialogueSpeaker.Partner;
            }

            return line.SpeakerId == SubjectIds.Player ? DialogueSpeaker.Player : DialogueSpeaker.Other;
        }
    }
}
