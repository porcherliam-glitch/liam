using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>German overlay texts of the combat states (debug overlay, guide 05).</summary>
    [TestFixture]
    public sealed class CombatStateTextTests
    {
        [Test]
        public void Describe_IdleAndCombo()
        {
            var machine = new CombatStateMachine(CombatTuning.CreateDefault(), CombatTestData.CreateSword(), CombatTestData.CreateStamina());

            Assert.That(CombatStateText.Describe(machine, 4), Is.EqualTo("Bereit"));

            machine.Tick(0.01f, new CombatInput { LightPressed = true });
            Assert.That(CombatStateText.Describe(machine, 4), Is.EqualTo("Angriff: Kombo 1/4 (Ausholen)"));
        }

        [Test]
        public void Describe_BlockWithParryWindow()
        {
            var machine = new CombatStateMachine(CombatTuning.CreateDefault(), CombatTestData.CreateSword(), CombatTestData.CreateStamina());

            machine.Tick(0.01f, new CombatInput { BlockPressed = true, BlockHeld = true });

            Assert.That(CombatStateText.Describe(machine, 4), Does.StartWith("Blocken"));
            Assert.That(CombatStateText.Describe(machine, 4), Does.Contain("PARIERFENSTER"));
        }

        [Test]
        public void Describe_WithoutMachine()
        {
            Assert.That(CombatStateText.Describe(null, 4), Does.Contain("fehlerhaft"));
        }

        [Test]
        public void PartTexts()
        {
            AttackSpec heavy = AttackSpec.Create("schwer", 0.4f, 0.1f, 0.5f);
            heavy.Kind = AttackKind.Heavy;
            heavy.ChargeLevel = 2;

            Assert.That(CombatStateText.Phase(AttackPhase.Windup), Is.EqualTo("Ausholen"));
            Assert.That(CombatStateText.Phase(AttackPhase.Active), Is.EqualTo("Treffer"));
            Assert.That(CombatStateText.Kind(heavy), Is.EqualTo("schwer, Stufe 2"));
            Assert.That(CombatStateText.Kind(null), Is.EqualTo("–"));
            Assert.That(CombatStateText.Stagger(StaggerKind.GuardBreak), Is.EqualTo("Deckungsbruch"));
            Assert.That(CombatStateText.Seconds(1.25f), Is.EqualTo("1.3 s").Or.EqualTo("1.2 s"));
        }
    }
}
