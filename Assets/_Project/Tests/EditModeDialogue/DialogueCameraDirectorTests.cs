using Aetherfall.Cinematics;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// The dialogue camera director (S58) against the real dialogue service: Harrik's negotiation (GDD 02 12.10) opens on the
    /// two-shot (hint "Eröffnung": 2.5 s), his lines are the shot, the choice is the reverse shot, the knife variant opens with the
    /// close-up; short conversations, the pause menu, the end and a cutscene switch it off or hold it.
    /// </summary>
    [TestFixture]
    public sealed class DialogueCameraDirectorTests
    {
        private const string Id = MuehlbachDialogueFixture.DialogueId;
        private const string Harrik = MuehlbachDialogueFixture.Harrik;

        private DialogueTestEnvironment _env;
        private DialogueCameraDirector _director;

        [SetUp]
        public void SetUp()
        {
            _env = TestDialogues.Environment();
            _director = new DialogueCameraDirector(_env.Dialogues, _env.GameState);
            _director.PostInitialize();
        }

        [TearDown]
        public void TearDown()
        {
            _director.Dispose();
            _env.Dispose();
        }

        [Test]
        public void FullConversation_OpensOnTheTwoShot_ForTwoAndAHalfSecondsWithTheOpeningHint()
        {
            Assert.That(_env.Start(Id, Harrik), Is.True);

            Assert.That(_director.Current.Active, Is.True);
            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Wide));
            Assert.That(_director.Current.PartnerId, Is.EqualTo(Harrik));

            Tick(2.0f);
            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Wide), "the opening hint holds the two-shot for 2.5 s");
            Tick(0.6f);
            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Shot));
        }

        [Test]
        public void Choice_IsTheReverseShot_ButNotBeforeOneAndAHalfSecondsOnTheShot()
        {
            _env.Start(Id, Harrik);
            Tick(2.6f);
            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Shot));

            _env.Continue();
            Tick(0.5f);
            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Shot), "the cut waits for 1.5 s on the shot");
            Tick(1.1f);

            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.ReverseShot));
        }

        [Test]
        public void ChoiceFraming_ListeningCloseUp_ShowsThePartnerInClose()
        {
            _director.ChoiceFraming = ChoiceFraming.ListeningCloseUp;
            _env.Start(Id, Harrik);
            Tick(2.6f);
            _env.Continue();
            Tick(2.0f);

            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Close));
        }

        [Test]
        public void CloseHint_OnTheFirstLine_CutsToTheCloseUpAfterTheOpening()
        {
            _env.World.SetBool(MuehlbachDialogueFixture.FlagKnife, true, "test");
            _env.Start(Id, Harrik);
            Assert.That(_env.View.NodeId, Is.EqualTo("n015"));

            Tick(1.4f);
            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Wide));
            Tick(0.2f);

            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Close));
        }

        [Test]
        public void CutLog_HasAtLeastOneAndAHalfSecondsBetweenCuts_AndAtMostOneCutPerLine()
        {
            _env.Start(Id, Harrik);
            for (int step = 0; step < 6; step++)
            {
                Tick(0.4f);
                Tick(0.4f);
                if (_env.View.State == Aetherfall.Dialogue.DialogueViewState.Line)
                {
                    _env.Continue();
                }
                else
                {
                    _env.Choose("a");
                }
            }

            Assert.That(_director.Cuts.Count, Is.GreaterThanOrEqualTo(2));
            for (int i = 1; i < _director.Cuts.Count; i++)
            {
                Assert.That(_director.Cuts[i].Time - _director.Cuts[i - 1].Time, Is.GreaterThanOrEqualTo(1.5d - 1e-6), _director.Cuts[i].ToString());
                if (i > 1)
                {
                    // Entry 0 is the opening two-shot, not a cut.
                    Assert.That(_director.Cuts[i].Beat, Is.Not.EqualTo(_director.Cuts[i - 1].Beat), "two cuts in one line");
                }
            }
        }

        [Test]
        public void ShortConversation_KeepsTheGameCamera()
        {
            Assert.That(_env.Start(TestDialogues.Short, TestDialogues.Stranger), Is.True);
            Tick(2f);

            Assert.That(_director.Current.Active, Is.False);
        }

        [Test]
        public void PauseOverTheConversation_HoldsTheCamera()
        {
            _env.Start(Id, Harrik);
            Assert.That(_env.GameState.Push(GameState.Paused, "test"), Is.True);

            Tick(0f);
            Tick(0f);

            Assert.That(_director.Current.Active, Is.True);
            Assert.That(_director.Current.Setup, Is.EqualTo(DialogueSetup.Wide));
        }

        [Test]
        public void EndOfTheConversation_SwitchesItOff()
        {
            _env.Start(Id, Harrik);

            _env.Dialogues.ForceEnd("test");

            Assert.That(_director.Current.Active, Is.False);
        }

        [Test]
        public void CutsceneReplacingTheConversation_SwitchesItOff()
        {
            _env.Start(Id, Harrik);

            Assert.That(_env.GameState.Push(GameState.Cutscene, "test"), Is.True);
            Tick(0.1f);

            Assert.That(_director.Current.Active, Is.False);
        }

        [Test]
        public void NextConversation_CountsUp_AndStartsAFreshCutLog()
        {
            _env.Start(Id, Harrik);
            Tick(2.6f);
            int first = _director.Current.Conversation;
            _env.Dialogues.ForceEnd("test");

            _env.Start(Id, Harrik);

            Assert.That(_director.Current.Conversation, Is.EqualTo(first + 1));
            Assert.That(_director.Cuts.Count, Is.EqualTo(1));
        }

        private void Tick(float seconds)
        {
            _director.Tick(seconds);
        }
    }
}
