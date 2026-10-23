using System.Collections.Generic;
using Aetherfall.World.Dungeons;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Shared state of one run of the crypt builder: layout, geometry, materials, layers, the protocol and the objects built so
    /// far by id (puzzles, doors and the boss refer to each other).
    /// </summary>
    public sealed class GruftContext
    {
        private readonly Dictionary<string, GameObject> _objects = new Dictionary<string, GameObject>();

        /// <summary>Creates the context.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="geometry">Geometry of the layout.</param>
        /// <param name="materials">Materials.</param>
        /// <param name="report">Protocol.</param>
        public GruftContext(DungeonLayout layout, DungeonGeometry geometry, GruftMaterials materials, TestGroundReport report)
        {
            Layout = layout;
            Geometry = geometry;
            Materials = materials;
            Report = report;
        }

        /// <summary>The layout.</summary>
        public DungeonLayout Layout { get; }

        /// <summary>The geometry.</summary>
        public DungeonGeometry Geometry { get; }

        /// <summary>Materials.</summary>
        public GruftMaterials Materials { get; }

        /// <summary>Protocol.</summary>
        public TestGroundReport Report { get; }

        /// <summary>Font of the 3D texts (may be null).</summary>
        public Font Font { get; set; }

        /// <summary>Layer Player.</summary>
        public int PlayerLayer { get; set; }

        /// <summary>Layer Environment.</summary>
        public int EnvironmentLayer { get; set; }

        /// <summary>Layer Enemy.</summary>
        public int EnemyLayer { get; set; } = -1;

        /// <summary>Layer Hurtbox.</summary>
        public int HurtboxLayer { get; set; } = -1;

        /// <summary>Layer Interactable.</summary>
        public int InteractableLayer { get; set; } = -1;

        /// <summary>Layer TriggerVolume.</summary>
        public int TriggerVolumeLayer { get; set; } = -1;

        /// <summary>Layer Pickup.</summary>
        public int PickupLayer { get; set; } = -1;

        /// <summary>Root of the scene content.</summary>
        public Transform Root { get; set; }

        /// <summary>Transform of the PlayerSpawnPoint.</summary>
        public Transform SpawnPoint { get; set; }

        /// <summary>Lights where daylight falls in (S35: they follow the valley's sun).</summary>
        public List<Light> DaylightLights { get; } = new List<Light>();

        /// <summary>Exit openings with the daylight material (S35: night material at night).</summary>
        public List<Renderer> DaylightRenderers { get; } = new List<Renderer>();

        /// <summary>Interactable layer or 0.</summary>
        public int InteractLayerOrDefault => InteractableLayer >= 0 ? InteractableLayer : 0;

        /// <summary>TriggerVolume layer or 0 ("Default").</summary>
        public int TriggerLayerOrDefault => TriggerVolumeLayer >= 0 ? TriggerVolumeLayer : 0;

        /// <summary>Remembers an object by id.</summary>
        /// <param name="id">Id.</param>
        /// <param name="value">Object.</param>
        public void Register(string id, GameObject value)
        {
            if (!string.IsNullOrEmpty(id) && value != null)
            {
                _objects[id] = value;
            }
        }

        /// <summary>An object built before, or null.</summary>
        /// <param name="id">Id.</param>
        public GameObject Get(string id)
        {
            return !string.IsNullOrEmpty(id) && _objects.TryGetValue(id, out GameObject value) ? value : null;
        }

        /// <summary>A component of an object built before, or null.</summary>
        /// <typeparam name="T">Component type.</typeparam>
        /// <param name="id">Id.</param>
        public T Get<T>(string id) where T : Component
        {
            GameObject value = Get(id);
            return value != null ? value.GetComponentInChildren<T>(true) : null;
        }

        /// <summary>Floor height at a point; points on a wall line take the nearest floor next to it.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public float FloorNear(float x, float z)
        {
            float floor = Geometry.FloorAt(x, z);
            if (!float.IsNaN(floor))
            {
                return floor;
            }

            float[] offsets = { 0.5f, -0.5f, 1f, -1f };
            for (int i = 0; i < offsets.Length; i++)
            {
                floor = Geometry.FloorAt(x + offsets[i], z);
                if (!float.IsNaN(floor))
                {
                    return floor;
                }

                floor = Geometry.FloorAt(x, z + offsets[i]);
                if (!float.IsNaN(floor))
                {
                    return floor;
                }
            }

            return 0f;
        }

        /// <summary>World position of a point: <paramref name="y"/> if set, else the floor, plus <paramref name="height"/>.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        /// <param name="y">Absolute height or NaN.</param>
        /// <param name="height">Height above it.</param>
        public Vector3 Position(float x, float z, float y, float height)
        {
            float baseY = float.IsNaN(y) ? FloorNear(x, z) : y;
            return new Vector3(x, baseY + height, z);
        }
    }
}
