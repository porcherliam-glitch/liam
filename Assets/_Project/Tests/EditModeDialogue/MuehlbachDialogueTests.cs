using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// The example dialogue "Verhandlung mit dem Banditenanfuehrer am Muehlbach" (GDD 02, 12.10) played through to every exit:
    /// abzug (persuade and bribe), muehlenwache, vertrieben (intimidate, knife at the throat, lie), abmachung (topic Grimmbart),
    /// kampf (from n025 and n040), attentat (hold option with the knife) and vertagt (B / Esc). Checks the markings of the
    /// options as the GDD shows them, the greyed checks of the deterministic mode, the flags the nodes write and the events.
    /// </summary>
    [TestFixture]
    public sealed class MuehlbachDialogueTests
    {
        private const string Id = MuehlbachDialogueFixture.DialogueId;
        private const string Harrik = MuehlbachDialogueFixture.Harrik;

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
        public void Opening_ShowsTheRole_UntilHarrikSaysHisName()
        {
            StartTalk();

            Assert.That(_env.View.NodeId, Is.EqualTo("n020"));
            Assert.That(_env.View.Line.SpeakerName, Is.EqualTo("Banditenanführer"));
            Assert.That(_env.View.Line.Emotion, Is.EqualTo(DialogueEmotion.Angry));
            Assert.That(_env.View.Line.Camera, Is.EqualTo(DialogueCameraHint.Opening));

            _env.Continue();
            Assert.That(_env.View.NodeId, Is.EqualTo("n025"));
            Assert.That(_env.Option("c").Tag, Is.EqualTo(DialogueOptionTag.Combat));
            _env.Choose("a");

            Assert.That(_env.View.NodeId, Is.EqualTo("n030"));
            Assert.That(_env.View.Line.SpeakerName, Is.EqualTo("Harrik"));
            Assert.That(_env.View.Line.Pages.Count, Is.EqualTo(2), "125 characters need two subtitle pages");
        }

        [Test]
        public void MainChoice_ShowsTheMarkingsOfTheGdd()
        {
            OpenMainChoice();

            Assert.That(Texts(), Is.EqualTo(new[]
            {
                "Ihr seid alle aus Eichental?",
                "[Überzeugen 12 · dein Wert 10] Lindenhain nimmt Flüchtlinge auf. Ihr müsst nicht stehlen.",
                "[Einschüchtern 14 · dein Wert 10] Zieht ab, oder ich hole mir eure Köpfe. Einen nach dem anderen.",
                "[Lügen 12 · dein Wert 10] Die Silberwacht rückt morgen mit dreißig Mann an.",
                "[80 Gold] Nehmt das Gold und verschwindet.",
                "[Angriff] Dann regeln wir das mit Stahl.",
                "[Ende] Ich komme wieder.",
            }));
            Assert.That(_env.Option("a").IsEnabled, Is.True);
            Assert.That(_env.Option("b").IsEnabled, Is.False, "deterministic checks below the threshold are greyed");
            Assert.That(_env.Option("c").IsEnabled, Is.False);
            Assert.That(_env.Option("d").IsEnabled, Is.False);
            Assert.That(_env.Option("e").IsEnabled, Is.False, "no gold");
            Assert.That(_env.Option("e").Marks & DialogueOptionMarks.QuestProgress, Is.EqualTo(DialogueOptionMarks.QuestProgress));
            Assert.That(_env.Option("e").Symbol, Is.EqualTo(DialogueQuestSymbol.None), "the diamond only shows on options without a tag");
            Assert.That(_env.Option("g").IsEnabled, Is.True);
            Assert.That(_env.Option("i").Marks & DialogueOptionMarks.QuestProgress, Is.EqualTo(DialogueOptionMarks.None), "vertagt is no quest exit");
            Assert.That(_env.View.BackOptionIndex, Is.EqualTo(6));
            Assert.That(_env.IndexOf("f"), Is.EqualTo(-1), "Grimmbart is not known yet");
            Assert.That(_env.IndexOf("h"), Is.EqualTo(-1), "no knife at the throat");
        }

        [Test]
        public void Persuade_ThenGuarantee_EndsWithAbzug()
        {
            _env.Stats.Charisma = 12;
            OpenMainChoice();
            Assert.That(_env.Option("b").TagText, Is.EqualTo("[Überzeugen 12]"));
            Assert.That(_env.Option("b").AttributeKey, Is.EqualTo("charisma"));

            _env.Choose("b");

            Assert.That(_env.Checks.Count, Is.EqualTo(1));
            Assert.That(_env.Checks.Last.CheckType, Is.EqualTo(SkillCheckType.Persuade));
            Assert.That(_env.Checks.Last.Success, Is.True);
            Assert.That(_env.View.NodeId, Is.EqualTo("n110"));
            _env.Continue();
            Assert.That(_env.Option("a").Symbol, Is.EqualTo(DialogueQuestSymbol.Progress), "the straight path ends in the quest exit abzug");
            Assert.That(_env.Option("a").DisplayText, Is.EqualTo("◆ Ich bürge bei Hedda für euch."));
            _env.Choose("a");
            Assert.That(_env.View.NodeId, Is.EqualTo("n135"));
            _env.Continue();

            AssertExit("abzug");
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagOutcome), Is.EqualTo(3));
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagSpared), Is.EqualTo(1));
            Assert.That(_env.Effects.Contains("NPC+(" + MuehlbachDialogueFixture.Group + ", loc.eichental.lindenhain)"), Is.True);
        }

        [Test]
        public void SavedWenna_GivesThePersuadeBonus()
        {
            _env.Stats.Charisma = 10;
            _env.World.SetBool(MuehlbachDialogueFixture.FlagWennaSaved, true, "test");

            OpenMainChoice();

            Assert.That(_env.Option("b").IsEnabled, Is.True, "10 + 2 reaches 12");
            Assert.That(_env.Option("b").Check.Situation, Is.EqualTo(2));
        }

        [Test]
        public void Persuade_ThenMillGuard_EndsWithMuehlenwache()
        {
            _env.Stats.Charisma = 12;
            OpenMainChoice();
            _env.Choose("b");
            _env.Continue();

            _env.Choose("b");
            _env.Continue();

            AssertExit("muehlenwache");
        }

        [Test]
        public void Bribe_PaysTheGold_AndEndsWithAbzug()
        {
            _env.Wallet.Gold = 100;
            OpenMainChoice();
            Assert.That(_env.Option("e").IsEnabled, Is.True);
            Assert.That(_env.Option("e").Price, Is.EqualTo(80));

            _env.Choose("e");

            Assert.That(_env.Wallet.Gold, Is.EqualTo(20));
            Assert.That(_env.Wallet.Payments, Is.EqualTo(new[] { "80 " + Id }));
            Assert.That(_env.View.NodeId, Is.EqualTo("n410"));
            _env.Continue();
            AssertExit("abzug");
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagOutcome), Is.EqualTo(3));
        }

        [Test]
        public void HighCharisma_LowersTheBribe()
        {
            _env.Stats.Charisma = 15;
            _env.Wallet.Gold = 72;

            OpenMainChoice();

            Assert.That(_env.Option("e").TagText, Is.EqualTo("[72 Gold]"), "80 × (1 - 0.1)");
            Assert.That(_env.Option("e").IsEnabled, Is.True);
        }

        [Test]
        public void Intimidate_WithStrength_EndsWithVertrieben()
        {
            _env.Stats.Strength = 14;
            OpenMainChoice();
            Assert.That(_env.Option("c").AttributeKey, Is.EqualTo("strength"), "intimidation uses the higher of Charisma and Strength");

            _env.Choose("c");
            Assert.That(_env.View.NodeId, Is.EqualTo("n210"));
            _env.Continue();

            AssertExit("vertrieben");
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagOutcome), Is.EqualTo(2));
            Assert.That(_env.Checks.Last.CheckType, Is.EqualTo(SkillCheckType.Intimidate));
        }

        [Test]
        public void KnifeAtTheThroat_OpensWithN015_AndMakesIntimidationReachable()
        {
            _env.World.SetBool(MuehlbachDialogueFixture.FlagKnife, true, "test");
            StartTalk();

            Assert.That(_env.View.NodeId, Is.EqualTo("n015"));
            Assert.That(_env.View.Line.Emotion, Is.EqualTo(DialogueEmotion.Whispering));
            _env.Continue();
            _env.Continue();

            Assert.That(_env.Option("c").IsEnabled, Is.True, "10 + 4 (knife) reaches 14");
            Assert.That(_env.Option("c").TagText, Is.EqualTo("[Einschüchtern 14]"));
            _env.Choose("c");
            _env.Continue();
            AssertExit("vertrieben");
        }

        [Test]
        public void LevelAdvantage_CountsForIntimidation()
        {
            _env.Stats.PlayerLevel = MuehlbachDialogueFixture.HarrikLevel + 6;

            OpenMainChoice();

            Assert.That(_env.Option("c").Check.Situation, Is.EqualTo(4), "two steps of three levels: +4");
            Assert.That(_env.Option("c").IsEnabled, Is.True);
        }

        [Test]
        public void Lie_EndsWithVertrieben_AndRemembersTheLie()
        {
            _env.Stats.Charisma = 12;
            OpenMainChoice();

            _env.Choose("d");
            _env.Continue();

            AssertExit("vertrieben");
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagLied), Is.EqualTo(1));
            Assert.That(_env.Checks.Last.CheckType, Is.EqualTo(SkillCheckType.Lie));
        }

        [Test]
        public void NoticedLie_MakesTheLieHarder()
        {
            _env.Stats.Charisma = 16;
            _env.World.SetBool(MuehlbachDialogueFixture.FlagLieNoticed, true, "test");

            OpenMainChoice();

            Assert.That(_env.Option("d").Check.Value, Is.EqualTo(11), "16 - 5");
            Assert.That(_env.Option("d").IsEnabled, Is.False);
        }

        [Test]
        public void TopicGrimmbart_UnlocksTheDeal_AndEndsWithAbmachung()
        {
            OpenMainChoice();
            _env.Choose("a");
            Assert.That(_env.Topics.Count, Is.EqualTo(1));
            Assert.That(_env.Topics.Last.TopicId, Is.EqualTo(MuehlbachDialogueFixture.TopicGrimmbart));
            _env.Continue();

            Assert.That(_env.View.NodeId, Is.EqualTo("n040"));
            Assert.That(_env.Option("a").IsEnabled, Is.False, "one-time question");
            Assert.That(_env.IndexOf("f"), Is.EqualTo(5), "option f appears after the topic was unlocked");
            _env.Choose("f");
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagWeakness), Is.EqualTo(1));
            _env.Continue();
            Assert.That(_env.View.NodeId, Is.EqualTo("n510"));
            _env.Choose("a");
            _env.Continue();

            AssertExit("abmachung");
        }

        [Test]
        public void FinishedBounty_HidesTheDeal()
        {
            _env.Dialogues.UnlockTopic(MuehlbachDialogueFixture.TopicGrimmbart);
            _env.Switches.Set(MuehlbachDialogueFixture.SwitchGrimmbartDone, true);
            OpenMainChoice();

            _env.Choose("f");
            _env.Continue();

            Assert.That(_env.IndexOf("a"), Is.EqualTo(-1));
            _env.Choose("b");
            Assert.That(_env.View.NodeId, Is.EqualTo("n040"));
        }

        [Test]
        public void AttackAtTheStart_EndsWithKampf_AndMakesTheGroupHostile()
        {
            DialogueEndInfo ended = default;
            _env.Dialogues.Ended += info => ended = info;
            StartTalk();
            _env.Continue();

            _env.Choose("c");

            AssertExit("kampf");
            Assert.That(ended.FollowUp, Is.EqualTo(DialogueFollowUp.Combat));
            Assert.That(_env.Npcs.IsHostile(MuehlbachDialogueFixture.Group), Is.True);
        }

        [Test]
        public void AttackFromTheMainChoice_EndsWithKampf()
        {
            OpenMainChoice();

            _env.Choose("g");

            AssertExit("kampf");
            Assert.That(_env.Npcs.IsHostile(MuehlbachDialogueFixture.Group), Is.True);
        }

        [Test]
        public void KnifeOption_IsAKillWithHold_AndEndsWithAttentat()
        {
            _env.World.SetBool(MuehlbachDialogueFixture.FlagKnife, true, "test");
            StartTalk();
            _env.Continue();
            _env.Continue();

            DialogueOptionView kill = _env.Option("h");
            Assert.That(kill.Tag, Is.EqualTo(DialogueOptionTag.Kill));
            Assert.That(kill.TagText, Is.EqualTo("[Töten]"));
            Assert.That(kill.RequiresHold, Is.True);
            _env.Choose("h");

            AssertExit("attentat");
            Assert.That(_env.Npcs.IsAlive(Harrik), Is.False);
            Assert.That(_env.Deaths.Count, Is.EqualTo(1));
            Assert.That(_env.Deaths.Last.NpcId, Is.EqualTo(Harrik));
            Assert.That(_env.Deaths.Last.KillerId, Is.EqualTo(SubjectIds.Player));
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagStatus), Is.EqualTo(1));
            Assert.That(_env.Flag(MuehlbachDialogueFixture.FlagOutcome), Is.EqualTo(1));
            Assert.That(_env.Effects.Contains("Banditen fliehen"), Is.True);
        }

        [Test]
        public void Back_EndsWithVertagt()
        {
            OpenMainChoice();

            Assert.That(_env.Dialogues.Back(), Is.True);

            AssertExit("vertagt");
            Assert.That(_env.Dialogues.Catalog.TryGet(Id, out DialogueSpec spec) && spec.IsQuestExit("vertagt"), Is.False);
        }

        [Test]
        public void ChecksAreRemembered_ASecondTalkDoesNotRollAgain()
        {
            _env.Stats.Charisma = 12;
            OpenMainChoice();
            _env.Choose("b");
            _env.Continue();
            _env.Choose("b");
            _env.Continue();

            _env.Stats.Charisma = 8;
            OpenMainChoice();

            Assert.That(_env.Option("b").IsEnabled, Is.True, "the persuasion succeeded before and stays won");
            Assert.That(_env.Option("b").Check.Remembered, Is.True);
            _env.Choose("b");
            Assert.That(_env.Checks.Count, Is.EqualTo(1), "a remembered result sends no second SkillCheckResolved");
            Assert.That(_env.Dialogues.TryGetCheckResult(Id, "n100", out bool success) && success, Is.True);
        }

        [Test]
        public void DiceMode_FailedPersuasion_LeadsToN120_AndGreysTheOption()
        {
            using (DialogueTestEnvironment env = TestDialogues.Environment(new DialogueRules(DialogueCheckMode.Dice)))
            {
                env.Stats.Charisma = 1;
                StartTalk(env);
                env.Continue();
                env.Choose("b");
                env.Continue();
                Assert.That(env.Option("b").TagText, Is.EqualTo("[Überzeugen · 0 %]"));
                Assert.That(env.Option("b").IsEnabled, Is.True, "the dice mode lets the player try");

                env.Choose("b");

                Assert.That(env.View.NodeId, Is.EqualTo("n120"));
                Assert.That(env.Checks.Last.Success, Is.False);
                env.Continue();
                Assert.That(env.View.NodeId, Is.EqualTo("n040"));
                Assert.That(env.Option("b").TagText, Is.EqualTo("[Überzeugen · gescheitert]"));
                Assert.That(env.Option("b").IsEnabled, Is.False);
            }
        }

        [Test]
        public void DiceMode_ShowsTheChance()
        {
            using (DialogueTestEnvironment env = TestDialogues.Environment(new DialogueRules(DialogueCheckMode.Dice)))
            {
                StartTalk(env);
                env.Continue();
                env.Choose("b");
                env.Continue();

                Assert.That(env.Option("b").TagText, Is.EqualTo("[Überzeugen · 45 %]"), "D20 + 0 needs 12 or more: 9 of 20");
                Assert.That(env.Option("c").TagText, Is.EqualTo("[Einschüchtern · 35 %]"));
            }
        }

        [Test]
        public void EveryQuestExit_IsReachable()
        {
            Assert.That(_env.Dialogues.Catalog.TryGet(Id, out DialogueSpec spec), Is.True);

            Assert.That(spec.QuestId, Is.EqualTo(MuehlbachDialogueFixture.QuestId));
            Assert.That(spec.QuestExitIds, Is.EquivalentTo(MuehlbachDialogueFixture.QuestExits));
            Assert.That(spec.Nodes.Count, Is.EqualTo(28));
        }

        private void StartTalk()
        {
            StartTalk(_env);
        }

        private static void StartTalk(DialogueTestEnvironment env)
        {
            Assert.That(env.Start(Id, Harrik), Is.True);
        }

        private void OpenMainChoice()
        {
            StartTalk();
            _env.Continue();
            _env.Choose("b");
            _env.Continue();
            Assert.That(_env.View.NodeId, Is.EqualTo("n040"));
        }

        private string[] Texts()
        {
            var texts = new string[_env.View.Options.Count];
            for (int i = 0; i < texts.Length; i++)
            {
                texts[i] = _env.View.Options[i].DisplayText;
            }

            return texts;
        }

        private void AssertExit(string exitId)
        {
            Assert.That(_env.Dialogues.IsRunning, Is.False, "conversation still runs at " + _env.View.NodeId);
            Assert.That(_env.Outcomes.Last.DialogueId, Is.EqualTo(Id));
            Assert.That(_env.Outcomes.Last.NpcId, Is.EqualTo(Harrik));
            Assert.That(_env.Outcomes.Last.ExitId, Is.EqualTo(exitId));
        }
    }
}
