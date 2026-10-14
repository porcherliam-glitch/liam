using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// Pure helpers of the crypt fights: the arena beam geometry (GDD 02 11.7 phase 2), the tower shield of the elite skeleton
    /// and the boss health bar source (GDD 05).
    /// </summary>
    [TestFixture]
    public sealed class BossHelpersTests
    {
        [Test]
        public void BeamHitsATargetInFrontWithinTheRadius()
        {
            // Arena mirror at (-5 | 75) facing west; the knight stands at (-14 | 75.5).
            Assert.That(BossBeamMath.IsInBeam(-5f, 75f, -1f, 0f, -14f, 75.5f, 0.9f, 40f), Is.True);
            Assert.That(BossBeamMath.IsInBeam(-5f, 75f, -1f, 0f, -14f, 77f, 0.9f, 40f), Is.False, "2 m beside the beam");
            Assert.That(BossBeamMath.IsInBeam(-5f, 75f, -1f, 0f, 2f, 75f, 0.9f, 40f), Is.False, "behind the mirror");
            Assert.That(BossBeamMath.IsInBeam(-5f, 75f, -1f, 0f, -50f, 75f, 0.9f, 40f), Is.False, "beyond the beam length");
            Assert.That(BossBeamMath.IsInBeam(-5f, 75f, 0f, 0f, -14f, 75f, 0.9f, 40f), Is.False, "no direction");
        }

        [Test]
        public void MirrorFacingTheCrackSendsNoBeam()
        {
            // The crack is east of the mirror (-1.1 | 75).
            Assert.That(BossBeamMath.FacesSource(-5f, 75f, 1f, 0f, -1.1f, 75f), Is.True);
            Assert.That(BossBeamMath.FacesSource(-5f, 75f, 0f, 1f, -1.1f, 75f), Is.False);
            Assert.That(BossBeamMath.FacesSource(-5f, 75f, -1f, 0f, -1.1f, 75f), Is.False);
        }

        [Test]
        public void TowerShieldBlocksFromTheFrontWhileNotAttacking()
        {
            Assert.That(ShieldGuardRules.IsGuarding(EnemyStateId.Combat, AttackPhase.None, true), Is.True);
            Assert.That(ShieldGuardRules.IsGuarding(EnemyStateId.Combat, AttackPhase.Windup, true), Is.True);
            Assert.That(ShieldGuardRules.IsGuarding(EnemyStateId.Combat, AttackPhase.Active, true), Is.False, "open while striking");
            Assert.That(ShieldGuardRules.IsGuarding(EnemyStateId.Combat, AttackPhase.Recovery, true), Is.False);
            Assert.That(ShieldGuardRules.IsGuarding(EnemyStateId.Stunned, AttackPhase.None, true), Is.False);
            Assert.That(ShieldGuardRules.IsGuarding(EnemyStateId.Guard, AttackPhase.None, false), Is.False, "dead");
            Assert.That(ShieldGuardRules.Covers(80f, ShieldGuardRules.TowerShieldAngle), Is.True);
            Assert.That(ShieldGuardRules.Covers(-95f, ShieldGuardRules.TowerShieldAngle), Is.False, "from the side");
            Assert.That(ShieldGuardRules.Covers(180f, ShieldGuardRules.TowerShieldAngle), Is.False, "from behind");
        }

        [Test]
        public void BossBarShowsUpdatesAndHidesTheShownBossOnly()
        {
            var bar = new BossBarService();
            var seen = new List<BossBarState>();
            bar.Changed += seen.Add;

            bar.Show(new BossBarState("boss.a", "Der Wachende Ritter", "Letzter Waechter", 1f, 1, 2, false));
            Assert.That(bar.Current.Visible, Is.True, "Show always makes it visible");

            bar.UpdateHealth("boss.a", 0.6f, 1);
            bar.UpdateHealth("boss.a", 0.6001f, 1);
            bar.UpdateHealth("boss.b", 0.1f, 2);
            Assert.That(bar.Current.HealthFraction, Is.EqualTo(0.6f).Within(0.001f));
            Assert.That(seen.Count, Is.EqualTo(2), "tiny changes and other bosses are ignored");

            bar.UpdateHealth("boss.a", 0.4f, 2);
            Assert.That(bar.Current.Phase, Is.EqualTo(2));

            bar.Hide("boss.b");
            Assert.That(bar.Current.Visible, Is.True);
            bar.Hide("boss.a");
            Assert.That(bar.Current.Visible, Is.False);
            bar.UpdateHealth("boss.a", 0.3f, 2);
            Assert.That(bar.Current.HealthFraction, Is.EqualTo(0.4f).Within(0.001f), "no updates while hidden");
        }

        [Test]
        public void BossBarStateClampsTheHealth()
        {
            var state = new BossBarState("boss.a", "A", "B", 1.5f, 1, 2, true);

            Assert.That(state.HealthFraction, Is.EqualTo(1f));
            Assert.That(state.With(-0.2f, 2).HealthFraction, Is.EqualTo(0f));
            Assert.That(state.Hidden().Visible, Is.False);
        }
    }
}
