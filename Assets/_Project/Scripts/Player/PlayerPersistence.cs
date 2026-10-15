using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Connects the player character with the save system: registers <see cref="PlayerLocationSaveable"/> (section
    /// <c>player</c>: position, yaw, world space), <see cref="PlayerResourcesSaveable"/> (section <c>stats.player</c>:
    /// health, stamina, mana) and <see cref="PlayerAbilitiesSaveable"/> (section <c>abilities.player</c>: ability bar and
    /// learned abilities) with <see cref="ISaveManager"/>, places the character when a save is loaded, and blocks saving
    /// while the character jumps or falls (<see cref="AirborneSaveLock"/>, architecture 9.8).
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root next to <see cref="PlayerMotor"/>, <see cref="DamageableComponent"/> and
    /// <see cref="CharacterStatsComponent"/> (the test ground menu sets the references).</para>
    /// <para>Waits in <c>Start</c> until the boot has registered the services (in the editor the boot scene loads after the
    /// test scene) and unregisters in <c>OnDestroy</c>, carrying the values over to the player of the next scene
    /// (<see cref="ISaveManager.CarryOver"/>). Registering this late is fine: if a save was loaded before, the save
    /// manager hands over the kept sections at once. The location also writes the world space into the save header. Without
    /// SaveInstaller in the BootConfig it logs a warning and the player is not saved.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerPersistence : MonoBehaviour, IPlayerPlacement
    {
        [Tooltip("Bewegung der Figur (zum Teleportieren beim Laden). Leer = PlayerMotor am selben GameObject.")]
        [SerializeField] private PlayerMotor motor = null;

        [Tooltip("Lebenspunkte der Figur. Leer = DamageableComponent am selben GameObject.")]
        [SerializeField] private DamageableComponent health = null;

        [Tooltip("Werte mit Ausdauer und Mana. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("ID des Weltraums, in dem die Figur steht (wird mitgespeichert), z. B. worldspace.test.testgelaende.")]
        [SerializeField] private string worldSpaceId = "worldspace.test.testgelaende";

        private ISaveManager _saves;
        private PlayerLocationSaveable _location;
        private PlayerResourcesSaveable _resources;
        private PlayerAbilitiesSaveable _abilities;
        private AirborneSaveLock _airborneLock;

        /// <inheritdoc />
        public PlayerPose CurrentPose => motor.CurrentPose;

        /// <inheritdoc />
        public string WorldSpaceId => worldSpaceId;

        /// <summary>True after both saveables were registered with the save manager.</summary>
        public bool IsRegistered => _saves != null;

        /// <inheritdoc />
        public void Place(in PlayerPose pose, string targetWorldSpaceId)
        {
            if (!string.IsNullOrEmpty(targetWorldSpaceId) && !string.Equals(targetWorldSpaceId, worldSpaceId, StringComparison.Ordinal))
            {
                // Changing world spaces needs the scene loader (later step). A position from another world (e.g. a test ground
                // save loaded into the Eichental) would put the player under the terrain, so the player stays at the scene's start.
                Log.Warning(LogCategory.Player, "Save places the player in world space '" + targetWorldSpaceId + "', but this scene is '" +
                                                worldSpaceId + "'. The saved position is ignored; the player stays at the start point.");
                return;
            }

            motor.Teleport(pose);
        }

        private void Awake()
        {
            if (motor == null && !TryGetComponent(out motor))
            {
                Log.Error(LogCategory.Player, "PlayerPersistence on '" + name + "' finds no PlayerMotor; the player is not saved.");
                enabled = false;
                return;
            }

            if (health == null && !TryGetComponent(out health))
            {
                Log.Error(LogCategory.Player, "PlayerPersistence on '" + name + "' finds no DamageableComponent; the player is not saved.");
                enabled = false;
                return;
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            if (!enabled)
            {
                return;
            }

            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                if (locator == null || !locator.TryGet(out ISaveManager saves))
                {
                    Log.Warning(LogCategory.Player, "PlayerPersistence: no ISaveManager registered, the player is not saved. " +
                                                    "Add the SaveInstaller to the BootConfig (menu Aetherfall > Testgelaende erstellen does that).");
                    return;
                }

                locator.TryGet(out IEventBus eventBus);
                _location = new PlayerLocationSaveable(this, eventBus);
                TryGetComponent(out Combatant combatant);
                _resources = new PlayerResourcesSaveable(health.Health, stats != null ? stats.Stamina : null, stats != null ? stats.Mana : null,
                    combatant != null ? combatant.Status : null);
                saves.Register(_resources);
                if (TryGetComponent(out PlayerAbilityCaster caster) && caster.enabled)
                {
                    // Ability bar and learned abilities (section abilities.player).
                    _abilities = new PlayerAbilitiesSaveable(caster);
                    saves.Register(_abilities);
                }

                saves.Register(_location);
                saves.RegisterHeaderContributor(_location);
                _saves = saves;
                _airborneLock = new AirborneSaveLock(saves);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerPersistence could not register the player saveables.");
            }
        }

        private void Update()
        {
            if (_airborneLock != null)
            {
                _airborneLock.Update(motor.IsAirborne);
            }
        }

        private void OnDestroy()
        {
            if (_saves == null)
            {
                return;
            }

            _airborneLock.Release();
            _airborneLock = null;
            _saves.UnregisterHeaderContributor(_location);
            _saves.Unregister(_location);

            // Health, stamina and mana go with the player into the next scene (portal change, guide 12, 11.5); the position does
            // not: there the arrival anchor places the player. Loading or a new game discards the carried values.
            _saves.CarryOver(_resources);
            if (_abilities != null)
            {
                _saves.CarryOver(_abilities);
                _abilities = null;
            }

            _saves = null;
        }
    }
}
