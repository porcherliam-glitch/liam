using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Layout of a region section (e.g. the Eichental mini slice), read from JSON by <see cref="RegionLayoutReader"/>. Coordinates in metres: x = east, z = north, origin = centre. Yaw in degrees clockwise, 0 = north.</summary>
    public sealed class RegionLayout
    {
        /// <summary>Schema version of the file (<see cref="RegionLayoutReader.SupportedSchemaVersion"/>).</summary>
        public int SchemaVersion { get; internal set; }

        /// <summary>Layout id, e.g. <c>layout.eichental.mini_slice</c>.</summary>
        public string LayoutId { get; internal set; } = string.Empty;

        /// <summary>Region id, e.g. <c>region.eichental</c>.</summary>
        public string RegionId { get; internal set; } = string.Empty;

        /// <summary>Display name (German).</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Title of the loading screen (German).</summary>
        public string SceneTitle { get; internal set; } = string.Empty;

        /// <summary>World space id stored in saves, e.g. <c>worldspace.eichental.mini_slice</c>.</summary>
        public string WorldSpaceId { get; internal set; } = string.Empty;

        /// <summary>Area level of the section (default item level of chests).</summary>
        public int AreaLevel { get; internal set; }

        /// <summary>Terrain size, resolution and height features.</summary>
        public LayoutTerrain Terrain { get; internal set; }

        /// <summary>Named colours (GDD 05 3.3).</summary>
        public LayoutPalette Palette { get; internal set; }

        /// <summary>Sun, ambient light and fog.</summary>
        public LayoutLighting Lighting { get; internal set; }

        /// <summary>Day cycle (S35: light over the day), or null without the optional <c>dayCycle</c> block.</summary>
        public LayoutDayCycle DayCycle { get; internal set; }

        /// <summary>Brooks and rivers.</summary>
        public IReadOnlyList<LayoutRiver> Rivers { get; internal set; } = Array.Empty<LayoutRiver>();

        /// <summary>Roads and paths.</summary>
        public IReadOnlyList<LayoutPath> Paths { get; internal set; } = Array.Empty<LayoutPath>();

        /// <summary>Bridges.</summary>
        public IReadOnlyList<LayoutBridge> Bridges { get; internal set; } = Array.Empty<LayoutBridge>();

        /// <summary>Buildings.</summary>
        public IReadOnlyList<LayoutBuilding> Buildings { get; internal set; } = Array.Empty<LayoutBuilding>();

        /// <summary>Fences.</summary>
        public IReadOnlyList<LayoutFence> Fences { get; internal set; } = Array.Empty<LayoutFence>();

        /// <summary>Fields.</summary>
        public IReadOnlyList<LayoutField> Fields { get; internal set; } = Array.Empty<LayoutField>();

        /// <summary>Circles that paint the ground (ash, dirt, rock).</summary>
        public IReadOnlyList<LayoutGroundZone> GroundZones { get; internal set; } = Array.Empty<LayoutGroundZone>();

        /// <summary>Trees, bushes and boulders.</summary>
        public LayoutVegetation Vegetation { get; internal set; }

        /// <summary>Explicit rocks of landmarks (Rabenfels, Wolfskopf).</summary>
        public IReadOnlyList<LayoutRock> Rocks { get; internal set; } = Array.Empty<LayoutRock>();

        /// <summary>Small objects (well, notice board, tents ...).</summary>
        public IReadOnlyList<LayoutProp> Props { get; internal set; } = Array.Empty<LayoutProp>();

        /// <summary>The Aether rift with its crater, or null.</summary>
        public LayoutRift Rift { get; internal set; }

        /// <summary>Location zones (AreaTrigger ids from GDD 02).</summary>
        public IReadOnlyList<LayoutLocation> Locations { get; internal set; } = Array.Empty<LayoutLocation>();

        /// <summary>Enemy spawners.</summary>
        public IReadOnlyList<LayoutSpawner> Spawners { get; internal set; } = Array.Empty<LayoutSpawner>();

        /// <summary>Chests.</summary>
        public IReadOnlyList<LayoutChest> Chests { get; internal set; } = Array.Empty<LayoutChest>();

        /// <summary>Harvest nodes (herbs; S30).</summary>
        public IReadOnlyList<LayoutHarvestNode> HarvestNodes { get; internal set; } = Array.Empty<LayoutHarvestNode>();

        /// <summary>Placeholder markers of NPCs.</summary>
        public IReadOnlyList<LayoutNpcMarker> NpcMarkers { get; internal set; } = Array.Empty<LayoutNpcMarker>();

        /// <summary>Placeholder quest objects (clues, targets, doors).</summary>
        public IReadOnlyList<LayoutQuestObject> QuestObjects { get; internal set; } = Array.Empty<LayoutQuestObject>();

        /// <summary>Trails of "Folge der Spur" objectives (node triggers).</summary>
        public IReadOnlyList<LayoutTrail> Trails { get; internal set; } = Array.Empty<LayoutTrail>();

        /// <summary>Start position of a new game.</summary>
        public LayoutPlayerStart PlayerStart { get; internal set; }
    }
}
