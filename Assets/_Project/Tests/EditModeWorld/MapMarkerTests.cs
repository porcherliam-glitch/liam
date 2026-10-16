using Aetherfall.World;
using Aetherfall.World.Exploration;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Own map markers (GDD 05 1.8): set and removed at a point, at most 50 per map, symbols wrap, kept through the DTO, and the
    /// service counts the change only when something happened.
    /// </summary>
    [TestFixture]
    public sealed class MapMarkerTests
    {
        private RegionMapDefinition _map;

        [SetUp]
        public void SetUp()
        {
            _map = RegionMapDefinition.Create("map.test", "region.test", "Testland", "worldspace.test", null, new MapProjection(-256f, -256f, 512f),
                new Vector2(-200f, -200f), new Vector2(200f, 200f), 4f, 60f,
                new[] { new MapPlace("loc.test.dorf", "Dorf", LocationKind.Settlement, 0f, 0f, 40f, true, 0f) });
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_map);
        }

        [Test]
        public void Toggle_SetsAMarker_AndTheSamePointRemovesIt()
        {
            var state = new ExplorationState(_map);

            Assert.That(state.ToggleMarker(10f, 20f, 1, 5f), Is.EqualTo(MapMarkerChange.Added));
            Assert.That(state.Markers.Count, Is.EqualTo(1));
            Assert.That(state.Markers[0].Symbol, Is.EqualTo(1));

            Assert.That(state.ToggleMarker(13f, 21f, 4, 5f), Is.EqualTo(MapMarkerChange.Removed), "3.2 m away: inside the pick radius");
            Assert.That(state.Markers.Count, Is.EqualTo(0));
        }

        [Test]
        public void Toggle_RemovesTheNearestOfTwo()
        {
            var state = new ExplorationState(_map);
            state.ToggleMarker(0f, 0f, 0, 5f);
            state.ToggleMarker(6f, 0f, 2, 5f);

            state.ToggleMarker(4f, 0f, 0, 5f);

            Assert.That(state.Markers.Count, Is.EqualTo(1));
            Assert.That(state.Markers[0].X, Is.EqualTo(0f), "the one 2 m away went, not the one 4 m away");
        }

        [Test]
        public void AtMostFiftyPerMap()
        {
            var state = new ExplorationState(_map);
            for (int i = 0; i < MapMarkerRules.MaxPerMap; i++)
            {
                Assert.That(state.ToggleMarker(i * 10f - 190f, 0f, 0, 1f), Is.EqualTo(MapMarkerChange.Added));
            }

            Assert.That(state.ToggleMarker(0f, 150f, 0, 1f), Is.EqualTo(MapMarkerChange.Full));
            Assert.That(state.Markers.Count, Is.EqualTo(MapMarkerRules.MaxPerMap));
            Assert.That(state.ToggleMarker(-190f, 0f, 0, 1f), Is.EqualTo(MapMarkerChange.Removed), "removing still works when full");
        }

        [Test]
        public void SymbolsWrapIntoTheSix()
        {
            Assert.That(MapMarkerRules.ClampSymbol(6), Is.EqualTo(0));
            Assert.That(MapMarkerRules.ClampSymbol(-1), Is.EqualTo(5));
            Assert.That(new MapMarker(0f, 0f, 13).Symbol, Is.EqualTo(1));
        }

        [Test]
        public void MarkersRoundTripThroughTheDto_AndOldSavesHaveNone()
        {
            var state = new ExplorationState(_map);
            state.ToggleMarker(-40f, 75f, 3, 5f);
            state.ToggleMarker(120f, -10f, 5, 5f);

            MapExplorationDto dto = state.ToDto();
            var loaded = new ExplorationState(_map);
            loaded.Load(dto);

            Assert.That(loaded.Markers.Count, Is.EqualTo(2));
            Assert.That(loaded.Markers[0].X, Is.EqualTo(-40f));
            Assert.That(loaded.Markers[0].Z, Is.EqualTo(75f));
            Assert.That(loaded.Markers[1].Symbol, Is.EqualTo(5));

            dto.Markers = null;
            loaded.Load(dto);
            Assert.That(loaded.Markers.Count, Is.EqualTo(0), "a save from before the markers");
        }

        [Test]
        public void BrokenPoints_AreNeitherSetNorLoaded()
        {
            var state = new ExplorationState(_map);
            Assert.That(state.ToggleMarker(float.PositiveInfinity, 0f, 0, 5f), Is.EqualTo(MapMarkerChange.None));

            MapExplorationDto dto = state.ToDto();
            dto.Markers.Add(new MapMarkerDto { X = float.NegativeInfinity, Z = 0f, Symbol = 0 });
            dto.Markers.Add(new MapMarkerDto { X = 1e30f, Z = 0f, Symbol = 0 });
            dto.Markers.Add(new MapMarkerDto { X = 10f, Z = 10f, Symbol = 2 });
            state.Load(dto);

            Assert.That(state.Markers.Count, Is.EqualTo(1), "an edited save must not leave a marker that can never be removed");
            Assert.That(state.Markers[0].Symbol, Is.EqualTo(2));
        }

        [Test]
        public void Service_CountsAChangeOnlyWhenSomethingHappened()
        {
            var service = new ExplorationService(null);
            Assert.That(service.ToggleMarker(0f, 0f, 0, 5f), Is.EqualTo(MapMarkerChange.None), "no map");

            service.SetActiveMap(_map);
            int revision = service.Revision;
            Assert.That(service.ToggleMarker(30f, 30f, 2, 5f), Is.EqualTo(MapMarkerChange.Added));
            Assert.That(service.Revision, Is.GreaterThan(revision));
            Assert.That(service.ActiveState.Markers.Count, Is.EqualTo(1));
        }
    }
}
