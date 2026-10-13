using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Column "Spielzeit-Zaehler" of architecture table 4.4 (<see cref="GameStateRules"/>).</summary>
    [TestFixture]
    public sealed class GameStateRulesTests
    {
        [TestCase(GameState.Playing, true)]
        [TestCase(GameState.Menu, true)]
        [TestCase(GameState.Dialogue, true)]
        [TestCase(GameState.Cutscene, true)]
        [TestCase(GameState.Building, true)]
        [TestCase(GameState.Paused, false)]
        [TestCase(GameState.Boot, false)]
        [TestCase(GameState.MainMenu, false)]
        [TestCase(GameState.Loading, false)]
        public void IsPlaytimeRunning_FollowsTable44(GameState state, bool expected)
        {
            Assert.That(GameStateRules.IsPlaytimeRunning(state), Is.EqualTo(expected));
        }
    }
}
