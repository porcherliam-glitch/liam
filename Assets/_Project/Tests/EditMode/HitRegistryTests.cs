using Aetherfall.Combat;
using Aetherfall.Events;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Hit registration of one swing: every target is hit at most once per swing (several hurtboxes, several frames), never
    /// the attacker itself and never a member of the same team; neutral targets (training dummy) can be hit by everyone.
    /// Several touched zones of one target: the zone nearest to the swing centre counts.
    /// </summary>
    [TestFixture]
    public sealed class HitRegistryTests
    {
        private readonly object _player = new object();
        private readonly object _wolf = new object();
        private readonly object _secondWolf = new object();
        private readonly object _dummy = new object();

        [Test]
        public void Target_IsRegisteredOncePerSwing()
        {
            var registry = new HitRegistry();
            registry.BeginSwing(_player, CombatTeam.Player);

            Assert.That(registry.TryRegister(_wolf, CombatTeam.Enemy), Is.True);
            Assert.That(registry.TryRegister(_wolf, CombatTeam.Enemy), Is.False, "Second hurtbox or next frame.");
            Assert.That(registry.HitCount, Is.EqualTo(1));
        }

        [Test]
        public void SeveralTargets_AreEachRegistered()
        {
            var registry = new HitRegistry();
            registry.BeginSwing(_player, CombatTeam.Player);

            Assert.That(registry.TryRegister(_wolf, CombatTeam.Enemy), Is.True);
            Assert.That(registry.TryRegister(_secondWolf, CombatTeam.Enemy), Is.True);
            Assert.That(registry.WasHit(_wolf), Is.True);
            Assert.That(registry.WasHit(_secondWolf), Is.True);
            Assert.That(registry.HitCount, Is.EqualTo(2));
        }

        [Test]
        public void NewSwing_CanHitTheSameTargetAgain()
        {
            var registry = new HitRegistry();
            registry.BeginSwing(_player, CombatTeam.Player);
            registry.TryRegister(_wolf, CombatTeam.Enemy);
            registry.EndSwing();

            registry.BeginSwing(_player, CombatTeam.Player);

            Assert.That(registry.WasHit(_wolf), Is.False);
            Assert.That(registry.TryRegister(_wolf, CombatTeam.Enemy), Is.True);
        }

        [Test]
        public void Attacker_NeverHitsItself()
        {
            var registry = new HitRegistry();
            registry.BeginSwing(_dummy, CombatTeam.Neutral);

            Assert.That(registry.TryRegister(_dummy, CombatTeam.Neutral), Is.False);
        }

        [Test]
        public void SameTeam_IsNotHit()
        {
            var registry = new HitRegistry();
            registry.BeginSwing(_wolf, CombatTeam.Enemy);

            Assert.That(registry.TryRegister(_secondWolf, CombatTeam.Enemy), Is.False);
            Assert.That(registry.TryRegister(_player, CombatTeam.Player), Is.True);
        }

        [Test]
        public void NeutralTarget_IsHitByEveryone()
        {
            var registry = new HitRegistry();
            registry.BeginSwing(_player, CombatTeam.Player);
            Assert.That(registry.TryRegister(_dummy, CombatTeam.Neutral), Is.True);

            registry.BeginSwing(_wolf, CombatTeam.Enemy);
            Assert.That(registry.TryRegister(_dummy, CombatTeam.Neutral), Is.True);
        }

        [Test]
        public void ClosedSwing_RegistersNothing()
        {
            var registry = new HitRegistry();

            Assert.That(registry.TryRegister(_wolf, CombatTeam.Enemy), Is.False);

            registry.BeginSwing(_player, CombatTeam.Player);
            registry.EndSwing();
            Assert.That(registry.IsOpen, Is.False);
            Assert.That(registry.TryRegister(_wolf, CombatTeam.Enemy), Is.False);
        }

        [Test]
        public void Null_IsIgnored()
        {
            var registry = new HitRegistry();
            registry.BeginSwing(_player, CombatTeam.Player);

            Assert.That(registry.TryRegister(null, CombatTeam.Enemy), Is.False);
        }

        [Test]
        public void Capacity_LimitsTheTargetsPerSwing()
        {
            var registry = new HitRegistry(2);
            registry.BeginSwing(_player, CombatTeam.Player);

            registry.TryRegister(_wolf, CombatTeam.Enemy);
            registry.TryRegister(_secondWolf, CombatTeam.Enemy);

            Assert.That(registry.TryRegister(_dummy, CombatTeam.Neutral), Is.False);
        }

        [Test]
        public void ZoneChoice_NearestToTheSwingCentreWins()
        {
            Assert.That(Hurtbox.IsBetterZone(0.4f, HitZone.Body, 0.9f, HitZone.Head), Is.True, "Body much nearer than the head.");
            Assert.That(Hurtbox.IsBetterZone(0.9f, HitZone.Head, 0.4f, HitZone.Body), Is.False);
            Assert.That(Hurtbox.IsBetterZone(0.42f, HitZone.WeakPoint, 0.4f, HitZone.Body), Is.True, "About the same distance: priority.");
            Assert.That(Hurtbox.IsBetterZone(0.4f, HitZone.Body, 0.42f, HitZone.WeakPoint), Is.False);
            Assert.That(Hurtbox.PriorityOf(HitZone.WeakPoint), Is.GreaterThan(Hurtbox.PriorityOf(HitZone.Head)));
            Assert.That(Hurtbox.PriorityOf(HitZone.Head), Is.GreaterThan(Hurtbox.PriorityOf(HitZone.Body)));
            Assert.That(Hurtbox.PriorityOf(HitZone.Body), Is.GreaterThan(Hurtbox.PriorityOf(HitZone.Limb)));
        }

        [Test]
        public void Teams_DamageRules()
        {
            Assert.That(CombatTeams.CanDamage(CombatTeam.Player, CombatTeam.Enemy), Is.True);
            Assert.That(CombatTeams.CanDamage(CombatTeam.Enemy, CombatTeam.Player), Is.True);
            Assert.That(CombatTeams.CanDamage(CombatTeam.Enemy, CombatTeam.Enemy), Is.False);
            Assert.That(CombatTeams.CanDamage(CombatTeam.Player, CombatTeam.Player), Is.False);
            Assert.That(CombatTeams.CanDamage(CombatTeam.Player, CombatTeam.Neutral), Is.True);
            Assert.That(CombatTeams.IsHostileOrNeutral(CombatTeam.Player, CombatTeam.Neutral), Is.True);
            Assert.That(CombatTeams.IsHostileOrNeutral(CombatTeam.Player, CombatTeam.Player), Is.False);
            Assert.That(CombatTeams.IsHostileOrNeutral(CombatTeam.Neutral, CombatTeam.Enemy), Is.False);
        }
    }
}
