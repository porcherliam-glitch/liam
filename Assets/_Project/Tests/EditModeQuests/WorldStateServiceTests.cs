using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// The world state (architecture 8, §6.5): bool and int values with start values from the flag definitions, clamping per
    /// kind, sparse storage, <c>FlagChanged</c> only on real changes, playtime stamps, typo protection (undefined ids are
    /// stored but logged once), quest-local reset by prefix and the debug API (query, console text, history, write log,
    /// reset by source).
    /// </summary>
    [TestFixture]
    public sealed class WorldStateServiceTests
    {
        private const string Burned = "flag.eichental.dorf_zerstoert";
        private const string Bandits = "stat.global.banditen_getoetet";
        private const string Outcome = "flag.eichental.muehlbach_ausgang";
        private const string Resonance = "stat.player.leere_resonanz";
        private const string Gate = "flag.eichental.tor_offen";

        private LogCapture _log;
        private EventBus _bus;
        private FakePlaytimeClock _clock;
        private WorldStateService _world;
        private EventRecorder<FlagChanged> _changes;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _clock = new FakePlaytimeClock();
            FlagRegistry flags = FlagRegistry.FromSpecs(
                FlagSpec.Bool(Burned),
                FlagSpec.Counter(Bandits),
                FlagSpec.Enum(Outcome, "unbekannt", "zerschlagen", "vertrieben", "verhandelt", "Mühlenwache", "verhaftet"),
                FlagSpec.StoryNumber(Resonance, 0, 100, 10),
                new FlagSpec(Gate, FlagKind.Bool, 1));
            _world = new WorldStateService(_bus, flags, _clock);
            _changes = new EventRecorder<FlagChanged>(_bus);
        }

        [TearDown]
        public void TearDown()
        {
            _changes.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void StartValues_ComeFromTheDefinitions()
        {
            Assert.That(_world.GetBool(Burned), Is.False);
            Assert.That(_world.GetInt(Resonance), Is.EqualTo(10));
            Assert.That(_world.GetBool(Gate), Is.True, "bool with start value true");
            Assert.That(_world.GetInt("flag.unbekannt.irgendwas"), Is.EqualTo(0));
            Assert.That(_world.GetInt(null), Is.EqualTo(0));
            Assert.That(_world.StoredCount, Is.EqualTo(0), "nothing stored for start values (sparse)");
            Assert.That(_world.IsDefined(Burned), Is.True);
            Assert.That(_world.IsDefined("flag.unbekannt.irgendwas"), Is.False);
        }

        [Test]
        public void SetBool_PublishesFlagChanged_OnlyOnRealChanges()
        {
            _world.SetBool(Burned, true, "quest.main.asche_ueber_eichental");
            _world.SetBool(Burned, true, "quest.main.asche_ueber_eichental");

            Assert.That(_changes.Count, Is.EqualTo(1));
            Assert.That(_changes.Last.FlagId, Is.EqualTo(Burned));
            Assert.That(_changes.Last.OldValue, Is.EqualTo(0));
            Assert.That(_changes.Last.NewValue, Is.EqualTo(1));
            Assert.That(_world.GetBool(Burned), Is.True);
        }

        [Test]
        public void Values_AreClampedByKind()
        {
            _world.SetInt(Burned, 7, "test");
            Assert.That(_world.GetInt(Burned), Is.EqualTo(1), "bool stores 0/1");

            Assert.That(_world.Add(Bandits, -5, "test"), Is.EqualTo(0), "counter never below 0");
            Assert.That(_world.Add(Bandits, 37, "test"), Is.EqualTo(37));

            _world.SetInt(Resonance, 250, "test");
            Assert.That(_world.GetInt(Resonance), Is.EqualTo(100), "story number clamped to max");
            _world.SetInt(Resonance, -3, "test");
            Assert.That(_world.GetInt(Resonance), Is.EqualTo(0), "story number clamped to min");
        }

        [Test]
        public void EnumValueOutsideTheList_IsStoredButLogged()
        {
            _world.SetInt(Outcome, 9, "test");

            Assert.That(_world.GetInt(Outcome), Is.EqualTo(9));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "value list"), Is.True);
        }

        [Test]
        public void UndefinedFlag_IsStored_AndLoggedOnce()
        {
            _world.SetBool("flag.eichental.tippfehler", true, "dlg.test");
            _world.SetBool("flag.eichental.tippfehler", false, "dlg.test");
            _world.SetBool("flag.eichental.tippfehler", true, "dlg.test");

            Assert.That(_world.GetBool("flag.eichental.tippfehler"), Is.True);
            Assert.That(_world.UndefinedFlagIds, Does.Contain("flag.eichental.tippfehler"));
            Assert.That(_log.Sink.Count(LogLevel.Warning), Is.EqualTo(1), _log.Sink.Dump());
        }

        [Test]
        public void SettingTheStartValueAgain_RemovesTheStoredEntry()
        {
            _world.SetBool(Burned, true, "test");
            Assert.That(_world.StoredCount, Is.EqualTo(1));

            _world.SetBool(Burned, false, "test");

            Assert.That(_world.StoredCount, Is.EqualTo(0));
            Assert.That(_changes.Count, Is.EqualTo(2));
        }

        [Test]
        public void ChangeTime_IsTheActivePlaytime()
        {
            _clock.PlaytimeSeconds = 5400.0;
            _world.SetBool(Burned, true, "test");
            _clock.AdvanceHours(2.0);

            Assert.That(_world.LastChangedPlaytime(Burned), Is.EqualTo(5400.0));
            Assert.That(_world.SecondsSinceChange(Burned), Is.EqualTo(7200.0));
            Assert.That(_world.LastChangedPlaytime(Bandits), Is.EqualTo(0.0), "never changed");
        }

        [Test]
        public void ResetPrefix_ResetsQuestLocalFlags_WithEvents()
        {
            _world.SetInt("quest.side.test.lokal.zaehler", 3, "quest.side.test");
            _world.SetBool("quest.side.test.lokal.tuer", true, "quest.side.test");
            _world.SetBool(Burned, true, "quest.side.test");
            _changes.Clear();

            int count = _world.ResetPrefix("quest.side.test.lokal.", "quest.side.test");

            Assert.That(count, Is.EqualTo(2));
            Assert.That(_changes.Count, Is.EqualTo(2));
            Assert.That(_world.GetInt("quest.side.test.lokal.zaehler"), Is.EqualTo(0));
            Assert.That(_world.GetBool(Burned), Is.True, "other flags stay");
            Assert.That(_world.ResetPrefix(string.Empty, "x"), Is.EqualTo(0), "empty prefix resets nothing");
        }

        [Test]
        public void Revision_GrowsWithEveryChange()
        {
            int before = _world.Revision;
            _world.SetBool(Burned, true, "test");
            _world.SetBool(Burned, true, "test");

            Assert.That(_world.Revision, Is.EqualTo(before + 1));
        }

        [Test]
        public void Query_ListsDefinitionsAndStoredEntries_SortedByPrefix()
        {
            _world.SetBool(Burned, true, "test");
            _world.SetBool("flag.eichental.ohne_definition", true, "test");

            List<FlagSnapshot> eichental = _world.Query("flag.eichental.", false);
            List<FlagSnapshot> changed = _world.Query(string.Empty, true);

            Assert.That(eichental.ConvertAll(s => s.Id), Is.EqualTo(new[] { Burned, Outcome, "flag.eichental.ohne_definition", Gate }));
            Assert.That(changed.ConvertAll(s => s.Id), Is.EquivalentTo(new[] { Burned, "flag.eichental.ohne_definition" }));
        }

        [Test]
        public void TryGetSnapshot_FormatsTheValue()
        {
            _world.SetInt(Outcome, 4, "test");

            Assert.That(_world.TryGetSnapshot(Outcome, out FlagSnapshot snapshot), Is.True);
            Assert.That(snapshot.Value, Is.EqualTo(4));
            Assert.That(snapshot.IsChanged, Is.True);
            Assert.That(snapshot.ToString(), Does.Contain("Mühlenwache"));
            Assert.That(_world.TryGetSnapshot("flag.gibt.es_nicht", out _), Is.False);
        }

        [Test]
        public void TrySetFromText_UnderstandsNumbersBoolWordsAndEnumNames()
        {
            Assert.That(_world.TrySetFromText(Burned, "wahr", "console", out _), Is.True);
            Assert.That(_world.GetBool(Burned), Is.True);
            Assert.That(_world.TrySetFromText(Outcome, "Mühlenwache", "console", out string message), Is.True, message);
            Assert.That(_world.GetInt(Outcome), Is.EqualTo(4));
            Assert.That(_world.TrySetFromText(Bandits, "12", "console", out _), Is.True);
            Assert.That(_world.GetInt(Bandits), Is.EqualTo(12));
            Assert.That(_world.TrySetFromText(Bandits, "viele", "console", out message), Is.False);
            Assert.That(message, Does.Contain("nicht verstanden"));
        }

        [Test]
        public void History_KeepsTheLast200Changes()
        {
            for (int i = 1; i <= WorldStateService.HistorySize + 5; i++)
            {
                _world.SetInt(Bandits, i, "test");
            }

            List<FlagChangeRecord> history = _world.GetRecentChanges();

            Assert.That(history.Count, Is.EqualTo(WorldStateService.HistorySize));
            Assert.That(history[0].NewValue, Is.EqualTo(6), "oldest kept entry");
            Assert.That(history[history.Count - 1].NewValue, Is.EqualTo(WorldStateService.HistorySize + 5));
        }

        [Test]
        public void WriteLog_ResetFlagsWrittenBy_UndoesAQuest()
        {
            _world.SetBool(Burned, true, "quest.main.asche_ueber_eichental");
            _world.SetInt(Outcome, 2, "quest.side.eichental.banditen_am_muehlbach");
            _world.SetInt(Resonance, 50, "quest.main.asche_ueber_eichental");

            Assert.That(_world.GetFlagsWrittenBy("quest.main.asche_ueber_eichental"), Is.EqualTo(new[] { Burned, Resonance }));

            int reset = _world.ResetFlagsWrittenBy("quest.main.asche_ueber_eichental", "debug");

            Assert.That(reset, Is.EqualTo(2));
            Assert.That(_world.GetBool(Burned), Is.False);
            Assert.That(_world.GetInt(Resonance), Is.EqualTo(10), "back to the start value");
            Assert.That(_world.GetInt(Outcome), Is.EqualTo(2), "flags of other sources stay");
        }

        [Test]
        public void WriteWithoutId_IsIgnoredAndLogged()
        {
            _world.SetBool(string.Empty, true, "test");

            Assert.That(_changes.Count, Is.EqualTo(0));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "without flag id"), Is.True);
        }
    }
}
