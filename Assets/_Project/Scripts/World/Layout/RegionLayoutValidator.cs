using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Data;

namespace Aetherfall.World
{
    /// <summary>
    /// Semantic checks of a <see cref="RegionLayout"/> (messages in German, shown by the generator):
    /// id format and prefixes (architecture 6.1), unique ids, numbers in a sensible range, gameplay objects inside the playable
    /// bounds, no building in a brook or on top of another building, start/chests/spawners/trail nodes not in water, NPC markers
    /// and trail nodes not inside buildings, references to existing locations, bridges over a brook, required palette colours,
    /// terrain heights inside the terrain volume.
    /// </summary>
    public static class RegionLayoutValidator
    {
        /// <summary>Distance in metres that buildings keep from the water edge of a brook.</summary>
        public const double BuildingWaterMargin = 1.0;

        /// <summary>Largest radius of a trail node trigger in metres.</summary>
        public const double MaxTrailRadius = 15.0;

        private const double RiverSampleStep = 0.5;

        /// <summary>Validates the layout and adds the findings to the report.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="report">Report.</param>
        public static void Validate(RegionLayout layout, LayoutReport report)
        {
            if (layout == null)
            {
                throw new ArgumentNullException(nameof(layout));
            }

            if (report == null)
            {
                throw new ArgumentNullException(nameof(report));
            }

            var ids = new Dictionary<string, string>(StringComparer.Ordinal);
            CheckHeader(layout, report);
            CheckTerrain(layout, report, ids);
            CheckPalette(layout, report);
            CheckLines(layout, report, ids);
            CheckBuildings(layout, report, ids);
            CheckAreas(layout, report, ids);
            CheckVegetation(layout, report, ids);
            CheckGameplay(layout, report, ids);
            if (!report.HasErrors)
            {
                CheckHeights(layout, report);
            }
        }

        /// <summary>Reads and validates in one go.</summary>
        /// <param name="json">JSON text.</param>
        /// <param name="report">Report.</param>
        /// <returns>The layout, or null if it could not be read at all.</returns>
        public static RegionLayout ReadAndValidate(string json, LayoutReport report)
        {
            RegionLayout layout = RegionLayoutReader.Read(json, report);
            if (layout != null && !report.HasErrors)
            {
                Validate(layout, report);
            }

            return layout;
        }

        private static void CheckHeader(RegionLayout layout, LayoutReport report)
        {
            RequireId(layout.LayoutId, "layout.", "layoutId", report);
            RequireId(layout.RegionId, "region.", "regionId", report);
            RequireId(layout.WorldSpaceId, "worldspace.", "worldSpaceId", report);
            if (layout.AreaLevel < 1 || layout.AreaLevel > 80)
            {
                report.Error("areaLevel", "Gebietslevel muss zwischen 1 und 80 liegen.");
            }
        }

