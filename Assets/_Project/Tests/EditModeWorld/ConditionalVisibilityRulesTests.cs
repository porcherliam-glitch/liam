using Aetherfall.Core;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Conditional groups hide their children only outside conversations (S58): talking to Hedda at s20 completes the quest goal
    /// at once, but she must not vanish while she speaks (and the dialogue camera looks at her).
    /// </summary>
    [TestFixture]
    public sealed class ConditionalVisibilityRulesTests
    {
        [TestCase(GameState.Dialogue)]
        [TestCase(GameState.Paused)]
        public void Hiding_WaitsDuringAConversation(GameState state)
        {
            Assert.That(ConditionalVisibilityRules.DeferHide(false, true, state), Is.True);
        }

        [TestCase(GameState.Playing)]
        [TestCase(GameState.Loading)]
        [TestCase(GameState.Cutscene)]
        [TestCase(GameState.Menu)]
        public void Hiding_HappensAtOnceOutsideConversations(GameState state)
        {
            Assert.That(ConditionalVisibilityRules.DeferHide(false, true, state), Is.False);
        }

        [Test]
        public void Showing_NeverWaits_AndHiddenChildrenNeedNoWait()
        {
            Assert.That(ConditionalVisibilityRules.DeferHide(true, false, GameState.Dialogue), Is.False);
            Assert.That(ConditionalVisibilityRules.DeferHide(false, false, GameState.Dialogue), Is.False);
        }
    }
}
