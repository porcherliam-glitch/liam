using System;
using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// Decisions of the mini boss "Der Wachende Ritter" (GDD 02 11.7, GDD 03 9.6): encounter start in the arena, invulnerable
    /// rising and phase change, tower-shield guard, telegraphed attacks per phase, adds in phase 2, Aether-beam stun with
    /// cooldown, parry opening, death exactly once, reset after the player's death.
    /// </summary>
    [TestFixture]
    public sealed class BossBrainTests
    {
        private BossBrain _brain;
        private int _encounters;
        private int _deaths;
        private readonly List<int> _phases = new List<int>();
        private readonly List<int> _summons = new List<int>();

        [SetUp]
        public void SetUp()
        {
            _brain = new BossBrain(Settings(), new SequenceRandom(0.1f, 0.5f, 0.9f), null);
            _encounters = 0;
            _deaths = 0;
            _phases.Clear();
            _summons.Clear();
            _brain.EncounterStarted += () => _encounters++;
            _brain.Died += () => _deaths++;
            _brain.PhaseChanged += _phases.Add;
            _brain.SummonRequested += _summons.Add;
        }

        [Test]
        public void WaitsUntilThePlayerEntersTheArena()
        {
            _brain.Tick(0.1f, Senses(5f, false, 1f));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Dormant));
            Assert.That(_brain.IsInvulnerable, Is.True);

            _brain.Tick(0.1f, Senses(5f, true, 1f));

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Awakening));
            Assert.That(_brain.IsEncounterRunning, Is.True);
            Assert.That(_encounters, Is.EqualTo(1));
            Assert.That(_phases, Is.EqualTo(new[] { 1 }), "the health bar starts in phase 1");
        }

        [Test]
        public void RisesInvulnerableThenFightsBehindTheShield()
        {
            Awaken();

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
            Assert.That(_brain.IsInvulnerable, Is.False);
            Assert.That(_brain.IsGuardUp, Is.True, "GDD 02 11.7: frontal 100 % block");
        }

        [Test]
        public void ApproachesAFarTargetRunningAndANearOneWalking()
        {
            Awaken();

            _brain.Tick(0.1f, Senses(12f, true, 1f));
            Assert.That(_brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Run));

            _brain.Tick(0.1f, Senses(5f, true, 1f));
            Assert.That(_brain.Intent.Mode, Is.EqualTo(EnemyMoveMode.Walk));
            Assert.That(_brain.CurrentAttack, Is.Null);
        }

        [Test]
        public void TelegraphsTheShieldBashAndKeepsTheGuardUp()
        {
            Awaken();

            _brain.Tick(0.1f, Senses(2f, true, 1f));

            Assert.That(_brain.CurrentAttack, Is.Not.Null);
            Assert.That(_brain.CurrentAttack.Id, Is.EqualTo("bash"));
            _brain.Tick(0.1f, Senses(2f, true, 1f));
            Assert.That(_brain.IsTelegraphing, Is.True, "0.8 s wind-up = the shield pulls back");
            Assert.That(_brain.IsGuardUp, Is.True);
        }

        [Test]
        public void FinishedAttackGoesIntoCooldownAndRecovery()
        {
            Awaken();
            _brain.Tick(0.1f, Senses(2f, true, 1f));
            Assert.That(_brain.CurrentAttack, Is.Not.Null);

            Run(1.8f, Senses(2f, true, 1f));

            Assert.That(_brain.CurrentAttack, Is.Null, "1.65 s attack, then 0.8 s recovery behind the shield");
            Assert.That(_brain.IsGuardUp, Is.True);
        }

        [Test]
        public void HalfHealthStartsPhaseTwoWithTwoAdds()
        {
            Awaken();

            _brain.Tick(0.1f, Senses(5f, true, 0.49f));

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Transition));
            Assert.That(_brain.Phase, Is.EqualTo(2));
            Assert.That(_brain.IsInvulnerable, Is.True, "GDD 03 9.6: phase change invulnerable");
            Assert.That(_phases, Is.EqualTo(new[] { 1, 2 }));
            Assert.That(_summons, Is.EqualTo(new[] { 2 }));

            Run(2.6f, Senses(5f, true, 0.49f));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting), "at most 3 s");
            Assert.That(_summons.Count, Is.EqualTo(1), "summoned once");
        }

        [Test]
        public void ChargeIsUsedOnlyInPhaseTwoAndLowersTheShield()
        {
            Awaken();
            _brain.Tick(0.1f, Senses(6f, true, 1f));
            Assert.That(_brain.CurrentAttack, Is.Null, "phase 1: no charge from 6 m");

            _brain.Tick(0.1f, Senses(6f, true, 0.4f));
            Run(2.6f, Senses(6f, true, 0.4f));
            Run(0.2f, Senses(6f, true, 0.4f));

            Assert.That(_brain.CurrentAttack, Is.Not.Null);
            Assert.That(_brain.CurrentAttack.Id, Is.EqualTo("charge"));
            Assert.That(_brain.CurrentAttack.Unblockable, Is.True);
            Assert.That(_brain.IsGuardUp, Is.False, "an opening for the player");
        }

        [Test]
        public void BeamStunsOnlyFromPhaseTwoAndHasACooldown()
        {
            Awaken();
            Assert.That(_brain.TryBeamStun(), Is.False, "phase 1");

            EnterPhaseTwo();
            Assert.That(_brain.TryBeamStun(), Is.True);
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Stunned));
            Assert.That(_brain.StunKind, Is.EqualTo(BossStunKind.Beam));
            Assert.That(_brain.StunRemaining, Is.EqualTo(5f).Within(0.001f), "GDD 02 11.7: 5 s");
            Assert.That(_brain.IsGuardUp, Is.False);

            Run(5.1f, Senses(5f, true, 0.4f));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
            Assert.That(_brain.TryBeamStun(), Is.False, "cooldown");

            Run(8.1f, Senses(30f, true, 0.4f));
            Assert.That(_brain.TryBeamStun(), Is.True);
        }

        [Test]
        public void ParriedBashOpensTheGuardForAMoment()
        {
            Awaken();

            Assert.That(_brain.NotifyParried(), Is.True);
            Assert.That(_brain.StunKind, Is.EqualTo(BossStunKind.Parried));
            Assert.That(_brain.IsGuardUp, Is.False);

            Run(1.6f, Senses(5f, true, 1f));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
            Assert.That(_brain.IsGuardUp, Is.True);
        }

        [Test]
        public void BrokenPoiseStunsButNotWhileInvulnerable()
        {
            Assert.That(_brain.NotifyPoiseBroken(4f), Is.False, "dormant");
            Awaken();

            Assert.That(_brain.NotifyPoiseBroken(4f), Is.True);
            Assert.That(_brain.StunKind, Is.EqualTo(BossStunKind.PoiseBreak));
            Assert.That(_brain.NotifyParried(), Is.False, "a shorter opening does not cut a longer stun");
        }

        [Test]
        public void DiesExactlyOnce()
        {
            Awaken();

            _brain.Kill();
            _brain.Kill();

            Assert.That(_deaths, Is.EqualTo(1));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Dead));
            Assert.That(_brain.IsEncounterRunning, Is.False);
            Assert.That(_brain.TryBeamStun(), Is.False);
            _brain.Tick(1f, Senses(1f, true, 0f));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Dead));
        }

        [Test]
        public void ResetAfterThePlayersDeathStartsOver()
        {
            Awaken();
            EnterPhaseTwo();

            _brain.Reset();

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Dormant));
            Assert.That(_brain.Phase, Is.EqualTo(1));
            Assert.That(_brain.BeamCooldownRemaining, Is.EqualTo(0f));
            _brain.Tick(0.1f, Senses(5f, true, 1f));
            Assert.That(_encounters, Is.EqualTo(2), "the next attempt starts a new encounter");
        }

        [Test]
        public void SettingsAreValidated()
        {
            BossBrainSettings slowTransition = Settings();
            slowTransition.TransitionSeconds = 4f;
            Assert.That(slowTransition.Validate(), Is.Not.Empty, "GDD 03 9.6: at most 3 s");

            BossBrainSettings noStarter = Settings();
            noStarter.Attacks = new[] { noStarter.Attacks[2] };
            Assert.That(noStarter.Validate(), Is.Not.Empty, "phase 1 needs an attack");

            BossBrainSettings badPhases = Settings();
            badPhases.PhaseThresholds = new[] { 0.9f, 0.5f };
            Assert.That(badPhases.Validate(), Is.Not.Empty);
            Assert.Throws<ArgumentException>(() => new BossBrain(badPhases, new SequenceRandom(0.5f), null));
            Assert.That(Settings().Validate(), Is.Empty);
        }

        [Test]
        public void PhaseTrackerOnlyGoesUpAndCanSkip()
        {
            var tracker = new BossPhaseTracker(new[] { 1f, 0.66f, 0.33f });

            Assert.That(tracker.PhaseFor(1f), Is.EqualTo(1));
            Assert.That(tracker.PhaseFor(0.5f), Is.EqualTo(2));
            Assert.That(tracker.TryAdvance(0.2f, out int skipped), Is.True);
            Assert.That(skipped, Is.EqualTo(3), "a big hit skips phase 2");
            Assert.That(tracker.TryAdvance(0.9f, out int same), Is.False, "healing does not go back");
            Assert.That(same, Is.EqualTo(3));
            tracker.Reset();
            Assert.That(tracker.Phase, Is.EqualTo(1));
        }

        private void Awaken()
        {
            _brain.Tick(0.1f, Senses(5f, true, 1f));
            Run(1.6f, Senses(30f, true, 1f));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
        }

        private void EnterPhaseTwo()
        {
            _brain.Tick(0.1f, Senses(30f, true, 0.4f));
            Run(2.6f, Senses(30f, true, 0.4f));
            Assert.That(_brain.Phase, Is.EqualTo(2));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
        }

        private void Run(float seconds, BossSenses senses)
        {
            const float step = 0.05f;
            for (float t = 0f; t < seconds; t += step)
            {
                _brain.Tick(step, senses);
            }
        }

        private static BossSenses Senses(float distanceNorth, bool inArena, float health)
        {
            return new BossSenses
            {
                Self = new FlatPoint(0f, 0f),
                SelfYaw = 0f,
                HasTarget = true,
                Target = new FlatPoint(0f, distanceNorth),
                TargetInArena = inArena,
                HealthFraction = health
            };
        }

        private static BossBrainSettings Settings()
        {
            AttackSpec charge = AttackSpec.Create("charge", 0.9f, 0.35f, 1.2f);
            charge.Unblockable = true;
            charge.LungeDistance = 6f;
            return new BossBrainSettings
            {
                Attacks = new[]
                {
                    Option(AttackSpec.Create("bash", 0.8f, 0.15f, 0.7f), 0f, 2.4f, 2.5f, 3f, 1, false),
                    Option(AttackSpec.Create("sword", 0.6f, 0.18f, 0.8f), 0f, 2.8f, 2f, 2f, 1, false),
                    Option(charge, 4f, 9f, 7f, 2f, 2, true)
                },
                PhaseThresholds = new[] { 1f, 0.5f },
                AddsPerPhase = new[] { 0, 2 },
                AwakenSeconds = 1.5f,
                TransitionSeconds = 2.5f,
                ParryOpenSeconds = 1.5f,
                BeamStunSeconds = 5f,
                BeamCooldownSeconds = 8f,
                BeamFromPhase = 2,
                RecoverSeconds = 0.8f
            };
        }

        private static BossAttackOption Option(AttackSpec attack, float minRange, float maxRange, float cooldown, float weight, int minPhase,
            bool dropsGuard)
        {
            return new BossAttackOption
            {
                Option = new EnemyAttackOption
                {
                    Attack = attack, MinRange = minRange, MaxRange = maxRange, MaxAngle = 25f, Cooldown = cooldown, Weight = weight
                },
                MinPhase = minPhase,
                DropsGuard = dropsGuard
            };
        }
    }
}
