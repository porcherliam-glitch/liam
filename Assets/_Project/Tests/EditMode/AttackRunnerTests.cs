using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Data-driven attack timing without animations: the runner opens the hit window at the start of the active phase and
    /// closes it at its end (same calls as later animation events), exactly once per attack, even across long frames.
    /// </summary>
    [TestFixture]
    public sealed class AttackRunnerTests
    {
        private static AttackSpec CreateAttack()
        {
            return AttackSpec.Create("test", 0.2f, 0.1f, 0.3f);
        }

        [Test]
        public void Phases_FollowTheTimeWindows()
        {
            AttackSpec attack = CreateAttack();

            Assert.That(attack.PhaseAt(0f), Is.EqualTo(AttackPhase.Windup));
            Assert.That(attack.PhaseAt(0.19f), Is.EqualTo(AttackPhase.Windup));
            Assert.That(attack.PhaseAt(0.2f), Is.EqualTo(AttackPhase.Active));
            Assert.That(attack.PhaseAt(0.29f), Is.EqualTo(AttackPhase.Active));
            Assert.That(attack.PhaseAt(0.3f), Is.EqualTo(AttackPhase.Recovery));
            Assert.That(attack.PhaseAt(0.6f), Is.EqualTo(AttackPhase.None));
            Assert.That(attack.TotalSeconds, Is.EqualTo(0.6f).Within(1e-6f));
        }

        [Test]
        public void HitWindow_OpensInActivePhaseAndClosesAfterIt()
        {
            var window = new RecordingHitWindow();
            var runner = new AttackRunner(window);
            AttackSpec attack = CreateAttack();

            runner.Start(attack);
            runner.Tick(0.1f);
            Assert.That(window.Opened, Is.Empty);

            runner.Tick(0.15f);
            Assert.That(window.Opened.Count, Is.EqualTo(1));
            Assert.That(window.Opened[0], Is.SameAs(attack));
            Assert.That(window.IsOpen, Is.True);
            Assert.That(runner.IsHitWindowOpen, Is.True);

            runner.Tick(0.1f);
            Assert.That(window.IsOpen, Is.False);
            Assert.That(window.CloseCount, Is.EqualTo(1));
        }

        [Test]
        public void LongFrame_StillOpensTheWindowOnce()
        {
            var window = new RecordingHitWindow();
            var runner = new AttackRunner(window);
            runner.Start(CreateAttack());

            runner.Tick(0.4f);

            Assert.That(window.Opened.Count, Is.EqualTo(1), "A frame jumping over the active phase gives the hitbox one query.");
            Assert.That(window.IsOpen, Is.False);
            Assert.That(window.CloseCount, Is.EqualTo(1));
        }

        [Test]
        public void Finish_RaisesEventAndStops()
        {
            var runner = new AttackRunner();
            AttackSpec attack = CreateAttack();
            AttackSpec finished = null;
            runner.Finished += spec => finished = spec;

            runner.Start(attack);
            Assert.That(runner.Tick(0.5f), Is.True);
            Assert.That(runner.Tick(0.2f), Is.False);

            Assert.That(finished, Is.SameAs(attack));
            Assert.That(runner.IsRunning, Is.False);
            Assert.That(runner.Phase, Is.EqualTo(AttackPhase.None));
        }

        [Test]
        public void Cancel_ClosesOpenWindowWithoutFinishedEvent()
        {
            var window = new RecordingHitWindow();
            var runner = new AttackRunner(window);
            bool finished = false;
            runner.Finished += spec => finished = true;
            runner.Start(CreateAttack());
            runner.Tick(0.25f);

            runner.Cancel();

            Assert.That(window.IsOpen, Is.False);
            Assert.That(finished, Is.False);
            Assert.That(runner.IsRunning, Is.False);
        }

        [Test]
        public void Progress_GoesFromZeroToOne()
        {
            var runner = new AttackRunner();
            runner.Start(CreateAttack());

            runner.Tick(0.3f);

            Assert.That(runner.Progress, Is.EqualTo(0.5f).Within(1e-5f));
            Assert.That(runner.Elapsed, Is.EqualTo(0.3f).Within(1e-6f));
        }

        [Test]
        public void ZeroWindup_OpensWindowOnStart()
        {
            var window = new RecordingHitWindow();
            var runner = new AttackRunner(window);

            runner.Start(AttackSpec.Create("sofort", 0f, 0.1f, 0.1f));

            Assert.That(window.IsOpen, Is.True);
        }

        [Test]
        public void CancelRules_HeavyOnlyInRecovery()
        {
            AttackSpec light = CreateAttack();
            AttackSpec heavy = CreateAttack();
            heavy.CancelOnlyInRecovery = true;

            Assert.That(light.CanCancelAt(0.1f), Is.True, "Light attacks can be cancelled in the wind-up.");
            Assert.That(light.CanCancelAt(0.25f), Is.False, "Never during the active phase.");
            Assert.That(heavy.CanCancelAt(0.1f), Is.False);
            Assert.That(heavy.CanCancelAt(0.35f), Is.True);
        }

        [Test]
        public void Lunge_CoversHalfWindupToActiveEnd()
        {
            AttackSpec attack = CreateAttack();
            attack.LungeDistance = 2f;

            Assert.That(attack.LungeStartSeconds, Is.EqualTo(0.1f).Within(1e-6f));
            Assert.That(attack.LungeEndSeconds, Is.EqualTo(0.3f).Within(1e-6f));
            Assert.That(attack.LungeSpeed, Is.EqualTo(10f).Within(1e-4f));
        }

        [Test]
        public void Validate_RejectsZeroActiveTime()
        {
            AttackSpec broken = CreateAttack();
            broken.ActiveSeconds = 0f;

            Assert.That(broken.Validate(), Is.Not.Empty);
            Assert.That(CreateAttack().Validate(), Is.Empty);
            Assert.That(AttackSpec.Create("leer", 0.1f, 0f, 0.1f).ActiveSeconds, Is.GreaterThan(0f), "Create clamps to a minimum.");
        }
    }
}