        private static void CheckTerrain(RegionLayout layout, LayoutReport report, Dictionary<string, string> ids)
        {
            LayoutTerrain t = layout.Terrain;
            if (t.Size <= 0.0)
            {
                report.Error("terrain.size", "Die Terraingröße muss größer als 0 sein.");
            }

            if (!IsPowerOfTwo(t.HeightmapResolution - 1) || t.HeightmapResolution < 33 || t.HeightmapResolution > 4097)
            {
                report.Error("terrain.heightmapResolution", "Muss 2^n + 1 sein (33 … 4097), z. B. 513.");
            }

            if (!IsPowerOfTwo(t.AlphamapResolution) || t.AlphamapResolution < 16 || t.AlphamapResolution > 4096)
            {
                report.Error("terrain.alphamapResolution", "Muss eine Zweierpotenz sein (16 … 4096), z. B. 512.");
            }

            if (t.MaxHeight <= t.BaseHeight || t.BaseHeight < 0.0)
            {
                report.Error("terrain.maxHeight", "maxHeight muss größer als baseHeight sein, baseHeight mindestens 0.");
            }

            LayoutBounds b = t.PlayableBounds;
            double half = t.Size * 0.5;
            if (b.Width <= 0.0 || b.Depth <= 0.0 || b.Min.X < -half || b.Min.Z < -half || b.Max.X > half || b.Max.Z > half)
            {
                report.Error("terrain.playableBounds", "Der begehbare Bereich muss im Terrain liegen und eine Fläche haben.");
            }

            if (t.Border != null && (t.Border.Width <= 0.0 || t.Border.Inset < 0.0))
            {
                report.Error("terrain.border", "Randbreite muss größer als 0 sein, inset mindestens 0.");
            }

            for (int i = 0; i < t.Noise.Count; i++)
            {
                if (t.Noise[i].Wavelength <= 0.0)
                {
                    report.Error("terrain.noise[" + i + "]", "Wellenlänge muss größer als 0 sein.");
                }
            }

            for (int i = 0; i < t.Features.Count; i++)
            {
                TerrainFeature f = t.Features[i];
                Unique(ids, f.Id, "terrain.features", report);
                switch (f.Kind)
                {
                    case TerrainFeatureKind.Slope:
                        if (f.End <= f.Start || (f.Direction.X == 0.0 && f.Direction.Z == 0.0))
                        {
                            report.Error(f.Id, "Hang: end muss größer als start sein und direction darf nicht [0, 0] sein.");
                        }

                        if (f.HasHalfWidth && (f.HalfWidth < 0.0 || f.Falloff < 0.0))
                        {
                            report.Error(f.Id, "Hang: halfWidth und falloff dürfen nicht negativ sein.");
                        }

                        break;
                    case TerrainFeatureKind.Hill:
                        if (f.Radius <= 0.0)
                        {
                            report.Error(f.Id, "Hügel: Radius muss größer als 0 sein.");
                        }

                        break;
                    default:
                        if (f.InnerRadius < 0.0 || f.OuterRadius <= f.InnerRadius)
                        {
                            report.Error(f.Id, "Ebene: outerRadius muss größer als innerRadius sein.");
                        }

                        break;
                }
            }
        }

        private static void CheckPalette(RegionLayout layout, LayoutReport report)
        {
            string[] required = LayoutPalette.RequiredNames;
            for (int i = 0; i < required.Length; i++)
            {
                if (!layout.Palette.TryGet(required[i], out _))
                {
                    report.Error("palette." + required[i], "Farbe fehlt (wird von Generator und Vorschau gebraucht).");
                }
            }

            if (layout.Lighting.SunElevation <= 0.0 || layout.Lighting.SunElevation > 90.0)
            {
                report.Error("lighting.sunElevation", "Sonnenhöhe muss zwischen 0 und 90 Grad liegen.");
            }

            if (layout.Lighting.FogDensity < 0.0 || layout.Lighting.FogDensity > 0.05)
            {
                report.Error("lighting.fogDensity", "Nebeldichte muss zwischen 0 und 0,05 liegen.");
            }
        }

        private static void CheckLines(RegionLayout layout, LayoutReport report, Dictionary<string, string> ids)
        {
            double reach = layout.Terrain.Size * 0.5 + 8.0;
            for (int i = 0; i < layout.Rivers.Count; i++)
            {
                LayoutRiver r = layout.Rivers[i];
                Unique(ids, r.Id, "rivers", report);
                if (r.Width <= 0.0 || r.Bank < 0.0 || r.WaterDepth <= 0.0 || r.Depth <= r.WaterDepth)
                {
                    report.Error(r.Id, "Bach: width > 0, bank ≥ 0, waterDepth > 0 und depth > waterDepth nötig.");
                }

                CheckPointsNearTerrain(r.Id, r.Points, reach, report);
            }

            for (int i = 0; i < layout.Paths.Count; i++)
            {
                LayoutPath p = layout.Paths[i];
                Unique(ids, p.Id, "paths", report);
                if (p.Width <= 0.0)
                {
                    report.Error(p.Id, "Weg: Breite muss größer als 0 sein.");
                }

                CheckPointsNearTerrain(p.Id, p.Points, reach, report);
            }

            for (int i = 0; i < layout.Bridges.Count; i++)
            {
                LayoutBridge bridge = layout.Bridges[i];
                Unique(ids, bridge.Id, "bridges", report);
                RequireId(bridge.Id, "obj.", bridge.Id, report);
                if (bridge.Length <= 0.0 || bridge.Width <= 0.0)
                {
                    report.Error(bridge.Id, "Brücke: Länge und Breite müssen größer als 0 sein.");
                }

                bool crossesRiver = false;
                for (int r = 0; r < layout.Rivers.Count; r++)
                {
                    LayoutRiver river = layout.Rivers[r];
                    if (LayoutGeometry.Nearest(bridge.Position.X, bridge.Position.Z, river.Points).Distance <= river.Width * 0.5 + river.Bank)
                    {
                        crossesRiver = true;
                    }
                }

                if (!crossesRiver)
                {
                    report.Warning(bridge.Id, "Die Brücke steht über keinem Bach.");
                }
            }

            for (int i = 0; i < layout.Fences.Count; i++)
            {
                LayoutFence f = layout.Fences[i];
                Unique(ids, f.Id, "fences", report);
                if (f.Height <= 0.0 || (f.Closed && f.Points.Count < 3))
                {
                    report.Error(f.Id, "Zaun: Höhe > 0; ein geschlossener Zaun braucht mindestens 3 Punkte.");
                }

                CheckPointsNearTerrain(f.Id, f.Points, reach, report);
            }
        }

