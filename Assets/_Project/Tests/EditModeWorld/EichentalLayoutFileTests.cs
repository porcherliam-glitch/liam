using System;
using System.Collections.Generic;
using System.Linq;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// The real layout of the mini slice (<c>Data/Regions/Eichental/eichental_layout.json</c>): no findings, the size from
    /// GDD 01 3.1 / architecture 10.5, and the ids of GDD 01 (4.1) and GDD 02 (11.0–11.2, 11.7) for places, NPCs, spawners,
    /// quest objects and trails; wildlife keeps away from the prologue, and the walking distance of the size rationale is right.
    /// </summary>
    [TestFixture]
    public sealed class EichentalLayoutFileTests
    {
        private static readonly string[] QuestLocations =
        {
            "loc.eichental.dorf_eichental", "loc.eichental.dorfplatz", "loc.eichental.dorfrand", "loc.eichental.riss_eichental",
            "loc.eichental.lindenhain", "loc.eichental.gasthaus_krummer_kessel", "loc.eichental.wachposten_lindenhain",
            "loc.eichental.hof_hollmann", "loc.eichental.nordhang", "loc.eichental.wolfsbau_nordhang", "loc.eichental.vergessene_gruft"
        };

        // GDD 02 11.0 "Verwendete Orte" plus the proposals of this layout.
        private static readonly string[] KnownLocations =
        {
            "loc.eichental.dorf_eichental", "loc.eichental.dorfplatz", "loc.eichental.dorfrand", "loc.eichental.riss_eichental",
            "loc.eichental.lindenhain", "loc.eichental.gasthaus_krummer_kessel", "loc.eichental.wachposten_lindenhain",
            "loc.eichental.hof_hollmann", "loc.eichental.nordhang", "loc.eichental.wolfsbau_nordhang", "loc.eichental.vergessene_gruft",
            "loc.eichental.muehle_muehlbach", "loc.eichental.rabenfels_spitze", "loc.eichental.steinbruch_grimmbart", "loc.eichental.steinbruch_arena",
            "loc.eichental.wachturm_grauwacht", "loc.eichental.kraeuterwiese"
        };

        // GDD 01 4.1.3 and GDD 02 11.0 "Verwendete NPCs" (region Eichental and the grey figure).
        private static readonly string[] KnownNpcs =
        {
            "npc.eichental.lina", "npc.eichental.dorfvorsteherin_hedda", "npc.eichental.schmied_tobold", "npc.eichental.edwin_kern",
            "npc.eichental.baeckerin_wenna", "npc.eichental.bauer_hollmann", "npc.eichental.pim_hollmann", "npc.eichental.mueller_brenner",
            "npc.eichental.liese_brenner", "npc.eichental.jannik_hartwig", "npc.eichental.banditenfuehrer_harrik", "npc.eichental.grimmbart",
            "npc.eichental.kraeuterfrau_alwine", "npc.eichental.wirt_ulf", "npc.eichental.hauptmann_dorn", "npc.eichental.gelehrter_corvin",
            "npc.eichental.seemann_ole", "npc.eichental.hueterin_ravna", "npc.main.graue_gestalt", "npc.eichental.grabraeuber_fenn"
        };

        // Spawners named in GDD 02 11.1 and 11.2.
        private static readonly string[] QuestSpawners =
        {
            "spawn.eichental.dorfrand_risslinge", "spawn.eichental.rissbrut_prolog", "spawn.eichental.nordhang_rudel",
            "spawn.eichental.glutfang", "spawn.eichental.bau_wut"
        };

        // Scene objects named in GDD 02 11.1 and 11.2 (group ids for counted objects).
        private static readonly string[] QuestObjects =
        {
            "obj.eichental.balken_tobold", "obj.eichental.tuer_haus_wenna", "clue.eichental.verbrannte_runen", "clue.eichental.weide_schaf",
            "clue.eichental.weide_pfoten", "clue.eichental.weide_aetherspeichel", "obj.eichental.strohziel_*", "obj.eichental.leiche_postreiter",
            "obj.eichental.aethersplitter_bau", "obj.eichental.wolfswelpe"
        };

        // Trails of the objectives "Folge(...)" in GDD 02 11.1 s40 and 11.2 s20, with their quest.
        private static readonly string[][] QuestTrails =
        {
            new[] { "spur.eichental.graue_gestalt", "quest.main.asche_ueber_eichental" },
            new[] { "spur.eichental.wolfsspur", "quest.side.eichental.woelfe_vom_nordhang" }
        };

        // Sight range of the wolves (EnemyTypeDefinition.sightRange, 22 m) plus a margin for running and hearing.
        private const double PrologueDistance = 45.0;

        private static readonly string[] MiniSliceQuests =
        {
            "quest.main.asche_ueber_eichental", "quest.side.eichental.woelfe_vom_nordhang", "quest.dungeon.eichental.vergessene_gruft"
        };

        private RegionLayout _layout;

        [OneTimeSetUp]
        public void LoadLayout()
        {
            _layout = LayoutTestFiles.LoadEichental();
        }

        [Test]
        public void HeaderAndSizeFollowTheGdd()
        {
            Assert.That(_layout.RegionId, Is.EqualTo("region.eichental"));
            Assert.That(_layout.WorldSpaceId, Is.EqualTo("worldspace.eichental.mini_slice"));
            Assert.That(_layout.Terrain.Size, Is.EqualTo(512.0), "one streaming cell (architecture 10.1)");
            Assert.That(_layout.Terrain.HeightmapResolution, Is.EqualTo(513), "architecture 10.5");
            Assert.That(_layout.Terrain.PlayableBounds.Width, Is.EqualTo(400.0));
            Assert.That(_layout.Terrain.PlayableBounds.Depth, Is.EqualTo(400.0));
            Assert.That(_layout.Terrain.Features.Count, Is.GreaterThan(0));
        }

        [Test]
        public void QuestLocationsExist()
        {
            var ids = new HashSet<string>();
            foreach (LayoutLocation location in _layout.Locations)
            {
                ids.Add(location.Id);
                Assert.That(KnownLocations, Does.Contain(location.Id), "location id not in GDD 02 11.0");
            }

            foreach (string id in QuestLocations)
            {
                Assert.That(ids, Does.Contain(id));
            }
        }

        [Test]
        public void NpcMarkersUseCanonIds()
        {
            Assert.That(_layout.NpcMarkers.Count, Is.GreaterThanOrEqualTo(10));
            foreach (LayoutNpcMarker marker in _layout.NpcMarkers)
            {
                Assert.That(KnownNpcs, Does.Contain(marker.NpcId));
            }
        }

        [Test]
        public void QuestSpawnersAndObjectsExist()
        {
            var spawners = new HashSet<string>();
            foreach (LayoutSpawner spawner in _layout.Spawners)
            {
                spawners.Add(spawner.Id);
            }

            foreach (string id in QuestSpawners)
            {
                Assert.That(spawners, Does.Contain(id));
            }

            var objects = new HashSet<string>();
            foreach (LayoutQuestObject quest in _layout.QuestObjects)
            {
                objects.Add(string.IsNullOrEmpty(quest.Group) ? quest.Id : quest.Group);
                Assert.That(MiniSliceQuests, Does.Contain(quest.QuestId));
            }

            foreach (string id in QuestObjects)
            {
                Assert.That(objects, Does.Contain(id));
            }
        }

        /// <summary>Enemy types the slice builds (GDD 01 11.4): wolves, the Rissbrut and the bandits.</summary>
        private static readonly string[] BuiltEnemyTypes =
        {
            "enemy.wolf.grauwolf", "enemy.rissbrut.rissling", "enemy.bandit.schlaeger", "enemy.bandit.armbrustschuetze", "enemy.bandit.grimmbart",
        };

        [Test]
        public void SliceEnemiesHaveBuiltTypes()
        {
            foreach (LayoutSpawner spawner in _layout.Spawners)
            {
                string used = string.IsNullOrEmpty(spawner.StandInTypeId) ? spawner.EnemyTypeId : spawner.StandInTypeId;
                Assert.That(BuiltEnemyTypes, Does.Contain(used), spawner.Id + ": no enemy of this type is built yet");
                foreach (LayoutSpawnMember member in spawner.Members)
                {
                    Assert.That(BuiltEnemyTypes, Does.Contain(member.EnemyTypeId), spawner.Id + ": no enemy of this type is built yet");
                }
            }
        }

        [Test]
        public void RisslingeNoLongerUseStandIns()
        {
            Assert.That(_layout.Spawners.First(s => s.Id == "spawn.eichental.dorfrand_risslinge").StandInTypeId, Is.Empty);
            Assert.That(_layout.Spawners.First(s => s.Id == "spawn.eichental.rissbrut_prolog").StandInTypeId, Is.Empty);
        }

        [Test]
        public void VillageIsDestroyedButNotEverywhere()
        {
            int burned = 0;
            int collapsed = 0;
            int intact = 0;
            var kinds = new HashSet<BuildingKind>();
            foreach (LayoutBuilding building in _layout.Buildings)
            {
                kinds.Add(building.Kind);
                burned += building.State == BuildingState.Burned ? 1 : 0;
                collapsed += building.State == BuildingState.Collapsed ? 1 : 0;
                intact += building.State == BuildingState.Intact ? 1 : 0;
            }

            Assert.That(burned, Is.GreaterThanOrEqualTo(4));
            Assert.That(collapsed, Is.GreaterThanOrEqualTo(3));
            Assert.That(intact, Is.GreaterThanOrEqualTo(4), "Lindenhain, the Hollmann farm and the mill are undamaged");
            foreach (BuildingKind kind in new[] { BuildingKind.House, BuildingKind.Smithy, BuildingKind.Tavern, BuildingKind.Mill, BuildingKind.Barn, BuildingKind.Chapel, BuildingKind.Ruin })
            {
                Assert.That(kinds, Does.Contain(kind));
            }

            Assert.That(_layout.Rift, Is.Not.Null);
            Assert.That(_layout.Rift.AetherDensity, Is.InRange(1, 3));
        }

        [Test]
        public void QuestTrailsExist()
        {
            foreach (string[] expected in QuestTrails)
            {
                LayoutTrail trail = Trail(expected[0]);
                Assert.That(trail.QuestId, Is.EqualTo(expected[1]));
                Assert.That(trail.Nodes.Count, Is.GreaterThanOrEqualTo(3), expected[0] + ": a trail worth following");
            }
        }

        [Test]
        public void TrailsLeadToTheNextGoal()
        {
            // s40 follows the grey figure, s50 asks to walk into the rift zone: the trail ends just before it.
            LayoutTrail figure = Trail("spur.eichental.graue_gestalt");
            LayoutLocation rift = Location("loc.eichental.riss_eichental");
            LayoutLocation edge = Location("loc.eichental.dorfrand");
            double figureEnd = figure.Nodes[figure.Nodes.Count - 1].DistanceTo(rift.Center);
            Assert.That(figureEnd, Is.InRange(rift.Radius, rift.Radius + 15.0));
            Assert.That(figure.Nodes[0].DistanceTo(edge.Center), Is.LessThan(edge.Radius + 15.0), "starts at the village edge (s30)");

            // s20 starts at the clues on the upper pasture and ends before the wolf den (s30: walk to the den).
            LayoutTrail wolves = Trail("spur.eichental.wolfsspur");
            LayoutLocation den = Location("loc.eichental.wolfsbau_nordhang");
            double wolvesEnd = wolves.Nodes[wolves.Nodes.Count - 1].DistanceTo(den.Center);
            Assert.That(wolvesEnd, Is.InRange(den.Radius, den.Radius + 15.0));
            Assert.That(wolves.Nodes[0].DistanceTo(QuestObject("clue.eichental.weide_pfoten").Position), Is.LessThan(15.0));
            bool passesTheCourier = false;
            foreach (LayoutPoint node in wolves.Nodes)
            {
                passesTheCourier |= node.DistanceTo(QuestObject("obj.eichental.leiche_postreiter").Position) < 12.0;
            }

            Assert.That(passesTheCourier, Is.True, "GDD 02 11.2: the dead courier lies by the trail (start of quest 3)");
        }

        [Test]
        public void WildlifeKeepsAwayFromThePrologue()
        {
            LayoutRift rift = _layout.Rift;
            LayoutTrail figure = Trail("spur.eichental.graue_gestalt");
            LayoutLocation village = Location("loc.eichental.dorf_eichental");
            foreach (LayoutSpawner spawner in _layout.Spawners)
            {
                if (spawner.Activation != SpawnActivation.Always)
                {
                    continue;
                }

                foreach (PlacedPoint p in LayoutPlacement.SpawnerPositions(spawner))
                {
                    var position = new LayoutPoint(p.X, p.Z);
                    double toRim = position.DistanceTo(rift.Center) - rift.Radius - rift.RimWidth;
                    Assert.That(toRim, Is.GreaterThanOrEqualTo(PrologueDistance), spawner.Id + ": too close to the rift (quest 1, s40–s60)");
                    Assert.That(position.DistanceTo(village.Center) - village.Radius, Is.GreaterThanOrEqualTo(PrologueDistance), spawner.Id);
                    foreach (LayoutPoint node in figure.Nodes)
                    {
                        Assert.That(position.DistanceTo(node), Is.GreaterThanOrEqualTo(PrologueDistance), spawner.Id + ": near the trail of s40");
                    }
                }
            }
        }

        [Test]
        public void SurvivorsGatherAtTheVillageEdge()
        {
            // GDD 02 11.1: s20 Hedda on the plaza, s25 NPC+(hedda, dorfrand); rescued Tobold and Wenna join her there (s30).
            Assert.That(Marker("npc.eichental.dorfvorsteherin_hedda", "s20").LocationId, Is.EqualTo("loc.eichental.dorfplatz"));
            Assert.That(Marker("npc.eichental.dorfvorsteherin_hedda", "s25").LocationId, Is.EqualTo("loc.eichental.dorfrand"));
            Assert.That(Marker("npc.eichental.schmied_tobold", "s30").LocationId, Is.EqualTo("loc.eichental.dorfrand"));
            Assert.That(Marker("npc.eichental.baeckerin_wenna", "s30").LocationId, Is.EqualTo("loc.eichental.dorfrand"));
            Assert.That(Marker("npc.eichental.baeckerin_wenna", "s25").InsideBuilding, Is.True, "trapped in the burning bakery");
        }

        [Test]
        public void WalkingDistanceOfTheRationaleIsRight()
        {
            // Start → plaza → village edge → rift → Lindenhain → farm → den → farm → Lindenhain → crypt → Lindenhain.
            string[] route =
            {
                "loc.eichental.dorfplatz", "loc.eichental.dorfrand", "loc.eichental.riss_eichental", "loc.eichental.lindenhain",
                "loc.eichental.hof_hollmann", "loc.eichental.wolfsbau_nordhang", "loc.eichental.hof_hollmann", "loc.eichental.lindenhain",
                "loc.eichental.vergessene_gruft", "loc.eichental.lindenhain"
            };
            LayoutPoint from = _layout.PlayerStart.Position;
            double metres = 0.0;
            foreach (string id in route)
            {
                LayoutPoint to = Location(id).Center;
                metres += from.DistanceTo(to);
                from = to;
            }

            Assert.That(metres, Is.InRange(1450.0, 1600.0), "straight lines between the places");
            string rationale = string.Join(" ", RationaleLines());
            Assert.That(rationale, Does.Contain("Luftlinie etwa 1,5 km"));
        }

        [Test]
        public void PlayerWakesInTheVillageAwayFromThePlaza()
        {
            LayoutLocation village = Location("loc.eichental.dorf_eichental");
            LayoutLocation plaza = Location("loc.eichental.dorfplatz");
            LayoutPoint start = _layout.PlayerStart.Position;

            Assert.That(start.DistanceTo(village.Center), Is.LessThan(village.Radius));
            Assert.That(start.DistanceTo(plaza.Center), Is.GreaterThan(plaza.Radius), "quest 1 s10 asks to walk to the plaza");
        }

        [Test]
        public void HerbNodesCoverQuestFive()
        {
            // GDD 02 11.5 s10: Sammle(blutwurz, 5), Sammle(rissmoos, 3), Sammle(nachtschattenbluete, 1) in one visit at the smallest yield;
            // GDD 04 6.10: common herbs grow back after 1 game day, rare ones after 3; Nachtschatten only at night (22-4).
            AssertHerbs("item.herb.blutwurz", 5, 1d, null, 0d, 0d);
            AssertHerbs("item.herb.rissmoos", 3, 3d, "loc.eichental.riss_eichental", 0d, 0d);
            AssertHerbs("item.herb.nachtschattenbluete", 1, 3d, null, 22d, 4d);
        }

        [Test]
        public void EveryViewpointHasAChest()
        {
            int viewpoints = 0;
            foreach (LayoutLocation viewpoint in _layout.Locations)
            {
                if (viewpoint.Kind != LocationKind.Viewpoint)
                {
                    continue;
                }

                viewpoints++;
                bool chest = false;
                foreach (LayoutChest c in _layout.Chests)
                {
                    chest |= c.LocationId == viewpoint.Id;
                }

                Assert.That(chest, Is.True, viewpoint.Id + ": GDD 00 pillar 1: exploration always rewards");
            }

            Assert.That(viewpoints, Is.GreaterThanOrEqualTo(2), "Rabenfels-Spitze and the crow's nest of the Wachturm Grauwacht");
        }

        private void AssertHerbs(string itemId, int needed, double respawnDays, string locationId, double from, double to)
        {
            int pieces = 0;
            foreach (LayoutHarvestNode node in _layout.HarvestNodes)
            {
                if (node.ItemId != itemId)
                {
                    continue;
                }

                pieces += node.MinYield;
                Assert.That(node.RespawnDays, Is.EqualTo(respawnDays), node.Id);
                Assert.That(node.ActiveFrom, Is.EqualTo(from), node.Id);
                Assert.That(node.ActiveTo, Is.EqualTo(to), node.Id);
                if (locationId != null)
                {
                    Assert.That(node.LocationId, Is.EqualTo(locationId), node.Id);
                }
            }

            Assert.That(pieces, Is.GreaterThanOrEqualTo(needed), itemId + ": one visit at the smallest yield covers quest 5");
        }

        private static IEnumerable<string> RationaleLines()
        {
            // The rationale is documentation only (not read into RegionLayout); search the file text.
            string text = LayoutTestFiles.ReadEichental();
            int start = text.IndexOf("\"sizeRationale\"", StringComparison.Ordinal);
            int end = text.IndexOf("]", start, StringComparison.Ordinal);
            yield return text.Substring(start, end - start);
        }

        private LayoutTrail Trail(string id)
        {
            foreach (LayoutTrail trail in _layout.Trails)
            {
                if (trail.Id == id)
                {
                    return trail;
                }
            }

            Assert.Fail("Trail missing: " + id);
            return null;
        }

        private LayoutQuestObject QuestObject(string id)
        {
            foreach (LayoutQuestObject quest in _layout.QuestObjects)
            {
                if (quest.Id == id)
                {
                    return quest;
                }
            }

            Assert.Fail("Quest object missing: " + id);
            return null;
        }

        private LayoutNpcMarker Marker(string npcId, string stage)
        {
            foreach (LayoutNpcMarker marker in _layout.NpcMarkers)
            {
                if (marker.NpcId == npcId && marker.Stage == stage)
                {
                    return marker;
                }
            }

            Assert.Fail("NPC marker missing: " + npcId + " " + stage);
            return null;
        }

        private LayoutLocation Location(string id)
        {
            foreach (LayoutLocation location in _layout.Locations)
            {
                if (location.Id == id)
                {
                    return location;
                }
            }

            Assert.Fail("Location missing: " + id);
            return null;
        }
    }
}
