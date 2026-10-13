using System;
using Aetherfall.Core;
using Aetherfall.Input;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>Unit tests for <see cref="PauseRouting"/> (Start/Esc) and <see cref="CursorPolicy"/>.</summary>
    [TestFixture]
    public sealed class PauseAndCursorRulesTests
    {
        private static GameState[] AllStates => (GameState[])Enum.GetValues(typeof(GameState));

        [Test]
        public void Pause_InPlayingAndDialogue_PushesPaused()
        {
            Assert.That(PauseRouting.Resolve(GameState.Playing, true, false), Is.EqualTo(PauseCommand.PushPaused));
            Assert.That(PauseRouting.Resolve(GameState.Dialogue, true, false), Is.EqualTo(PauseCommand.PushPaused));
        }

        [Test]
        public void Resume_InPaused_PopsPaused()
        {
            Assert.That(PauseRouting.Resolve(GameState.Paused, false, true), Is.EqualTo(PauseCommand.PopPaused));
        }

        [Test]
        public void Pause_InPaused_DoesNothing()
        {
            Assert.That(PauseRouting.Resolve(GameState.Paused, true, false), Is.EqualTo(PauseCommand.None));
        }

        [Test]
        public void Pause_WhereTheTransitionTableForbidsIt_DoesNothing()
        {
            foreach (GameState state in AllStates)
            {
                bool allowed = GameStateTransitions.CanPush(state, GameState.Paused);
                PauseCommand expected = allowed ? PauseCommand.PushPaused : PauseCommand.None;
                if (state == GameState.Paused)
                {
                    expected = PauseCommand.None;
                }

                Assert.That(PauseRouting.Resolve(state, true, false), Is.EqualTo(expected), state.ToString());
            }
        }

        [Test]
        public void Resume_OutsideOfPaused_DoesNothing()
        {
            foreach (GameState state in AllStates)
            {
                if (state != GameState.Paused)
                {
                    Assert.That(PauseRouting.Resolve(state, false, true), Is.EqualTo(PauseCommand.None), state.ToString());
                }
            }
        }

        [Test]
        public void NoButton_DoesNothing()
        {
            foreach (GameState state in AllStates)
            {
                Assert.That(PauseRouting.Resolve(state, false, false), Is.EqualTo(PauseCommand.None), state.ToString());
            }
        }

        [Test]
        public void Cursor_IsLockedOnlyWhilePlaying()
        {
            foreach (GameState state in AllStates)
            {
                Assert.That(CursorPolicy.ShouldLockCursor(state), Is.EqualTo(state == GameState.Playing), state.ToString());
            }
        }
    }
}