        private static void CheckBuildings(RegionLayout layout, LayoutReport report, Dictionary<string, string> ids)
        {
            LayoutBounds bounds = layout.Terrain.PlayableBounds;
            var footprints = new List<LayoutPoint[]>(layout.Buildings.Count);
            for (int i = 0; i < layout.Buildings.Count; i++)
            {
                LayoutBuilding b = layout.Buildings[i];
                Unique(ids, b.Id, "buildings", report);
                RequireId(b.Id, "obj.", b.Id, report);
                if (b.Width <= 0.0 || b.Depth <= 0.0 || b.WallHeight <= 0.0)
                {
                    report.Error(b.Id, "Gebäude: Breite, Wandhöhe und Tiefe müssen größer als 0 sein.");
                }

                if (b.Roof != RoofKind.None && (b.RoofPitch <= 0.0 || b.RoofPitch >= 80.0))
                {
                    report.Error(b.Id, "Gebäude: Dachneigung muss zwischen 0 und 80 Grad liegen.");
                }

                LayoutPoint[] corners = LayoutGeometry.RectCorners(b.Position, b.Width, b.Depth, b.Yaw);
                footprints.Add(corners);
                for (int c = 0; c < corners.Length; c++)
                {
                    if (!bounds.Contains(corners[c]))
                    {
                        report.Error(b.Id, "Gebäude ragt aus dem begehbaren Bereich (Ecke " + corners[c] + ").");
                        break;
                    }
                }

                for (int r = 0; r < layout.Rivers.Count; r++)
                {
                    double gap = RiverToRectGap(layout.Rivers[r], b.Position, b.Width, b.Depth, b.Yaw);
                    double needed = layout.Rivers[r].Width * 0.5 + BuildingWaterMargin;
                    if (gap < needed)
                    {
                        report.Error(b.Id, "Gebäude steht im Bach „" + layout.Rivers[r].Name + "“ (Abstand zur Bachmitte " +
                                           Format(Math.Max(0.0, gap)) + " m, nötig " + Format(needed) + " m).");
                    }
                }
            }

            for (int i = 0; i < footprints.Count; i++)
            {
                for (int j = i + 1; j < footprints.Count; j++)
                {
                    if (LayoutGeometry.ConvexOverlap(footprints[i], footprints[j]))
                    {
                        report.Error(layout.Buildings[i].Id, "Gebäude überlappt mit " + layout.Buildings[j].Id + ".");
                    }
                }
            }
        }

