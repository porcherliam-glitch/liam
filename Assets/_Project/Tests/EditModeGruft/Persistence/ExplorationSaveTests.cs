using Aetherfall.SaveSystem;
using Aetherfall.World;
using Aetherfall.World.Exploration;
using Aetherfall.World.Gameplay;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.GruftSave
{
    /// <summary>
    /// Saving the exploration (architecture 9.2, section <c>world</c>, load order 80; S34): fog, discovered places and
    /// viewpoints survive the JSON round trip, a new game puts the map back into fog, and the DTO follows the save rules.
    /// </summary>
    [TestFixture]
    public sealed class ExplorationSaveTests
    {
        private RegionMapDefinition _map;

        [SetUp]
        public void SetUp()
        {
            _map = RegionMapDefinition.Create("map.test", "region.test", "Testland", "worldspace.test", null, new MapProjection(-256f, -256f, 512f),
                new Vector2(-200f, -200f), new Vector2(200f, 200f), 4f, 60f,
                new[]
                {
                    new MapPlace("loc.test.dorf", "Dorf", LocationKind.Settlement, 0f, 0f, 40f, true, 0f),
                    new MapPlace("loc.test.turm", "Turm", LocationKind.Viewpoint, -150f, 50f, 10f, true, 150f)
                });
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_map);
        }

        [Test]
        public void ExplorationSurvivesTheJsonRoundTrip()
        {
            var service = new ExplorationService(null);
            service.SetActiveMap(_map);
            service.Tick(new Vector3(20f, 0f, 20f));
            service.ActivateViewpoint("loc.test.turm");
            var saveable = new ExplorationSaveable(service);

            var dto = (ExplorationDto)saveable.Save();
            string json = new NewtonsoftJsonSerializer().Serialize(dto, false);
            var back = new NewtonsoftJsonSerializer().Deserialize<ExplorationDto>(json);
            var loaded = new ExplorationService(null);
            loaded.SetActiveMap(_map);
            new ExplorationSaveable(loaded).Load(back, new LoadContext("slot", 1, false, false, null));

            Assert.That(saveable.SaveKey, Is.EqualTo("world"));
            Assert.That(saveable.LoadOrder, Is.EqualTo(80), "architecture 9.2");
            Assert.That(loaded.ActiveState.Fog.RevealedCells, Is.EqualTo(service.ActiveState.Fog.RevealedCells));
            Assert.That(loaded.ActiveState.Fog.IsRevealed(20f, 20f), Is.True);
            Assert.That(loaded.ActiveState.IsViewpointActivated("loc.test.turm"), Is.True);
            Assert.That(loaded.ActiveState.Announced, Is.True, "no second \"Region entdeckt\" after loading");
        }

        [Test]
        public void NewGamePutsTheMapBackIntoFog()
        {
            var service = new ExplorationService(null);
            service.SetActiveMap(_map);
            service.Tick(Vector3.zero);

            new ExplorationSaveable(service).Load(null, LoadContext.NewGame);

            Assert.That(service.ActiveState.Fog.RevealedCells, Is.EqualTo(0));
            Assert.That(service.ActiveState.Announced, Is.False);
        }

        [Test]
        public void DtoFollowsTheSaveRules()
        {
            Assert.That(SaveDtoValidator.Validate(typeof(ExplorationDto), out string problem), Is.True, problem);
            Assert.That(SaveDtoValidator.Validate(typeof(MapExplorationDto), out problem), Is.True, problem);
        }
    }
}
