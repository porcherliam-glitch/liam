using System;
using Aetherfall.Core;
using Aetherfall.Progression;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Connects the player with the progression (GDD 03 12, architecture 11.5): binds the player's stats to
    /// <see cref="IProgressionService"/>, which sets the level (more health, stamina and mana per level, GDD 03 10.3) and adds
    /// the distributed attribute points as modifiers with the source <c>progression:attributes</c>.
    /// </summary>
    /// <remarks>
    /// GameObject: the player root (the test ground menu adds it). Unbinds when the player is destroyed (scene change), so
    /// the service never holds stats of a destroyed player.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerProgression : MonoBehaviour
    {
        [Tooltip("Werte der Figur. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        private IProgressionService _progression;
        private StatCollection _boundStats;

        /// <summary>True once the stats are bound to the progression.</summary>
        public bool IsBound => _boundStats != null;

        private void Awake()
        {
            if (stats == null)
            {
                TryGetComponent(out stats);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                if (!Services.Locator.TryGet(out _progression))
                {
                    Log.Warning(LogCategory.Player, "PlayerProgression: no IProgressionService registered, the player stays at level 1. " +
                                                    "Add the ProgressionInstaller to the BootConfig (menu Aetherfall > Testgelaende erstellen does that).");
                    return;
                }

                if (stats == null)
                {
                    Log.Warning(LogCategory.Player, "PlayerProgression on '" + name + "': no CharacterStatsComponent found.");
                    return;
                }

                _boundStats = stats.Stats;
                _progression.AttachPlayerStats(_boundStats);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerProgression could not connect to the progression.");
            }
        }

        private void OnDestroy()
        {
            if (_progression != null && _boundStats != null)
            {
                _progression.DetachPlayerStats(_boundStats);
                _boundStats = null;
            }
        }
    }
}
