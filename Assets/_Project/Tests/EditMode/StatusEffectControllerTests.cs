using System.Collections.Generic;
using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Status effects of GDD 03 7: thresholds, decay, burning, stun immunity, bosses, wet and oily, the corruption bar.</summary>
    public sealed class StatusEffectControllerTests
    {
        private const float MaxHealth = 100f;

        [Test]
        public void Threshold_Is100TimesOnePlusResistance()
        {
            var normal = new StatusEffectController(StatusSettings.Enemy);
            Assert.That(normal.Threshold(StatusEffectId.Burning), Is.EqualTo(100f).Within(0.001f));

            var elite = new StatusEffectController(StatusSettings.Elite);
            Assert.That(elite.Threshold(StatusEffectId.Burning), Is.EqualTo(150f).Within(0.001f));

            var player = new StatusEffectController(StatusSettings.Player) { ExternalResistance = 15f };
            Assert.That(player.Threshold(StatusEffectId.Poison), Is.EqualTo(115f).Within(0.001f), "GDD 03 7.1: Weisheit 20 → Res 15 → Schwelle 115");
        }

        [Test]
        public void Add_TriggersAtTheThreshold_AndEmptiesTheBar()
        {
            var status = new StatusEffectController(StatusSettings.Enemy);
            var triggered = new List<StatusEffectId>();
            status.Triggered += triggered.Add;

            Assert.That(status.Add(StatusEffectId.Burning, 60f), Is.False);
            Assert.That(status.Buildup(StatusEffectId.Burning), Is.EqualTo(60f));
            Assert.That(status.Add(StatusEffectId.Burning, 40f), Is.True);
            Assert.That(status.Buildup(StatusEffectId.Burning), Is.EqualTo(0f));
            Assert.That(status.IsBurning, Is.True);
            Assert.That(status.Remaining(StatusEffectId.Burning), Is.EqualTo(StatusEffectController.BurningSeconds));
            Assert.That(triggered, Is.EqualTo(new[] { StatusEffectId.Burning }));
        }

        [Test]
        public void Buildup_FallsTenPerSecond_AfterTwoSecondsWithoutNewBuildup()
        {
            var status = new StatusEffectController(StatusSettings.Enemy);
            status.Add(StatusEffectId.Shock, 50f);
            status.Tick(2f, MaxHealth);
            Assert.That(status.Buildup(StatusEffectId.Shock), Is.EqualTo(50f).Within(0.001f));
            status.Tick(1f, MaxHealth);
            Assert.That(status.Buildup(StatusEffectId.Shock), Is.EqualTo(40f).Within(0.001f));
            status.Tick(10f, MaxHealth);
            Assert.That(status.Buildup(StatusEffectId.Shock), Is.EqualTo(0f));
        }

        [Test]
        public void Burning_Deals2PercentOfMaxHealthPerSecond_For6Seconds()
        {
            var status = new StatusEffectController(StatusSettings.Enemy);
            var ended = new List<StatusEffectId>();
            status.Ended += ended.Add;
            status.Add(StatusEffectId.Burning, 100f);

            StatusTick tick = status.Tick(1f, MaxHealth);
            Assert.That(tick.BurnDamage, Is.EqualTo(2f).Within(0.001f));
            status.Tick(4.5f, MaxHealth);
            tick = status.Tick(1f, MaxHealth);
            Assert.That(tick.BurnDamage, Is.EqualTo(1f).Within(0.001f), "only the last half second burns");
            Assert.That(status.IsBurning, Is.False);
            Assert.That(ended, Is.EqualTo(new[] { StatusEffectId.Burning }));

            var boss = new StatusEffectController(StatusSettings.Boss);
            boss.Add(StatusEffectId.Burning, 300f);
            Assert.That(boss.Tick(1f, MaxHealth).BurnDamage, Is.EqualTo(0.5f).Within(0.001f), "bosses burn for 0.5 %");
        }

        [Test]
        public void Stun_LastsItsSeconds_ThenTenSecondsOfImmunity()
        {
            var status = new StatusEffectController(StatusSettings.Enemy);
            Assert.That(status.Add(StatusEffectId.Stun, 100f), Is.True);
            Assert.That(status.IsStunned, Is.True);
            Assert.That(status.IncomingDamageMultiplier, Is.EqualTo(1.2f));
            status.Tick(2.1f, MaxHealth);
            Assert.That(status.IsStunned, Is.False);

            Assert.That(status.Add(StatusEffectId.Stun, 100f), Is.False, "immune for 10 s after a stun");
            status.Tick(8f, MaxHealth);
            Assert.That(status.Add(StatusEffectId.Stun, 100f), Is.True);

            var player = new StatusEffectController(StatusSettings.Player);
            player.Add(StatusEffectId.Stun, 100f);
            Assert.That(player.Remaining(StatusEffectId.Stun), Is.EqualTo(1.2f));
        }

        [Test]
        public void AfterATrigger_TheSameEffectResists50More_For10Seconds()
        {
            var status = new StatusEffectController(StatusSettings.Enemy);
            status.Add(StatusEffectId.Burning, 100f);
            Assert.That(status.Threshold(StatusEffectId.Burning), Is.EqualTo(150f).Within(0.001f));
            Assert.That(status.Threshold(StatusEffectId.Poison), Is.EqualTo(100f).Within(0.001f), "other effects stay");
            status.Tick(10.1f, MaxHealth);
            Assert.That(status.Threshold(StatusEffectId.Burning), Is.EqualTo(100f).Within(0.001f));
        }

        [Test]
        public void Boss_IgnoresStun_AndKeepsGrowingResistance()
        {
            var boss = new StatusEffectController(StatusSettings.Boss);
            Assert.That(boss.Add(StatusEffectId.Stun, 500f), Is.False);
            Assert.That(boss.Threshold(StatusEffectId.Burning), Is.EqualTo(300f).Within(0.001f), "resistance 200");
            Assert.That(boss.Add(StatusEffectId.Burning, 300f), Is.True);
            Assert.That(boss.Threshold(StatusEffectId.Burning), Is.EqualTo(400f).Within(0.001f), "+50 boss, +50 after the trigger");
            boss.Tick(30f, MaxHealth);
            Assert.That(boss.Threshold(StatusEffectId.Burning), Is.EqualTo(350f).Within(0.001f), "the boss growth stays for the fight");
            boss.Add(StatusEffectId.Freezing, 300f);
            Assert.That(boss.IsFrozen, Is.False, "bosses only slow down");
            Assert.That(boss.IsChilled, Is.True);
        }

        [Test]
        public void Wet_HalvesBurning_Oily_DoublesIt()
        {
            var oily = new StatusEffectController(StatusSettings.Enemy);
            oily.MakeOily(15f);
            Assert.That(oily.Add(StatusEffectId.Burning, 50f), Is.True);

            var wet = new StatusEffectController(StatusSettings.Enemy);
            wet.MakeWet(20f);
            Assert.That(wet.Add(StatusEffectId.Burning, 100f), Is.False);
            Assert.That(wet.Buildup(StatusEffectId.Burning), Is.EqualTo(50f).Within(0.001f));
            Assert.That(wet.Add(StatusEffectId.Shock, 70f), Is.True, "shock × 1.5 on a wet target");

            var burning = new StatusEffectController(StatusSettings.Enemy);
            burning.Add(StatusEffectId.Burning, 100f);
            burning.MakeWet(20f);
            Assert.That(burning.IsBurning, Is.False, "water puts the fire out (#7)");
        }

        [Test]
        public void Corruption_HasStages_AndFloodsThePlayerAt100()
        {
            var player = new StatusEffectController(StatusSettings.Player);
            player.AddCorruption(30f);
            Assert.That(player.Stage, Is.EqualTo(CorruptionStage.Touched));
            Assert.That(player.AetherDamageBonus, Is.EqualTo(0.05f));
            Assert.That(player.HealingMultiplier, Is.EqualTo(0.95f).Within(0.001f));
            player.AddCorruption(45f);
            Assert.That(player.Stage, Is.EqualTo(CorruptionStage.Marked));

            Assert.That(player.AddCorruption(25f), Is.True);
            Assert.That(player.Stage, Is.EqualTo(CorruptionStage.Flooded));
            Assert.That(player.FloodedRemaining, Is.EqualTo(StatusEffectController.FloodedSeconds));
            Assert.That(player.Tick(1f, MaxHealth).CorruptionDamage, Is.EqualTo(2f).Within(0.001f));
            player.Tick(19.5f, MaxHealth);
            Assert.That(player.FloodedRemaining, Is.EqualTo(0f));
            Assert.That(player.Corruption, Is.EqualTo(StatusEffectController.FloodedFallback));
            Assert.That(player.Stage, Is.EqualTo(CorruptionStage.Permeated));
        }

        [Test]
        public void Corruption_OfAnEnemy_BurstsAt100()
        {
            var enemy = new StatusEffectController(StatusSettings.Enemy);
            enemy.AddCorruption(100f);
            StatusTick tick = enemy.Tick(0.1f, MaxHealth);
            Assert.That(tick.CorruptionBurst, Is.True);
            Assert.That(enemy.Corruption, Is.EqualTo(0f));
            Assert.That(enemy.Tick(0.1f, MaxHealth).CorruptionBurst, Is.False, "only once");

            var corrupted = new StatusEffectController(StatusSettings.Enemy) { CorruptionImmune = true };
            corrupted.AddCorruption(100f);
            Assert.That(corrupted.Corruption, Is.EqualTo(0f), "Aether-corrupted variants are immune");
        }

        [Test]
        public void Corruption_Falls2PerSecondInDensity0_AndGrowsWithDensity()
        {
            var player = new StatusEffectController(StatusSettings.Player);
            player.AddCorruption(10f);
            player.Tick(2f, MaxHealth);
            Assert.That(player.Corruption, Is.EqualTo(6f).Within(0.001f));

            player.AetherDensity = 2f;
            player.Tick(4f, MaxHealth);
            Assert.That(player.Corruption, Is.EqualTo(10f).Within(0.001f), "+1 per second at density 2");
        }

        [Test]
        public void Immunity_IgnoresBuildup_AndCuresARunningEffect()
        {
            var undead = new StatusEffectController(StatusSettings.Enemy);
            undead.Add(StatusEffectId.Poison, 100f);
            Assert.That(undead.IsActive(StatusEffectId.Poison), Is.True);
            undead.SetImmune(StatusEffectId.Poison, true);
            Assert.That(undead.IsActive(StatusEffectId.Poison), Is.False);
            Assert.That(undead.Add(StatusEffectId.Poison, 500f), Is.False);
            Assert.That(undead.IsImmune(StatusEffectId.Poison), Is.True);
        }

        [Test]
        public void Poison_StacksUpToThree_BleedingHitsAtOnce()
        {
            var status = new StatusEffectController(StatusSettings.Enemy);
            status.Add(StatusEffectId.Poison, 100f);
            status.Add(StatusEffectId.Poison, 150f);
            status.Add(StatusEffectId.Poison, 150f);
            status.Add(StatusEffectId.Poison, 150f);
            Assert.That(status.Stacks(StatusEffectId.Poison), Is.EqualTo(3));
            Assert.That(status.Tick(1f, MaxHealth).PoisonDamage, Is.EqualTo(4.5f).Within(0.001f), "1.5 % per stack");
            Assert.That(status.HealingMultiplier, Is.EqualTo(0.5f).Within(0.001f));

            var bleeding = new StatusEffectController(StatusSettings.Enemy);
            bleeding.Add(StatusEffectId.Bleeding, 100f);
            Assert.That(bleeding.Tick(0.1f, MaxHealth).BurnDamage, Is.EqualTo(8f).Within(0.001f), "8 % of max health at once");
            Assert.That(bleeding.Tick(0.1f, MaxHealth).BurnDamage, Is.EqualTo(0f));
        }

        [Test]
        public void Apply_TakesEveryBarOfAHit_AndClearEffectsKeepsTheCorruption()
        {
            var status = new StatusEffectController(StatusSettings.Enemy);
            StatusBuildup hit = StatusBuildup.None.With(StatusEffectId.Burning, 100f).With(StatusEffectId.Stun, 100f).With(StatusEffectId.AetherCorruption, 5f);
            status.Apply(hit);
            Assert.That(status.IsBurning, Is.True);
            Assert.That(status.IsStunned, Is.True);
            Assert.That(status.Corruption, Is.EqualTo(5f));

            status.ClearEffects();
            Assert.That(status.HasActiveEffect, Is.False);
            Assert.That(status.Corruption, Is.EqualTo(5f));
            Assert.That(status.Add(StatusEffectId.Stun, 100f), Is.True, "the immunity window was cleared as well");
        }
    }
}