        private static void CheckAreas(RegionLayout layout, LayoutReport report, Dictionary<string, string> ids)
        {
            for (int i = 0; i < layout.Fields.Count; i++)
            {
                LayoutField f = layout.Fields[i];
                Unique(ids, f.Id, "fields", report);
                if (f.Width <= 0.0 || f.Depth <= 0.0 || f.RowSpacing <= 0.1)
                {
                    report.Error(f.Id, "Feld: Größe > 0 und Reihenabstand > 0,1 m nötig.");
                }

                for (int r = 0; r < layout.Rivers.Count; r++)
                {
                    if (RiverToRectGap(layout.Rivers[r], f.Center, f.Width, f.Depth, f.Yaw) < layout.Rivers[r].Width * 0.5)
                    {
                        report.Error(f.Id, "Feld liegt im Bach „" + layout.Rivers[r].Name + "“.");
                    }
                }
            }

            for (int i = 0; i < layout.GroundZones.Count; i++)
            {
                LayoutGroundZone z = layout.GroundZones[i];
                Unique(ids, z.Id, "groundZones", report);
                if (z.Radius < 0.0 || z.Falloff < 0.0 || z.Strength < 0.0 || z.Strength > 1.0)
                {
                    report.Error(z.Id, "Bodenzone: Radius und Übergang ≥ 0, Stärke 0 … 1.");
                }
            }

            for (int i = 0; i < layout.Rocks.Count; i++)
            {
                LayoutRock r = layout.Rocks[i];
                Unique(ids, r.Id, "rocks", report);
                if (r.SizeX <= 0.0 || r.SizeY <= 0.0 || r.SizeZ <= 0.0 || r.Variant < 0 || r.Variant > 2)
                {
                    report.Error(r.Id, "Fels: Größe > 0 und Variante 0 … 2 nötig.");
                }
            }

            LayoutRift rift = layout.Rift;
            if (rift != null)
            {
                Unique(ids, rift.Id, "rift", report);
                RequireId(rift.Id, "obj.", "rift.id", report);
                if (rift.Radius <= 0.0 || rift.Depth < 0.0 || rift.RimWidth <= 0.0 || rift.TearHeight <= 0.0 || rift.TearWidth <= 0.0 ||
                    rift.Crystals < 0 || rift.AetherDensity < 0 || rift.AetherDensity > 3)
                {
                    report.Error(rift.Id, "Riss: Radius, Randbreite, Höhe und Breite > 0; Aether-Dichte 0 … 3.");
                }

                if (!layout.Terrain.PlayableBounds.ContainsCircle(rift.Center, rift.Radius))
                {
                    report.Error(rift.Id, "Der Riss-Krater muss im begehbaren Bereich liegen.");
                }

                for (int i = 0; i < layout.Buildings.Count; i++)
                {
                    LayoutBuilding b = layout.Buildings[i];
                    if (LayoutGeometry.RectExcess(rift.Center.X, rift.Center.Z, b.Position, b.Width, b.Depth, b.Yaw) < rift.Radius + rift.RimWidth)
                    {
                        report.Warning(rift.Id, "Gebäude " + b.Id + " steht im Riss-Krater.");
                    }
                }
            }
        }

        private static void CheckVegetation(RegionLayout layout, LayoutReport report, Dictionary<string, string> ids)
        {
            LayoutVegetation v = layout.Vegetation;
            if (v == null)
            {
                return;
            }

            for (int i = 0; i < v.Clearings.Count; i++)
            {
                Unique(ids, v.Clearings[i].Id, "vegetation.clearings", report);
                if (v.Clearings[i].Radius <= 0.0)
                {
                    report.Error(v.Clearings[i].Id, "Lichtung: Radius muss größer als 0 sein.");
                }
            }

            for (int i = 0; i < v.Groups.Count; i++)
            {
                VegetationGroup g = v.Groups[i];
                Unique(ids, g.Id, "vegetation.groups", report);
                if (g.Spacing < 1.0 || g.Density < 0.0 || g.Density > 1.0 || g.Jitter < 0.0 || g.Jitter > 1.0 || g.ScaleMin <= 0.0 ||
                    g.ScaleMax < g.ScaleMin || g.Species.Count == 0)
                {
                    report.Error(g.Id, "Gruppe: spacing ≥ 1, density und jitter 0 … 1, 0 < scale[0] ≤ scale[1], mindestens eine Art.");
                }

                for (int s = 0; s < g.Species.Count; s++)
                {
                    if (g.Species[s].Weight <= 0.0)
                    {
                        report.Error(g.Id, "Gruppe: Gewicht jeder Art muss größer als 0 sein.");
                    }
                }
            }

            for (int i = 0; i < v.Trees.Count; i++)
            {
                Unique(ids, v.Trees[i].Id, "vegetation.trees", report);
                if (v.Trees[i].Scale <= 0.0)
                {
                    report.Error(v.Trees[i].Id, "Baum: Skalierung muss größer als 0 sein.");
                }
            }
        }

