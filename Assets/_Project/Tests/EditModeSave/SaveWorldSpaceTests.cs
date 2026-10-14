using System;
using System.Linq;
using System.Text;
using Aetherfall.SaveSystem;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// Saving across world spaces (guide 12, 11.5): the world space in the save header (round trip, old saves without the field)
    /// and <see cref="ISaveManager.CarryOver"/> (values of the player go with him through a portal; loading and a new game
    /// discard them).
    /// </summary>
    [TestFixture]
    public sealed class SaveWorldSpaceTests
    {
        private const string Crypt = "worldspace.eichental.gruft";

        private SaveTestEnvironment _env;
        private SaveManager _manager;

        [SetUp]
        public void SetUp()
        {
            _env = new SaveTestEnvironment();
            _manager = _env.CreateManager();
        }

        [TearDown]
        public void TearDown()
        {
            _manager.Dispose();
            _env.Dispose();
        }

        [Test]
        public void Header_WorldSpaceId_RoundTrip_AndVisibleInTheSlotInfo()
        {
            _manager.Register(new CounterSaveable("player", 110));
            _manager.RegisterHeaderContributor(new WorldSpaceContributor(Crypt));

            SaveResult saved = _manager.Save(SaveRequest.Quick());

            Assert.That(saved.Success, Is.True, saved.ToString());
            SaveSlotInfo slot = _manager.ListSlots(null).Single();
            Assert.That(slot.WorldSpaceId, Is.EqualTo(Crypt));
            Assert.That(slot.Header.Location.WorldSpaceId, Is.EqualTo(Crypt));
        }

        [Test]
        public void Header_WithoutWorldSpace_KeepsTheOldFormat_AndReadsEmpty()
        {
            var codec = new SaveDocumentCodec();
            var header = new SaveHeader { SlotId = "char_01/manual_0" };
            header.Location.RegionId = "region.eichental";
            JObject json = JObject.Parse(Encoding.UTF8.GetString(codec.EncodeHeader(header)));
            JObject location = (JObject)json.Properties().Single(p => p.Name.Equals("Location", StringComparison.OrdinalIgnoreCase)).Value;
            Assert.That(location.Properties().Any(p => p.Name.Equals("WorldSpaceId", StringComparison.OrdinalIgnoreCase)), Is.False,
                "an empty world space is not written (old saves stay byte-identical)");

            SaveHeader old = codec.DecodeHeader(Encoding.UTF8.GetBytes(json.ToString()));

            Assert.That(old.Location.RegionId, Is.EqualTo("region.eichental"));
            Assert.That(old.Location.WorldSpaceId, Is.Empty);
            Assert.That(new SaveSlotInfo("char_01", "manual_0", old, false).WorldSpaceId, Is.Empty);
            Assert.That(new SaveSlotInfo("char_01", "manual_0", null, false).WorldSpaceId, Is.Empty, "damaged slot without header");
        }

        [Test]
        public void CarryOver_TheNextRegistrationWithTheKeyGetsTheState()
        {
            var village = new CounterSaveable("stats.player", 45) { Value = 37 };
            _manager.Register(village);

            _manager.CarryOver(village);
            Assert.That(_manager.Saveables, Has.No.Member(village), "carried over = unregistered");

            var crypt = new CounterSaveable("stats.player", 45);
            _manager.Register(crypt);
            Assert.That(crypt.Value, Is.EqualTo(37));
            Assert.That(crypt.LoadCount, Is.EqualTo(1));

            var later = new CounterSaveable("stats.player", 45);
            _manager.Unregister(crypt);
            _manager.Register(later);
            Assert.That(later.LoadCount, Is.EqualTo(0), "a carried section is delivered once");
        }

        [Test]
        public void CarryOver_ASaveInBetweenKeepsTheSection()
        {
            var village = new CounterSaveable("stats.player", 45) { Value = 12 };
            _manager.Register(village);
            _manager.CarryOver(village);

            SaveResult saved = _manager.Save(SaveRequest.Quick());
            Assert.That(saved.Success, Is.True, saved.ToString());
            var reader = new CounterSaveable("stats.player", 45);
            _manager.Register(reader);
            Assert.That(reader.Value, Is.EqualTo(12), "carried section still delivered after the save");

            reader.Value = 0;
            _manager.Load(saved.SlotId);
            Assert.That(reader.Value, Is.EqualTo(12), "and it was written into the save");
        }

        [Test]
        public void CarryOver_IsDiscardedByLoadAndNewGame()
        {
            var counter = new CounterSaveable("other", 10) { Value = 1 };
            _manager.Register(counter);
            SaveResult saved = _manager.Save(SaveRequest.Quick());

            var village = new CounterSaveable("stats.player", 45) { Value = 50 };
            _manager.Register(village);
            _manager.CarryOver(village);
            _manager.Load(saved.SlotId);
            var afterLoad = new CounterSaveable("stats.player", 45);
            _manager.Register(afterLoad);
            Assert.That(afterLoad.LoadCount, Is.EqualTo(0), "loading replaces the carried values");

            _manager.CarryOver(afterLoad);
            _manager.NewGame(new NewGameSettings(null));
            var afterNewGame = new CounterSaveable("stats.player", 45);
            _manager.Register(afterNewGame);
            Assert.That(afterNewGame.LoadCount, Is.EqualTo(0), "a new game starts with fresh values");
        }

        [Test]
        public void CarryOver_OfAnUnregisteredSaveable_DoesNothing()
        {
            var stranger = new CounterSaveable("stats.player", 45) { Value = 9 };

            _manager.CarryOver(stranger);
            _manager.CarryOver(null);
            var player = new CounterSaveable("stats.player", 45);
            _manager.Register(player);

            Assert.That(player.LoadCount, Is.EqualTo(0));
        }

        private sealed class WorldSpaceContributor : ISaveHeaderContributor
        {
            private readonly string _worldSpaceId;

            public WorldSpaceContributor(string worldSpaceId)
            {
                _worldSpaceId = worldSpaceId;
            }

            public void Contribute(SaveHeader header)
            {
                header.Location.WorldSpaceId = _worldSpaceId;
            }
        }
    }
}
