using System;
using Aetherfall.AI.Bosses;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>Aether shell of the Prolog-Rissbrut (GDD 02 11.1 s60): protects, breaks once, grows back after a while.</summary>
    [TestFixture]
    public sealed class AetherShellStateTests
    {
        private static AetherShellState Shell()
        {
            return new AetherShellState(0.25f, 12f, 1.5f);
        }

        [Test]
        public void IntactShellLetsAQuarterThrough()
        {
            AetherShellState shell = Shell();

            Assert.That(shell.IsIntact, Is.True);
            Assert.That(shell.DamageFactor, Is.EqualTo(0.25f));
            Assert.That(shell.GrowFraction, Is.EqualTo(1f));
        }

        [Test]
        public void BrokenShellLetsEverythingThroughAndBreaksOnlyOnce()
        {
            AetherShellState shell = Shell();

            Assert.That(shell.TryBreak(), Is.True);
            Assert.That(shell.TryBreak(), Is.False);
            Assert.That(shell.IsIntact, Is.False);
            Assert.That(shell.DamageFactor, Is.EqualTo(1f));
            Assert.That(shell.GrowFraction, Is.EqualTo(0f));
        }

        [Test]
        public void ShellGrowsBackAfterTheExposedTime()
        {
            AetherShellState shell = Shell();
            shell.TryBreak();

            Assert.That(shell.Tick(11.9f), Is.False);
            Assert.That(shell.IsRegrowing, Is.False);
            Assert.That(shell.Tick(0.85f), Is.False);
            Assert.That(shell.IsRegrowing, Is.True, "12 s are over: the shell grows back");
            Assert.That(shell.DamageFactor, Is.EqualTo(1f), "a growing shell does not protect yet");
            Assert.That(shell.GrowFraction, Is.EqualTo(0.5f).Within(1e-4f));
            Assert.That(shell.Tick(0.8f), Is.True);
            Assert.That(shell.IsIntact, Is.True);
            Assert.That(shell.DamageFactor, Is.EqualTo(0.25f));
        }

        [Test]
        public void RestoreMakesItWholeAtOnce()
        {
            AetherShellState shell = Shell();
            shell.TryBreak();

            shell.Restore();

            Assert.That(shell.IsIntact, Is.True);
            Assert.That(shell.TryBreak(), Is.True);
        }

        [Test]
        public void InvalidValuesAreRejected()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new AetherShellState(1.5f, 12f, 1.5f));
            Assert.Throws<ArgumentOutOfRangeException>(() => new AetherShellState(0.25f, 0f, 1.5f));
        }
    }
}
