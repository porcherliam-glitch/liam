using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.NPC;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// Saving and loading of the dialogue memory (section <c>dialogue</c>) and the NPC state (section <c>npcs</c>) through the
    /// JSON serializer of the save system, and the rule "running dialogues are never saved" (GDD 05 5.2): the save lock while a
    /// conversation runs, and a load that stops a running conversation silently (architecture 9.1: no gameplay events).
    /// </summary>
    [TestFixture]
    public sealed class DialogueSaveTests
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
        public void Dtos_AreValidSaveDtos()
        {
            Assert.That(SaveDtoValidator.Validate(typeof(DialogueDto), out string problem), Is.True, problem);
            Assert.That(SaveDtoValidator.Validate(typeof(NpcsDto), out problem), Is.True, problem);
        }

        [Test]
        public void SaveKeys_AndLoadOrder_FollowTable92()
        {
            Assert.That(_env.DialogueSaveable.SaveKey, Is.EqualTo("dialogue"));
            Assert.That(_env.NpcSaveable.SaveKey, Is.EqualTo("npcs"));
            Assert.That(_env.WorldSaveable.LoadOrder, Is.LessThan(_env.DialogueSaveable.LoadOrder));
        }

        [Test]
        public void Memory_SurvivesSaveAndLoad()
        {
            PlayMuehlbachToTheDeal();
            _env.Npcs.ChangeRelationship(TestDialogues.Ulf, 15, "test");

            using (DialogueTestEnvironment loaded = TestDialogues.Environment())
            {
                _env.SaveAndLoadInto(loaded);

                Assert.That(loaded.Dialogues.IsTopicKnown(MuehlbachDialogueFixture.TopicGrimmbart), Is.True);
                Assert.That(loaded.Dialogues.IsNameKnown(MuehlbachDialogueFixture.Harrik), Is.True);
                Assert.That(loaded.Dialogues.WasOptionChosen(MuehlbachDialogueFixture.DialogueId, "n040", "a"), Is.True);
                Assert.That(loaded.Dialogues.TryGetCheckResult(MuehlbachDialogueFixture.DialogueId, "n100", out bool success), Is.True);
                Assert.That(success, Is.True);
                Assert.That(loaded.Npcs.GetRelationship(TestDialogues.Ulf), Is.EqualTo(15));
                Assert.That(loaded.Topics.Count, Is.EqualTo(0), "loading sends no TopicUnlocked");
            }
        }

        [Test]
        public void OnceOption_StaysSpent_AfterLoading()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();
            _env.Choose("a");
            _env.Continue();
            _env.Choose("c");

            using (DialogueTestEnvironment loaded = TestDialogues.Environment())
            {
                _env.SaveAndLoadInto(loaded);
                loaded.Start(TestDialogues.Basic, TestDialogues.Ulf);
                loaded.Continue();

                Assert.That(loaded.Option("a").IsEnabled, Is.False);
                Assert.That(loaded.Option("c").IsAlreadyChosen, Is.True);
            }
        }

        [Test]
        public void Capture_IsSorted_ForStableSaveFiles()
        {
            _env.Dialogues.UnlockTopic("thema.zz");
            _env.Dialogues.UnlockTopic("thema.aa");
            _env.Dialogues.UnlockTopic("thema.mm");

            DialogueDto dto = (DialogueDto)_env.DialogueSaveable.Save();

            Assert.That(dto.Topics, Is.EqualTo(new[] { "thema.aa", "thema.mm", "thema.zz" }));
            Assert.That(_env.Dialogues.KnownTopics, Is.EqualTo(new[] { "thema.aa", "thema.mm", "thema.zz" }));
        }

        [Test]
        public void NewGame_ClearsTheMemory()
        {
            _env.Dialogues.UnlockTopic("thema.riss");
            _env.Dialogues.RevealName(TestDialogues.Stranger);

            _env.DialogueSaveable.Load(null, new LoadContext("char_test/neu", SaveFormat.CurrentVersion, true, false, null));

            Assert.That(_env.Dialogues.IsTopicKnown("thema.riss"), Is.False);
            Assert.That(_env.Dialogues.IsNameKnown(TestDialogues.Stranger), Is.False);
        }

        [Test]
        public void SavingIsLocked_WhileAConversationRuns_EvenBelowThePauseMenu()
        {
            Assert.That(SavePermissionRules.IsSaveAllowedInState(GameState.Dialogue), Is.False);
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.GameState.Push(GameState.Paused, "test");

            Assert.That(SavePermissionRules.IsSaveAllowedInState(_env.GameState.Current), Is.True, "the pause menu itself allows saving");
            Assert.That(_env.Saves.IsSaveAllowed(out string reason), Is.False, "but not while the conversation below it runs");
            Assert.That(reason, Is.EqualTo(SaveReasonKeys.ForState(GameState.Dialogue)));
        }

        [Test]
        public void LoadingDuringAConversation_StopsItSilently_AndReleasesStateAndLock()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();
            object saved = _env.DialogueSaveable.Save();

            _env.DialogueSaveable.Load(saved, DialogueTestEnvironment.LoadedGame);

            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.View.State, Is.EqualTo(DialogueViewState.None));
            Assert.That(_env.Outcomes.Count, Is.EqualTo(0), "loading sends no DialogOutcome");
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.Saves.Blockers, Is.Empty);
            Assert.That(_env.Start(TestDialogues.Basic, TestDialogues.Ulf), Is.True, "a new conversation can start afterwards");
        }

        [Test]
        public void NpcState_SurvivesSaveAndLoad()
        {
            _env.Npcs.ChangeRelationship(TestDialogues.Stranger, 30, "test");
            _env.Npcs.MarkDead(MuehlbachDialogueFixture.Harrik, "player");
            _env.Npcs.SetHostile(MuehlbachDialogueFixture.Group, true, "test");

            using (DialogueTestEnvironment loaded = TestDialogues.Environment())
            {
                _env.SaveAndLoadInto(loaded);

                Assert.That(loaded.Npcs.GetRelationship(TestDialogues.Stranger), Is.EqualTo(10), "-20 + 30");
                Assert.That(loaded.Npcs.IsAlive(MuehlbachDialogueFixture.Harrik), Is.False);
                Assert.That(loaded.Npcs.IsHostile(MuehlbachDialogueFixture.Group), Is.True);
                Assert.That(loaded.Deaths.Count, Is.EqualTo(0), "loading sends no NPCDied");
                Assert.That(loaded.Relationships.Count, Is.EqualTo(0), "loading sends no RelationshipChanged");
            }
        }

        private void PlayMuehlbachToTheDeal()
        {
            _env.Stats.Charisma = 12;
            _env.Start(MuehlbachDialogueFixture.DialogueId, MuehlbachDialogueFixture.Harrik);
            _env.Continue();
            _env.Choose("b");
            _env.Continue();
            _env.Choose("a");
            _env.Continue();
            _env.Choose("b");
            _env.Continue();
            _env.Choose("b");
            _env.Continue();
        }
    }
}