        private static void CheckGameplay(RegionLayout layout, LayoutReport report, Dictionary<string, string> ids)
        {
            LayoutBounds bounds = layout.Terrain.PlayableBounds;
            var locations = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < layout.Locations.Count; i++)
            {
                LayoutLocation l = layout.Locations[i];
                Unique(ids, l.Id, "locations", report);
                RequireId(l.Id, "loc.", l.Id, report);
                locations.Add(l.Id);
                if (l.Shape == LocationShape.Circle ? l.Radius <= 0.0 : (l.Width <= 0.0 || l.Depth <= 0.0))
                {
                    report.Error(l.Id, "Ort: Radius bzw. Größe muss größer als 0 sein.");
                }

                if (!bounds.Contains(l.Center))
                {
                    report.Error(l.Id, "Der Mittelpunkt des Orts liegt außerhalb des begehbaren Bereichs.");
                }

                for (int q = 0; q < l.Quests.Count; q++)
                {
                    RequireId(l.Quests[q], "quest.", l.Id + ".quests", report);
                }

                if (l.Kind == LocationKind.Viewpoint && !(l.RevealRadius > 0.0))
                {
                    report.Error(l.Id, "Aussichtspunkt ohne revealRadius: Er muss beim Aktivieren den Kartennebel lichten (GDD 01 6.6).");
                }

                if (l.RevealRadius < 0.0)
                {
                    report.Error(l.Id, "revealRadius darf nicht negativ sein.");
                }
            }

            for (int i = 0; i < layout.Props.Count; i++)
            {
                LayoutProp p = layout.Props[i];
                Unique(ids, p.Id, "props", report);
                RequireId(p.Id, "obj.", p.Id, report);
                RequireInside(bounds, p.Position, p.Id, report);
            }

            for (int i = 0; i < layout.Spawners.Count; i++)
            {
                LayoutSpawner s = layout.Spawners[i];
                Unique(ids, s.Id, "spawners", report);
                RequireId(s.Id, "spawn.", s.Id, report);
                RequireId(s.EnemyTypeId, "enemy.", s.Id + ".enemyTypeId", report);
                if (!string.IsNullOrEmpty(s.BossId))
                {
                    RequireId(s.BossId, "boss.", s.Id + ".bossId", report);
                }

                if (!string.IsNullOrEmpty(s.StandInTypeId))
                {
                    RequireId(s.StandInTypeId, "enemy.", s.Id + ".standIn", report);
                }

                if (s.Count < 1 || s.Radius < 0.0 || s.RespawnSeconds < 0.0)
                {
                    report.Error(s.Id, "Spawner: mindestens 1 Gegner, Radius und Respawn ≥ 0.");
                }

                if (s.Members.Count > 0)
                {
                    int sum = 0;
                    foreach (LayoutSpawnMember member in s.Members)
                    {
                        RequireId(member.EnemyTypeId, "enemy.", s.Id + ".members", report);
                        sum += member.Count;
                        if (member.Count < 1)
                        {
                            report.Error(s.Id, "Spawner-Teil " + member.EnemyTypeId + ": mindestens 1 Gegner.");
                        }
                    }

                    if (sum != s.Count)
                    {
                        report.Error(s.Id, "Spawner: die Teile ergeben " + sum + " Gegner, „count“ sagt " + s.Count + ".");
                    }
                }

                if (s.Level < 0 || s.Level > 80)
                {
                    report.Error(s.Id, "Spawner: Gebietsstufe 0 (Region) bis 80.");
                }

                if (s.Activation == SpawnActivation.Quest)
                {
                    RequireId(s.QuestId, "quest.", s.Id + ".quest", report);
                }

                RequireLocation(locations, s.LocationId, s.Id, report);
                RequireInside(bounds, s.Center, s.Id, report);
                for (int p = 0; p < s.Patrol.Count; p++)
                {
                    RequireInside(bounds, s.Patrol[p], s.Id + ".patrol", report);
                }

                List<PlacedPoint> enemies = LayoutPlacement.SpawnerPositions(s);
                for (int e = 0; e < enemies.Count; e++)
                {
                    CheckDry(layout, enemies[e].X, enemies[e].Z, s.Id, "Gegner steht im Bach.", report);
                    CheckOutsideBuildings(layout, enemies[e].X, enemies[e].Z, s.Id, "Gegner steht in einem Gebäude.", report);
                }
            }

