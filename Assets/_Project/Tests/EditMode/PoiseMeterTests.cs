using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Poise of enemies (GDD 03 4.9): build-up up to the maximum, regeneration 15 % per second after 2.5 s without damage,
    /// break = 3 s stun with finisher, afterwards full poise again; bosses grow their maximum after each break.
    /// </summary>
    [TestFixture]
    public sealed class PoiseMeterTests
    {
        [Test]
        public void GreyWolf_BreaksAfterFourLightHits()
        {
            // GDD 03 4.9 example: grey wolf L8 has 35 poise; three light hits (10 each) and the fourth hit break it.
            var poise = new PoiseMeter(35f, PoiseSettings.Normal);

            Assert.That(poise.ApplyDamage(10f), Is.EqualTo(PoiseOutcome.Flinch));
            Assert.That(poise.ApplyDamage(10f), Is.EqualTo(PoiseOutcome.Flinch));
            Assert.That(poise.ApplyDamage(10f), Is.EqualTo(PoiseOutcome.Flinch));
            Assert.That(poise.IsStunned, Is.False);

            Assert.That(poise.ApplyDamage(13.5f), Is.EqualTo(PoiseOutcome.Broken));
            Assert.That(poise.IsStunned, Is.True);
            Assert.That(poise.StunAllowsFinisher, Is.True);
            Assert.That(poise.StunRemaining, Is.EqualTo(3f).Within(1e-5f));
            Assert.That(poise.BreakCount, Is.EqualTo(1));
        }

        [Test]
        public void SmallHit_BelowFlinchThreshold_HasNoReaction()
        {
            var poise = new PoiseMeter(100f, PoiseSettings.Normal);

            Assert.That(poise.ApplyDamage(5f), Is.EqualTo(PoiseOutcome.None));
            Assert.That(poise.Buildup, Is.EqualTo(5f));
        }

        [Test]
        public void Regeneration_StartsAfterDelay()
        {
            var poise = new PoiseMeter(100f, PoiseSettings.Normal);
            poise.ApplyDamage(30f);

            poise.Tick(2.4f);
            Assert.That(poise.Buildup, Is.EqualTo(30f).Within(1e-4f), "No regeneration within 2.5 s.");

            poise.Tick(0.1f);
            poise.Tick(1f);
            Assert.That(poise.Buildup, Is.EqualTo(15f).Within(0.05f), "15 % of the maximum per second.");

            poise.Tick(5f);
            Assert.That(poise.Buildup, Is.EqualTo(0f));
        }

        [Test]
        public void NewDamage_RestartsRegenerationDelay()
        {
            var poise = new PoiseMeter(100f, PoiseSettings.Normal);
            poise.ApplyDamage(20f);
            poise.Tick(2f);
            poise.ApplyDamage(10f);
            poise.Tick(2f);

            Assert.That(poise.Buildup, Is.EqualTo(30f).Within(1e-4f));
        }

        [Test]
        public void Stun_EndsAfterThreeSecondsWithFullPoise()
        {
            var poise = new PoiseMeter(35f, PoiseSettings.Normal);
            poise.ApplyDamage(40f);

            poise.Tick(2.9f);
            Assert.That(poise.IsStunned, Is.True);

            poise.Tick(0.2f);
            Assert.That(poise.IsStunned, Is.False);
            Assert.That(poise.Buildup, Is.EqualTo(0f));
            Assert.That(poise.StunAllowsFinisher, Is.False);
        }

        [Test]
        public void DamageDuringStun_IsIgnored()
        {
            var poise = new PoiseMeter(35f, PoiseSettings.Normal);
            poise.ApplyDamage(40f);

            Assert.That(poise.ApplyDamage(50f), Is.EqualTo(PoiseOutcome.None));
            Assert.That(poise.BreakCount, Is.EqualTo(1));
        }

        [Test]
        public void Parry_RemovesShareOfMaximum()
        {
            var poise = new PoiseMeter(40f, PoiseSettings.Normal);

            poise.ApplyParry(0.35f);

            Assert.That(poise.Buildup, Is.EqualTo(14f).Within(1e-4f));
        }

        [Test]
        public void ParryOpening_DoesNotAllowFinisher()
        {
            var poise = new PoiseMeter(40f, PoiseSettings.Normal);

            poise.Stun(1.2f, false);

            Assert.That(poise.IsStunned, Is.True);
            Assert.That(poise.StunAllowsFinisher, Is.False);
        }

        [Test]
        public void ShorterStun_DoesNotReplaceLongerStun()
        {
            var poise = new PoiseMeter(40f, PoiseSettings.Normal);
            poise.ApplyDamage(50f);

            poise.Stun(1f, false);

            Assert.That(poise.StunRemaining, Is.EqualTo(3f).Within(1e-5f));
            Assert.That(poise.StunAllowsFinisher, Is.True);
        }

        [Test]
        public void EndStun_ClearsStunAndBuildup()
        {
            var poise = new PoiseMeter(40f, PoiseSettings.Normal);
            poise.ApplyDamage(50f);

            poise.EndStun();

            Assert.That(poise.IsStunned, Is.False);
            Assert.That(poise.Buildup, Is.EqualTo(0f));
        }

        [Test]
        public void Boss_MaximumGrowsAfterEachBreak()
        {
            var poise = new PoiseMeter(100f, PoiseSettings.Boss);

            poise.ApplyDamage(100f);
            poise.EndStun();
            Assert.That(poise.Max, Is.EqualTo(125f).Within(1e-4f));

            poise.ApplyDamage(125f);
            poise.EndStun();
            poise.ApplyDamage(150f);
            poise.EndStun();
            poise.ApplyDamage(175f);
            poise.EndStun();

            Assert.That(poise.Max, Is.EqualTo(175f).Within(1e-4f), "Growth is capped at +75 %.");
        }

        [Test]
        public void Reset_RestoresFreshMeter()
        {
            var poise = new PoiseMeter(100f, PoiseSettings.Boss);
            poise.ApplyDamage(100f);

            poise.Reset();

            Assert.That(poise.Max, Is.EqualTo(100f));
            Assert.That(poise.Buildup, Is.EqualTo(0f));
            Assert.That(poise.IsStunned, Is.False);
            Assert.That(poise.BreakCount, Is.EqualTo(0));
        }

        [Test]
        public void InvalidMaximum_Throws()
        {
            Assert.That(() => new PoiseMeter(0f, PoiseSettings.Normal), Throws.InstanceOf<System.ArgumentOutOfRangeException>());
        }
    }
}
