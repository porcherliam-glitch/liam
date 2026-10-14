using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Availability of quests with a giver (architecture 7.5 and 11.7, GDD 02 7.6): the start conditions are watched,
    /// <c>QuestAvailabilityChanged</c> tells the giver symbols, hidden quests are never announced, started quests are no longer
    /// offered, and after loading only the differences are announced (a symbol of the old game is withdrawn), so symbols read
    /// the current state with <c>GetAvailableQuestIds</c>.
    /// </summary>
    [TestFixture]
    public sealed class QuestAvailabilityTests
    {
        private const string Flag = "flag.eichental.test_frei";
        private const string Offered = "quest.side.test.angebot";
        private const string Hidden = "quest.side.test.versteckt";
        private const string Giver = "npc.eichental.wirt_ulf";

        private QuestTestEnvironment _env;
        private EventRecorder<QuestAvailabilityChanged> _events;

        [SetUp]
        public void SetUp()
        {
            _env = Create();
            _events = new EventRecorder<QuestAvailabilityChanged>(_env.Bus);
        }

        [TearDown]
        public void TearDown()
        {
            _events.Dispose();
            _env.Dispose();
        }

        [Test]
        public void StartCondition_Watched_AnnouncesTheGiverSymbol()
        {
            Assert.That(_env.StatusOf(Offered), Is.EqualTo(QuestStatus.Unknown));
            Assert.That(_env.Quests.Availability.WatchCount, Is.EqualTo(2));

            _env.World.SetBool(Flag, true, "test");
            _env.Settle();

            Assert.That(_env.StatusOf(Offered), Is.EqualTo(QuestStatus.Available));
            Assert.That(_events.Count, Is.EqualTo(1), "hidden quest not announced");
            Assert.That(_events.Last.QuestId, Is.EqualTo(Offered));
            Assert.That(_events.Last.GiverId, Is.EqualTo(Giver));
            Assert.That(_events.Last.Available, Is.True);
            Assert.That(_env.StatusOf(Hidden), Is.EqualTo(QuestStatus.Available), "hidden quests are available, only not shown");
        }

        [Test]
        public void StartedQuest_IsNoLongerOffered()
        {
            _env.World.SetBool(Flag, true, "test");
            _env.Settle();

            _env.Quests.TryStart(Offered, Giver);

            Assert.That(_events.Last.Available, Is.False);
            Assert.That(_env.Quests.Availability.IsAvailable(Offered), Is.False);
            Assert.That(_env.StatusOf(Offered), Is.EqualTo(QuestStatus.Active));
        }

        [Test]
        public void Load_WithdrawsSymbolsThatAreNoLongerAvailable()
        {
            _env.World.SetBool(Flag, true, "test");
            _env.Settle();
            _events.Clear();

            using (var oldGame = Create())
            {
                oldGame.SaveAndLoadInto(_env);
            }

            Assert.That(_env.StatusOf(Offered), Is.EqualTo(QuestStatus.Unknown));
            Assert.That(_events.Count, Is.EqualTo(1));
            Assert.That(_events.Last.QuestId, Is.EqualTo(Offered));
            Assert.That(_events.Last.Available, Is.False);
        }

        [Test]
        public void Load_KeepsSymbolsThatStayAvailable_WithoutNewEvents()
        {
            _env.World.SetBool(Flag, true, "test");
            _env.Settle();
            _events.Clear();

            _env.SaveAndLoadInto(_env);

            Assert.That(_env.StatusOf(Offered), Is.EqualTo(QuestStatus.Available));
            Assert.That(_events.Count, Is.EqualTo(0));
        }

        [Test]
        public void GetAvailableQuestIds_GivesTheStateWithoutEvents_PerGiver_WithoutHiddenQuests()
        {
            var ids = new List<string> { "alt" };
            Assert.That(_env.Quests.GetAvailableQuestIds(Giver, ids), Is.EqualTo(0));
            Assert.That(ids, Is.Empty, "the list is cleared");

            _env.World.SetBool(Flag, true, "test");
            _env.Settle();
            _env.SaveAndLoadInto(_env);
            _events.Clear();

            Assert.That(_env.Quests.GetAvailableQuestIds(Giver, ids), Is.EqualTo(1), "a symbol enabled after the load finds the quest");
            Assert.That(ids, Is.EqualTo(new[] { Offered }), "hidden quests are not offered");
            Assert.That(_env.Quests.GetAvailableQuestIds("npc.eichental.niemand", ids), Is.EqualTo(0));
            Assert.That(_env.Quests.GetAvailableQuestIds(string.Empty, ids), Is.EqualTo(1), "empty giver = all givers");

            _env.Quests.TryStart(Offered, Giver);
            Assert.That(_env.Quests.GetAvailableQuestIds(Giver, ids), Is.EqualTo(0));
        }

        private static QuestTestEnvironment Create()
        {
            QuestSpec offered = new QuestSpecBuilder(Offered)
                .Giver(Giver)
                .StartCondition(new FlagIs(Flag, 1))
                .Stage(new StageBuilder("s10").Objective(new TalkToObjective("o1", Giver)).EndSuccess())
                .Build();
            QuestSpec hidden = new QuestSpecBuilder(Hidden)
                .Giver(Giver)
                .Category(QuestCategory.Side, QuestTraits.Hidden)
                .StartCondition(new FlagIs(Flag, 1))
                .Stage(new StageBuilder("s10").Objective(new TalkToObjective("o1", Giver)).EndSuccess())
                .Build();
            return new QuestTestEnvironment(FlagRegistry.FromSpecs(FlagSpec.Bool(Flag)), offered, hidden);
        }
    }
}
