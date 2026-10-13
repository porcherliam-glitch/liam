using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Combat service: publishes <see cref="DamageDealt"/> (payload as in architecture 4.3) and
    /// <see cref="CombatStateChanged"/> through the event bus; finisher protection runs out after its time.
    /// </summary>
    [TestFixture]
    public sealed class CombatServiceTests
    {
        private EventBus _bus;
        private CombatService _service;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _service = new CombatService(_bus, null, new SequenceRandom(0.5f));
        }

        [TearDown]
        public void TearDown()
        {
            _service.Dispose();
        }

        [Test]
        public void Hit_PublishesDamageDealtWithPayload()
        {
            using (var recorder = new EventRecorder<DamageDealt>(_bus))
            {
                _service.ReportHitValues("player", CombatTeam.Player, "wolf_1", CombatTeam.Enemy, 48, true, DamageType.Slash, true, HitZone.Head,
                    DefenseOutcome.Hit);

                Assert.That(recorder.Count, Is.EqualTo(1));
                DamageDealt evt = recorder.Last;
                Assert.That(evt.AttackerId, Is.EqualTo("player"));
                Assert.That(evt.TargetId, Is.EqualTo("wolf_1"));
                Assert.That(evt.Amount, Is.EqualTo(48));
                Assert.That(evt.DamageType, Is.EqualTo(DamageType.Slash));
                Assert.That(evt.IsCritical, Is.True);
                Assert.That(evt.Zone, Is.EqualTo(HitZone.Head));
            }
        }

        [Test]
        public void HitWithoutDamage_PublishesNoDamageDealt()
        {
            using (var recorder = new EventRecorder<DamageDealt>(_bus))
            {
                _service.ReportHitValues("wolf_1", CombatTeam.Enemy, "player", CombatTeam.Player, 0, false, DamageType.Stab, false, HitZone.Body,
                    DefenseOutcome.Parried);

                Assert.That(recorder.Count, Is.EqualTo(0));
            }
        }

        [Test]
        public void DamageExchangeWithPlayer_StartsCombatAndEndsAfterFiveSeconds()
        {
            using (var recorder = new EventRecorder<CombatStateChanged>(_bus))
            {
                _service.ReportHitValues("player", CombatTeam.Player, "wolf_1", CombatTeam.Enemy, 20, true, DamageType.Slash, false, HitZone.Body,
                    DefenseOutcome.Hit);
                Assert.That(_service.InCombat, Is.True);
                Assert.That(recorder.Count, Is.EqualTo(1));
                Assert.That(recorder.Last.InCombat, Is.True);

                _service.Tick(5.1f);

                Assert.That(_service.InCombat, Is.False);
                Assert.That(recorder.Count, Is.EqualTo(2));
                Assert.That(recorder.Last.InCombat, Is.False);
            }
        }

        [Test]
        public void HittingTheTrainingDummy_IsNoCombat()
        {
            _service.ReportHitValues("player", CombatTeam.Player, "dummy", CombatTeam.Neutral, 20, true, DamageType.Slash, false, HitZone.Body,
                DefenseOutcome.Hit);

            Assert.That(_service.InCombat, Is.False);
        }

        [Test]
        public void Engagement_KeepsCombatUntilReleased()
        {
            object wolf = new object();
            _service.ReportEngagement(wolf, true);
            _service.Tick(30f);
            Assert.That(_service.InCombat, Is.True);

            _service.ReportEngagement(wolf, false);
            Assert.That(_service.InCombat, Is.False);
        }

        [Test]
        public void ResetCombatState_EndsCombat()
        {
            _service.ReportEngagement(new object(), true);

            _service.ResetCombatState();

            Assert.That(_service.InCombat, Is.False);
        }

        [Test]
        public void DisposedService_PublishesNoMoreStateChanges()
        {
            using (var recorder = new EventRecorder<CombatStateChanged>(_bus))
            {
                _service.Dispose();
                _service.ReportEngagement(new object(), true);

                Assert.That(recorder.Count, Is.EqualTo(0));
            }
        }

        [Test]
        public void NullEventBus_Throws()
        {
            Assert.That(() => new CombatService(null), Throws.ArgumentNullException);
        }
    }
}
