using System;
using UnityEngine;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// A place on the world map (S34/S63, GDD 01 6.6): a location of the region layout with the name shown on the map, its kind
    /// (settlement, point of interest, dungeon entrance, viewpoint), position and size, and for viewpoints the reveal radius.
    /// Places with <see cref="ShowOnMap"/> get an icon and an "Ort entdeckt" message; others (sub-zones such as the village
    /// square) only clear fog.
    /// </summary>
    [Serializable]
    public sealed class MapPlace
    {
        [SerializeField] private string id = string.Empty;
        [SerializeField] private string displayName = string.Empty;
        [SerializeField] private LocationKind kind = LocationKind.Poi;
        [SerializeField] private float x;
        [SerializeField] private float z;
        [SerializeField] private float radius = 10f;
        [SerializeField] private bool showOnMap;
        [SerializeField] private float revealRadius;
        [SerializeField] private float boxWidth;
        [SerializeField] private float boxDepth;
        [SerializeField] private float boxYaw;

        /// <summary>Creates a place (generator, tests).</summary>
        /// <param name="id">Location id, e.g. <c>loc.eichental.lindenhain</c>.</param>
        /// <param name="displayName">Name on the map (German).</param>
        /// <param name="kind">Kind of the place.</param>
        /// <param name="x">Centre x in world metres.</param>
        /// <param name="z">Centre z in world metres.</param>
        /// <param name="radius">Radius of the place in metres.</param>
        /// <param name="showOnMap">True: icon, name and discovery message.</param>
        /// <param name="revealRadius">Viewpoints: fog cleared around them on activation (metres), otherwise 0.</param>
        /// <param name="boxWidth">Box places: width along their local x (0 = a circle of <paramref name="radius"/>).</param>
        /// <param name="boxDepth">Box places: depth along their local z.</param>
        /// <param name="boxYaw">Box places: rotation in degrees.</param>
        public MapPlace(string id, string displayName, LocationKind kind, float x, float z, float radius, bool showOnMap, float revealRadius,
            float boxWidth = 0f, float boxDepth = 0f, float boxYaw = 0f)
        {
            this.id = id ?? string.Empty;
            this.displayName = displayName ?? string.Empty;
            this.kind = kind;
            this.x = x;
            this.z = z;
            this.radius = radius;
            this.showOnMap = showOnMap;
            this.revealRadius = revealRadius;
            this.boxWidth = boxWidth;
            this.boxDepth = boxDepth;
            this.boxYaw = boxYaw;
        }

        /// <summary>Location id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>Name on the map.</summary>
        public string DisplayName => string.IsNullOrEmpty(displayName) ? Id : displayName;

        /// <summary>Kind.</summary>
        public LocationKind Kind => kind;

        /// <summary>Centre x in world metres.</summary>
        public float X => x;

        /// <summary>Centre z in world metres.</summary>
        public float Z => z;

        /// <summary>Radius in metres.</summary>
        public float Radius => radius;

        /// <summary>True if the map shows an icon and the discovery raises a message.</summary>
        public bool ShowOnMap => showOnMap;

        /// <summary>True for a viewpoint (found only by climbing up and activating it).</summary>
        public bool IsViewpoint => kind == LocationKind.Viewpoint;

        /// <summary>Viewpoints: fog cleared around them on activation in metres.</summary>
        public float RevealRadius => revealRadius;

        /// <summary>True for a box-shaped place (otherwise a circle).</summary>
        public bool IsBox => boxWidth > 0f && boxDepth > 0f;

        /// <summary>True if the point lies in the place (circle, or the rotated box like its location trigger).</summary>
        /// <param name="px">World x.</param>
        /// <param name="pz">World z.</param>
        public bool Contains(float px, float pz)
        {
            if (!IsBox)
            {
                float dx = px - x;
                float dz = pz - z;
                return dx * dx + dz * dz <= radius * radius;
            }

            LayoutPoint local = LayoutGeometry.ToLocal(px - x, pz - z, boxYaw);
            return Math.Abs(local.X) <= boxWidth * 0.5 && Math.Abs(local.Z) <= boxDepth * 0.5;
        }
    }
}
