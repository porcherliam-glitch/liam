using System;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// One node of a trail ("Folge der Spur", GDD 02 5.1 type 17): sends <c>TrailNodeReached(trailId, index)</c> when the player
    /// enters the trigger volume. The quest objective <c>FollowTrailObjective</c> counts the highest reached node; skipping nodes
    /// is allowed, the last node fulfils it.
    /// </summary>
    /// <remarks>
    /// GameObject: one per node on the layer TriggerVolume (14, architecture 2.8) with a trigger collider (a CapsuleCollider with
    /// "Is Trigger") and a kinematic Rigidbody, so the player's CharacterController always raises trigger messages. The menu
    /// "Aetherfall > Eichental erstellen" creates them from the <c>trails</c> of the layout file. Entering again sends the event
    /// again; the objective ignores nodes that are not further than the progress.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class TrailNodeTrigger : MonoBehaviour
    {
        [Tooltip("Spur-ID, z. B. spur.eichental.wolfsspur (GDD 02, Abschnitt 11).")]
        [SerializeField] private string trailId = "spur.region.name";

        [Tooltip("Nummer des Knotens, 0 = erster Knoten.")]
        [Min(0)] [SerializeField] private int index;

        [Tooltip("Layer, die als Spieler zählen (Architektur 2.8: Layer 6 „Player“).")]
        [SerializeField] private LayerMask playerLayers = 1 << 6;

        private readonly WorldMarkerHandle _marker = new WorldMarkerHandle();
        private IEventBus _eventBus;

        /// <summary>Trail id.</summary>
        public string TrailId => trailId ?? string.Empty;

        /// <summary>Index of the node (0 = first).</summary>
        public int Index => index;

        private void Awake()
        {
            if (TryGetComponent(out Collider zone) && !zone.isTrigger)
            {
                Log.Warning(LogCategory.World, "TrailNodeTrigger '" + name + "': the collider is not a trigger - switched to 'Is Trigger'.");
                zone.isTrigger = true;
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _eventBus = await Services.WaitForAsync<IEventBus>(destroyCancellationToken);
                _marker.Connect(Services.Locator);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "TrailNodeTrigger could not resolve IEventBus.");
            }
        }

        private void OnEnable()
        {
            // "Folge der Spur" points the compass at the next node (trailId#index).
            _marker.Show(WorldMarkerIds.TrailNode(TrailId, index), transform);
        }

        private void OnDisable()
        {
            _marker.Hide();
        }

        private void OnTriggerEnter(Collider other)
        {
            if (other == null || (playerLayers.value & (1 << other.gameObject.layer)) == 0 || _eventBus == null)
            {
                return;
            }

            Log.Debug(LogCategory.World, "Trail node reached: " + TrailId + " #" + index);
            var reached = new TrailNodeReached(TrailId, index);
            _eventBus.Publish(in reached);
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = new Color(0.96f, 0.82f, 0.42f);
            Gizmos.DrawWireSphere(transform.position, 0.6f);
        }
    }
}
