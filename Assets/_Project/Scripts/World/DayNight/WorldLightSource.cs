using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// A fire or lamp the stealth AI counts (S35, GDD 03 9.2: at night within 5 m of a lit source the light factor is 0.9). Registers
    /// itself with the <see cref="ILightSourceRegistry"/> while enabled, so a fire switched off with its group (the prologue fire)
    /// stops counting. Its own position is the point that counts, so the generator can put it at player height under a high light.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class WorldLightSource : MonoBehaviour, IWorldLightSource
    {
        [Tooltip("Das Licht, das brennen muss, damit die Quelle zählt.")]
        [SerializeField] private Light lightComponent = null;

        [Tooltip("Reichweite für die Schleich-KI in Metern (GDD 03, 9.2: 5 m).")]
        [Min(0.5f)] [SerializeField] private float radius = 5f;

        [Tooltip("Folgt der Tageszeit (tags schwächer, nachts voll); aus für Licht mit fester Stärke wie den Aether-Riss.")]
        [SerializeField] private bool followsDayCycle = true;

        private ILightSourceRegistry _registry;
        private bool _registered;

        /// <inheritdoc />
        public Vector3 Position => transform.position;

        /// <inheritdoc />
        public float Radius => radius;

        /// <inheritdoc />
        public bool IsLit => isActiveAndEnabled && lightComponent != null && lightComponent.enabled && lightComponent.gameObject.activeInHierarchy &&
                             lightComponent.intensity > 0.05f;

        /// <summary>The light (the scene rig scales it with the time of day if <see cref="FollowsDayCycle"/>).</summary>
        public Light Light => lightComponent;

        /// <summary>True if the light follows the time of day.</summary>
        public bool FollowsDayCycle => followsDayCycle;

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _registry = await Services.WaitForAsync<ILightSourceRegistry>(destroyCancellationToken);
                Register();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "WorldLightSource '" + name + "' could not resolve ILightSourceRegistry.");
            }
        }

        private void OnEnable()
        {
            Register();
        }

        private void OnDisable()
        {
            if (_registered && _registry != null)
            {
                _registry.Unregister(this);
            }

            _registered = false;
        }

        private void Register()
        {
            if (!_registered && _registry != null && isActiveAndEnabled)
            {
                _registry.Register(this);
                _registered = true;
            }
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = new Color(1f, 0.7f, 0.3f);
            Gizmos.DrawWireSphere(transform.position, radius);
        }
    }
}
