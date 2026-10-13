using System;
using Aetherfall.Core;
using Aetherfall.Input;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Checks <see cref="ActionMapTable"/> against an independent copy of table 4.4 (architecture) / "Wann welche Map aktiv
    /// ist" (GDD 03 1.5) for every game state and both control modes.
    /// </summary>
    [TestFixture]
    public sealed class ActionMapTableTests
    {
        private static readonly (GameState State, ActionMapId OnFoot, ActionMapId Mounted)[] Expected =
        {
            (GameState.Boot, ActionMapId.None, ActionMapId.None),
            (GameState.MainMenu, ActionMapId.UI, ActionMapId.UI),
            (GameState.Loading, ActionMapId.None, ActionMapId.None),
            (GameState.Playing, ActionMapId.Gameplay, ActionMapId.Riding),
            (GameState.Menu, ActionMapId.UI, ActionMapId.UI),
            (GameState.Paused, ActionMapId.UI, ActionMapId.UI),
            (GameState.Dialogue, ActionMapId.Dialog, ActionMapId.Dialog),
            (GameState.Cutscene, ActionMapId.UI, ActionMapId.UI),
            (GameState.Building, ActionMapId.Building, ActionMapId.Building)
        };

        [Test]
        public void Table_CoversEveryGameState()
        {
            Assert.That(Expected.Length, Is.EqualTo(Enum.GetValues(typeof(GameState)).Length));
        }

        [Test]
        public void For_MatchesArchitectureTable44()
        {
            foreach ((GameState state, ActionMapId onFoot, ActionMapId mounted) in Expected)
            {
                Assert.That(ActionMapTable.For(state, PlayerControlMode.OnFoot), Is.EqualTo(onFoot), state + " on foot");
                Assert.That(ActionMapTable.For(state, PlayerControlMode.Mounted), Is.EqualTo(mounted), state + " mounted");
            }
        }

        [Test]
        public void For_GameplayIsNeverActiveOutsideOfPlaying()
        {
            foreach (GameState state in (GameState[])Enum.GetValues(typeof(GameState)))
            {
                if (state == GameState.Playing)
                {
                    continue;
                }

                Assert.That(ActionMapTable.For(state, PlayerControlMode.OnFoot), Is.Not.EqualTo(ActionMapId.Gameplay), state.ToString());
            }
        }

        [Test]
        public void ForMap_NamesEveryPlayerMap()
        {
            Assert.That(InputActionNames.ForMap(ActionMapId.None), Is.Null);
            Assert.That(InputActionNames.ForMap(ActionMapId.Gameplay), Is.EqualTo("Gameplay"));
            Assert.That(InputActionNames.ForMap(ActionMapId.UI), Is.EqualTo("UI"));
            Assert.That(InputActionNames.ForMap(ActionMapId.Dialog), Is.EqualTo("Dialog"));
            Assert.That(InputActionNames.ForMap(ActionMapId.Riding), Is.EqualTo("Riding"));
            Assert.That(InputActionNames.ForMap(ActionMapId.Building), Is.EqualTo("Building"));
        }
    }
}
