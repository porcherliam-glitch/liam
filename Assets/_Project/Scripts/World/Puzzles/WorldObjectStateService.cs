using System;
using Aetherfall.Core;
using Aetherfall.Events;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// The registered <see cref="IWorldObjectStateStore"/>: besides the states it records the global facts that must survive
    /// scene changes and loads, so no scene object has to be alive for them: <c>PuzzleSolved</c> sets the puzzle id to
    /// <see cref="WorldObjectStates.Done"/>, <c>BossDefeated</c> sets the boss id ("besiegt bleibt besiegt", GDD 02 11.7:
    /// "der Mini-Boss kehrt nicht zurueck"). Every change while playing is published as <c>WorldObjectStateChanged</c> (condition
    /// triggers). Ends of a session (main menu) clear the states.
    /// </summary>
    public sealed class WorldObjectStateService : WorldObjectStateStore, IPostInitializable, IDisposable, ISessionService
    {
        private readonly IEventBus _eventBus;
        private bool _subscribed;

        /// <summary>Creates the service.</summary>
        /// <param name="eventBus">Event bus (null in tests: no event recording).</param>
        public WorldObjectStateService(IEventBus eventBus)
        {
            _eventBus = eventBus;
        }

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_eventBus == null || _subscribed)
            {
                return;
            }

            _eventBus.Subscribe<PuzzleSolved>(OnPuzzleSolved);
            _eventBus.Subscribe<BossDefeated>(OnBossDefeated);
            StateChanged += PublishChange;
            _subscribed = true;
        }

        /// <inheritdoc />
        public void BeginSession()
        {
        }

        /// <inheritdoc />
        public void EndSession()
        {
            Restore(null);
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<PuzzleSolved>(OnPuzzleSolved);
            _eventBus.Unsubscribe<BossDefeated>(OnBossDefeated);
            StateChanged -= PublishChange;
            _subscribed = false;
        }

        private void PublishChange(string id)
        {
            var changed = new WorldObjectStateChanged(id, GetState(id));
            _eventBus.Publish(in changed);
        }

        private void OnPuzzleSolved(PuzzleSolved evt)
        {
            if (!string.IsNullOrEmpty(evt.PuzzleId))
            {
                SetState(evt.PuzzleId, WorldObjectStates.Done);
            }
        }

        private void OnBossDefeated(BossDefeated evt)
        {
            if (!string.IsNullOrEmpty(evt.BossId))
            {
                SetState(evt.BossId, WorldObjectStates.Done);
            }
        }
    }
}
