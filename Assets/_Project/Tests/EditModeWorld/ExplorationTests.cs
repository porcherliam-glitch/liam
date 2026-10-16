using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.World;
using Aetherfall.World.Exploration;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// World map and exploration (S34/S63, GDD 01 6.6): projection of the map picture, the fog grid (60 m around the player,
    /// saved as Base64, resampled when the grid changes), discovering places, viewpoints that clear the fog and mark places with
    /// "?", and the exploration service with its events.
    /// </summary>
    [TestFixture]
    public sealed class ExplorationTests
    {
        private readonly List<Object> _created = new List<Object>();

        [TearDown]
        public void TearDown()
        {
            foreach (Object created in _created)
            {
                Object.DestroyImmediate(created);
            }

            _created.Clear();
        }

        private RegionMapDefinition Map()
        {
            var places = new[]
            {
                new MapPlace("loc.test.dorf", "Dorf", LocationKind.Settlement, 0f, 0f, 40f, true, 0f),
                new MapPlace("loc.test.dorfplatz", "Dorfplatz", LocationKind.Area, 5f, 5f, 10f, false, 0f),
                new MapPlace("loc.test.muehle", "Mühle", LocationKind.Poi, 100f, -100f, 15f, true, 0f),
                new MapPlace("loc.test.turm", "Turm", LocationKind.Viewpoint, -150f, 50f, 10f, true, 150f),
                new MapPlace("loc.test.fels", "Fels", LocationKind.Viewpoint, 150f, 150f, 10f, true, 150f)
            };
            RegionMapDefinition map = RegionMapDefinition.Create("map.test", "region.test", "Testland", "worldspace.test", null,
                new MapProjection(-256f, -256f, 512f), new Vector2(-200f, -200f), new Vector2(200f, 200f), 4f, 60f, places);
            _created.Add(map);
            return map;
        }

        [Test]
        public void ProjectionPutsTheCornersAtTheEdgesAndRoundTrips()
        {
            var projection = new MapProjection(-256f, -256f, 512f);

            projection.WorldToUv(-256f, -256f, out float u0, out float v0);
            projection.WorldToUv(256f, 256f, out float u1, out float v1);
            projection.ToPanel(12f, 184f, out float left, out float top);
            projection.UvToWorld(left, 1f - top, out float x, out float z);

            Assert.That(u0, Is.EqualTo(0f).Within(1e-5f));
            Assert.That(v0, Is.EqualTo(0f).Within(1e-5f));
            Assert.That(u1, Is.EqualTo(1f).Within(1e-5f));
            Assert.That(v1, Is.EqualTo(1f).Within(1e-5f));
            Assert.That(top, Is.EqualTo(1f - (184f + 256f) / 512f).Within(1e-5f), "panels count from the top: north is up");
            Assert.That(x, Is.EqualTo(12f).Within(1e-3f));
            Assert.That(z, Is.EqualTo(184f).Within(1e-3f));
        }

        [Test]
        public void FogClearsOnlyWithinTheRadius()
        {
            var fog = new FogGrid(-200f, -200f, 4f, 100, 100);

            int added = fog.Reveal(0f, 0f, 60f);

            Assert.That(added, Is.GreaterThan(600).And.LessThan(800), "π · 60² / 16 ≈ 707 cells");
            Assert.That(fog.IsRevealed(0f, 0f), Is.True);
            Assert.That(fog.IsRevealed(55f, 0f), Is.True);
            Assert.That(fog.IsRevealed(70f, 0f), Is.False);
            Assert.That(fog.Reveal(0f, 0f, 60f), Is.EqualTo(0), "nothing new the second time");
            Assert.That(fog.Reveal(500f, 500f, 60f), Is.EqualTo(0), "outside the grid");
            Assert.That(fog.RevealedFraction, Is.EqualTo(added / 10000f).Within(1e-6f));
        }

        [Test]
        public void FogSurvivesBase64AndIsResampledForAnotherGrid()
        {
            var fog = new FogGrid(-200f, -200f, 4f, 100, 100);
            fog.Reveal(-100f, 50f, 30f);
            string bits = fog.ToBase64();

            var same = new FogGrid(-200f, -200f, 4f, 100, 100);
            Assert.That(same.Load(bits, -200f, -200f, 4f, 100, 100), Is.True);
            Assert.That(same.RevealedCells, Is.EqualTo(fog.RevealedCells));

            var finer = new FogGrid(-200f, -200f, 2f, 200, 200);
            Assert.That(finer.Load(bits, -200f, -200f, 4f, 100, 100), Is.True);
            Assert.That(finer.IsRevealed(-100f, 50f), Is.True);
            Assert.That(finer.IsRevealed(100f, 50f), Is.False);

            var broken = new FogGrid(-200f, -200f, 4f, 100, 100);
            Assert.That(broken.Load("kein Base64!", -200f, -200f, 4f, 100, 100), Is.False);
            Assert.That(broken.RevealedCells, Is.EqualTo(0), "broken data leaves the fog");
        }

        [Test]
        public void OnlyPlacesOnTheMapAreDiscoveredAndViewpointsOnlyByActivation()
        {
            var state = new ExplorationState(Map());

            Assert.That(state.Discover("loc.test.dorf", out MapPlace dorf), Is.True);
            Assert.That(dorf.DisplayName, Is.EqualTo("Dorf"));
            Assert.That(state.Discover("loc.test.dorf", out _), Is.False, "only once");
            Assert.That(state.Discover("loc.test.dorfplatz", out _), Is.False, "sub-zones are not on the map");
            Assert.That(state.Discover("loc.test.turm", out _), Is.False, "walking past the foot of a viewpoint is not enough");
            Assert.That(state.Discover("loc.unbekannt", out _), Is.False);
            state.CountPlaces(out int found, out int total);
            Assert.That(found, Is.EqualTo(1));
            Assert.That(total, Is.EqualTo(2), "Dorf and Mühle; viewpoints are counted on their own");
        }

        [Test]
        public void AViewpointClearsTheFogAndMarksThePlacesAround()
        {
            var state = new ExplorationState(Map());
            state.Discover("loc.test.dorf", out _);

            Assert.That(state.ActivateViewpoint("loc.test.turm", out int marked), Is.True);

            Assert.That(state.IsViewpointActivated("loc.test.turm"), Is.True);
            Assert.That(state.IsDiscovered("loc.test.turm"), Is.True, "the viewpoint itself is found");
            Assert.That(state.Fog.IsRevealed(-150f, 50f), Is.True);
            Assert.That(state.Fog.IsRevealed(-150f, 190f), Is.True, "140 m away, inside 150 m");
            Assert.That(marked, Is.EqualTo(0), "the village is already discovered, the mill is 250 m away");
            Assert.That(state.ActivateViewpoint("loc.test.turm", out _), Is.False, "only once");
            Assert.That(state.ActivateViewpoint("loc.test.dorf", out _), Is.False, "not a viewpoint");

            Assert.That(state.ActivateViewpoint("loc.test.fels", out marked), Is.True);
            Assert.That(marked, Is.EqualTo(0));
            state.CountViewpoints(out int found, out int total);
            Assert.That(found, Is.EqualTo(2));
            Assert.That(total, Is.EqualTo(2));
        }

        [Test]
        public void AViewpointMarksUnvisitedPlacesWithAQuestionMark()
        {
            RegionMapDefinition map = Map();
            var state = new ExplorationState(map);
            map.TryGetPlace("loc.test.muehle", out MapPlace mill);

            // The rock is 255 m from the mill: too far. A viewpoint close to it marks it.
            state.ActivateViewpoint("loc.test.fels", out int far);
            Assert.That(far, Is.EqualTo(0));
            Assert.That(state.IsRevealed(mill.Id), Is.False);

            RegionMapDefinition near = RegionMapDefinition.Create("map.near", "region.test", "Testland", "worldspace.test", null,
                new MapProjection(-256f, -256f, 512f), new Vector2(-200f, -200f), new Vector2(200f, 200f), 4f, 60f,
                new[] { mill, new MapPlace("loc.test.hochsitz", "Hochsitz", LocationKind.Viewpoint, 50f, -50f, 5f, true, 150f) });
            _created.Add(near);
            var nearState = new ExplorationState(near);
            Assert.That(nearState.ActivateViewpoint("loc.test.hochsitz", out int marked), Is.True);
            Assert.That(marked, Is.EqualTo(1));
            Assert.That(nearState.IsRevealed(mill.Id), Is.True, "seen, shown as ?");
            Assert.That(nearState.IsDiscovered(mill.Id), Is.False);
            nearState.Discover(mill.Id, out _);
            Assert.That(nearState.IsRevealed(mill.Id), Is.False, "visited: no longer a ?");
        }

        [Test]
        public void StateRoundTripsThroughItsDto()
        {
            RegionMapDefinition map = Map();
            var state = new ExplorationState(map) { Announced = true };
            state.RevealAround(10f, 10f, 60f);
            state.Discover("loc.test.muehle", out _);
            state.ActivateViewpoint("loc.test.fels", out _);

            var loaded = new ExplorationState(map);
            loaded.Load(state.ToDto());

            Assert.That(loaded.Fog.RevealedCells, Is.EqualTo(state.Fog.RevealedCells));
            Assert.That(loaded.IsDiscovered("loc.test.muehle"), Is.True);
            Assert.That(loaded.IsViewpointActivated("loc.test.fels"), Is.True);
            Assert.That(loaded.Announced, Is.True);
            loaded.Load(null);
            Assert.That(loaded.Fog.RevealedCells, Is.EqualTo(0), "new game: all in fog");
            Assert.That(loaded.IsDiscovered("loc.test.muehle"), Is.False);
        }

        [Test]
        public void ServiceDiscoversThroughAreasAnnouncesTheRegionAndSendsEvents()
        {
            using (var bus = new EventBus())
            {
                var discovered = new List<string>();
                var viewpoints = new List<int>();
                int regions = 0;
                bus.Subscribe<LocationDiscovered>(e => discovered.Add(e.LocationId));
                bus.Subscribe<ViewpointActivated>(e => viewpoints.Add(e.RevealedPlaces));
                bus.Subscribe<RegionDiscovered>(e => regions++);
                var service = new ExplorationService(bus);
                service.PostInitialize();

                // Entered places count on the next tick (the anchor ticks only while playing).
                var early = new AreaEntered("loc.test.dorf");
                bus.Publish(in early);
                RegionMapDefinition map = Map();
                service.SetActiveMap(map);
                Assert.That(discovered, Is.Empty, "not while the scene is still loading");

                int revision = service.Revision;
                service.Tick(new Vector3(0f, 0f, 0f));
                Assert.That(discovered, Is.EqualTo(new[] { "loc.test.dorf" }));
                Assert.That(regions, Is.EqualTo(1), "Region entdeckt");
                Assert.That(service.Revision, Is.GreaterThan(revision), "fog cleared");
                service.Tick(new Vector3(0.5f, 0f, 0f));
                Assert.That(regions, Is.EqualTo(1), "only once");

                var mill = new AreaEntered("loc.test.muehle");
                bus.Publish(in mill);
                var square = new AreaEntered("loc.test.dorfplatz");
                bus.Publish(in square);
                service.Tick(new Vector3(0.5f, 0f, 0f));
                Assert.That(discovered, Is.EqualTo(new[] { "loc.test.dorf", "loc.test.muehle" }));

                Assert.That(service.ActivateViewpoint("loc.test.turm"), Is.True);
                Assert.That(service.ActivateViewpoint("loc.test.turm"), Is.False);
                Assert.That(viewpoints, Has.Count.EqualTo(1));

                ExplorationDto saved = service.Capture();
                service.Restore(null);
                Assert.That(service.ActiveState.IsDiscovered("loc.test.dorf"), Is.False, "new game");
                service.Restore(saved);
                Assert.That(service.ActiveState.IsDiscovered("loc.test.dorf"), Is.True);
                Assert.That(service.ActiveState.IsViewpointActivated("loc.test.turm"), Is.True);
                Assert.That(discovered, Has.Count.EqualTo(2), "restoring sends no events");

                service.ClearActiveMap(map);
                Assert.That(service.ActiveMap, Is.Null, "scene unloaded: no map (crypt)");
                Assert.That(service.Capture().Maps, Has.Count.EqualTo(1), "the explored map stays in the save");
                service.Dispose();
            }
        }

        [Test]
        public void APlaceEnteredWhileLoadingCountsOnceAfterTheRestore()
        {
            using (var bus = new EventBus())
            {
                var discovered = new List<string>();
                bus.Subscribe<LocationDiscovered>(e => discovered.Add(e.LocationId));
                var service = new ExplorationService(bus);
                service.PostInitialize();

                // New game: the scene loads with the player at its start point, then the save system restores "nothing".
                service.SetActiveMap(Map());
                var start = new AreaEntered("loc.test.dorf");
                bus.Publish(in start);
                service.Restore(null);
                service.Tick(new Vector3(1f, 0f, 1f));
                service.Tick(new Vector3(5f, 0f, 1f));

                Assert.That(discovered, Is.EqualTo(new[] { "loc.test.dorf" }), "exactly one \"Ort entdeckt\"");
                service.Dispose();
            }
        }

        [Test]
        public void BoxPlacesUseTheirRealShape()
        {
            // The Nordhang: 170 × 60 m. A circle of half the long side would reach 85 m south of its centre.
            var slope = new MapPlace("loc.test.hang", "Hang", LocationKind.Area, -112f, 170f, 85f, true, 0f, 170f, 60f, 0f);
            var turned = new MapPlace("loc.test.feld", "Feld", LocationKind.Area, 0f, 0f, 20f, true, 0f, 40f, 10f, 90f);

            Assert.That(slope.IsBox, Is.True);
            Assert.That(slope.Contains(-112f, 195f), Is.True);
            Assert.That(slope.Contains(-150f, 145f), Is.True);
            Assert.That(slope.Contains(-156f, 108f), Is.False, "the farm 62 m south is not on the slope");
            Assert.That(turned.Contains(0f, 15f), Is.True, "turned by 90°: long along z");
            Assert.That(turned.Contains(15f, 0f), Is.False);
        }

        [Test]
        public void StandingInAPlaceDiscoversIt()
        {
            using (var bus = new EventBus())
            {
                var discovered = new List<string>();
                bus.Subscribe<LocationDiscovered>(e => discovered.Add(e.LocationId));
                var service = new ExplorationService(bus);
                service.SetActiveMap(Map());

                // The start village after a new game, or a place where a save was loaded: no trigger enter happens there.
                service.Tick(new Vector3(105f, 0f, -98f));
                service.Tick(new Vector3(-150f, 0f, 50f));

                Assert.That(discovered, Is.EqualTo(new[] { "loc.test.muehle" }), "viewpoints only by climbing up");
            }
        }

        [Test]
        public void SavedMapsWaitUntilTheirSceneIsLoaded()
        {
            var service = new ExplorationService(null);
            RegionMapDefinition map = Map();
            var state = new ExplorationState(map);
            state.Discover("loc.test.muehle", out _);
            var saved = new ExplorationDto();
            saved.Maps.Add(state.ToDto());

            service.Restore(saved);
            Assert.That(service.Capture().Maps, Has.Count.EqualTo(1), "kept while the scene is not loaded");
            service.SetActiveMap(map);

            Assert.That(service.ActiveState.IsDiscovered("loc.test.muehle"), Is.True);
        }
    }
}
