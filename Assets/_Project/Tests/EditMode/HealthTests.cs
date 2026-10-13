using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="Health"/> (architecture 11.4): damage, healing, death exactly once, invulnerability, regeneration,
    /// silent restore for loading, maximum from stats.
    /// </summary>
    [TestFixture]
    public sealed class HealthTests
    {
        private readonly List<DamageTaken> _damaged = new List<DamageTaken>();
        private readonly List<DamageInfo> _died = new List<DamageInfo>();
        private readonly List<float> _healed = new List<float>();
        private int _revived;

        private Health Create(float max = 100f, bool regenerate = false)
        {
            var health = new Health(max, regenerate ? ResourcePoolSettings.Health : ResourcePoolSettings.None, "test");
            health.Damaged += taken => _damaged.Add(taken);
            health.Died += info => _died.Add(info);
            health.Healed += amount => _healed.Add(amount);
            health.Revived += () => _revived++;
            return health;
        }

        [SetUp]
        public void SetUp()
        {
            _damaged.Clear();
            _died.Clear();
            _healed.Clear();
            _revived = 0;
        }

        [Test]
        public void Damage_ReducesHealth_AndRaisesDamagedWithBeforeAndAfter()
        {
            Health health = Create();

            DamageOutcome outcome = health.ApplyDamage(new DamageInfo(30f, "enemy.wolf", DamageType.Stab, HitFlags.Critical));

            Assert.That(outcome.WasApplied, Is.True);
            Assert.That(outcome.Applied, Is.EqualTo(30f));
            Assert.That(health.Current, Is.EqualTo(70f));
            Assert.That(_damaged.Count, Is.EqualTo(1));
            Assert.That(_damaged[0].HealthBefore, Is.EqualTo(100f));
            Assert.That(_damaged[0].HealthAfter, Is.EqualTo(70f));
            Assert.That(_damaged[0].Damage.SourceId, Is.EqualTo("enemy.wolf"));
            Assert.That(_damaged[0].Damage.Flags, Is.EqualTo(HitFlags.Critical));
        }

        [Test]
        public void Death_HappensExactlyOnce()
        {
            Health health = Create();

            DamageOutcome first = health.ApplyDamage(new DamageInfo(150f, "a"));
            DamageOutcome second = health.ApplyDamage(new DamageInfo(10f, "b"));

            Assert.That(first.Killed, Is.True);
            Assert.That(first.Applied, Is.EqualTo(100f), "only the remaining health counts");
            Assert.That(health.IsDead, Is.True);
            Assert.That(health.IsAlive, Is.False);
            Assert.That(health.Current, Is.EqualTo(0f));
            Assert.That(second.IgnoredReason, Is.EqualTo(DamageIgnoredReason.Dead));
            Assert.That(_died.Count, Is.EqualTo(1));
            Assert.That(_died[0].SourceId, Is.EqualTo("a"));
            Assert.That(_damaged.Count, Is.EqualTo(1));
            Assert.That(health.Kill("c"), Is.False);
            Assert.That(_died.Count, Is.EqualTo(1));
        }

        [Test]
        public void DamagedHandlerThatHeals_PreventsTheDeath()
        {
            // Later "cheat death" effects (last stand, oath shield) heal from the Damaged event at 0 health.
            Health health = Create();
            health.Damaged += taken =>
            {
                if (!(taken.HealthAfter > 0f))
                {
                    health.Heal(50f);
                }
            };

            DamageOutcome outcome = health.ApplyDamage(new DamageInfo(150f, "boss"));

            Assert.That(outcome.Killed, Is.False);
            Assert.That(outcome.HealthAfter, Is.EqualTo(50f));
            Assert.That(health.IsDead, Is.False);
            Assert.That(health.Current, Is.EqualTo(50f));
            Assert.That(_died, Is.Empty);
            Assert.That(_damaged[0].HealthAfter, Is.EqualTo(0f), "the event still reports the hit itself");
        }

        [Test]
        public void Invulnerability_BySourceAndByTime()
        {
            Health health = Create();
            health.AddInvulnerability("iframes");
            health.AddInvulnerability("cutscene");

            Assert.That(health.ApplyDamage(new DamageInfo(10f, "x")).IgnoredReason, Is.EqualTo(DamageIgnoredReason.Invulnerable));
            health.RemoveInvulnerability("iframes");
            Assert.That(health.IsInvulnerable, Is.True, "one source left");
            health.RemoveInvulnerability("cutscene");
            Assert.That(health.IsInvulnerable, Is.False);

            health.SetInvulnerableFor(0.3f);
            health.Tick(0.2f);
            Assert.That(health.ApplyDamage(new DamageInfo(10f, "x")).WasApplied, Is.False, "inside the i-frame window");
            health.Tick(0.15f);
            Assert.That(health.ApplyDamage(new DamageInfo(10f, "x")).WasApplied, Is.True, "after the window");
            Assert.That(health.Current, Is.EqualTo(90f));
        }

        [Test]
        public void Kill_IgnoresInvulnerability()
        {
            Health health = Create();
            health.AddInvulnerability("god");

            Assert.That(health.Kill("env.fall"), Is.True);
            Assert.That(health.IsDead, Is.True);
            Assert.That(_died.Count, Is.EqualTo(1));
            Assert.That(_died[0].SourceId, Is.EqualTo("env.fall"));
        }

        [Test]
        public void ZeroDamage_IsIgnored()
        {
            Health health = Create();
            Assert.That(health.ApplyDamage(new DamageInfo(0f, "parry")).IgnoredReason, Is.EqualTo(DamageIgnoredReason.NoDamage));
            Assert.That(_damaged, Is.Empty);
        }

        [Test]
        public void Heal_ClampsAtMaximum_AndDoesNothingWhenDead()
        {
            Health health = Create();
            health.ApplyDamage(new DamageInfo(30f, "x"));

            Assert.That(health.Heal(50f), Is.EqualTo(30f));
            Assert.That(health.Current, Is.EqualTo(100f));
            Assert.That(_healed, Is.EqualTo(new[] { 30f }));
            Assert.That(health.Heal(10f), Is.EqualTo(0f), "already full");

            health.Kill("x");
            Assert.That(health.Heal(50f), Is.EqualTo(0f));
            Assert.That(health.IsDead, Is.True);
        }

        [Test]
        public void Revive_BringsBackADeadTarget()
        {
            Health health = Create();
            Assert.That(health.Revive(), Is.False, "alive");
            health.Kill("x");

            Assert.That(health.Revive(0.5f), Is.True);
            Assert.That(health.IsAlive, Is.True);
            Assert.That(health.Current, Is.EqualTo(50f));
            Assert.That(_revived, Is.EqualTo(1));

            health.ApplyDamage(new DamageInfo(60f, "again"));
            Assert.That(_died.Count, Is.EqualTo(2), "can die again after a revive");
        }

        [Test]
        public void RestoreState_SetsHealthWithoutEvents()
        {
            Health health = Create();

            health.RestoreState(40f);
            Assert.That(health.Current, Is.EqualTo(40f));
            health.RestoreState(0f);
            Assert.That(health.IsDead, Is.True);
            health.RestoreState(500f);
            Assert.That(health.Current, Is.EqualTo(100f), "clamped");
            Assert.That(health.IsAlive, Is.True);

            Assert.That(_damaged, Is.Empty);
            Assert.That(_died, Is.Empty);
            Assert.That(_healed, Is.Empty);
        }

        [Test]
        public void Regeneration_OutsideOfCombatAfter8Seconds_NoneInCombat_NoneWhenDead()
        {
            Health health = Create(200f, regenerate: true);
            health.ApplyDamage(new DamageInfo(100f, "x"));

            for (int i = 0; i < 100; i++)
            {
                health.Tick(0.1f); // 10 s: 8 s delay + 2 s at 2 per second
            }

            Assert.That(health.Current, Is.EqualTo(104f).Within(0.05f));

            health.InCombat = true;
            for (int i = 0; i < 50; i++)
            {
                health.Tick(0.1f);
            }

            Assert.That(health.Current, Is.EqualTo(104f).Within(0.05f), "no regeneration in combat");
            health.InCombat = false;
            health.Kill("x");
            for (int i = 0; i < 100; i++)
            {
                health.Tick(0.1f);
            }

            Assert.That(health.Current, Is.EqualTo(0f), "the dead do not regenerate");
        }

        [Test]
        public void MaxHealth_FollowsTheStats()
        {
            var stats = new StatCollection();
            stats.SetBase(StatId.Constitution, 15f);
            stats.SetBase(StatId.Level, 1f);
            var health = new Health(new ResourcePool(stats, StatId.MaxHealth, ResourcePoolSettings.Health), "player");

            Assert.That(health.Max, Is.EqualTo(175f), "warrior level 1 (GDD 03 10.3)");
            Assert.That(health.Current, Is.EqualTo(175f));

            stats.AddModifier(StatModifier.Flat(StatId.MaxHealth, 25f, StatSourceIds.Item("helm")));
            Assert.That(health.Max, Is.EqualTo(200f));
        }

        [Test]
        public void FromResult_TakesDamageFlagsAndPrimaryType()
        {
            var result = new DamageResult(42, 41.6f, 12f, StatusBuildup.None, HitFlags.Critical | HitFlags.Head, 0f);
            DamagePacket packet = DamagePacket.Single(DamageType.Slash, 10f).With(DamageType.Fire, 30f);

            DamageInfo info = DamageInfo.FromResult(result, packet, "player");

            Assert.That(info.Amount, Is.EqualTo(42f));
            Assert.That(info.Type, Is.EqualTo(DamageType.Fire));
            Assert.That(info.PoiseDamage, Is.EqualTo(12f));
            Assert.That(info.Flags, Is.EqualTo(HitFlags.Critical | HitFlags.Head));
        }
    }
}
