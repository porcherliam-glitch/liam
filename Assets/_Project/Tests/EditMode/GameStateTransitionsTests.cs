using System;
using System.Collections.Generic;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Checks the complete transition table of <see cref="GameStateTransitions"/> against an independent copy of the
    /// state diagram in architecture 4.4 (every combination of states, allowed and forbidden).
    /// </summary>
    [TestFixture]
    public sealed class GameStateTransitionsTests
    {
        // Edges of the diagram, written down independently of the implementation.
        private static readonly (GameState From, GameState To)[] ExpectedSwitchBase =
        {
            (GameState.Boot, GameState.MainMenu),
            (GameState.MainMenu, GameState.Loading),
            (GameState.Loading, GameState.Playing),
            (GameState.Playing, GameState.Loading),
            (GameState.Paused, GameState.Loading),
            (GameState.Paused, GameState.MainMenu)
        };

        private static readonly (GameState From, GameState To, ModalPushMode Mode)[] ExpectedPush =
        {
            (GameState.Playing, GameState.Menu, ModalPushMode.Stack),
            (GameState.Playing, GameState.Paused, ModalPushMode.Stack),
            (GameState.Playing, GameState.Dialogue, ModalPushMode.Stack),
            (GameState.Playing, GameState.Cutscene, ModalPushMode.Stack),
            (GameState.Playing, GameState.Building, ModalPushMode.Stack),
            (GameState.Dialogue, GameState.Paused, ModalPushMode.Stack),
            (GameState.Dialogue, GameState.Cutscene, ModalPushMode.ReplaceTop)
        };

        private static readonly (GameState Top, GameState Revealed)[] ExpectedPopTargets =
        {
            (GameState.Menu, GameState.Playing),
            (GameState.Paused, GameState.Playing),
            (GameState.Paused, GameState.Dialogue),
            (GameState.Dialogue, GameState.Playing),
            (GameState.Cutscene, GameState.Playing),
            (GameState.Building, GameState.Playing)
        };

        private static GameState[] AllStates => (GameState[])Enum.GetValues(typeof(GameState));

        [Test]
        public void BaseAndModalStates_AreSplitAsInTheArchitecture()
        {
            var baseStates = new List<GameState>();
            var modalStates = new List<GameState>();
            foreach (GameState state in AllStates)
            {
                Assert.That(GameStateTransitions.IsBaseState(state), Is.Not.EqualTo(GameStateTransitions.IsModalState(state)), state.ToString());
                (GameStateTransitions.IsBaseState(state) ? baseStates : modalStates).Add(state);
            }

            Assert.That(baseStates, Is.EquivalentTo(new[] { GameState.Boot, GameState.MainMenu, GameState.Loading, GameState.Playing }));
            Assert.That(modalStates, Is.EquivalentTo(new[] { GameState.Menu, GameState.Paused, GameState.Dialogue, GameState.Cutscene, GameState.Building }));
        }

        [Test]
        public void CanSwitchBase_MatchesDiagramForEveryCombination()
        {
            foreach (GameState from in AllStates)
            {
                foreach (GameState to in AllStates)
                {
                    bool expected = Array.IndexOf(ExpectedSwitchBase, (from, to)) >= 0;
                    Assert.That(GameStateTransitions.CanSwitchBase(from, to), Is.EqualTo(expected), "SwitchBase " + from + " -> " + to);
                }
            }
        }

        [Test]
        public void TryGetPushMode_MatchesDiagramForEveryCombination()
        {
            foreach (GameState from in AllStates)
            {
                foreach (GameState to in AllStates)
                {
                    int index = Array.FindIndex(ExpectedPush, edge => edge.From == from && edge.To == to);
                    bool allowed = GameStateTransitions.TryGetPushMode(from, to, out ModalPushMode mode);

                    Assert.That(allowed, Is.EqualTo(index >= 0), "Push " + from + " -> " + to);
                    Assert.That(GameStateTransitions.CanPush(from, to), Is.EqualTo(allowed));
                    if (index >= 0)
                    {
                        Assert.That(mode, Is.EqualTo(ExpectedPush[index].Mode), "Push mode " + from + " -> " + to);
                    }
                }
            }
        }

        [Test]
        public void IsValidPopTarget_MatchesDiagramForEveryCombination()
        {
            foreach (GameState top in AllStates)
            {
                foreach (GameState revealed in AllStates)
                {
                    bool expected = Array.IndexOf(ExpectedPopTargets, (top, revealed)) >= 0;
                    Assert.That(GameStateTransitions.IsValidPopTarget(top, revealed), Is.EqualTo(expected), "Pop " + top + " -> " + revealed);
                }
            }
        }

        [Test]
        public void EveryPushOfTheStackModeHasAMatchingPopEdge()
        {
            foreach ((GameState from, GameState to, ModalPushMode mode) in ExpectedPush)
            {
                if (mode == ModalPushMode.Stack)
                {
                    Assert.That(GameStateTransitions.IsValidPopTarget(to, from), Is.True, "Pop " + to + " -> " + from);
                }
            }
        }
    }
}
