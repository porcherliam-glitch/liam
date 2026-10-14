using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Arrival point of a scene change (architecture 10.8: "Spieler am Eingangs-Anker"): if the <see cref="IWorldTravelService"/>
    /// expects the player at this anchor, the anchor moves the spawn point of the scene to its own pose in <c>Awake</c> – before
    /// the spawn point places the player (Loading → Playing). Without a pending anchor (new game, start in the editor) the spawn
    /// point stays where it is.
    /// </summary>
    /// <remarks>
    /// GameObject: an empty object at the arrival pose (position on the floor, Y rotation = view direction). <see cref="spawnPoint"/>
    /// is the transform of the scene's PlayerSpawnPoint (World may not reference the player assembly, so it moves the transform).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class ArrivalAnchor : MonoBehaviour
    {
        [Tooltip("Anker-ID, z. B. anchor.gruft.eingang oder anchor.eichental.gruft_eingang.")]
        [SerializeField] private string anchorId = "anchor.neu";

        [Tooltip("Transform des PlayerSpawnPoint dieser Szene.")]
        [SerializeField] private Transform spawnPoint = null;

        /// <summary>Anchor id.</summary>
        public string AnchorId => anchorId ?? string.Empty;

        /// <summary>True if the player arrived here in this scene lifetime.</summary>
        public bool Arrived { get; private set; }

        /// <summary>Moves the spawn point to this anchor (also used by tests and debug tools).</summary>
        public void MoveSpawnPointHere()
        {
            if (spawnPoint == null)
            {
                Log.Warning(LogCategory.World, "ArrivalAnchor '" + AnchorId + "': the field 'Spawn Point' is empty.");
                return;
            }

            spawnPoint.SetPositionAndRotation(transform.position, Quaternion.Euler(0f, transform.eulerAngles.y, 0f));
        }

        private void Awake()
        {
            IServiceLocator locator = Services.Locator;
            if (locator == null || !locator.TryGet(out IWorldTravelService travel))
            {
                return;
            }

            if (travel.TryConsume(AnchorId))
            {
                MoveSpawnPointHere();
                Arrived = true;
                Log.Info(LogCategory.World, "Arrival at anchor '" + AnchorId + "'.");
            }
        }

        private void OnDrawGizmos()
        {
            Vector3 position = transform.position;
            Vector3 forward = Quaternion.Euler(0f, transform.eulerAngles.y, 0f) * Vector3.forward;
            Gizmos.color = new Color(0.18f, 0.9f, 0.84f, 0.9f);
            Gizmos.DrawWireCube(position + Vector3.up * 0.05f, new Vector3(1f, 0.1f, 1f));
            Gizmos.DrawLine(position + Vector3.up * 0.5f, position + Vector3.up * 0.5f + forward * 1.5f);
        }
    }
}