            for (int i = 0; i < layout.Chests.Count; i++)
            {
                LayoutChest c = layout.Chests[i];
                Unique(ids, c.Id, "chests", report);
                RequireId(c.Id, "obj.", c.Id, report);
                RequireInside(bounds, c.Position, c.Id, report);
                RequireLocation(locations, c.LocationId, c.Id, report);
                CheckDry(layout, c.Position.X, c.Position.Z, c.Id, "Truhe steht im Bach.", report);
                if (c.AreaLevel < 1 || c.AreaLevel > 80)
                {
                    report.Error(c.Id, "Truhe: Gebietslevel 1 … 80.");
                }
            }

            var npcKeys = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < layout.NpcMarkers.Count; i++)
            {
                LayoutNpcMarker n = layout.NpcMarkers[i];
                string key = n.NpcId + "@" + n.Phase + "/" + n.Stage;
                RequireId(n.NpcId, "npc.", "npcMarkers[" + i + "]", report);
                if (!npcKeys.Add(key))
                {
                    report.Error(n.NpcId, "NPC-Marker doppelt für dieselbe Phase (" + n.Phase + ")" +
                                          (n.Stage.Length > 0 ? " und Stufe " + n.Stage : string.Empty) + ". Unterscheide sie mit \"stage\".");
                }

                if (n.Stage.Length > 0 && !IsStageId(n.Stage))
                {
                    report.Error(n.NpcId, "stage „" + n.Stage + "“ muss eine Stufen-ID wie s25 sein (GDD 02, Abschnitt 11).");
                }

                RequireInside(bounds, n.Position, n.NpcId, report);
                RequireLocation(locations, n.LocationId, n.NpcId, report);
                CheckDry(layout, n.Position.X, n.Position.Z, n.NpcId, "NPC-Marker steht im Bach.", report);
                if (!n.InsideBuilding)
                {
                    CheckOutsideBuildings(layout, n.Position.X, n.Position.Z, n.NpcId,
                        "NPC-Marker steht in einem Gebäude (dort wäre er unsichtbar). Verschieben oder \"insideBuilding\": true setzen.", report);
                }
                else if (!InsideAnyBuilding(layout, n.Position.X, n.Position.Z))
                {
                    report.Warning(n.NpcId, "\"insideBuilding\": true, der Marker steht aber in keinem Gebäude.");
                }
            }

            for (int i = 0; i < layout.QuestObjects.Count; i++)
            {
                LayoutQuestObject q = layout.QuestObjects[i];
                Unique(ids, q.Id, "questObjects", report);
                if (!(q.Id.StartsWith("obj.", StringComparison.Ordinal) || q.Id.StartsWith("clue.", StringComparison.Ordinal)) ||
                    !ContentIdRules.IsValid(q.Id))
                {
                    report.Error(q.Id, "Quest-Objekt: ID muss mit obj. oder clue. beginnen und dem ID-Format folgen.");
                }

                if (!string.IsNullOrEmpty(q.Group))
                {
                    string group = q.Group.EndsWith("_*", StringComparison.Ordinal) ? q.Group.Substring(0, q.Group.Length - 2) : q.Group;
                    if (!ContentIdRules.IsValid(group))
                    {
                        report.Error(q.Id, "Quest-Objekt: group \"" + q.Group + "\" folgt nicht dem ID-Format (erlaubt: Endung _*).");
                    }
                }

                RequireId(q.QuestId, "quest.", q.Id + ".quest", report);
                RequireInside(bounds, q.Position, q.Id, report);
                RequireLocation(locations, q.LocationId, q.Id, report);
            }

