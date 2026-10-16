using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Reads a region layout from JSON (e.g. <c>Assets/_Project/Data/Regions/Eichental/eichental_layout.json</c>) into a
    /// <see cref="RegionLayout"/>. Structural problems (missing required fields, wrong types, unknown values, unknown keys) go
    /// into the <see cref="LayoutReport"/> with their JSON path; semantic checks follow in <see cref="RegionLayoutValidator"/>.
    /// Pure C#; the Unity generator and the EditMode tests use the same code.
    /// </summary>
    public static class RegionLayoutReader
    {
        /// <summary>Schema version this reader understands.</summary>
        public const int SupportedSchemaVersion = 1;

        internal static readonly KeyValuePair<string, TerrainFeatureKind>[] FeatureKinds =
        {
            Pair("slope", TerrainFeatureKind.Slope), Pair("hill", TerrainFeatureKind.Hill), Pair("flatten", TerrainFeatureKind.Flatten)
        };

        internal static readonly KeyValuePair<string, BuildingKind>[] BuildingKinds =
        {
            Pair("house", BuildingKind.House), Pair("smithy", BuildingKind.Smithy), Pair("tavern", BuildingKind.Tavern),
            Pair("mill", BuildingKind.Mill), Pair("barn", BuildingKind.Barn), Pair("chapel", BuildingKind.Chapel),
            Pair("ruin", BuildingKind.Ruin), Pair("guardpost", BuildingKind.Guardpost),
            Pair("watchtower", BuildingKind.Watchtower)
        };

        internal static readonly KeyValuePair<string, BuildingState>[] BuildingStates =
        {
            Pair("intact", BuildingState.Intact), Pair("burned", BuildingState.Burned), Pair("collapsed", BuildingState.Collapsed)
        };

        internal static readonly KeyValuePair<string, RoofKind>[] RoofKinds =
        {
            Pair("gable", RoofKind.Gable), Pair("lean_to", RoofKind.LeanTo), Pair("none", RoofKind.None)
        };

        internal static readonly KeyValuePair<string, BridgeKind>[] BridgeKinds =
        {
            Pair("stone", BridgeKind.Stone), Pair("wood", BridgeKind.Wood)
        };

        internal static readonly KeyValuePair<string, FieldCrop>[] FieldCrops = { Pair("wheat", FieldCrop.Wheat) };

        internal static readonly KeyValuePair<string, FieldState>[] FieldStates =
        {
            Pair("ripe", FieldState.Ripe), Pair("burned", FieldState.Burned), Pair("stubble", FieldState.Stubble)
        };

        internal static readonly KeyValuePair<string, GroundKind>[] GroundKinds =
        {
            Pair("grass", GroundKind.Grass), Pair("dirt", GroundKind.Dirt), Pair("rock", GroundKind.Rock), Pair("ash", GroundKind.Ash)
        };

        internal static readonly KeyValuePair<string, VegetationKind>[] VegetationKinds =
        {
            Pair("oak", VegetationKind.Oak), Pair("beech", VegetationKind.Beech), Pair("birch", VegetationKind.Birch),
            Pair("linden", VegetationKind.Linden), Pair("dead", VegetationKind.Dead), Pair("bush", VegetationKind.Bush),
            Pair("rock", VegetationKind.Rock)
        };

        internal static readonly KeyValuePair<string, PropKind>[] PropKinds =
        {
            Pair("well", PropKind.Well), Pair("campfire", PropKind.Campfire), Pair("cart", PropKind.Cart), Pair("signpost", PropKind.Signpost),
            Pair("wayside_cross", PropKind.WaysideCross), Pair("barricade", PropKind.Barricade), Pair("notice_board", PropKind.NoticeBoard),
            Pair("tent", PropKind.Tent), Pair("hay_bale", PropKind.HayBale), Pair("sheep", PropKind.Sheep), Pair("crate_stack", PropKind.CrateStack),
            Pair("barrel", PropKind.Barrel), Pair("crypt_entrance", PropKind.CryptEntrance), Pair("cave_mouth", PropKind.CaveMouth),
            Pair("cairn", PropKind.Cairn), Pair("oil_barrel", PropKind.OilBarrel), Pair("powder_keg", PropKind.PowderKeg)
        };

        internal static readonly KeyValuePair<string, LocationKind>[] LocationKinds =
        {
            Pair("settlement", LocationKind.Settlement), Pair("poi", LocationKind.Poi), Pair("area", LocationKind.Area),
            Pair("dungeon_entrance", LocationKind.DungeonEntrance), Pair("viewpoint", LocationKind.Viewpoint)
        };

        internal static readonly KeyValuePair<string, LocationShape>[] LocationShapes =
        {
            Pair("circle", LocationShape.Circle), Pair("box", LocationShape.Box)
        };

        internal static readonly KeyValuePair<string, SpawnActivation>[] SpawnActivations =
        {
            Pair("always", SpawnActivation.Always), Pair("quest", SpawnActivation.Quest)
        };

        internal static readonly KeyValuePair<string, LayoutChestTier>[] ChestTiers =
        {
            Pair("wooden", LayoutChestTier.Wooden), Pair("iron", LayoutChestTier.Iron), Pair("hidden", LayoutChestTier.Hidden)
        };

        internal static readonly KeyValuePair<string, NpcMarkerPhase>[] NpcPhases =
        {
            Pair("always", NpcMarkerPhase.Always), Pair("prolog", NpcMarkerPhase.Prolog), Pair("after_prolog", NpcMarkerPhase.AfterProlog)
        };

        internal static readonly KeyValuePair<string, QuestObjectKind>[] QuestObjectKinds =
        {
            Pair("beam", QuestObjectKind.Beam), Pair("door", QuestObjectKind.Door), Pair("clue", QuestObjectKind.Clue),
            Pair("straw_target", QuestObjectKind.StrawTarget), Pair("corpse", QuestObjectKind.Corpse),
            Pair("aether_shard", QuestObjectKind.AetherShard), Pair("pup", QuestObjectKind.Pup)
        };

        /// <summary>Reads the layout. Returns null if the text is no JSON object or the schema version is unknown.</summary>
        /// <param name="json">JSON text.</param>
        /// <param name="report">Receives all findings.</param>
        public static RegionLayout Read(string json, LayoutReport report)
        {
            if (report == null)
            {
                throw new System.ArgumentNullException(nameof(report));
            }

            JsonNode root;
            try
            {
                root = LayoutJsonParser.Parse(json);
            }
            catch (LayoutFormatException exception)
            {
                report.Error("(Datei)", "Kein gültiges JSON: " + exception.Message);
                return null;
            }

            if (root.Kind != JsonNodeKind.Object)
            {
                report.Error("(Datei)", "Die Datei muss ein JSON-Objekt { … } sein.");
                return null;
            }

            var ctx = new LayoutJsonContext(report);
            ctx.Known(root, string.Empty, "schemaVersion", "layoutId", "regionId", "name", "sceneTitle", "worldSpaceId", "areaLevel", "notes",
                "sizeRationale", "terrain", "palette", "lighting", "rivers", "paths", "bridges", "buildings", "fences", "fields", "groundZones",
                "vegetation", "rocks", "props", "rift", "locations", "spawners", "chests", "npcMarkers", "questObjects", "trails", "playerStart");
            int schema = ctx.Integer(root, "schemaVersion", string.Empty);
            if (schema != SupportedSchemaVersion)
            {
                report.Error("schemaVersion", "Schema-Version " + schema + " wird nicht unterstützt (erwartet: " + SupportedSchemaVersion + ").");
                return null;
            }

            var layout = new RegionLayout
            {
                SchemaVersion = schema,
                LayoutId = ctx.String(root, "layoutId", string.Empty),
                RegionId = ctx.String(root, "regionId", string.Empty),
                Name = ctx.String(root, "name", string.Empty),
                SceneTitle = ctx.String(root, "sceneTitle", string.Empty, string.Empty),
                WorldSpaceId = ctx.String(root, "worldSpaceId", string.Empty),
                AreaLevel = ctx.Integer(root, "areaLevel", string.Empty, 1),
                Terrain = ReadTerrain(ctx, ctx.Object(root, "terrain", string.Empty, true), "terrain"),
                Palette = ReadPalette(ctx, ctx.Object(root, "palette", string.Empty, true), "palette"),
                Lighting = ReadLighting(ctx, ctx.Object(root, "lighting", string.Empty, true), "lighting"),
                Rivers = ReadList(ctx, root, "rivers", false, ReadRiver),
                Paths = ReadList(ctx, root, "paths", false, ReadPath),
                Bridges = ReadList(ctx, root, "bridges", false, ReadBridge),
                Buildings = ReadList(ctx, root, "buildings", false, ReadBuilding),
                Fences = ReadList(ctx, root, "fences", false, ReadFence),
                Fields = ReadList(ctx, root, "fields", false, ReadField),
                GroundZones = ReadList(ctx, root, "groundZones", false, ReadGroundZone),
                Vegetation = ReadVegetation(ctx, ctx.Object(root, "vegetation", string.Empty, false), "vegetation"),
                Rocks = ReadList(ctx, root, "rocks", false, ReadRock),
                Props = ReadList(ctx, root, "props", false, ReadProp),
                Locations = ReadList(ctx, root, "locations", true, ReadLocation),
                Spawners = ReadList(ctx, root, "spawners", false, ReadSpawner),
                Chests = ReadList(ctx, root, "chests", false, ReadChest),
                NpcMarkers = ReadList(ctx, root, "npcMarkers", false, ReadNpcMarker),
                QuestObjects = ReadList(ctx, root, "questObjects", false, ReadQuestObject),
                Trails = ReadList(ctx, root, "trails", false, ReadTrail),
                PlayerStart = ReadPlayerStart(ctx, ctx.Object(root, "playerStart", string.Empty, true), "playerStart")
            };
            JsonNode rift = ctx.Object(root, "rift", string.Empty, false);
            layout.Rift = rift != null ? ReadRift(ctx, rift, "rift") : null;
            return layout;
        }

        private static KeyValuePair<string, T> Pair<T>(string key, T value)
        {
            return new KeyValuePair<string, T>(key, value);
        }

        private static IReadOnlyList<T> ReadList<T>(LayoutJsonContext ctx, JsonNode root, string key, bool required,
            System.Func<LayoutJsonContext, JsonNode, string, T> read)
        {
            IReadOnlyList<JsonNode> items = ctx.Array(root, key, string.Empty, required);
            var list = new List<T>(items.Count);
            for (int i = 0; i < items.Count; i++)
            {
                string path = LayoutJsonContext.Index(key, i);
                if (ctx.IsObject(items[i], path))
                {
                    list.Add(read(ctx, items[i], path));
                }
            }

            return list;
        }

        private static LayoutTerrain ReadTerrain(LayoutJsonContext ctx, JsonNode node, string path)
        {
            var terrain = new LayoutTerrain();
            if (node == null)
            {
                return terrain;
            }

            ctx.Known(node, path, "size", "heightmapResolution", "alphamapResolution", "maxHeight", "baseHeight", "playableBounds", "border",
                "noise", "features");
            terrain.Size = ctx.Number(node, "size", path);
            terrain.HeightmapResolution = ctx.Integer(node, "heightmapResolution", path);
            terrain.AlphamapResolution = ctx.Integer(node, "alphamapResolution", path);
            terrain.MaxHeight = ctx.Number(node, "maxHeight", path);
            terrain.BaseHeight = ctx.Number(node, "baseHeight", path);
            JsonNode bounds = ctx.Object(node, "playableBounds", path, true);
            string boundsPath = LayoutJsonContext.Join(path, "playableBounds");
            ctx.Known(bounds, boundsPath, "min", "max");
            terrain.PlayableBounds = bounds == null
                ? default
                : new LayoutBounds(ctx.Point(bounds, "min", boundsPath), ctx.Point(bounds, "max", boundsPath));
            JsonNode border = ctx.Object(node, "border", path, false);
            if (border != null)
            {
                string borderPath = LayoutJsonContext.Join(path, "border");
                ctx.Known(border, borderPath, "inset", "width", "height");
                terrain.Border = new LayoutBorder
                {
                    Inset = ctx.Number(border, "inset", borderPath, 0.0),
                    Width = ctx.Number(border, "width", borderPath),
                    Height = ctx.Number(border, "height", borderPath)
                };
            }

            var noise = new List<LayoutNoise>();
            IReadOnlyList<JsonNode> noiseItems = ctx.Array(node, "noise", path, false);
            for (int i = 0; i < noiseItems.Count; i++)
            {
                string p = LayoutJsonContext.Index(LayoutJsonContext.Join(path, "noise"), i);
                if (!ctx.IsObject(noiseItems[i], p))
                {
                    continue;
                }

                ctx.Known(noiseItems[i], p, "amplitude", "wavelength", "angle", "phase");
                noise.Add(new LayoutNoise
                {
                    Amplitude = ctx.Number(noiseItems[i], "amplitude", p),
                    Wavelength = ctx.Number(noiseItems[i], "wavelength", p),
                    Angle = ctx.Number(noiseItems[i], "angle", p, 0.0),
                    Phase = ctx.Number(noiseItems[i], "phase", p, 0.0)
                });
            }

            terrain.Noise = noise;
            var features = new List<TerrainFeature>();
            IReadOnlyList<JsonNode> featureItems = ctx.Array(node, "features", path, false);
            for (int i = 0; i < featureItems.Count; i++)
            {
                string p = LayoutJsonContext.Index(LayoutJsonContext.Join(path, "features"), i);
                if (ctx.IsObject(featureItems[i], p))
                {
                    features.Add(ReadFeature(ctx, featureItems[i], p));
                }
            }

            terrain.Features = features;
            return terrain;
        }

        private static TerrainFeature ReadFeature(LayoutJsonContext ctx, JsonNode node, string path)
        {
            var feature = new TerrainFeature
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Kind = ctx.Token(node, "kind", path, FeatureKinds)
            };
            switch (feature.Kind)
            {
                case TerrainFeatureKind.Slope:
                    ctx.Known(node, path, "id", "name", "kind", "origin", "direction", "start", "end", "height", "halfWidth", "falloff");
                    feature.Origin = ctx.Point(node, "origin", path);
                    feature.Direction = ctx.Point(node, "direction", path);
                    feature.Start = ctx.Number(node, "start", path);
                    feature.End = ctx.Number(node, "end", path);
                    feature.Height = ctx.Number(node, "height", path);
                    feature.HasHeight = true;
                    feature.HasHalfWidth = ctx.TryNumber(node, "halfWidth", path, out double halfWidth);
                    feature.HalfWidth = halfWidth;
                    feature.Falloff = ctx.Number(node, "falloff", path, 0.0);
                    break;
                case TerrainFeatureKind.Hill:
                    ctx.Known(node, path, "id", "name", "kind", "center", "radius", "height");
                    feature.Center = ctx.Point(node, "center", path);
                    feature.Radius = ctx.Number(node, "radius", path);
                    feature.Height = ctx.Number(node, "height", path);
                    feature.HasHeight = true;
                    break;
                default:
                    ctx.Known(node, path, "id", "name", "kind", "center", "innerRadius", "outerRadius", "height");
                    feature.Center = ctx.Point(node, "center", path);
                    feature.InnerRadius = ctx.Number(node, "innerRadius", path);
                    feature.OuterRadius = ctx.Number(node, "outerRadius", path);
                    feature.HasHeight = ctx.TryNumber(node, "height", path, out double height);
                    feature.Height = height;
                    break;
            }

            return feature;
        }

        private static LayoutPalette ReadPalette(LayoutJsonContext ctx, JsonNode node, string path)
        {
            var palette = new LayoutPalette();
            if (node == null)
            {
                return palette;
            }

            IReadOnlyList<KeyValuePair<string, JsonNode>> members = node.Members;
            for (int i = 0; i < members.Count; i++)
            {
                palette.Set(members[i].Key, ctx.Color(node, members[i].Key, path));
            }

            return palette;
        }

        private static LayoutLighting ReadLighting(LayoutJsonContext ctx, JsonNode node, string path)
        {
            var lighting = new LayoutLighting();
            if (node == null)
            {
                return lighting;
            }

            ctx.Known(node, path, "sunAzimuth", "sunElevation", "sunColor", "sunIntensity", "ambientSky", "ambientEquator", "ambientGround",
                "fogColor", "fogDensity", "skyTop", "skyHorizon");
            lighting.SunAzimuth = ctx.Number(node, "sunAzimuth", path);
            lighting.SunElevation = ctx.Number(node, "sunElevation", path);
            lighting.SunColor = ctx.Color(node, "sunColor", path);
            lighting.SunIntensity = ctx.Number(node, "sunIntensity", path);
            lighting.AmbientSky = ctx.Color(node, "ambientSky", path);
            lighting.AmbientEquator = ctx.Color(node, "ambientEquator", path);
            lighting.AmbientGround = ctx.Color(node, "ambientGround", path);
            lighting.FogColor = ctx.Color(node, "fogColor", path);
            lighting.FogDensity = ctx.Number(node, "fogDensity", path);
            lighting.SkyTop = ctx.Color(node, "skyTop", path);
            lighting.SkyHorizon = ctx.Color(node, "skyHorizon", path);
            return lighting;
        }

        private static LayoutRiver ReadRiver(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "width", "bank", "depth", "waterDepth", "points");
            return new LayoutRiver
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Width = ctx.Number(node, "width", path),
                Bank = ctx.Number(node, "bank", path),
                Depth = ctx.Number(node, "depth", path),
                WaterDepth = ctx.Number(node, "waterDepth", path),
                Points = ctx.Points(node, "points", path, 2)
            };
        }

        private static LayoutPath ReadPath(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "width", "points");
            return new LayoutPath
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Width = ctx.Number(node, "width", path),
                Points = ctx.Points(node, "points", path, 2)
            };
        }

        private static LayoutBridge ReadBridge(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "kind", "position", "yaw", "length", "width");
            return new LayoutBridge
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Kind = ctx.Token(node, "kind", path, BridgeKinds, BridgeKind.Stone),
                Position = ctx.Point(node, "position", path),
                Yaw = ctx.Number(node, "yaw", path, 0.0),
                Length = ctx.Number(node, "length", path),
                Width = ctx.Number(node, "width", path)
            };
        }

        private static LayoutBuilding ReadBuilding(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "kind", "state", "position", "yaw", "size", "roof", "roofPitch", "glow");
            double[] size = ctx.Numbers(node, "size", path, 3);
            var building = new LayoutBuilding
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Kind = ctx.Token(node, "kind", path, BuildingKinds),
                State = ctx.Token(node, "state", path, BuildingStates, BuildingState.Intact),
                Position = ctx.Point(node, "position", path),
                Yaw = ctx.Number(node, "yaw", path, 0.0),
                Width = size[0],
                WallHeight = size[1],
                Depth = size[2],
                Roof = ctx.Token(node, "roof", path, RoofKinds, RoofKind.Gable),
                RoofPitch = ctx.Number(node, "roofPitch", path, 45.0),
                Glow = ctx.Boolean(node, "glow", path, false)
            };
            return building;
        }

        private static LayoutFence ReadFence(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "height", "closed", "points");
            return new LayoutFence
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Height = ctx.Number(node, "height", path, 1.0),
                Closed = ctx.Boolean(node, "closed", path, false),
                Points = ctx.Points(node, "points", path, 2)
            };
        }

        private static LayoutField ReadField(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "crop", "state", "center", "size", "yaw", "rowSpacing");
            double[] size = ctx.Numbers(node, "size", path, 2);
            return new LayoutField
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Crop = ctx.Token(node, "crop", path, FieldCrops, FieldCrop.Wheat),
                State = ctx.Token(node, "state", path, FieldStates, FieldState.Ripe),
                Center = ctx.Point(node, "center", path),
                Width = size[0],
                Depth = size[1],
                Yaw = ctx.Number(node, "yaw", path, 0.0),
                RowSpacing = ctx.Number(node, "rowSpacing", path, 1.4)
            };
        }

        private static LayoutGroundZone ReadGroundZone(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "ground", "center", "radius", "falloff", "strength");
            return new LayoutGroundZone
            {
                Id = ctx.String(node, "id", path),
                Ground = ctx.Token(node, "ground", path, GroundKinds),
                Center = ctx.Point(node, "center", path),
                Radius = ctx.Number(node, "radius", path),
                Falloff = ctx.Number(node, "falloff", path, 0.0),
                Strength = ctx.Number(node, "strength", path, 1.0)
            };
        }

        private static LayoutVegetation ReadVegetation(LayoutJsonContext ctx, JsonNode node, string path)
        {
            var vegetation = new LayoutVegetation { Clearance = new VegetationClearance() };
            if (node == null)
            {
                return vegetation;
            }

            ctx.Known(node, path, "clearance", "clearings", "groups", "trees");
            JsonNode clearance = ctx.Object(node, "clearance", path, false);
            if (clearance != null)
            {
                string p = LayoutJsonContext.Join(path, "clearance");
                ctx.Known(clearance, p, "paths", "rivers", "buildings", "fields", "rift", "fences");
                vegetation.Clearance = new VegetationClearance
                {
                    Paths = ctx.Number(clearance, "paths", p, 0.0),
                    Rivers = ctx.Number(clearance, "rivers", p, 0.0),
                    Buildings = ctx.Number(clearance, "buildings", p, 0.0),
                    Fields = ctx.Number(clearance, "fields", p, 0.0),
                    Rift = ctx.Number(clearance, "rift", p, 0.0),
                    Fences = ctx.Number(clearance, "fences", p, 0.0)
                };
            }

            var clearings = new List<LayoutCircle>();
            IReadOnlyList<JsonNode> clearingItems = ctx.Array(node, "clearings", path, false);
            for (int i = 0; i < clearingItems.Count; i++)
            {
                string p = LayoutJsonContext.Index(LayoutJsonContext.Join(path, "clearings"), i);
                if (!ctx.IsObject(clearingItems[i], p))
                {
                    continue;
                }

                ctx.Known(clearingItems[i], p, "id", "center", "radius");
                clearings.Add(new LayoutCircle
                {
                    Id = ctx.String(clearingItems[i], "id", p),
                    Center = ctx.Point(clearingItems[i], "center", p),
                    Radius = ctx.Number(clearingItems[i], "radius", p)
                });
            }

            vegetation.Clearings = clearings;
            var groups = new List<VegetationGroup>();
            IReadOnlyList<JsonNode> groupItems = ctx.Array(node, "groups", path, false);
            for (int i = 0; i < groupItems.Count; i++)
            {
                string p = LayoutJsonContext.Index(LayoutJsonContext.Join(path, "groups"), i);
                if (ctx.IsObject(groupItems[i], p))
                {
                    groups.Add(ReadGroup(ctx, groupItems[i], p));
                }
            }

            vegetation.Groups = groups;
            var trees = new List<LayoutTree>();
            IReadOnlyList<JsonNode> treeItems = ctx.Array(node, "trees", path, false);
            for (int i = 0; i < treeItems.Count; i++)
            {
                string p = LayoutJsonContext.Index(LayoutJsonContext.Join(path, "trees"), i);
                if (!ctx.IsObject(treeItems[i], p))
                {
                    continue;
                }

                ctx.Known(treeItems[i], p, "id", "name", "kind", "position", "scale", "yaw");
                trees.Add(new LayoutTree
                {
                    Id = ctx.String(treeItems[i], "id", p),
                    Name = ctx.String(treeItems[i], "name", p, string.Empty),
                    Kind = ctx.Token(treeItems[i], "kind", p, VegetationKinds),
                    Position = ctx.Point(treeItems[i], "position", p),
                    Scale = ctx.Number(treeItems[i], "scale", p, 1.0),
                    Yaw = ctx.Number(treeItems[i], "yaw", p, 0.0)
                });
            }

            vegetation.Trees = trees;
            return vegetation;
        }

        private static VegetationGroup ReadGroup(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "seed", "spacing", "density", "jitter", "scale", "species", "polygon");
            double[] scale = ctx.Numbers(node, "scale", path, 2);
            var species = new List<VegetationSpeciesWeight>();
            IReadOnlyList<JsonNode> speciesItems = ctx.Array(node, "species", path, true);
            for (int i = 0; i < speciesItems.Count; i++)
            {
                string p = LayoutJsonContext.Index(LayoutJsonContext.Join(path, "species"), i);
                if (!ctx.IsObject(speciesItems[i], p))
                {
                    continue;
                }

                ctx.Known(speciesItems[i], p, "kind", "weight");
                species.Add(new VegetationSpeciesWeight
                {
                    Kind = ctx.Token(speciesItems[i], "kind", p, VegetationKinds),
                    Weight = ctx.Number(speciesItems[i], "weight", p)
                });
            }

            return new VegetationGroup
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Seed = ctx.Seed(node, "seed", path),
                Spacing = ctx.Number(node, "spacing", path),
                Density = ctx.Number(node, "density", path),
                Jitter = ctx.Number(node, "jitter", path, 0.0),
                ScaleMin = scale[0],
                ScaleMax = scale[1],
                Species = species,
                Polygon = ctx.Points(node, "polygon", path, 3)
            };
        }

        private static LayoutRock ReadRock(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "position", "size", "yaw", "variant", "lift");
            double[] size = ctx.Numbers(node, "size", path, 3);
            return new LayoutRock
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Position = ctx.Point(node, "position", path),
                SizeX = size[0],
                SizeY = size[1],
                SizeZ = size[2],
                Yaw = ctx.Number(node, "yaw", path, 0.0),
                Variant = ctx.Integer(node, "variant", path, 0),
                Lift = ctx.Number(node, "lift", path, 0.0)
            };
        }

        private static LayoutProp ReadProp(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "kind", "position", "yaw");
            return new LayoutProp
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Kind = ctx.Token(node, "kind", path, PropKinds),
                Position = ctx.Point(node, "position", path),
                Yaw = ctx.Number(node, "yaw", path, 0.0)
            };
        }

        private static LayoutRift ReadRift(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "center", "radius", "depth", "rim", "rimWidth", "tearHeight", "tearWidth", "tearYaw", "crystals",
                "crystalSeed", "aetherDensity", "lightRange");
            return new LayoutRift
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Center = ctx.Point(node, "center", path),
                Radius = ctx.Number(node, "radius", path),
                Depth = ctx.Number(node, "depth", path),
                Rim = ctx.Number(node, "rim", path, 0.0),
                RimWidth = ctx.Number(node, "rimWidth", path, 1.0),
                TearHeight = ctx.Number(node, "tearHeight", path),
                TearWidth = ctx.Number(node, "tearWidth", path),
                TearYaw = ctx.Number(node, "tearYaw", path, 0.0),
                Crystals = ctx.Integer(node, "crystals", path, 0),
                CrystalSeed = ctx.Seed(node, "crystalSeed", path),
                AetherDensity = ctx.Integer(node, "aetherDensity", path, 1),
                LightRange = ctx.Number(node, "lightRange", path, 30.0)
            };
        }

        private static LayoutLocation ReadLocation(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "kind", "shape", "center", "radius", "size", "yaw", "quests", "mapName", "revealRadius");
            var location = new LayoutLocation
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Kind = ctx.Token(node, "kind", path, LocationKinds, LocationKind.Poi),
                Shape = ctx.Token(node, "shape", path, LocationShapes, LocationShape.Circle),
                Center = ctx.Point(node, "center", path)
            };
            if (location.Shape == LocationShape.Circle)
            {
                location.Radius = ctx.Number(node, "radius", path);
            }
            else
            {
                double[] size = ctx.Numbers(node, "size", path, 2);
                location.Width = size[0];
                location.Depth = size[1];
                location.Yaw = ctx.Number(node, "yaw", path, 0.0);
            }

            location.Quests = ReadStrings(ctx, node, "quests", path);
            location.MapName = ctx.String(node, "mapName", path, string.Empty);
            location.RevealRadius = ctx.Number(node, "revealRadius", path, 0.0);
            return location;
        }

        private static LayoutSpawner ReadSpawner(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "enemyTypeId", "variant", "count", "bossId", "center", "radius", "activation", "respawnSeconds",
                "locationId", "quest", "patrol", "standIn", "note", "level", "members");
            var spawner = new LayoutSpawner
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                EnemyTypeId = ctx.String(node, "enemyTypeId", path),
                Variant = ctx.String(node, "variant", path, "normal"),
                Count = ctx.Integer(node, "count", path),
                BossId = ctx.String(node, "bossId", path, string.Empty),
                Center = ctx.Point(node, "center", path),
                Radius = ctx.Number(node, "radius", path, 1.0),
                Activation = ctx.Token(node, "activation", path, SpawnActivations, SpawnActivation.Always),
                RespawnSeconds = ctx.Number(node, "respawnSeconds", path, 0.0),
                LocationId = ctx.String(node, "locationId", path, string.Empty),
                QuestId = ctx.String(node, "quest", path, string.Empty),
                Patrol = ctx.Points(node, "patrol", path, 0, false),
                Note = ctx.String(node, "note", path, string.Empty),
                Level = ctx.Integer(node, "level", path, 0)
            };
            IReadOnlyList<JsonNode> members = ctx.Array(node, "members", path, false);
            if (members.Count > 0)
            {
                var list = new List<LayoutSpawnMember>(members.Count);
                for (int i = 0; i < members.Count; i++)
                {
                    string p = LayoutJsonContext.Index(LayoutJsonContext.Join(path, "members"), i);
                    if (!ctx.IsObject(members[i], p))
                    {
                        continue;
                    }

                    ctx.Known(members[i], p, "enemyTypeId", "variant", "count");
                    list.Add(new LayoutSpawnMember
                    {
                        EnemyTypeId = ctx.String(members[i], "enemyTypeId", p),
                        Variant = ctx.String(members[i], "variant", p, "normal"),
                        Count = ctx.Integer(members[i], "count", p, 1)
                    });
                }

                spawner.Members = list;
            }

            JsonNode standIn = ctx.Object(node, "standIn", path, false);
            if (standIn != null)
            {
                string p = LayoutJsonContext.Join(path, "standIn");
                ctx.Known(standIn, p, "enemyTypeId", "variant");
                spawner.StandInTypeId = ctx.String(standIn, "enemyTypeId", p);
                spawner.StandInVariant = ctx.String(standIn, "variant", p, "normal");
            }

            return spawner;
        }

        private static LayoutChest ReadChest(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "tier", "position", "yaw", "areaLevel", "locationId");
            return new LayoutChest
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Tier = ctx.Token(node, "tier", path, ChestTiers),
                Position = ctx.Point(node, "position", path),
                Yaw = ctx.Number(node, "yaw", path, 0.0),
                AreaLevel = ctx.Integer(node, "areaLevel", path, 1),
                LocationId = ctx.String(node, "locationId", path, string.Empty)
            };
        }

        private static LayoutNpcMarker ReadNpcMarker(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "npcId", "name", "phase", "stage", "insideBuilding", "locationId", "position", "yaw");
            return new LayoutNpcMarker
            {
                NpcId = ctx.String(node, "npcId", path),
                Name = ctx.String(node, "name", path, string.Empty),
                Phase = ctx.Token(node, "phase", path, NpcPhases, NpcMarkerPhase.Always),
                Stage = ctx.String(node, "stage", path, string.Empty),
                InsideBuilding = ctx.Boolean(node, "insideBuilding", path, false),
                LocationId = ctx.String(node, "locationId", path, string.Empty),
                Position = ctx.Point(node, "position", path),
                Yaw = ctx.Number(node, "yaw", path, 0.0)
            };
        }

        private static LayoutQuestObject ReadQuestObject(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "group", "name", "kind", "position", "yaw", "locationId", "quest");
            return new LayoutQuestObject
            {
                Id = ctx.String(node, "id", path),
                Group = ctx.String(node, "group", path, string.Empty),
                Name = ctx.String(node, "name", path, string.Empty),
                Kind = ctx.Token(node, "kind", path, QuestObjectKinds),
                Position = ctx.Point(node, "position", path),
                Yaw = ctx.Number(node, "yaw", path, 0.0),
                LocationId = ctx.String(node, "locationId", path, string.Empty),
                QuestId = ctx.String(node, "quest", path, string.Empty)
            };
        }

        private static LayoutTrail ReadTrail(LayoutJsonContext ctx, JsonNode node, string path)
        {
            ctx.Known(node, path, "id", "name", "quest", "radius", "nodes", "note");
            return new LayoutTrail
            {
                Id = ctx.String(node, "id", path),
                Name = ctx.String(node, "name", path, string.Empty),
                QuestId = ctx.String(node, "quest", path, string.Empty),
                Radius = ctx.Number(node, "radius", path, 4.0),
                Nodes = ctx.Points(node, "nodes", path, 0),
                Note = ctx.String(node, "note", path, string.Empty)
            };
        }

        private static LayoutPlayerStart ReadPlayerStart(LayoutJsonContext ctx, JsonNode node, string path)
        {
            var start = new LayoutPlayerStart();
            if (node == null)
            {
                return start;
            }

            ctx.Known(node, path, "position", "yaw", "note");
            start.Position = ctx.Point(node, "position", path);
            start.Yaw = ctx.Number(node, "yaw", path, 0.0);
            start.Note = ctx.String(node, "note", path, string.Empty);
            return start;
        }

        private static IReadOnlyList<string> ReadStrings(LayoutJsonContext ctx, JsonNode node, string key, string path)
        {
            IReadOnlyList<JsonNode> items = ctx.Array(node, key, path, false);
            var list = new List<string>(items.Count);
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i].Kind != JsonNodeKind.String)
                {
                    ctx.Report.Error(LayoutJsonContext.Index(LayoutJsonContext.Join(path, key), i), "Text erwartet.");
                    continue;
                }

                list.Add(items[i].StringValue);
            }

            return list;
        }
    }
}
