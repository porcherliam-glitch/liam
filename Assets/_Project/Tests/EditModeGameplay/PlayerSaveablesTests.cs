using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Player;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// The first saveables of the player (architecture 9.1/9.3): position and facing in world grid cells
    /// (<see cref="PlayerLocationSaveable"/>) and the resources health, stamina and mana (<see cref="PlayerResourcesSaveable"/>).
    /// </summary>
    [TestFixture]
    public sealed class PlayerSaveablesTests
    {
        private static readonly LoadContext Context = new LoadContext("char_01/quick_0", SaveFormat.CurrentVersion, false, false, null);

        private LogCapture _log;
        private EventBus _bus;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Location_KeysAndOrder()
        {
            var saveable = new PlayerLocationSaveable(new FakePlayerPlacement(), _bus);

            Assert.That(saveable.SaveKey, Is.EqualTo("player"));
            Assert.That(saveable.LoadOrder, Is.EqualTo(110));
            Assert.That(saveable.DataType, Is.EqualTo(typeof(PlayerLocationDto)));
            Assert.Throws<ArgumentNullException>(() => new PlayerLocationSaveable(null, _bus));
        }

        [Test]
        public void ToDto_SplitsTheWorldPositionIntoCellsOf512Metres()
        {
            PlayerLocationDto dto = PlayerLocationSaveable.ToDto(new PlayerPose(12.5f, 1.25f, -12f, 90f), "worldspace.test.testgelaende");

            Assert.That(dto.WorldSpaceId, Is.EqualTo("worldspace.test.testgelaende"));
            Assert.That(dto.CellX, Is.EqualTo(0));
            Assert.That(dto.CellZ, Is.EqualTo(-1), "negative coordinates belong to cell -1");
            Assert.That(dto.LocalX, Is.EqualTo(12.5f));
            Assert.That(dto.LocalY, Is.EqualTo(1.25f));
            Assert.That(dto.LocalZ, Is.EqualTo(500f));
            Assert.That(dto.Yaw, Is.EqualTo(90f));
            Assert.That(dto.Mounted, Is.False);
            Assert.That(dto.MovementMode, Is.EqualTo("onFoot"));
        }

        [TestCase(1300.25f, -1024f, 2, -2)]
        [TestCase(-0.5f, 511.75f, -1, 0)]
        [TestCase(0f, 0f, 0, 0)]
        public void ToDtoAndBack_KeepsThePosition(float x, float z, int cellX, int cellZ)
        {
            var pose = new PlayerPose(x, 3.5f, z, 270f);

            PlayerLocationDto dto = PlayerLocationSaveable.ToDto(pose, null);
            PlayerPose back = PlayerLocationSaveable.ToPose(dto);

            Assert.That(dto.CellX, Is.EqualTo(cellX));
            Assert.That(dto.CellZ, Is.EqualTo(cellZ));
            Assert.That(dto.WorldSpaceId, Is.EqualTo(string.Empty));
            Assert.That(back.X, Is.EqualTo(x).Within(1e-3f));
            Assert.That(back.Y, Is.EqualTo(3.5f));
            Assert.That(back.Z, Is.EqualTo(z).Within(1e-3f));
            Assert.That(back.Yaw, Is.EqualTo(270f));
        }

        [Test]
        public void Location_SaveCapturesThePlacementPose()
        {
            var placement = new FakePlayerPlacement(new PlayerPose(600f, 2f, 40f, 45f), "worldspace.aetherfall");
            var saveable = new PlayerLocationSaveable(placement, _bus);

            var dto = (PlayerLocationDto)saveable.Save();

            Assert.That(dto.WorldSpaceId, Is.EqualTo("worldspace.aetherfall"));
            Assert.That(dto.CellX, Is.EqualTo(1));
            Assert.That(dto.LocalX, Is.EqualTo(88f));
            Assert.That(dto.LocalZ, Is.EqualTo(40f));
            Assert.That(dto.Yaw, Is.EqualTo(45f));
        }

        [Test]
        public void Location_LoadPlacesThePlayer_AndAnnouncesTheSpawnAfterLoading()
        {
            var placement = new FakePlayerPlacement();
            var saveable = new PlayerLocationSaveable(placement, _bus);
            using (var spawned = new EventRecorder<PlayerSpawned>(_bus))
            {
                saveable.Load(PlayerLocationSaveable.ToDto(new PlayerPose(12.5f, 1.25f, -12f, 90f), "worldspace.test.testgelaende"), Context);

                Assert.That(placement.Placements.Count, Is.EqualTo(1));
                Assert.That(placement.CurrentPose.X, Is.EqualTo(12.5f));
                Assert.That(placement.CurrentPose.Z, Is.EqualTo(-12f));
                Assert.That(placement.CurrentPose.Yaw, Is.EqualTo(90f));
                Assert.That(spawned.Count, Is.EqualTo(0), "the spawn is announced after all sections are loaded");

                saveable.OnAfterLoad(Context);
                saveable.OnAfterLoad(Context);

                Assert.That(spawned.Count, Is.EqualTo(1), "exactly once per load");
                Assert.That(spawned.Last.WorldSpaceId, Is.EqualTo("worldspace.test.testgelaende"));
                Assert.That(spawned.Last.Position.x, Is.EqualTo(12.5f));
                Assert.That(spawned.Last.Position.y, Is.EqualTo(1.25f));
                Assert.That(spawned.Last.Position.z, Is.EqualTo(-12f));
            }
        }

        [Test]
        public void Location_NullData_KeepsThePlayerWhereHeIs()
        {
            var placement = new FakePlayerPlacement(new PlayerPose(1f, 2f, 3f, 4f));
            var saveable = new PlayerLocationSaveable(placement, _bus);
            using (var spawned = new EventRecorder<PlayerSpawned>(_bus))
            {
                saveable.Load(null, LoadContext.NewGame);
                saveable.OnAfterLoad(LoadContext.NewGame);

                Assert.That(placement.Placements, Is.Empty);
                Assert.That(spawned.Count, Is.EqualTo(0));
            }
        }

        [Test]
        public void Location_WrongDataType_IsRejected()
        {
            var saveable = new PlayerLocationSaveable(new FakePlayerPlacement(), _bus);

            Assert.Throws<ArgumentException>(() => saveable.Load(new PlayerResourcesDto(), Context));
        }

        [Test]
        public void Resources_KeysAndOrder()
        {
            var saveable = new PlayerResourcesSaveable(new Health(100f, ResourcePoolSettings.None), null, null);

            Assert.That(saveable.SaveKey, Is.EqualTo("stats.player"));
            Assert.That(saveable.LoadOrder, Is.EqualTo(45));
            Assert.That(saveable.LoadOrder, Is.LessThan(PlayerLocationSaveable.Order));
            Assert.Throws<ArgumentNullException>(() => new PlayerResourcesSaveable(null, null, null));
        }

        [Test]
        public void Resources_RoundTrip()
        {
            var health = new Health(200f, ResourcePoolSettings.Health, "player");
            var stamina = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            var mana = new ResourcePool(80f, ResourcePoolSettings.Mana);
            health.ApplyDamage(new DamageInfo(101.5f, "test"));
            stamina.Spend(35.75f);
            mana.Spend(25f);
            var saveable = new PlayerResourcesSaveable(health, stamina, mana);

            var dto = (PlayerResourcesDto)saveable.Save();
            Assert.That(dto.Health, Is.EqualTo(98.5f));
            Assert.That(dto.Stamina, Is.EqualTo(64.25f));
            Assert.That(dto.Mana, Is.EqualTo(55f));

            health.Heal(500f);
            stamina.Refill();
            mana.Refill();
            int damagedEvents = 0;
            health.Damaged += _ => damagedEvents++;
            saveable.Load(dto, Context);

            Assert.That(health.Current, Is.EqualTo(98.5f));
            Assert.That(stamina.Current, Is.EqualTo(64.25f));
            Assert.That(mana.Current, Is.EqualTo(55f));
            Assert.That(damagedEvents, Is.EqualTo(0), "loading is not damage");
        }

        [Test]
        public void Resources_LoadNeverRestoresADeadPlayer_AndClearsExhaustion()
        {
            var health = new Health(100f, ResourcePoolSettings.None, "player");
            var stamina = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            stamina.Spend(100f);
            var saveable = new PlayerResourcesSaveable(health, stamina, null);

            saveable.Load(new PlayerResourcesDto { Health = 0f, Stamina = 0f, Mana = 10f }, Context);

            Assert.That(health.Current, Is.EqualTo(1f));
            Assert.That(health.IsAlive, Is.True);
            Assert.That(stamina.Current, Is.EqualTo(0f));
            Assert.That(stamina.IsExhausted, Is.False);
        }

        [Test]
        public void Resources_NullData_RefillsEverything()
        {
            var health = new Health(100f, ResourcePoolSettings.None, "player");
            var stamina = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            var mana = new ResourcePool(50f, ResourcePoolSettings.Mana);
            health.Kill("test");
            stamina.Spend(60f);
            mana.Spend(50f);
            var saveable = new PlayerResourcesSaveable(health, stamina, mana);

            saveable.Load(null, LoadContext.NewGame);

            Assert.That(health.IsAlive, Is.True);
            Assert.That(health.Current, Is.EqualTo(100f));
            Assert.That(stamina.IsFull, Is.True);
            Assert.That(mana.IsFull, Is.True);
        }

        [Test]
        public void Resources_WithoutStaminaAndMana_SavesZeros()
        {
            var saveable = new PlayerResourcesSaveable(new Health(100f, ResourcePoolSettings.None), null, null);

            var dto = (PlayerResourcesDto)saveable.Save();

            Assert.That(dto.Health, Is.EqualTo(100f));
            Assert.That(dto.Stamina, Is.EqualTo(0f));
            Assert.That(dto.Mana, Is.EqualTo(0f));
        }
    }
}
