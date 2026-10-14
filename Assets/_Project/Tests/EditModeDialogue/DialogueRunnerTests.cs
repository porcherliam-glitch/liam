using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// The dialogue runner through the dialogue service (architecture 11.8): every node type (line, choice, switch, action,
    /// random, jump with and without return, end), the events of architecture 4.3 in the right order, one-time options,
    /// remembered choices, line variants, name reveal, cancel and back, cycle protection, the game state <c>Dialogue</c> and the
    /// save lock while a conversation runs.
    /// </summary>
    [TestFixture]
    public sealed class DialogueRunnerTests
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
        public void Start_PublishesTalkedToAndStarted_AndShowsTheFirstLine()
        {
            Assert.That(_env.Start(TestDialogues.Basic, TestDialogues.Ulf), Is.True);

            Assert.That(_env.Talked.Count, Is.EqualTo(1));
            Assert.That(_env.Talked.Last.NpcId, Is.EqualTo(TestDialogues.Ulf));
            Assert.That(_env.Talked.Last.DialogueId, Is.EqualTo(TestDialogues.Basic));
            Assert.That(_env.Started.Count, Is.EqualTo(1));
            Assert.That(_env.Started.Last.Mode, Is.EqualTo(DialogueMode.Full));
            Assert.That(_env.View.State, Is.EqualTo(DialogueViewState.Line));
            Assert.That(_env.View.NodeId, Is.EqualTo("n010"));
            DialogueLineView line = _env.View.Line;
            Assert.That(line.SpeakerName, Is.EqualTo("Ulf"));
            Assert.That(line.Text, Is.EqualTo("Na, Rissgeborener? Was gibt's?"));
            Assert.That(line.TextKey, Is.EqualTo(TestDialogues.Basic + ".n010"));
            Assert.That(line.VoiceClipId, Is.EqualTo("VO_" + TestDialogues.Ulf + "_" + TestDialogues.Basic + ".n010"));
            Assert.That(line.Pages.Count, Is.EqualTo(1));
            Assert.That(line.EndsConversation, Is.False);
        }

        [Test]
        public void Start_PushesTheDialogueState_AndLocksSaving_UntilTheEnd()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);

            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Dialogue));
            Assert.That(_env.Saves.IsSaveAllowed(out string reason), Is.False, "running dialogues are never saved (GDD 05 5.2)");
            Assert.That(reason, Is.EqualTo(SaveReasonKeys.ForState(GameState.Dialogue)));
            Assert.That(_env.Dialogues.IsBlockingSaves, Is.True);

            _env.Continue();
            _env.Choose("c");

            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.Saves.Blockers, Is.Empty);
            Assert.That(_env.Dialogues.IsBlockingSaves, Is.False);
        }

        [Test]
        public void Continue_ShowsTheChoice_WithAllVisibleOptions()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();

            Assert.That(_env.View.State, Is.EqualTo(DialogueViewState.Choice));
            Assert.That(_env.View.NodeId, Is.EqualTo("n020"));
            Assert.That(_env.View.Options.Count, Is.EqualTo(3));
            Assert.That(_env.View.Options[0].OptionId, Is.EqualTo("a"));
            Assert.That(_env.View.Options[2].Tag, Is.EqualTo(DialogueOptionTag.End));
            Assert.That(_env.View.Options[2].DisplayText, Is.EqualTo("[Ende] Bis später."));
            Assert.That(_env.View.BackOptionIndex, Is.EqualTo(2));
            Assert.That(_env.Dialogues.Continue(), Is.False, "no line is shown");
        }

        [Test]
        public void Choose_PublishesChoiceMade_RunsTheActions_AndEndsWithTheExit()
        {
            var order = new List<string>();
            _env.Bus.Subscribe<ChoiceMade>(e => order.Add("choice"));
            _env.Bus.Subscribe<DialogOutcome>(e => order.Add("outcome " + e.ExitId + " " + _env.GameState.Current));
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();

            Assert.That(_env.Choose("b"), Is.True);

            Assert.That(_env.Choices.Count, Is.EqualTo(1));
            Assert.That(_env.Choices.Last.ChoiceId, Is.EqualTo(TestDialogues.Basic + ".n020"));
            Assert.That(_env.Choices.Last.OptionId, Is.EqualTo("b"));
            Assert.That(_env.Flag(TestDialogues.FlagCounter), Is.EqualTo(11), "option action (+1) and action node (+10)");
            Assert.That(_env.Effects.Contains(TestDialogues.Basic + ": Gefallen"), Is.True, "actions run with the dialogue as source");
            Assert.That(_env.Outcomes.Count, Is.EqualTo(1));
            Assert.That(_env.Outcomes.Last.DialogueId, Is.EqualTo(TestDialogues.Basic));
            Assert.That(_env.Outcomes.Last.NpcId, Is.EqualTo(TestDialogues.Ulf));
            Assert.That(_env.Outcomes.Last.ExitId, Is.EqualTo("erledigt"));
            Assert.That(order, Is.EqualTo(new[] { "choice", "outcome erledigt Playing" }),
                "DialogOutcome comes after the game state was released, so quests may open the next screen");
            Assert.That(_env.View.State, Is.EqualTo(DialogueViewState.Ended));
            Assert.That(_env.View.ExitId, Is.EqualTo("erledigt"));
            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Dialogues.Runner.LastEnd.Cancelled, Is.False);
        }

        [Test]
        public void EndNode_EndsWithItsExit()
        {
            DialogueEndInfo ended = default;
            _env.Dialogues.Ended += info => ended = info;
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();

            _env.Choose("c");

            Assert.That(ended.ExitId, Is.EqualTo("tschuess"));
            Assert.That(ended.FollowUp, Is.EqualTo(DialogueFollowUp.Gameplay));
            Assert.That(_env.Outcomes.Last.ExitId, Is.EqualTo("tschuess"));
        }

        [Test]
        public void OnceOption_IsGreyedAfterItWasChosen_AndTheLineLeadsBackToTheChoice()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();

            _env.Choose("a");
            Assert.That(_env.View.Line.Text, Is.EqualTo("Schlecht. Seit dem Riss trinkt keiner mehr."));
            _env.Continue();

            DialogueOptionView spent = _env.Option("a");
            Assert.That(_env.View.NodeId, Is.EqualTo("n020"));
            Assert.That(spent.IsEnabled, Is.False);
            Assert.That(spent.IsAlreadyChosen, Is.True);
            Assert.That(spent.Marks & DialogueOptionMarks.Spent, Is.EqualTo(DialogueOptionMarks.Spent));
            Assert.That(_env.Choose("a"), Is.False, "a spent option cannot be chosen again");
            Assert.That(_env.Dialogues.WasOptionChosen(TestDialogues.Basic, "n020", "a"), Is.True);
            Assert.That(_env.Dialogues.WasOptionChosen(TestDialogues.Basic, "n020", "b"), Is.False);
        }

        [Test]
        public void ChosenOptions_StayRemembered_InTheNextConversation()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();
            _env.Choose("c");

            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();

            DialogueOptionView again = _env.Option("c");
            Assert.That(again.IsAlreadyChosen, Is.True, "shown with 60 % opacity");
            Assert.That(again.IsEnabled, Is.True, "only one-time options are greyed");
        }

        [Test]
        public void Switch_TakesTheFirstMatchingBranch_OrTheDefault()
        {
            _env.Start(TestDialogues.Switch, TestDialogues.Ulf);
            Assert.That(_env.View.NodeId, Is.EqualTo("n030"));
            _env.Continue();
            Assert.That(_env.Outcomes.Last.ExitId, Is.EqualTo("fremd"));

            _env.World.SetBool(TestDialogues.FlagFriend, true, "test");
            _env.Start(TestDialogues.Switch, TestDialogues.Ulf);

            Assert.That(_env.View.NodeId, Is.EqualTo("n020"));
            Assert.That(_env.View.Line.Text, Is.EqualTo("Mein Freund!"));
        }

        [Test]
        public void LineVariant_ReplacesTheText_AndTheTextKey()
        {
            _env.World.SetInt(TestDialogues.FlagCounter, 5, "test");

            _env.Start(TestDialogues.Switch, TestDialogues.Ulf);

            Assert.That(_env.View.Line.Text, Is.EqualTo("Du schon wieder."));
            Assert.That(_env.View.Line.TextKey, Is.EqualTo(TestDialogues.Switch + ".n030.v1"));
            Assert.That(_env.View.Line.EndsConversation, Is.True);
        }

        [Test]
        public void VoiceClip_FollowsTheLineKey_AndCanBeSetByTheAuthor()
        {
            // GDD 02 12.8: VO_<speaker>_<line id>; a variant is its own recording, the optional field overrides the id.
            _env.World.SetInt(TestDialogues.FlagCounter, 5, "test");
            _env.Start(TestDialogues.Switch, TestDialogues.Ulf);
            Assert.That(_env.View.Line.VoiceClipId, Is.EqualTo("VO_" + TestDialogues.Ulf + "_" + TestDialogues.Switch + ".n030.v1"));
            _env.Continue();

            DialogueSpec spec = new DialogueSpecBuilder("dlg.test.ulf_prost")
                .Speaker(TestDialogues.Ulf)
                .Nodes(new LineNode("n010", "Prost!").Voice("VO_npc.test.wirt_ulf_prost").EndWith("prost"))
                .Build();
            using (var env = new DialogueTestEnvironment(null, TestDialogues.Npcs(), TestDialogues.Flags(), spec))
            {
                Assert.That(env.Start(spec.Id, TestDialogues.Ulf), Is.True);
                Assert.That(env.View.Line.VoiceClipId, Is.EqualTo("VO_npc.test.wirt_ulf_prost"));
                Assert.That(env.View.Line.TextKey, Is.EqualTo("dlg.test.ulf_prost.n010"), "the text key stays generated");
            }
        }

        [Test]
        public void Random_IsTheSameForTheSameNpcAndDay_AndCoversAllOutcomesOverDays()
        {
            var exits = new HashSet<string>();
            for (int day = 0; day < 40; day++)
            {
                _env.Calendar.CurrentDay = day;
                _env.Start(TestDialogues.Random, TestDialogues.Ulf);
                string first = _env.View.NodeId;
                _env.Continue();
                string exit = _env.Outcomes.Last.ExitId;

                _env.Start(TestDialogues.Random, TestDialogues.Ulf);
                Assert.That(_env.View.NodeId, Is.EqualTo(first), "day " + day + ": same NPC and day give the same greeting");
                _env.Continue();
                exits.Add(exit);
            }

            Assert.That(exits, Is.EquivalentTo(new[] { "a", "b", "c" }));
        }

        [Test]
        public void JumpWithReturn_RunsTheOtherDialogue_AndComesBackToTheHub()
        {
            _env.Start(TestDialogues.Hub, TestDialogues.Ulf);

            _env.Choose("a");

            Assert.That(_env.View.CurrentDialogueId, Is.EqualTo(TestDialogues.Topic));
            Assert.That(_env.View.DialogueId, Is.EqualTo(TestDialogues.Hub));
            Assert.That(_env.View.Line.Text, Is.EqualTo("Der Riss summt nachts."));
            Assert.That(_env.View.Line.EndsConversation, Is.False, "the jump returns to the hub");
            Assert.That(_env.Topics.Count, Is.EqualTo(1), "line actions run before the line is shown");
            Assert.That(_env.Dialogues.IsTopicKnown("thema.riss"), Is.True);

            _env.Continue();

            Assert.That(_env.View.State, Is.EqualTo(DialogueViewState.Choice));
            Assert.That(_env.View.CurrentDialogueId, Is.EqualTo(TestDialogues.Hub));
            Assert.That(_env.View.NodeId, Is.EqualTo("n010"));
            Assert.That(_env.Outcomes.Count, Is.EqualTo(0), "the exit of the jumped-to dialogue does not end the conversation");

            _env.Choose("c");

            Assert.That(_env.Outcomes.Last.DialogueId, Is.EqualTo(TestDialogues.Hub));
            Assert.That(_env.Outcomes.Last.ExitId, Is.EqualTo("danke"));
        }

        [Test]
        public void JumpWithoutReturn_EndsWithTheExitOfTheOtherDialogue()
        {
            _env.Start(TestDialogues.Hub, TestDialogues.Ulf);

            _env.Choose("b");

            Assert.That(_env.View.Line.Text, Is.EqualTo("Grimmbart? Frag lieber nicht."));
            Assert.That(_env.View.Line.EndsConversation, Is.True);
            _env.Continue();
            Assert.That(_env.Outcomes.Last.DialogueId, Is.EqualTo(TestDialogues.Hub), "the outcome names the started dialogue");
            Assert.That(_env.Outcomes.Last.ExitId, Is.EqualTo("grimmbart"));
        }

        [Test]
        public void EndlessLoopWithoutInput_EndsTheConversation_WithAnError()
        {
            Assert.That(_env.Start(TestDialogues.Loop, TestDialogues.Ulf), Is.True);

            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Outcomes.Last.ExitId, Is.Empty);
            Assert.That(_env.Dialogues.Runner.LastEnd.Cancelled, Is.True);
            Assert.That(_env.LogCapture.Sink.Contains(LogLevel.Error, "cycle"), Is.True, _env.LogCapture.Sink.Dump());
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void UnknownDialogue_IsNotStarted()
        {
            Assert.That(_env.Start("dlg.test.gibt_es_nicht", TestDialogues.Ulf), Is.False);

            Assert.That(_env.Talked.Count, Is.EqualTo(0));
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.Saves.Blockers, Is.Empty);
            Assert.That(_env.LogCapture.Sink.ErrorCount, Is.EqualTo(1));
        }

        [Test]
        public void SecondStart_WhileAConversationRuns_IsRefused()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);

            Assert.That(_env.Start(TestDialogues.Switch, TestDialogues.Ulf), Is.False);
            Assert.That(_env.View.DialogueId, Is.EqualTo(TestDialogues.Basic));
            Assert.That(_env.Started.Count, Is.EqualTo(1));
        }

        [Test]
        public void Bark_IsNotStartedAsAConversation()
        {
            DialogueSpec bark = new DialogueSpecBuilder("dlg.test.ulf_ruf")
                .Mode(DialogueMode.Bark)
                .Speaker(TestDialogues.Ulf)
                .Nodes(new LineNode("n010", "Frisches Bier!").EndWith("ruf"))
                .Build();
            using (var env = new DialogueTestEnvironment(null, TestDialogues.Npcs(), TestDialogues.Flags(), bark))
            {
                Assert.That(env.Start("dlg.test.ulf_ruf", TestDialogues.Ulf), Is.False);
                Assert.That(env.GameState.Current, Is.EqualTo(GameState.Playing));
            }
        }

        [Test]
        public void Back_ChoosesTheEndOption()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.Continue();

            Assert.That(_env.Dialogues.Back(), Is.True);

            Assert.That(_env.Choices.Last.OptionId, Is.EqualTo("c"));
            Assert.That(_env.Outcomes.Last.ExitId, Is.EqualTo("tschuess"));
        }

        [Test]
        public void Back_OnALine_DoesNothing_UnlessTheDialogueIsCancelable()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            Assert.That(_env.View.CanCancel, Is.False);
            Assert.That(_env.Dialogues.Back(), Is.False);
            Assert.That(_env.Dialogues.IsRunning, Is.True);
            _env.Dialogues.ForceEnd("test");

            _env.Start(TestDialogues.Short, TestDialogues.Stranger);
            Assert.That(_env.View.CanCancel, Is.True);
            Assert.That(_env.Dialogues.Back(), Is.True);

            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Outcomes.Last.DialogueId, Is.EqualTo(TestDialogues.Short));
            Assert.That(_env.Outcomes.Last.ExitId, Is.Empty, "a cancelled conversation has no exit");
            Assert.That(_env.Dialogues.Runner.LastEnd.Cancelled, Is.True);
        }

        [Test]
        public void ForceEnd_EndsWithoutExit()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);

            Assert.That(_env.Dialogues.ForceEnd("Partner gestorben"), Is.True);

            Assert.That(_env.Outcomes.Last.ExitId, Is.Empty);
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.Dialogues.ForceEnd("again"), Is.False);
        }

        [Test]
        public void ActionThatEndsTheConversation_EndsItBeforeTheNextLineIsShown()
        {
            DialogueSpec spec = new DialogueSpecBuilder("dlg.test.ulf_abbruch")
                .Speaker(TestDialogues.Ulf)
                .Nodes(
                    new ActionNode("n010", new EndRunningDialogue()).To("n020"),
                    new LineNode("n020", "Das sieht niemand.").EndWith("nie"))
                .Build();
            using (var env = new DialogueTestEnvironment(null, TestDialogues.Npcs(), TestDialogues.Flags(), spec))
            {
                env.Start("dlg.test.ulf_abbruch", TestDialogues.Ulf);

                Assert.That(env.Dialogues.IsRunning, Is.False);
                Assert.That(env.Outcomes.Count, Is.EqualTo(1));
                Assert.That(env.Outcomes.Last.ExitId, Is.Empty);
                Assert.That(env.View.NodeId, Is.Not.EqualTo("n020"));
            }
        }

        [Test]
        public void SpeakerName_IsTheRole_UntilTheNameIsRevealed()
        {
            _env.Start(TestDialogues.Short, TestDialogues.Stranger);

            Assert.That(_env.View.Mode, Is.EqualTo(DialogueMode.Short));
            Assert.That(_env.View.Line.SpeakerName, Is.EqualTo("Wanderer"));
            Assert.That(_env.Dialogues.IsNameKnown(TestDialogues.Stranger), Is.False);

            _env.Continue();

            Assert.That(_env.View.Line.SpeakerName, Is.EqualTo("Ansgar"), "the reveal action runs before its line is shown");
            Assert.That(_env.Dialogues.IsNameKnown(TestDialogues.Stranger), Is.True);
            Assert.That(_env.Dialogues.IsNameKnown(TestDialogues.Ulf), Is.True, "Ulf is known from the start");
        }

        [Test]
        public void BribeOption_IsHidden_AtAnUnbribableNpc()
        {
            _env.Wallet.Gold = 500;
            _env.Start(TestDialogues.Short, TestDialogues.Stranger);
            _env.Continue();
            _env.Continue();

            Assert.That(_env.View.State, Is.EqualTo(DialogueViewState.Choice));
            Assert.That(_env.IndexOf("a"), Is.EqualTo(-1));
            Assert.That(_env.View.Options.Count, Is.EqualTo(1));
            Assert.That(_env.View.BackOptionIndex, Is.EqualTo(-1), "option b leads to a line, not to an end node");
        }

        [Test]
        public void ConversationThatEndsBelowThePauseMenu_LeavesTheDialogueStateWhenThePauseCloses()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            Assert.That(_env.GameState.Push(GameState.Paused, "test"), Is.True);

            _env.Dialogues.ForceEnd("test");

            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_env.Saves.Blockers, Is.Empty);

            _env.GameState.Pop(GameState.Paused);

            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.GameState.ModalCount, Is.EqualTo(0));
        }

        [Test]
        public void Start_IsRefused_WhileAMenuIsOpen()
        {
            _env.GameState.Push(GameState.Menu, "test");

            Assert.That(_env.Start(TestDialogues.Basic, TestDialogues.Ulf), Is.False);
            Assert.That(_env.Talked.Count, Is.EqualTo(0));
            Assert.That(_env.Saves.Blockers, Is.Empty);
        }

        [Test]
        public void Changed_IsRaisedForEveryStep_AndTheRevisionGrows()
        {
            int changes = 0;
            _env.Dialogues.Changed += () => changes++;
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            int revision = _env.View.Revision;

            _env.Continue();

            Assert.That(changes, Is.EqualTo(2));
            Assert.That(_env.View.Revision, Is.GreaterThan(revision));
        }
    }
}
