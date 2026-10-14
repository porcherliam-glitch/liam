using System.Collections.Generic;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// The real layout of the mini slice (<c>Data/Regions/Eichental/eichental_layout.json</c>): no findings, the size from
    /// GDD 01 3.1 / architecture 10.5, and the ids of GDD 01 (4.1) and GDD 02 (11.0–11.2, 11.7) for places, NPCs, spawners
    /// and quest objects.
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
            "loc.eichental.muehle_muehlbach", "loc.eichental.rabenfels_spitze"
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

        [Test]
        public void MiniSliceEnemiesAreWolves()
        {
            foreach (LayoutSpawner spawner in _layout.Spawners)
            {
                string used = string.IsNullOrEmpty(spawner.StandInTypeId) ? spawner.EnemyTypeId : spawner.StandInTypeId;
                Assert.That(used, Is.EqualTo("enemy.wolf.grauwolf"), spawner.Id + ": the mini slice only has wolves and Aether wolves");
            }
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
        public void PlayerWakesInTheVillageAwayFromThePlaza()
        {
            LayoutLocation village = Location("loc.eichental.dorf_eichental");
            LayoutLocation plaza = Location("loc.eichental.dorfplatz");
            LayoutPoint start = _layout.PlayerStart.Position;

            Assert.That(start.DistanceTo(village.Center), Is.LessThan(village.Radius));
            Assert.That(start.DistanceTo(plaza.Center), Is.GreaterThan(plaza.Radius), "quest 1 s10 asks to walk to the plaza");
        }

        [Test]
        public void ViewpointHasAChest()
        {
            LayoutLocation viewpoint = null;
            foreach (LayoutLocation location in _layout.Locations)
            {
                if (location.Kind == LocationKind.Viewpoint)
                {
                    viewpoint = location;
                }
            }

            Assert.That(viewpoint, Is.Not.Null);
            bool chest = false;
            foreach (LayoutChest c in _layout.Chests)
            {
                chest |= c.LocationId == viewpoint.Id;
            }

            Assert.That(chest, Is.True, "GDD 00 pillar 1: exploration always rewards");
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
