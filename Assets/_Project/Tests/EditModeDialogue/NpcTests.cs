using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using Aetherfall.NPC;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// The NPC system (architecture 11.10, assembly NPC Nr. 22) without scene: NPC data as speaker directory of the dialogues,
    /// relationship values with tiers and events, death and hostility, the NPC conditions and actions, the interaction prompt
    /// and the look model (turn to the player, glance aside when idle).
    /// </summary>
    [TestFixture]
    public sealed class NpcTests
    {
        private DialogueTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _env = TestDialogues.Environment();
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        [Test]
        public void SpeakerDirectory_ReturnsTheNpcData()
        {
            Assert.That(_env.Npcs.TryGetSpeaker(TestDialogues.Stranger, out DialogueSpeakerInfo info), Is.True);

            Assert.That(info.Name, Is.EqualTo("Ansgar"));
            Assert.That(info.Role, Is.EqualTo("Wanderer"));
            Assert.That(info.NameKnownFromStart, Is.False);
            Assert.That(info.Level, Is.EqualTo(6));
            Assert.That(info.Greed, Is.EqualTo(1.5f));
            Assert.That(info.Unbribable, Is.True);
            Assert.That(info.Relationship, Is.EqualTo(-20), "start relationship (persuasion bonus, GDD 02 12.3)");
            _env.Npcs.ChangeRelationship(TestDialogues.Stranger, 45, "test");
            Assert.That(_env.Npcs.TryGetSpeaker(TestDialogues.Stranger, out info), Is.True);
            Assert.That(info.Relationship, Is.EqualTo(25), "always the current value");
            Assert.That(_env.Npcs.TryGetSpeaker("npc.test.niemand", out _), Is.False);
        }

        [Test]
        public void Relationship_StartsAtTheStartValue_IsClamped_AndPublishesChanges()
        {
            Assert.That(_env.Npcs.GetRelationship(TestDialogues.Stranger), Is.EqualTo(-20));
            Assert.That(_env.Npcs.GetTier(TestDialogues.Stranger), Is.EqualTo(RelationshipTier.Dislike));

            int value = _env.Npcs.ChangeRelationship(TestDialogues.Stranger, 500, "test");

            Assert.That(value, Is.EqualTo(RelationshipRules.Max));
            Assert.That(_env.Relationships.Count, Is.EqualTo(1));
            Assert.That(_env.Relationships.Last.OldValue, Is.EqualTo(-20));
            Assert.That(_env.Relationships.Last.NewValue, Is.EqualTo(100));
            Assert.That(_env.Npcs.ChangeRelationship(TestDialogues.Stranger, 1, "test"), Is.EqualTo(100));
            Assert.That(_env.Relationships.Count, Is.EqualTo(1), "no event without change");
        }

        [TestCase(-100, RelationshipTier.Enemy)]
        [TestCase(-50, RelationshipTier.Enemy)]
        [TestCase(-49, RelationshipTier.Dislike)]
        [TestCase(-10, RelationshipTier.Dislike)]
        [TestCase(-9, RelationshipTier.Neutral)]
        [TestCase(9, RelationshipTier.Neutral)]
        [TestCase(10, RelationshipTier.Friendly)]
        [TestCase(49, RelationshipTier.Friendly)]
        [TestCase(50, RelationshipTier.Trusted)]
        public void Tiers(int value, RelationshipTier tier)
        {
            Assert.That(RelationshipRules.TierOf(value), Is.EqualTo(tier));
        }

        [Test]
        public void TierNames_AreGerman()
        {
            Assert.That(RelationshipRules.GermanName(RelationshipTier.Enemy), Is.EqualTo("Feind"));
            Assert.That(RelationshipRules.GermanName(RelationshipTier.Trusted), Is.EqualTo("Vertraut"));
        }

        [Test]
        public void MarkDead_PublishesNpcDiedOnce()
        {
            Assert.That(_env.Npcs.MarkDead(TestDialogues.Ulf, "player"), Is.True);
            Assert.That(_env.Npcs.MarkDead(TestDialogues.Ulf, "player"), Is.False);

            Assert.That(_env.Npcs.IsAlive(TestDialogues.Ulf), Is.False);
            Assert.That(_env.Deaths.Count, Is.EqualTo(1));
        }

        [Test]
        public void SetHostile_RaisesHostilityChanged_OnlyOnChange()
        {
            int calls = 0;
            _env.Npcs.HostilityChanged += (id, hostile) => calls++;

            _env.Npcs.SetHostile(MuehlbachDialogueFixture.Group, true, "test");
            _env.Npcs.SetHostile(MuehlbachDialogueFixture.Group, true, "test");
            _env.Npcs.SetHostile(MuehlbachDialogueFixture.Group, false, "test");

            Assert.That(calls, Is.EqualTo(2));
            Assert.That(_env.Npcs.IsHostile(MuehlbachDialogueFixture.Group), Is.False);
        }

        [Test]
        public void HostileGroup_MakesItsMembersHostile_ButNotOthers()
        {
            Assert.That(_env.Npcs.IsHostile(MuehlbachDialogueFixture.Harrik), Is.False);

            _env.Npcs.SetHostile(MuehlbachDialogueFixture.Group, true, "test");

            Assert.That(_env.Npcs.IsHostile(MuehlbachDialogueFixture.Harrik), Is.True, "member of group.banditen_muehlbach");
            Assert.That(_env.Npcs.IsHostile(TestDialogues.Ulf), Is.False, "no group");
            Assert.That(_env.Npcs.IsHostile(null), Is.False);
            _env.Npcs.SetHostile(MuehlbachDialogueFixture.Group, false, "test");
            Assert.That(_env.Npcs.IsHostile(MuehlbachDialogueFixture.Harrik), Is.False);
        }

        [Test]
        public void Conditions_UseThePartner_WhenNoNpcIsSet()
        {
            var ctx = new ConditionContext(_env.Services, SubjectIds.Player, TestDialogues.Ulf, "test");

            Assert.That(new RelationshipAtLeast(string.Empty, 0).Evaluate(ctx), Is.True);
            Assert.That(new RelationshipAtLeast(string.Empty, 10).Evaluate(ctx), Is.False);
            Assert.That(new RelationshipAtLeast(TestDialogues.Stranger, -20).Evaluate(ctx), Is.True);
            Assert.That(new NpcAlive(string.Empty).Evaluate(ctx), Is.True);
            _env.Npcs.MarkDead(TestDialogues.Ulf, "test");
            Assert.That(new NpcAlive(string.Empty).Evaluate(ctx), Is.False);
        }

        [Test]
        public void Actions_ChangeTheRelationship_AndStartCombat()
        {
            var ctx = new ActionContext(_env.Services, SubjectIds.Player, TestDialogues.Ulf, TestDialogues.Basic);

            new ChangeRelationship(string.Empty, 15).Execute(ctx);
            new StartCombat(string.Empty).Execute(ctx);

            Assert.That(_env.Npcs.GetRelationship(TestDialogues.Ulf), Is.EqualTo(15));
            Assert.That(_env.Npcs.IsHostile(TestDialogues.Ulf), Is.True);
        }

        [Test]
        public void RelationshipInADialogue_OpensAnOption()
        {
            DialogueSpec spec = new DialogueSpecBuilder("dlg.test.ulf_freund")
                .Speaker(TestDialogues.Ulf)
                .Nodes(
                    new ChoiceNode("n010")
                        .Add(new DialogueOption("a", "Ein Freundschaftsbier?", "n020").SelectableWhen(new RelationshipAtLeast(string.Empty, 10), "Freund"))
                        .Add(new DialogueOption("b", "Bis dann.", "n990")),
                    new LineNode("n020", "Für dich immer.").Do(new ChangeRelationship(string.Empty, 5)).EndWith("bier"),
                    new EndNode("n990", "tschuess"))
                .Build();
            using (var env = new DialogueTestEnvironment(null, TestDialogues.Npcs(), TestDialogues.Flags(), spec))
            {
                env.Start("dlg.test.ulf_freund", TestDialogues.Ulf);
                Assert.That(env.Option("a").IsEnabled, Is.False);
                Assert.That(env.Option("a").TagText, Is.EqualTo("[Freund]"));
                env.Dialogues.ForceEnd("test");

                env.Npcs.ChangeRelationship(TestDialogues.Ulf, 10, "test");
                env.Start("dlg.test.ulf_freund", TestDialogues.Ulf);
                Assert.That(env.Option("a").IsEnabled, Is.True);
                env.Choose("a");

                Assert.That(env.Npcs.GetRelationship(TestDialogues.Ulf), Is.EqualTo(15));
            }
        }

        [Test]
        public void PromptText_ShowsTheNameOnlyWhenKnown()
        {
            Assert.That(NpcPromptText.For("Harrik", "Banditenanführer", false), Is.EqualTo("Sprechen: Banditenanführer"));
            Assert.That(NpcPromptText.For("Harrik", "Banditenanführer", true), Is.EqualTo("Sprechen: Harrik"));
            Assert.That(NpcPromptText.For("Harrik", string.Empty, false), Is.EqualTo("Sprechen: Harrik"));
            Assert.That(NpcPromptText.For(string.Empty, string.Empty, false), Is.EqualTo("Sprechen"));
        }

        [Test]
        public void Catalog_IgnoresDuplicates()
        {
            NpcCatalog catalog = TestDialogues.Npcs();

            Assert.That(catalog.Add(MuehlbachDialogueFixture.HarrikNpc()), Is.False);
            Assert.That(catalog.Count, Is.EqualTo(3));
            Assert.That(catalog.TryGet(MuehlbachDialogueFixture.Harrik, out NpcSpec harrik), Is.True);
            Assert.That(harrik.DefaultDialogueId, Is.EqualTo(MuehlbachDialogueFixture.DialogueId));
        }

        [Test]
        public void LookModel_TurnsToThePartner_WithTheTurnSpeed()
        {
            var model = new NpcLookModel(0f, 7u, 90f, 0f);

            model.Tick(0.5f, true, true, 90f);
            Assert.That(model.State, Is.EqualTo(NpcLookState.Talking));
            Assert.That(model.Yaw, Is.EqualTo(45f).Within(0.001f));

            model.Tick(1f, true, true, 90f);
            Assert.That(model.Yaw, Is.EqualTo(90f).Within(0.001f));

            model.Tick(0.5f, false, false, 90f);
            Assert.That(model.State, Is.EqualTo(NpcLookState.Idle));
            Assert.That(model.Yaw, Is.EqualTo(45f).Within(0.001f), "back towards the home direction");
        }

        [Test]
        public void LookModel_WatchesThePlayerInRange()
        {
            var model = new NpcLookModel(0f, 7u, 360f, 0f);

            model.Tick(1f, false, true, -60f);

            Assert.That(model.State, Is.EqualTo(NpcLookState.Watching));
            Assert.That(model.Yaw, Is.EqualTo(-60f).Within(0.001f));
        }

        [Test]
        public void LookModel_TakesTheShortWayRound()
        {
            var model = new NpcLookModel(170f, 7u, 20f, 0f);

            model.Tick(1f, true, true, -170f);

            Assert.That(NpcLookModel.DeltaAngle(model.Yaw, -170f), Is.EqualTo(0f).Within(0.001f), "170 → 190 (= -170) over 180");
            Assert.That(NpcLookModel.DeltaAngle(350f, 10f), Is.EqualTo(20f).Within(0.001f));
            Assert.That(NpcLookModel.DeltaAngle(10f, 350f), Is.EqualTo(-20f).Within(0.001f));
        }

        [Test]
        public void LookModel_GlancesAside_WhenIdle_AndComesBack()
        {
            var model = new NpcLookModel(0f, 12345u, 1000f, 25f, 1f, 1f);
            bool glanced = false;
            bool returned = false;
            for (int frame = 0; frame < 200; frame++)
            {
                model.Tick(0.05f, false, false, 0f);
                if (model.IsGlancing)
                {
                    glanced = true;
                    float offset = System.Math.Abs(NpcLookModel.DeltaAngle(0f, model.Yaw));
                    Assert.That(offset, Is.InRange(NpcLookModel.MinGlanceAngle - 0.001f, 25.001f));
                }
                else if (glanced)
                {
                    returned = true;
                }
            }

            Assert.That(glanced, Is.True);
            Assert.That(returned, Is.True);
        }

        [Test]
        public void YawTowards_UsesZForwardAndXRight()
        {
            Assert.That(NpcLookModel.YawTowards(0f, 0f, 0f, 1f), Is.EqualTo(0f).Within(0.001f));
            Assert.That(NpcLookModel.YawTowards(0f, 0f, 1f, 0f), Is.EqualTo(90f).Within(0.001f));
            Assert.That(NpcLookModel.YawTowards(0f, 0f, -1f, 0f), Is.EqualTo(-90f).Within(0.001f));
        }
    }
}
