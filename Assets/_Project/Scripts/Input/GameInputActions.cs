using System;
using UnityEngine;
using UnityEngine.InputSystem;
using Object = UnityEngine.Object;

namespace Aetherfall.Input
{
    /// <summary>
    /// The one run-time instance of the game's input actions (architecture 11.1 "Instanz"): an
    /// <see cref="InputActionAsset"/> built in code by <see cref="GameInputBindings"/> with the maps Gameplay, UI, Dialog,
    /// Riding and Building. Owned by <see cref="InputService"/>; other systems read input through
    /// <see cref="IInputService"/>.
    /// </summary>
    /// <remarks>
    /// <para>Built in code instead of an <c>.inputactions</c> file so that the bindings live in the repository as reviewable
    /// code and no asset has to be created by hand. The template asset <c>InputSystem_Actions.inputactions</c> (project-wide
    /// actions) is not used by the game.</para>
    /// <para>All maps start disabled; <see cref="InputService"/> enables exactly one of them (<see cref="ActionMapTable"/>).</para>
    /// </remarks>
    public sealed class GameInputActions : IDisposable
    {
        private readonly InputActionMap[] _maps;
        private bool _disposed;

        private GameInputActions(InputActionAsset asset)
        {
            Asset = asset;
            Gameplay = asset.FindActionMap(InputActionNames.Gameplay.MapName, true);
            UI = asset.FindActionMap(InputActionNames.UI.MapName, true);
            Dialog = asset.FindActionMap(InputActionNames.Dialog.MapName, true);
            Riding = asset.FindActionMap(InputActionNames.Riding.MapName, true);
            Building = asset.FindActionMap(InputActionNames.Building.MapName, true);
            _maps = new[] { null, Gameplay, UI, Dialog, Riding, Building };
        }

        /// <summary>The action asset (for the UI input module, rebinding and glyph lookup).</summary>
        public InputActionAsset Asset { get; }

        /// <summary>Gameplay map (on foot).</summary>
        public InputActionMap Gameplay { get; }

        /// <summary>UI map (menus, hub, pause menu, cutscenes).</summary>
        public InputActionMap UI { get; }

        /// <summary>Dialog map.</summary>
        public InputActionMap Dialog { get; }

        /// <summary>Riding map.</summary>
        public InputActionMap Riding { get; }

        /// <summary>Building map.</summary>
        public InputActionMap Building { get; }

        /// <summary>Creates a new asset with all maps and bindings (all maps disabled).</summary>
        /// <returns>The new instance; dispose it to destroy the asset.</returns>
        public static GameInputActions Create()
        {
            InputActionAsset asset = ScriptableObject.CreateInstance<InputActionAsset>();
            asset.name = "AetherfallInput (runtime)";
            GameInputBindings.Populate(asset);
            return new GameInputActions(asset);
        }

        /// <summary>Returns the map of an <see cref="ActionMapId"/>; null for <see cref="ActionMapId.None"/>.</summary>
        /// <param name="id">Map identifier.</param>
        public InputActionMap GetMap(ActionMapId id)
        {
            int index = (int)id;
            return index >= 0 && index < _maps.Length ? _maps[index] : null;
        }

        /// <summary>Returns an action of a map; throws with the full name if it does not exist.</summary>
        /// <param name="map">Map identifier (not <see cref="ActionMapId.None"/>).</param>
        /// <param name="actionName">Action name from <see cref="InputActionNames"/>.</param>
        /// <exception cref="ArgumentException">The map or the action does not exist.</exception>
        public InputAction GetAction(ActionMapId map, string actionName)
        {
            InputActionMap actionMap = GetMap(map);
            if (actionMap == null)
            {
                throw new ArgumentException("No action map for " + map + ".", nameof(map));
            }

            return actionMap.FindAction(actionName, true);
        }

        /// <summary>Enables exactly one map and disables all others (<see cref="ActionMapId.None"/> disables all).</summary>
        /// <param name="active">Map to enable.</param>
        public void EnableOnly(ActionMapId active)
        {
            if (_disposed)
            {
                return;
            }

            // Disable first, so two maps are never enabled at the same time (no attack on a menu click).
            for (int i = 1; i < _maps.Length; i++)
            {
                if (i != (int)active && _maps[i].enabled)
                {
                    _maps[i].Disable();
                }
            }

            InputActionMap map = GetMap(active);
            if (map != null && !map.enabled)
            {
                map.Enable();
            }
        }

        /// <summary>Disables all maps and destroys the asset.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            if (Asset == null)
            {
                return;
            }

            Asset.Disable();
            if (Application.isPlaying)
            {
                Object.Destroy(Asset);
            }
            else
            {
                Object.DestroyImmediate(Asset);
            }
        }
    }
}
