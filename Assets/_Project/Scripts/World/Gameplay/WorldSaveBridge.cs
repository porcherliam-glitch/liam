using System;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.World.Dungeons;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Connects the world triggers with the save system (GDD 05 5.3): autosaves of checkpoints, dungeon entrances and arrivals
    /// (<see cref="IWorldAutosave"/>), no saving inside a running boss fight ("Arena geschlossen", blocker while
    /// <c>BossEncounterStarted</c> … <c>BossEncounterEnded</c>) and an autosave after a victory.
    /// </summary>
    /// <remarks>
    /// An autosave requested while saving is locked waits (the newest request wins) and runs as soon as saving is allowed
    /// again, at most <see cref="PendingLimitSeconds"/> later. Typical case: the killing blow keeps the player "in combat" for
    /// 5 s (GDD 05 5.2), so the save after a victory has to wait for that lock. Loading a save drops a waiting request.
    /// </remarks>
    public sealed class WorldSaveBridge : IWorldAutosave, IPostInitializable, ITickable, IDisposable, ISessionService
    {
        /// <summary>Blocker id of a running boss fight.</summary>
        public const string BossBlockerId = "world.boss_encounter";

        /// <summary>Seconds (game time) a locked autosave waits before it is dropped.</summary>
        public const float PendingLimitSeconds = 30f;

        private readonly ISaveManager _saves;
        private readonly IEventBus _eventBus;
        private bool _subscribed;
        private string _runningBoss = string.Empty;
        private string _pendingReason = string.Empty;
        private float _pendingAge;

        /// <summary>Creates the bridge.</summary>
        /// <param name="saves">Save manager.</param>
        /// <param name="eventBus">Event bus (null in tests: no boss blocker).</param>
        public WorldSaveBridge(ISaveManager saves, IEventBus eventBus)
        {
            _saves = saves ?? throw new ArgumentNullException(nameof(saves));
            _eventBus = eventBus;
        }

        /// <summary>Id of the boss whose fight blocks saving, or empty.</summary>
        public string RunningBoss => _runningBoss;

        /// <summary>Number of autosaves started by this bridge (debug, tests).</summary>
        public int RequestedSaves { get; private set; }

        /// <summary>True while a locked autosave waits.</summary>
        public bool HasPendingAutosave => _pendingReason.Length > 0;

        /// <summary>Reason of the waiting autosave, or empty.</summary>
        public string PendingReason => _pendingReason;

        /// <inheritdoc />
        public void RequestAutosave(string reason)
        {
            string why = string.IsNullOrEmpty(reason) ? "world" : reason;
            if (!_saves.IsSaveAllowed(out string blocked))
            {
                _pendingReason = why;
                _pendingAge = 0f;
                Log.Info(LogCategory.Save, "Autosave '" + why + "' waits: " + blocked + ".");
                return;
            }

            ClearPending();
            Save(why);
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (!HasPendingAutosave)
            {
                return;
            }

            if (_saves.IsSaveAllowed(out _))
            {
                string reason = _pendingReason;
                ClearPending();
                Save(reason);
                return;
            }

            if (deltaTime > 0f)
            {
                _pendingAge += deltaTime;
            }

            if (_pendingAge > PendingLimitSeconds)
            {
                Log.Info(LogCategory.Save, "Autosave '" + _pendingReason + "' dropped: saving stayed locked for more than " + PendingLimitSeconds + " s.");
                ClearPending();
            }
        }

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_eventBus == null || _subscribed)
            {
                return;
            }

            _eventBus.Subscribe<BossEncounterStarted>(OnEncounterStarted);
            _eventBus.Subscribe<BossEncounterEnded>(OnEncounterEnded);
            _eventBus.Subscribe<GameLoaded>(OnGameLoaded);
            _eventBus.Subscribe<FastTravelCompleted>(OnFastTravelCompleted);
            _subscribed = true;
        }

        /// <inheritdoc />
        public void BeginSession()
        {
        }

        /// <inheritdoc />
        public void EndSession()
        {
            ClearBlocker();
            ClearPending();
        }

        /// <inheritdoc />
        public void Dispose()
        {
            ClearBlocker();
            ClearPending();
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<BossEncounterStarted>(OnEncounterStarted);
            _eventBus.Unsubscribe<BossEncounterEnded>(OnEncounterEnded);
            _eventBus.Unsubscribe<GameLoaded>(OnGameLoaded);
                _eventBus.Unsubscribe<FastTravelCompleted>(OnFastTravelCompleted);
            _subscribed = false;
        }

        private void OnEncounterStarted(BossEncounterStarted evt)
        {
            _runningBoss = evt.BossId;
            _saves.AddBlocker(BossBlockerId, SaveReasonKeys.Combat);
        }

        private void OnEncounterEnded(BossEncounterEnded evt)
        {
            if (_runningBoss.Length > 0 && evt.BossId != _runningBoss)
            {
                return;
            }

            ClearBlocker();
            if (evt.Defeated)
            {
                // GDD 05 5.3: autosave after the victory (waits while the combat lock of the last hits is still active).
                RequestAutosave(evt.BossId);
            }
        }

        private void OnGameLoaded(GameLoaded evt)
        {
            if (HasPendingAutosave)
            {
                Log.Info(LogCategory.Save, "Autosave '" + _pendingReason + "' dropped: a save was loaded.");
                ClearPending();
            }
        }

        private void ClearBlocker()
        {
            _runningBoss = string.Empty;
            _saves.RemoveBlocker(BossBlockerId);
        }

        private void ClearPending()
        {
            _pendingReason = string.Empty;
            _pendingAge = 0f;
        }

        private void Save(string reason)
        {
            RequestedSaves++;
            Log.Info(LogCategory.Save, "Autosave '" + reason + "'.");
            RunSave(reason);
        }

        private async void RunSave(string reason)
        {
            // Fire-and-forget like the save manager's own autosave; SaveAsync captures the state synchronously.
            try
            {
                SaveResult result = await _saves.SaveAsync(SaveRequest.Auto(), CancellationToken.None);
                if (!result.Success)
                {
                    Log.Warning(LogCategory.Save, "Autosave '" + reason + "' failed: " + result);
                }
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Save, exception, "Autosave '" + reason + "' failed.");
            }
        }

        private void OnFastTravelCompleted(FastTravelCompleted evt)
        {
            // S50 / GDD 05 5.2: an autosave at the arrival of a fast travel.
            RequestAutosave("travel." + evt.PlaceId);
        }
    }
}
