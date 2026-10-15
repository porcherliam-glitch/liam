using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Marks a climbable surface (GDD 03 3.3, GDD 05 3.2: pale worn rock, vines, ladders): walking into it makes the player
    /// climb. A rest point (a ledge in the wall) costs no stamina; at the top edge the player climbs over if
    /// <see cref="AllowTopOut"/> is set.
    /// </summary>
    /// <remarks>GameObject: the wall or ladder with its collider (layer Environment).</remarks>
    [DisallowMultipleComponent]
    public sealed class ClimbSurface : MonoBehaviour
    {
        [Tooltip("Art der Fläche: Fels, Ranken oder Leiter.")]
        [SerializeField] private ClimbSurfaceKind kind = ClimbSurfaceKind.Rock;

        [Tooltip("Rastpunkt: kein Ausdauerverbrauch, solange man hier hängt.")]
        [SerializeField] private bool restPoint = false;

        [Tooltip("Oben über die Kante steigen (sonst endet die Fläche oben).")]
        [SerializeField] private bool allowTopOut = true;

        /// <summary>Kind of surface.</summary>
        public ClimbSurfaceKind Kind => kind;

        /// <summary>True on a rest point.</summary>
        public bool RestPoint => restPoint;

        /// <summary>True if the player may climb over the top edge.</summary>
        public bool AllowTopOut => allowTopOut;
    }
}