            CheckTrails(layout, report, ids);

            LayoutPlayerStart start = layout.PlayerStart;
            RequireInside(bounds, start.Position, "playerStart", report);
            CheckDry(layout, start.Position.X, start.Position.Z, "playerStart", "Der Spieler-Start liegt im Bach.", report);
            CheckOutsideBuildings(layout, start.Position.X, start.Position.Z, "playerStart", "Der Spieler-Start liegt in einem Gebäude.", report);
        }

        private static void CheckTrails(RegionLayout layout, LayoutReport report, Dictionary<string, string> ids)
        {
            LayoutBounds bounds = layout.Terrain.PlayableBounds;
            for (int i = 0; i < layout.Trails.Count; i++)
            {
                LayoutTrail t = layout.Trails[i];
                Unique(ids, t.Id, "trails", report);
                RequireId(t.Id, "spur.", t.Id, report);
                RequireId(t.QuestId, "quest.", t.Id + ".quest", report);
                if (t.Nodes.Count < 2)
                {
                    report.Error(t.Id, "Spur: mindestens 2 Knoten nötig (sonst ist es ein „Gehe zu“-Ziel).");
                }

                if (t.Radius <= 0.0 || t.Radius > MaxTrailRadius)
                {
                    report.Error(t.Id, "Spur: Radius der Knoten muss größer als 0 und höchstens " + Format(MaxTrailRadius) + " m sein.");
                }

                for (int n = 0; n < t.Nodes.Count; n++)
                {
                    LayoutPoint node = t.Nodes[n];
                    string path = t.Id + ".nodes[" + n + "]";
                    RequireInside(bounds, node, path, report);
                    CheckDry(layout, node.X, node.Z, path, "Spur-Knoten liegt im Bach.", report);
                    CheckOutsideBuildings(layout, node.X, node.Z, path, "Spur-Knoten liegt in einem Gebäude.", report);
                    if (n > 0 && node.DistanceTo(t.Nodes[n - 1]) < t.Radius)
                    {
                        report.Warning(path, "Spur-Knoten liegt näher als sein Radius am vorigen Knoten.");
                    }
                }
            }
        }

        private static bool IsStageId(string stage)
        {
            if (stage.Length < 2 || stage[0] != 's' || stage[1] < '0' || stage[1] > '9')
            {
                return false;
            }

            for (int i = 1; i < stage.Length; i++)
            {
                char c = stage[i];
                if (!(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '_')
                {
                    return false;
                }
            }

            return true;
        }

        private static bool InsideAnyBuilding(RegionLayout layout, double x, double z)
        {
            for (int i = 0; i < layout.Buildings.Count; i++)
            {
                LayoutBuilding b = layout.Buildings[i];
                if (LayoutGeometry.RectExcess(x, z, b.Position, b.Width, b.Depth, b.Yaw) < 0.0)
                {
                    return true;
                }
            }

            return false;
        }

        private static void CheckHeights(RegionLayout layout, LayoutReport report)
        {
            var field = new LayoutHeightField(layout);
            LayoutTerrain t = layout.Terrain;
            const int samples = 65;
            double min = double.PositiveInfinity;
            double max = double.NegativeInfinity;
            for (int iz = 0; iz < samples; iz++)
            {
                for (int ix = 0; ix < samples; ix++)
                {
                    double x = -t.Size * 0.5 + ix * t.Size / (samples - 1);
                    double z = -t.Size * 0.5 + iz * t.Size / (samples - 1);
                    double h = field.Height(x, z);
                    min = Math.Min(min, h);
                    max = Math.Max(max, h);
                }
            }

            if (min < 0.5)
            {
                report.Error("terrain", "Gelände reicht bis " + Format(min) + " m hinunter (mindestens 0,5 m nötig): baseHeight erhöhen.");
            }

            if (max > t.MaxHeight - 1.0)
            {
                report.Error("terrain", "Gelände reicht bis " + Format(max) + " m hinauf (höchstens maxHeight − 1 m): maxHeight erhöhen.");
            }
        }

        private static double RiverToRectGap(LayoutRiver river, LayoutPoint center, double width, double depth, double yaw)
        {
            double best = double.PositiveInfinity;
            IReadOnlyList<LayoutPoint> points = river.Points;
            for (int i = 0; i < points.Count - 1; i++)
            {
                double length = points[i].DistanceTo(points[i + 1]);
                int steps = Math.Max(1, (int)Math.Ceiling(length / RiverSampleStep));
                for (int s = 0; s <= steps; s++)
                {
                    double f = (double)s / steps;
                    double x = LayoutGeometry.Lerp(points[i].X, points[i + 1].X, f);
                    double z = LayoutGeometry.Lerp(points[i].Z, points[i + 1].Z, f);
                    best = Math.Min(best, LayoutGeometry.RectExcess(x, z, center, width, depth, yaw));
                }
            }

            return best;
        }

        private static void CheckDry(RegionLayout layout, double x, double z, string id, string message, LayoutReport report)
        {
            for (int r = 0; r < layout.Rivers.Count; r++)
            {
                LayoutRiver river = layout.Rivers[r];
                if (LayoutGeometry.Nearest(x, z, river.Points).Distance < river.Width * 0.5 + 0.5)
                {
                    report.Error(id, message);
                    return;
                }
            }
        }

        private static void CheckOutsideBuildings(RegionLayout layout, double x, double z, string id, string message, LayoutReport report)
        {
            for (int i = 0; i < layout.Buildings.Count; i++)
            {
                LayoutBuilding b = layout.Buildings[i];
                if (LayoutGeometry.RectExcess(x, z, b.Position, b.Width, b.Depth, b.Yaw) < 0.3)
                {
                    report.Error(id, message + " (" + b.Id + ")");
                    return;
                }
            }
        }

        private static void CheckPointsNearTerrain(string id, IReadOnlyList<LayoutPoint> points, double reach, LayoutReport report)
        {
            for (int i = 0; i < points.Count; i++)
            {
                if (Math.Abs(points[i].X) > reach || Math.Abs(points[i].Z) > reach)
                {
                    report.Error(id, "Punkt " + points[i] + " liegt weit außerhalb des Terrains.");
                    return;
                }
            }
        }

        private static void RequireInside(LayoutBounds bounds, LayoutPoint point, string id, LayoutReport report)
        {
            if (!bounds.Contains(point))
            {
                report.Error(id, "Liegt außerhalb des begehbaren Bereichs: " + point + ".");
            }
        }

        private static void RequireLocation(HashSet<string> locations, string locationId, string id, LayoutReport report)
        {
            if (string.IsNullOrEmpty(locationId))
            {
                report.Error(id, "locationId fehlt.");
            }
            else if (!locations.Contains(locationId))
            {
                report.Error(id, "Unbekannter Ort „" + locationId + "“ (nicht in locations).");
            }
        }

        private static void RequireId(string id, string prefix, string path, LayoutReport report)
        {
            if (string.IsNullOrEmpty(id))
            {
                report.Error(path, "ID fehlt (erwartet: " + prefix + "…).");
            }
            else if (!id.StartsWith(prefix, StringComparison.Ordinal) || !ContentIdRules.IsValid(id))
            {
                report.Error(path, "ID „" + id + "“ muss mit „" + prefix + "“ beginnen und dem ID-Format folgen (a–z, 0–9, _, Punkte; Architektur 6.1).");
            }
        }

        private static void Unique(Dictionary<string, string> ids, string id, string section, LayoutReport report)
        {
            if (string.IsNullOrEmpty(id))
            {
                report.Error(section, "ID fehlt.");
                return;
            }

            if (!ContentIdRules.IsValid(id))
            {
                report.Error(section, "ID „" + id + "“ folgt nicht dem ID-Format (a–z, 0–9, _, Punkte; Architektur 6.1).");
            }

            if (ids.TryGetValue(id, out string first))
            {
                report.Error(id, "ID doppelt (schon in " + first + ").");
                return;
            }

            ids.Add(id, section);
        }

        private static bool IsPowerOfTwo(int value)
        {
            return value > 0 && (value & (value - 1)) == 0;
        }

        private static string Format(double value)
        {
            return value.ToString("0.##", CultureInfo.InvariantCulture).Replace('.', ',');
        }
    }
}
