using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// Unit tests for the quest tracker and experience bar part of <see cref="HudVisibilityRules"/> (GDD 05 1.2): tracked
    /// quests show 8 s after quest activity, the experience bar 4 s after experience; "Vollstaendig" shows both always,
    /// "Minimal" never, the HUD peek shows both.
    /// </summary>
    [TestFixture]
    public sealed class HudProgressVisibilityTests
    {
        private static readonly HudContext Calm = new HudContext { Health01 = 1f, Stamina01 = 1f, Mana01 = 1f };

        [Test]
        public void Contextual_QuestsShowEightSecondsAfterActivity()
        {
            var rules = new HudVisibilityRules();
            rules.Update(Calm, 0.1f);
            Assert.That(rules.ShowQuests, Is.False, "nothing happened yet");

            rules.NotifyQuestActivity();
            rules.Update(Calm, 7.9f);
            Assert.That(rules.ShowQuests, Is.True);
            rules.Update(Calm, 0.2f);
            Assert.That(rules.ShowQuests, Is.False);

            rules.NotifyQuestActivity();
            rules.Update(Calm, 5f);
            rules.NotifyQuestActivity();
            rules.Update(Calm, 5f);
            Assert.That(rules.ShowQuests, Is.True, "new activity restarts the 8 s");
        }

        [Test]
        public void Contextual_XpBarShowsFourSecondsAfterExperience()
        {
            var rules = new HudVisibilityRules();
            rules.NotifyXpGained();
            rules.Update(Calm, 3.9f);
            Assert.That(rules.ShowXp, Is.True);
            Assert.That(rules.ShowQuests, Is.False, "experience does not show the quests");
            rules.Update(Calm, 0.2f);
            Assert.That(rules.ShowXp, Is.False);
        }

        [Test]
        public void Full_ShowsBothAlways_Minimal_Never()
        {
            var rules = new HudVisibilityRules { Mode = HudMode.Full };
            rules.Update(Calm, 0.1f);
            Assert.That(rules.ShowQuests && rules.ShowXp, Is.True);

            rules.Mode = HudMode.Minimal;
            rules.NotifyQuestActivity();
            rules.NotifyXpGained();
            rules.Update(Calm, 0.1f);
            Assert.That(rules.ShowQuests || rules.ShowXp, Is.False);
        }

        [Test]
        public void Peek_ShowsBoth_AndResetForgetsTheTimers()
        {
            var rules = new HudVisibilityRules();
            rules.Peek();
            rules.Update(Calm, 0.1f);
            Assert.That(rules.ShowQuests && rules.ShowXp, Is.True);

            rules.Reset();
            rules.NotifyQuestActivity();
            rules.Reset();
            rules.Update(Calm, 0.1f);
            Assert.That(rules.ShowQuests || rules.ShowXp, Is.False);
        }
    }
}
