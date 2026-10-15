using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// Boss brain parts for Grimmbart (GDD 02 11.6): special attacks per phase (war horn only in phase 1, crane in phase 2,
    /// fire pot in phase 3), a stolen horn, interrupting the horn call, faster attacks in phase 3, kneeling at 10 % with
    /// "Fesseln" for 5 s, getting up again, death while kneeling and the health floor that protects the kneeling.
    /// </summary>
    [TestFixture]
    public sealed class BossSpecialAndYieldTests
    {
        private BossBrain _brain;
        private readonly List<string> _specials = new List<string>();
        private int _yielded;
        private int _yieldEnded;
        private int _subdued;
        private int _deaths;

        [SetUp]
        public void SetUp()
        {
            _brain = new BossBrain(Settings(), new SequenceRandom(0.1f, 0.5f, 0.9f), null);
            _specials.Clear();
            _yielded = 0;
            _yieldEnded = 0;
            _subdued = 0;
            _deaths = 0;
            _brain.SpecialStarted += _specials.Add;
            _brain.Yielded += () => _yielded++;
            _brain.YieldEnded += () => _yieldEnded++;
            _brain.Subdued += () => _subdued++;
            _brain.Died += () => _deaths++;
        }

        [Test]
        public void BlowsTheHornFromAfarInPhaseOne()
        {
            Awaken();

            _brain.Tick(0.1f, Senses(20f, 1f));

            Assert.That(_brain.CurrentAttack, Is.Not.Null);
            Assert.That(_brain.CurrentAttack.Id, Is.EqualTo("horn"));
            Assert.That(_specials, Is.EqualTo(new[] { "horn" }));
        }

        [Test]
        public void AStolenHornIsNeverBlown()
        {
            Awaken();
            _brain.DisableSpecial("horn");

            _brain.Tick(0.1f, Senses(20f, 1f));

            Assert.That(_brain.CurrentAttack, Is.Null);
            Assert.That(_specials, Is.Empty);
            Assert.That(_brain.IsSpecialDisabled("horn"), Is.True);
        }

        [Test]
        public void InterruptingTheHornStaggersHim()
        {
            Awaken();
            _brain.Tick(0.1f, Senses(20f, 1f));

            bool interrupted = _brain.Interrupt(1.5f);

            Assert.That(interrupted, Is.True);
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Stunned));
            Assert.That(_brain.StunKind, Is.EqualTo(BossStunKind.Interrupted));
            Assert.That(_brain.CurrentAttack, Is.Null);
        }

        [Test]
        public void TheHornStopsAfterPhaseOneAndTheCraneStarts()
        {
            Awaken();
            EnterPhase(0.5f, 2);

            _brain.Tick(0.1f, Senses(20f, 0.5f));

            Assert.That(_brain.CurrentAttack, Is.Not.Null);
            Assert.That(_brain.CurrentAttack.Id, Is.EqualTo("crane"), "GDD 02 11.6: phase 2 \"Lasst fallen!\"");
            Assert.That(_specials, Is.EqualTo(new[] { "kran" }));
        }

        [Test]
        public void FasterAttacksEndSooner()
        {
            Awaken();
            _brain.AttackSpeed = 1.25f;
            _brain.Tick(0.05f, Senses(2f, 1f));
            Assert.That(_brain.CurrentAttack.Id, Is.EqualTo("hammer"));

            Run(1.35f, Senses(2f, 1f));

            Assert.That(_brain.CurrentAttack, Is.Null, "1.6 s hammer at ×1.25 takes 1.28 s");
        }

        [Test]
        public void NormalSpeedAttackIsStillRunning()
        {
            Awaken();
            _brain.Tick(0.05f, Senses(2f, 1f));

            Run(1.35f, Senses(2f, 1f));

            Assert.That(_brain.CurrentAttack, Is.Not.Null);
        }

        [Test]
        public void KneelsAtTenPercentInTheLastPhase()
        {
            Awaken();
            EnterPhase(0.25f, 3);
            Assert.That(_brain.HealthFloor(1000f), Is.EqualTo(99f), "a big hit stops just below 10 % until he kneels");

            _brain.Tick(0.1f, Senses(2f, 0.09f));

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Yielding));
            Assert.That(_brain.IsYielding, Is.True);
            Assert.That(_yielded, Is.EqualTo(1));
            Assert.That(_brain.IsInvulnerable, Is.False, "\"weiter angreifen = tot\"");
            Assert.That(_brain.HealthFloor(1000f), Is.EqualTo(0f));
            Assert.That(_brain.CurrentAttack, Is.Null);
        }

        [Test]
        public void BindingTheKneelingBossEndsTheFightAlive()
        {
            Awaken();
            EnterPhase(0.25f, 3);
            _brain.Tick(0.1f, Senses(2f, 0.09f));

            Assert.That(_brain.Bind(), Is.True);

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Subdued));
            Assert.That(_subdued, Is.EqualTo(1));
            Assert.That(_brain.IsEncounterRunning, Is.False);
            Assert.That(_brain.IsInvulnerable, Is.True);
            Assert.That(_brain.Bind(), Is.False);
        }

        [Test]
        public void CannotBeBoundWhileFighting()
        {
            Awaken();

            Assert.That(_brain.Bind(), Is.False);
            Assert.That(_subdued, Is.EqualTo(0));
        }

        [Test]
        public void GetsUpAfterFiveSecondsAndDoesNotKneelAgain()
        {
            Awaken();
            EnterPhase(0.25f, 3);
            _brain.Tick(0.1f, Senses(2f, 0.09f));

            Run(5.1f, Senses(2f, 0.09f));

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
            Assert.That(_yieldEnded, Is.EqualTo(1));
            Run(1f, Senses(2f, 0.05f));
            Assert.That(_yielded, Is.EqualTo(1), "only once");
        }

        [Test]
        public void KillingTheKneelingBossCountsAsDeath()
        {
            Awaken();
            EnterPhase(0.25f, 3);
            _brain.Tick(0.1f, Senses(2f, 0.09f));

            _brain.Kill();

            Assert.That(_brain.State, Is.EqualTo(BossStateId.Dead));
            Assert.That(_deaths, Is.EqualTo(1));
            Assert.That(_subdued, Is.EqualTo(0));
        }

        [Test]
        public void ResetForgetsTheKneelingButNotTheStolenHorn()
        {
            Awaken();
            _brain.DisableSpecial("horn");
            _brain.AttackSpeed = 1.25f;

            _brain.Reset();

            Assert.That(_brain.AttackSpeed, Is.EqualTo(1f));
            Assert.That(_brain.IsSpecialDisabled("horn"), Is.True);
        }

        [Test]
        public void YieldFractionMustBeBelowHalf()
        {
            BossBrainSettings settings = Settings();
            settings.YieldFraction = 0.6f;

            Assert.That(settings.Validate(), Is.Not.Empty);
        }

        private void Awaken()
        {
            _brain.Tick(0.1f, Senses(5f, 1f));
            Run(1.6f, Senses(30f, 1f, false));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
        }

        private void EnterPhase(float health, int phase)
        {
            _brain.Tick(0.1f, Senses(30f, health, false));
            Run(2.6f, Senses(30f, health, false));
            Assert.That(_brain.Phase, Is.EqualTo(phase));
            Assert.That(_brain.State, Is.EqualTo(BossStateId.Fighting));
            _specials.Clear();
        }

        private void Run(float seconds, BossSenses senses)
        {
            const float step = 0.05f;
            for (float t = 0f; t < seconds; t += step)
            {
                _brain.Tick(step, senses);
            }
        }

        private static BossSenses Senses(float distanceNorth, float health, bool hasTarget = true)
        {
            return new BossSenses
            {
                Self = new FlatPoint(0f, 0f),
                SelfYaw = 0f,
                HasTarget = hasTarget,
                Target = new FlatPoint(0f, distanceNorth),
                TargetInArena = true,
                HealthFraction = health
            };
        }

        private static BossBrainSettings Settings()
        {
            return new BossBrainSettings
            {
                Attacks = new[]
                {
                    Option(AttackSpec.Create("hammer", 0.8f, 0.2f, 0.6f), 0f, 2.6f, 2f, 1f, 1, 0, string.Empty),
                    Option(AttackSpec.Create("horn", 1.2f, 0.2f, 0.8f), 0f, 40f, 30f, 5f, 1, 1, "horn"),
                    Option(AttackSpec.Create("crane", 0.9f, 0.2f, 0.8f), 0f, 40f, 14f, 5f, 2, 2, "kran"),
                    Option(AttackSpec.Create("pot", 0.7f, 0.2f, 0.6f), 4f, 20f, 8f, 2f, 3, 0, "brandtopf")
                },
                PhaseThresholds = new[] { 1f, 0.6f, 0.3f },
                AddsPerPhase = new[] { 0, 0, 0 },
                AwakenSeconds = 1.5f,
                TransitionSeconds = 2.5f,
                RecoverSeconds = 0.8f,
                BeamFromPhase = 5,
                YieldFraction = 0.1f,
                YieldSeconds = 5f
            };
        }

        private static BossAttackOption Option(AttackSpec attack, float minRange, float maxRange, float cooldown, float weight, int minPhase,
            int maxPhase, string special)
        {
            return new BossAttackOption
            {
                Option = new EnemyAttackOption
                {
                    Attack = attack, MinRange = minRange, MaxRange = maxRange, MaxAngle = 25f, Cooldown = cooldown, Weight = weight
                },
                MinPhase = minPhase,
                MaxPhase = maxPhase > 0 ? maxPhase : int.MaxValue,
                Special = special
            };
        }
    }
}
