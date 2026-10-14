using Aetherfall.Tests.EditMode.Dialogue;
using Aetherfall.UI.Screens.Dialogue;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.DialogueScreen
{
    /// <summary>
    /// The dialogue screen on the real dialogue service: the Muehlbach dialogue (GDD 02, 12.10) through
    /// <see cref="DialogueServiceScreenSource"/> and <see cref="DialogueScreenPresenter"/> with confirm and back as a player
    /// would press them.
    /// </summary>
    [TestFixture]
    public sealed class DialogueServiceScreenSourceTests
    {
        [Test]
        public void Muehlbach_ThroughTheScreen_EndsWithVertagt_AndShowsTheMarkings()
        {
            using (DialogueTestEnvironment env = TestDialogues.Environment())
            {
                env.Stats.Charisma = 12;
                env.Wallet.Gold = 100;
                var source = new DialogueServiceScreenSource(env.Dialogues);
                var presenter = new DialogueScreenPresenter(source, new DialogueScreenPreferences());
                Assert.That(env.Start(MuehlbachDialogueFixture.DialogueId, MuehlbachDialogueFixture.Harrik), Is.True);
                var frame = new DialogueInputFrame();
                presenter.Tick(0.016f, frame, true);
                Assert.That(presenter.Mode, Is.EqualTo(DialogueScreenMode.Line));
                Assert.That(presenter.SpeakerName, Is.EqualTo("Banditenanführer"));
                Assert.That(presenter.PageCount, Is.EqualTo(2));

                frame.SubmitPressed = true;
                for (int i = 0; i < 6 && presenter.Mode == DialogueScreenMode.Line; i++)
                {
                    presenter.Tick(0.016f, frame, true);
                }

                Assert.That(presenter.Mode, Is.EqualTo(DialogueScreenMode.Choice), "n025");
                frame.Clear();
                frame.SubmitPressed = true;
                presenter.Tick(0.016f, frame, true);
                Assert.That(env.View.NodeId, Is.EqualTo("n030"));
                for (int i = 0; i < 6 && presenter.Mode == DialogueScreenMode.Line; i++)
                {
                    presenter.Tick(0.016f, frame, true);
                }

                Assert.That(env.View.NodeId, Is.EqualTo("n040"));
                Assert.That(presenter.GetOption(1).TagText, Is.EqualTo("[Überzeugen 12]"));
                Assert.That(presenter.GetOption(1).Tag, Is.EqualTo(DialogueScreenTag.Check));
                Assert.That(presenter.GetOption(1).AttributeKey, Is.EqualTo("charisma"));
                Assert.That(presenter.GetOption(4).TagText, Is.EqualTo("[77 Gold]"));
                Assert.That(presenter.GetOption(presenter.OptionCount - 1).Tag, Is.EqualTo(DialogueScreenTag.End));
                frame.Clear();
                frame.BackPressed = true;
                presenter.Tick(0.016f, frame, true);
                Assert.That(env.Dialogues.IsRunning, Is.False);
                Assert.That(env.Outcomes.Last.ExitId, Is.EqualTo("vertagt"));
                Assert.That(presenter.Mode, Is.EqualTo(DialogueScreenMode.None));
            }
        }
    }
}
