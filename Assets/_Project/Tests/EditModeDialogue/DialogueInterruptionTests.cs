using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// Conversations that are interrupted from outside: the death of the player and the start of a fight end them like a
    /// cancel (the AI keeps running in the game state Dialogue), also below the death screen (Paused over Dialogue); a cutscene
    /// that replaces the state Dialogue (architecture 4.4) ends them as well, and loading from the pause menu stops them
    /// without events. In every case the game state returns to Playing and the save lock is gone.
    /// </summary>
    [TestFixture]
    public sealed class DialogueInterruptionTests
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
        public void PlayerDied_EndsTheConversation_WithoutExit()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);

            _env.Bus.Publish(Died());

            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Outcomes.Count, Is.EqualTo(1));
            Assert.That(_env.Outcomes.Last.ExitId, Is.Empty);
            Assert.That(_env.Dialogues.Runner.LastEnd.Cancelled, Is.True);
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.Saves.Blockers, Is.Empty);
        }

        [Test]
        public void PlayerDied_BelowTheDeathScreen_LeavesNoDialogueStateBehind()
        {
            // The death screen is a Paused modal over the dialogue; "Am Spawnpunkt wiederbeleben" pops it.
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            Assert.That(_env.GameState.Push(GameState.Paused, "death screen"), Is.True);

            _env.Bus.Publish(Died());

            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Outcomes.Count, Is.EqualTo(1));
            Assert.That(_env.Outcomes.Last.ExitId, Is.Empty);
            Assert.That(_env.Saves.Blockers, Is.Empty);
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Paused));

            _env.GameState.Pop(GameState.Paused);

            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing), "the conversation does not come back after the respawn");
            Assert.That(_env.GameState.ModalCount, Is.EqualTo(0));
            Assert.That(_env.View.State, Is.EqualTo(DialogueViewState.Ended));
            Assert.That(_env.Start(TestDialogues.Basic, TestDialogues.Ulf), Is.True, "a new conversation can start");
        }

        [Test]
        public void CombatStarted_EndsTheConversation_CombatEndedDoesNot()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);

            _env.Bus.Publish(new CombatStateChanged(false));
            Assert.That(_env.Dialogues.IsRunning, Is.True, "leaving combat changes nothing");

            _env.Bus.Publish(new CombatStateChanged(true));

            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Outcomes.Last.ExitId, Is.Empty);
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.Saves.Blockers, Is.Empty);
        }

        [Test]
        public void DeathAndCombat_WithoutConversation_DoNothing()
        {
            _env.Bus.Publish(Died());
            _env.Bus.Publish(new CombatStateChanged(true));

            Assert.That(_env.Outcomes.Count, Is.EqualTo(0));
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void CutsceneReplacingTheDialogue_EndsTheConversation()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);

            Assert.That(_env.GameState.Push(GameState.Cutscene, "test"), Is.True);

            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Cutscene));
            Assert.That(_env.GameState.ModalCount, Is.EqualTo(1), "Dialogue → Cutscene replaces the top");
            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Outcomes.Count, Is.EqualTo(1));
            Assert.That(_env.Outcomes.Last.ExitId, Is.Empty);
            Assert.That(_env.Saves.Blockers, Is.Empty);

            _env.GameState.Pop(GameState.Cutscene);
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_env.Start(TestDialogues.Basic, TestDialogues.Ulf), Is.True, "no stuck conversation refuses the next start");
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Dialogue));
        }

        [Test]
        public void CutsceneStartedByADialogueAction_KeepsTheExitReachedInTheSameStep()
        {
            DialogueSpec spec = new DialogueSpecBuilder("dlg.test.ulf_szene")
                .Speaker(TestDialogues.Ulf)
                .Nodes(
                    new ChoiceNode("n010")
                        .Add(new DialogueOption("a", "Zeig es mir.", "n020"))
                        .Add(new DialogueOption("b", "Und dann?", "n030"))
                        .Add(new DialogueOption("c", "Bis später.", "n990")),
                    new ActionNode("n020", new PushCutscene()).EndWith("szene"),
                    new ActionNode("n030", new PushCutscene()).To("n040"),
                    new LineNode("n040", "Das sieht niemand mehr.").EndWith("nie"),
                    new EndNode("n990", "tschuess"))
                .Build();
            using (var env = new DialogueTestEnvironment(null, TestDialogues.Npcs(), TestDialogues.Flags(), spec))
            {
                env.Start(spec.Id, TestDialogues.Ulf);
                env.Choose("a");

                Assert.That(env.Dialogues.IsRunning, Is.False);
                Assert.That(env.Outcomes.Last.ExitId, Is.EqualTo("szene"), "the step ends at its end node, the exit counts");
                Assert.That(env.GameState.Current, Is.EqualTo(GameState.Cutscene));
                Assert.That(env.Saves.Blockers, Is.Empty);
                env.GameState.Pop(GameState.Cutscene);

                env.Start(spec.Id, TestDialogues.Ulf);
                env.Choose("b");

                Assert.That(env.Dialogues.IsRunning, Is.False, "the line after the cutscene would wait forever without the Dialog map");
                Assert.That(env.Outcomes.Count, Is.EqualTo(2));
                Assert.That(env.Outcomes.Last.ExitId, Is.Empty);
                Assert.That(env.GameState.Current, Is.EqualTo(GameState.Cutscene));
                Assert.That(env.GameState.ModalCount, Is.EqualTo(1));
                Assert.That(env.Saves.Blockers, Is.Empty);
            }
        }

        [Test]
        public void LoadingFromThePauseMenu_StopsTheConversationWithoutEvents()
        {
            _env.Start(TestDialogues.Basic, TestDialogues.Ulf);
            _env.GameState.Push(GameState.Paused, "pause menu");

            Assert.That(_env.GameState.SwitchBase(GameState.Loading, "load"), Is.True);

            Assert.That(_env.Dialogues.IsRunning, Is.False);
            Assert.That(_env.Outcomes.Count, Is.EqualTo(0), "loading sends no gameplay events (architecture 9.1)");
            Assert.That(_env.Saves.Blockers, Is.Empty);

            _env.GameState.SwitchBase(GameState.Playing, "loaded");
            Assert.That(_env.Start(TestDialogues.Basic, TestDialogues.Ulf), Is.True);
            Assert.That(_env.GameState.Current, Is.EqualTo(GameState.Dialogue));
        }

        private static PlayerDied Died()
        {
            // default instead of Vector3.zero: the harness compiles against reference assemblies without method bodies.
            Vector3 position = default;
            return new PlayerDied(position, "enemy.wolf.grauwolf", string.Empty);
        }
    }
}
