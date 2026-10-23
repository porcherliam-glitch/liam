using System;
using System.Threading;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Entrance or exit between world spaces (architecture 10.8: "Dungeons sind eigene Szenen … Eingangs-Trigger: Speicherpunkt,
    /// Ladeschirm mit Ortsname, Spieler am Eingangs-Anker"): on interaction it requests an autosave if
    /// <see cref="AutosaveBeforeTravel"/> is on (dungeon entrances, GDD 05 5.3 "vor dem Betreten"), remembers the arrival
    /// anchor, switches to Loading, changes the world space through the scene loader (loading screen with the title) and
    /// switches back to Playing; the <see cref="ArrivalAnchor"/> of the target scene then places the player (and saves after
    /// leaving a dungeon, GDD 05 5.3 "nach dem Verlassen"). A target scene that is not in the scene list is refused before
    /// anything is unloaded.
    /// </summary>
    /// <remarks>
    /// GameObject: the gate or stair of the exit with a trigger collider on the layer Interactable. In the crypt: both exits
    /// lead to Eichental (<c>Assets/_Project/Scenes/World/Eichental.unity</c>, anchor <c>anchor.eichental.gruft_eingang</c>)
    /// and do not save before the travel (a save inside the crypt right at its exit would bring "Fortsetzen" back there).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class DungeonPortal : MonoBehaviour, IInteractable
    {
        [Tooltip("Stabile ID, z. B. obj.eichental.gruft_ausgang_eingang.")]
        [SerializeField] private string objectId = "obj.neu.ausgang";

        [Tooltip("Hinweistext, z. B. „Gruft verlassen“.")]
        [SerializeField] private string prompt = "Verlassen";

        [Tooltip("Zielszene als Pfad (muss in der Szenenliste stehen), z. B. Assets/_Project/Scenes/World/Eichental.unity.")]
        [SerializeField] private string targetSceneKey = string.Empty;

        [Tooltip("Titel des Ladebildschirms, z. B. Eichental.")]
        [SerializeField] private string targetTitle = string.Empty;

        [Tooltip("Anker in der Zielszene, an dem der Spieler ankommt.")]
        [SerializeField] private string targetAnchorId = string.Empty;

        [Tooltip("Vor der Reise automatisch speichern (an: Dungeon-Eingang in der Welt; aus: Dungeon-Ausgang – dort speichert der " +
                 "Ankunftspunkt draußen nach der Reise, GDD 05, 5.3).")]
        [SerializeField] private bool autosaveBeforeTravel = true;

        private IGameStateService _gameState;
        private ISceneLoader _scenes;
        private IWorldTravelService _travel;
        private IWorldAutosave _autosave;
        private readonly WorldMarkerHandle _marker = new WorldMarkerHandle();
        private bool _travelling;

        /// <summary>Stable id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Target scene key.</summary>
        public string TargetSceneKey => targetSceneKey ?? string.Empty;

        /// <summary>Target anchor id.</summary>
        public string TargetAnchorId => targetAnchorId ?? string.Empty;

        /// <summary>True if the portal saves before the travel (dungeon entrance).</summary>
        public bool AutosaveBeforeTravel => autosaveBeforeTravel;

        /// <inheritdoc />
        public string InteractionObjectId => ObjectId;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Use;

        /// <inheritdoc />
        public string InteractionPrompt => prompt ?? string.Empty;

        /// <inheritdoc />
        public int InteractionPriority => 6;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return isActiveAndEnabled && !_travelling && _gameState != null && _scenes != null && !_scenes.IsBusy &&
                   _gameState.Current == GameState.Playing && TargetSceneKey.Length > 0;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            if (!Application.CanStreamedLevelBeLoaded(TargetSceneKey))
            {
                Log.Warning(LogCategory.World, "Portal '" + ObjectId + "': the scene '" + TargetSceneKey + "' is not in the scene list " +
                                               "(File > Build Profiles). Nothing happens.");
                return false;
            }

            TravelAsync();
            return true;
        }

        private void OnEnable()
        {
            // GDD 02 7.3 "Mehrstufige Wege": quest stages inside a dungeon name the entrance as a marker target, so the compass
            // outside points at the entrance first.
            _marker.Show(ObjectId, transform);
        }

        private void OnDisable()
        {
            _marker.Hide();
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                if (locator != null)
                {
                    locator.TryGet(out _scenes);
                    locator.TryGet(out _travel);
                    locator.TryGet(out _autosave);
                    _marker.Connect(locator);
                }

                if (_scenes == null)
                {
                    Log.Warning(LogCategory.World, "Portal '" + ObjectId + "': no ISceneLoader registered, the exit cannot be used.");
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "Portal '" + ObjectId + "' could not resolve its services.");
            }
        }

        private async void TravelAsync()
        {
            // async void: started from Interact (Unity adapter); this object is destroyed with its scene during the change,
            // so only cached services are used after the first await (no Unity members, no destroyCancellationToken).
            _travelling = true;
            IGameStateService gameState = _gameState;
            ISceneLoader scenes = _scenes;
            string sceneKey = TargetSceneKey;
            string id = ObjectId;
            try
            {
                if (autosaveBeforeTravel && _autosave != null)
                {
                    _autosave.RequestAutosave(id);
                }

                if (_travel != null)
                {
                    _travel.SetPendingAnchor(TargetAnchorId);
                }

                if (!gameState.SwitchBase(GameState.Loading, "Portal " + id))
                {
                    _travelling = false;
                    return;
                }

                Log.Info(LogCategory.World, "Portal '" + id + "': travelling to '" + sceneKey + "'.");
                SceneHandle scene = await scenes.ChangeWorldSpaceAsync(new WorldSpaceRequest(sceneKey, targetTitle, false), CancellationToken.None);
                if (!scene.IsValid)
                {
                    Log.Error(LogCategory.World, "Portal '" + id + "': the scene '" + sceneKey + "' could not be loaded.");
                }

                // Two frames, so the objects of the new scene run Awake/Start (arrival anchor, spawn point, saveables).
                await Awaitable.NextFrameAsync(CancellationToken.None);
                await Awaitable.NextFrameAsync(CancellationToken.None);
                if (gameState.Current == GameState.Loading)
                {
                    gameState.SwitchBase(GameState.Playing, "Portal " + id);
                }
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "Portal '" + id + "': travel failed.");
                if (gameState.Current == GameState.Loading)
                {
                    gameState.SwitchBase(GameState.Playing, "Portal failed");
                }
            }
            finally
            {
                _travelling = false;
            }
        }
    }
}
