using System;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.World.Dungeons;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Connects the world triggers with the save system (GDD 05 5.3): autosaves of checkpoints and dungeon exits
    /// (<see cref="IWorldAutosave"/>), no saving inside a running boss fight ("Arena geschlossen", blocker while
    /// <c>BossEncounterStarted</c> … <c>BossEncounterEnded</c>) and an autosave after a victory.
    /// </summary>
    public sealed class WorldSaveBridge : IWorldAutosave, IPostInitializable, IDisposable, ISessionService
    {
        /// <summary>Blocker id of a running boss fight.</summary>
        public const string BossBlockerId = "world.boss_encounter";

        private readonly ISaveManager _saves;
        private readonly IEventBus _eventBus;
        private bool _subscribed;
        private string _runningBoss = string.Empty;

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

        /// <inheritdoc />
        public void RequestAutosave(string reason)
        {
            if (!_saves.IsSaveAllowed(out string blocked))
            {
                Log.Info(LogCategory.Save, "Autosave '" + reason + "' skipped: " + blocked + ".");
                return;
            }

            RequestedSaves++;
            Log.Info(LogCategory.Save, "Autosave '" + reason + "'.");
            RunSave(reason);
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
        }

        /// <inheritdoc />
        public void Dispose()
        {
            ClearBlocker();
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<BossEncounterStarted>(OnEncounterStarted);
            _eventBus.Unsubscribe<BossEncounterEnded>(OnEncounterEnded);
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
                // GDD 05 5.3: autosave after the victory (skipped while combat still blocks, e.g. remaining adds).
                RequestAutosave(evt.BossId);
            }
        }

        private void ClearBlocker()
        {
            _runningBoss = string.Empty;
            _saves.RemoveBlocker(BossBlockerId);
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
    }
}
