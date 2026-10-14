using Aetherfall.UI.Screens.Dialogue;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.DialogueScreen
{
    /// <summary>
    /// The logic of the dialogue screen without Unity (GDD 02 12.7, GDD 05 1.4 and 2.4): typewriter at the chosen text speed,
    /// first confirm completes the page and the second continues, subtitle pages, automatic continue, controller focus that
    /// skips greyed answers, hold to confirm for "[Toeten]", direct choice with 1-9, back to "[Ende]" or cancel, no input while
    /// the Dialog map is off (pause menu).
    /// </summary>
    [TestFixture]
    public sealed class DialogueScreenPresenterTests
    {
        private const float Frame = 1f / 60f;

        private FakeDialogueScreenSource _source;
        private DialogueScreenPreferences _preferences;
        private DialogueScreenPresenter _presenter;

        [SetUp]
        public void SetUp()
        {
            _source = new FakeDialogueScreenSource();
            _preferences = new DialogueScreenPreferences();
            _presenter = new DialogueScreenPresenter(_source, _preferences);
        }

        [Test]
        public void Line_IsTypedAtTheTextSpeed()
        {
            _preferences.SetTextSpeed(DialogueTextSpeed.Normal);
            _source.ShowLine("Ulf", 3f, false, "Hallo Welt");

            Tick(0.1f);

            Assert.That(_presenter.Mode, Is.EqualTo(DialogueScreenMode.Line));
            Assert.That(_presenter.SpeakerName, Is.EqualTo("Ulf"));
            Assert.That(_presenter.VisibleText, Is.EqualTo("Hall"), "40 characters per second");
            Assert.That(_presenter.ShowsContinueMark, Is.False);

            Tick(0.2f);

            Assert.That(_presenter.VisibleText, Is.EqualTo("Hallo Welt"));
            Assert.That(_presenter.IsPageComplete, Is.True);
            Assert.That(_presenter.ShowsContinueMark, Is.True);
        }

        [Test]
        public void FirstConfirm_ShowsThePage_SecondConfirmContinues()
        {
            _source.ShowLine("Ulf", 3f, false, "Eine lange Zeile, die noch getippt wird.");
            Tick(Frame);

            Tick(Frame, Submit());
            Assert.That(_presenter.IsPageComplete, Is.True);
            Assert.That(_source.Continues, Is.EqualTo(0));

            Tick(Frame, Submit());
            Assert.That(_source.Continues, Is.EqualTo(1));
            Assert.That(_presenter.Mode, Is.EqualTo(DialogueScreenMode.None));
        }

        [Test]
        public void Pages_AreShownOneAfterTheOther()
        {
            _preferences.SetTextSpeed(DialogueTextSpeed.Instant);
            _source.ShowLine("Harrik", 6f, false, "Seite eins", "Seite zwei");
            Tick(Frame);

            Assert.That(_presenter.PageCount, Is.EqualTo(2));
            Assert.That(_presenter.VisibleText, Is.EqualTo("Seite eins"));
            Tick(Frame, Submit());

            Assert.That(_presenter.PageIndex, Is.EqualTo(1));
            Assert.That(_presenter.VisibleText, Is.EqualTo("Seite zwei"));
            Assert.That(_source.Continues, Is.EqualTo(0));
            Tick(Frame, Submit());
            Assert.That(_source.Continues, Is.EqualTo(1));
        }

        [Test]
        public void AutoContinue_WaitsTheDisplayTimePerPage()
        {
            _preferences.SetTextSpeed(DialogueTextSpeed.Instant);
            _preferences.SetAutoContinue(true, 2f);
            _source.ShowLine("Harrik", 4f, false, "Seite eins", "Seite zwei");
            Tick(Frame);

            Tick(3.9f);
            Assert.That(_presenter.PageIndex, Is.EqualTo(0), "4 s × factor 2 / 2 pages = 4 s per page");
            Tick(0.2f);
            Assert.That(_presenter.PageIndex, Is.EqualTo(1));
            Tick(4.1f);
            Assert.That(_source.Continues, Is.EqualTo(1));
        }

        [Test]
        public void AutoToggle_SwitchesAutomaticContinue()
        {
            _source.ShowLine("Ulf", 3f, false, "Hallo.");

            Tick(Frame, new DialogueInputFrame { AutoTogglePressed = true });
            Assert.That(_preferences.AutoContinue, Is.True);
            Assert.That(_presenter.AutoContinue, Is.True);

            Tick(Frame, new DialogueInputFrame { AutoTogglePressed = true });
            Assert.That(_preferences.AutoContinue, Is.False);
        }

        [Test]
        public void Choice_KeepsTheLastLineAsContext()
        {
            _preferences.SetTextSpeed(DialogueTextSpeed.Instant);
            _source.ShowLine("Harrik", 3f, false, "Noch ein Schritt, und meine\nJungs spicken dich.", "Wer schickt dich?");
            Tick(Frame);
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Der Müller."), FakeDialogueScreenSource.Answer("Niemand."));

            Tick(Frame);

            Assert.That(_presenter.Mode, Is.EqualTo(DialogueScreenMode.Choice));
            Assert.That(_presenter.VisibleText, Is.EqualTo("Noch ein Schritt, und meine Jungs spicken dich. Wer schickt dich?"),
                "the whole line without page breaks");
            Assert.That(_presenter.SpeakerName, Is.EqualTo("Harrik"));
            Assert.That(_presenter.OptionCount, Is.EqualTo(2));
            Assert.That(_presenter.ShowsContinueMark, Is.False);
        }

        [Test]
        public void Focus_StartsOnTheFirstSelectableAnswer_AndSkipsGreyedOnes()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Greyed("Probe"), FakeDialogueScreenSource.Answer("Eins"),
                FakeDialogueScreenSource.Greyed("Probe 2"), FakeDialogueScreenSource.Answer("Zwei"));
            Tick(Frame, Down());
            Assert.That(_presenter.Focus.Current, Is.EqualTo(1), "a direction still held from the line does not move the focus");
            Tick(Frame, Down());
            Assert.That(_presenter.Focus.Current, Is.EqualTo(1));

            Tick(Frame);
            Tick(Frame, Down());

            Assert.That(_presenter.Focus.Current, Is.EqualTo(3));
        }

        [Test]
        public void Submit_ChoosesTheFocusedAnswer()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"), FakeDialogueScreenSource.Answer("Zwei"));
            Tick(Frame);
            Tick(Frame);
            Tick(Frame, Down());

            Tick(Frame, Submit());

            Assert.That(_source.Chosen, Is.EqualTo(new[] { 1 }));
        }

        [Test]
        public void Pointer_FocusesSelectableAnswers_GreyedOnesStayUnfocusedAndCannotBeChosen()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"), FakeDialogueScreenSource.Greyed("Probe"),
                FakeDialogueScreenSource.Answer("Drei"));
            Tick(Frame);

            _presenter.PointerOver(2);
            Assert.That(_presenter.Focus.Current, Is.EqualTo(2));
            _presenter.PointerOver(1);
            Assert.That(_presenter.Focus.Current, Is.EqualTo(2), "the tag of a greyed answer shows its reason");
            Assert.That(_presenter.PointerIndex, Is.EqualTo(1), "the row under the pointer is remembered, also a greyed one");

            Assert.That(_presenter.ChooseDirect(1), Is.False);
            Assert.That(_source.Chosen, Is.Empty);
        }

        [Test]
        public void ClickOnAGreyedAnswer_ChoosesNothing_EvenIfAnotherAnswerWasFocusedBefore()
        {
            // n040 with values 10 and no gold: the mouse passes "[Angriff]" on its way up to the greyed "[Luegen 12 · dein Wert 10]".
            _source.ShowChoice(4, false, FakeDialogueScreenSource.Answer("Wer schickt dich?"), FakeDialogueScreenSource.Greyed("Lindenhain …"),
                FakeDialogueScreenSource.Greyed("Brenner zahlt euch …"), FakeDialogueScreenSource.Combat("Dann regeln wir das mit Stahl."),
                FakeDialogueScreenSource.End("Ich komme wieder."));
            Tick(Frame);
            _presenter.PointerOver(3);
            Assert.That(_presenter.Focus.Current, Is.EqualTo(3));
            _presenter.PointerLeave(3);
            _presenter.PointerOver(2);

            Tick(Frame, Click());

            Assert.That(_source.Chosen, Is.Empty, "the click on the greyed answer must not confirm \"[Angriff]\"");
            Assert.That(_presenter.Focus.Current, Is.EqualTo(3), "the keyboard focus stays where it was");
            Assert.That(_presenter.Mode, Is.EqualTo(DialogueScreenMode.Choice));
        }

        [Test]
        public void ClickBesideTheAnswers_ChoosesNothing()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"), FakeDialogueScreenSource.Answer("Zwei"));
            Tick(Frame);
            _presenter.PointerOver(1);
            _presenter.PointerLeave(1);

            Tick(Frame, Click());

            Assert.That(_source.Chosen, Is.Empty);
            Assert.That(_presenter.PointerIndex, Is.EqualTo(-1));
        }

        [Test]
        public void Click_ChoosesTheAnswerUnderThePointer_NotTheFocusedOne()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"), FakeDialogueScreenSource.Answer("Zwei"),
                FakeDialogueScreenSource.Answer("Drei"));
            Tick(Frame);
            Tick(Frame);
            _presenter.PointerOver(2);
            Tick(Frame, Up());
            Assert.That(_presenter.Focus.Current, Is.EqualTo(1), "the keyboard moved the focus away from the pointer");

            Tick(Frame, Click());

            Assert.That(_source.Chosen, Is.EqualTo(new[] { 2 }));
        }

        [Test]
        public void PointerLeave_OfAnotherRow_KeepsTheRowUnderThePointer()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"), FakeDialogueScreenSource.Answer("Zwei"));
            Tick(Frame);
            _presenter.PointerOver(1);
            _presenter.PointerLeave(0);

            Tick(Frame, Click());

            Assert.That(_source.Chosen, Is.EqualTo(new[] { 1 }), "enter of the new row may arrive before leave of the old one");
        }

        [Test]
        public void Click_InALine_Continues()
        {
            _preferences.SetTextSpeed(DialogueTextSpeed.Instant);
            _source.ShowLine("Ulf", 2f, false, "Hallo.");
            Tick(Frame);

            Tick(Frame, Click());

            Assert.That(_source.Continues, Is.EqualTo(1), "in a line a click anywhere continues");
        }

        [Test]
        public void ClickOnAKill_StartsTheHold_AndLeavingTheRowCancelsIt()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Kill("Du drückst die Klinge tiefer."), FakeDialogueScreenSource.Answer("Zwei"));
            Tick(Frame);
            _presenter.PointerOver(0);

            Tick(Frame, Click(true));
            Assert.That(_presenter.HoldIndex, Is.EqualTo(0));
            Assert.That(_source.Chosen, Is.Empty, "a click alone never confirms \"[Toeten]\"");
            _presenter.PointerLeave(0);
            Assert.That(_presenter.HoldIndex, Is.EqualTo(-1), "the mouse left the row");
            Tick(1f, Held());
            Assert.That(_source.Chosen, Is.Empty);

            _presenter.PointerOver(0);
            Tick(Frame, Click(true));
            Tick(0.5f, Held());
            Tick(0.5f, Held());

            Assert.That(_source.Chosen, Is.EqualTo(new[] { 0 }));
        }

        [Test]
        public void ClickOnAKill_DoesNothing_WhenTheFocusIsOnAnotherRow()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Kill("Klinge"), FakeDialogueScreenSource.Answer("Zwei"));
            Tick(Frame);
            Tick(Frame);
            _presenter.PointerOver(0);
            Tick(Frame, Down());
            Assert.That(_presenter.Focus.Current, Is.EqualTo(1));

            Tick(Frame, Click(true));
            Tick(1.1f, Held());

            Assert.That(_presenter.HoldIndex, Is.EqualTo(-1));
            Assert.That(_source.Chosen, Is.Empty);
        }

        [Test]
        public void KeyboardHold_IsNotCancelledByThePointerLeavingARow()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Kill("Klinge"));
            Tick(Frame);
            _presenter.PointerOver(0);
            Tick(Frame, Submit(true));
            _presenter.PointerLeave(0);

            Tick(1f, Held());

            Assert.That(_source.Chosen, Is.EqualTo(new[] { 0 }));
        }

        [Test]
        public void KillAnswer_NeedsHolding()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Kill("Du drückst die Klinge tiefer."));
            Tick(Frame);
            Assert.That(_presenter.FocusedRequiresHold, Is.True);

            Tick(Frame, Submit(true));
            Assert.That(_presenter.HoldIndex, Is.EqualTo(0));
            Tick(0.5f, Held());
            Assert.That(_presenter.HoldProgress, Is.EqualTo(0.5f).Within(0.01f));
            Assert.That(_source.Chosen, Is.Empty);
            Tick(0.5f, Held());

            Assert.That(_source.Chosen, Is.EqualTo(new[] { 0 }));
        }

        [Test]
        public void ReleasingEarly_CancelsTheHold()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Kill("Klinge"));
            Tick(Frame);
            Tick(Frame, Submit(true));
            Tick(0.5f, Held());

            Tick(Frame);

            Assert.That(_presenter.HoldIndex, Is.EqualTo(-1));
            Assert.That(_presenter.HoldProgress, Is.EqualTo(0f));
            Assert.That(_source.Chosen, Is.Empty);
        }

        [Test]
        public void DirectNumber_ChoosesTheAnswer_ButOnlyFocusesAKill()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"), FakeDialogueScreenSource.Kill("Klinge"),
                FakeDialogueScreenSource.Answer("Drei"));
            Tick(Frame);

            Tick(Frame, new DialogueInputFrame { DirectNumber = 2 });
            Assert.That(_source.Chosen, Is.Empty);
            Assert.That(_presenter.Focus.Current, Is.EqualTo(1));

            Tick(Frame, new DialogueInputFrame { DirectNumber = 3 });
            Assert.That(_source.Chosen, Is.EqualTo(new[] { 2 }));
        }

        [Test]
        public void DefaultInputFrame_ChoosesNothing()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"));
            Tick(Frame);

            Tick(Frame, default);

            Assert.That(_source.Chosen, Is.Empty);
        }

        [Test]
        public void Back_ChoosesTheEndAnswer_OrCancels_OrDoesNothing()
        {
            _source.ShowChoice(1, false, FakeDialogueScreenSource.Answer("Eins"), FakeDialogueScreenSource.End("Ich komme wieder."));
            Tick(Frame);
            Assert.That(_presenter.CanGoBack, Is.True);
            Tick(Frame, new DialogueInputFrame { BackPressed = true });
            Assert.That(_source.Backs, Is.EqualTo(1));

            _source.ShowLine("Ulf", 2f, false, "Hallo.");
            Tick(Frame);
            Assert.That(_presenter.CanGoBack, Is.False);
            Tick(Frame, new DialogueInputFrame { BackPressed = true });
            Assert.That(_source.Backs, Is.EqualTo(1), "a line of a conversation that cannot be cancelled ignores B");

            _source.ShowLine("Ansgar", 2f, true, "Was starrst du so?");
            Tick(Frame);
            Tick(Frame, new DialogueInputFrame { BackPressed = true });
            Assert.That(_source.Backs, Is.EqualTo(2));
        }

        [Test]
        public void InactiveInput_IsIgnored_AndCancelsAHold()
        {
            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Kill("Klinge"), FakeDialogueScreenSource.Answer("Zwei"));
            Tick(Frame);
            Tick(Frame, Submit(true));

            _presenter.Tick(Frame, Held(), false);
            Assert.That(_presenter.HoldIndex, Is.EqualTo(-1), "the pause menu opened over the dialogue");

            _presenter.Tick(Frame, Submit(), false);
            Assert.That(_source.Chosen, Is.Empty);
        }

        [Test]
        public void Version_GrowsWithVisibleChanges_AndStaysWithout()
        {
            _preferences.SetTextSpeed(DialogueTextSpeed.Instant);
            _source.ShowLine("Ulf", 2f, false, "Hallo.");
            Tick(Frame);
            int version = _presenter.Version;

            Tick(Frame);
            Assert.That(_presenter.Version, Is.EqualTo(version));

            _source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"));
            Tick(Frame);
            Assert.That(_presenter.Version, Is.GreaterThan(version));
        }

        [Test]
        public void TooManyOptions_AreCutToNine()
        {
            var options = new DialogueScreenOption[12];
            for (int i = 0; i < options.Length; i++)
            {
                options[i] = FakeDialogueScreenSource.Answer("Option " + i);
            }

            _source.ShowChoice(-1, false, options);
            Tick(Frame);

            Assert.That(_presenter.OptionCount, Is.EqualTo(DialogueScreenPresenter.MaxOptions));
        }

        private void Tick(float dt)
        {
            Tick(dt, new DialogueInputFrame());
        }

        private void Tick(float dt, DialogueInputFrame input)
        {
            _presenter.Tick(dt, input, true);
        }

        private static DialogueInputFrame Submit(bool held = false)
        {
            return new DialogueInputFrame { SubmitPressed = true, SubmitHeld = held };
        }

        private static DialogueInputFrame Click(bool held = false)
        {
            return new DialogueInputFrame { PointerSubmitPressed = true, SubmitHeld = held };
        }

        private static DialogueInputFrame Held()
        {
            return new DialogueInputFrame { SubmitHeld = true };
        }

        private static DialogueInputFrame Down()
        {
            return new DialogueInputFrame { NavigateY = -1f };
        }

        private static DialogueInputFrame Up()
        {
            return new DialogueInputFrame { NavigateY = 1f };
        }
    }
}
