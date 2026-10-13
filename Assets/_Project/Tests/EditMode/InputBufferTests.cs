using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Input buffer of the combat state machine (GDD 03 1.3): attacks are kept 0.2 s, dodge and parry 0.15 s, the last
    /// input wins, defensive inputs are not overwritten by attacks.
    /// </summary>
    [TestFixture]
    public sealed class InputBufferTests
    {
        [Test]
        public void Attack_IsKeptForTwoHundredMilliseconds()
        {
            var buffer = new InputBuffer();
            buffer.Push(BufferedAction.LightAttack);

            buffer.Tick(0.19f);
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.LightAttack));

            buffer.Tick(0.02f);
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.None));
        }

        [Test]
        public void Dodge_IsKeptForOneHundredFiftyMilliseconds()
        {
            var buffer = new InputBuffer();
            buffer.Push(BufferedAction.Dodge);

            buffer.Tick(0.14f);
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.Dodge));

            buffer.Tick(0.02f);
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.None));
        }

        [Test]
        public void LaterAttack_ReplacesEarlierAttackAndRestartsTheWindow()
        {
            var buffer = new InputBuffer();
            buffer.Push(BufferedAction.LightAttack);
            buffer.Tick(0.15f);

            Assert.That(buffer.Push(BufferedAction.HeavyAttack), Is.True);
            buffer.Tick(0.15f);

            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.HeavyAttack));
            Assert.That(buffer.Age, Is.EqualTo(0.15f).Within(1e-5f));
        }

        [Test]
        public void Attack_DoesNotOverwriteDefensiveInput()
        {
            var buffer = new InputBuffer();
            buffer.Push(BufferedAction.Dodge);

            Assert.That(buffer.Push(BufferedAction.LightAttack), Is.False);
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.Dodge));
        }

        [Test]
        public void DefensiveInput_OverwritesAttack()
        {
            var buffer = new InputBuffer();
            buffer.Push(BufferedAction.HeavyAttack);

            Assert.That(buffer.Push(BufferedAction.Parry), Is.True);
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.Parry));
        }

        [Test]
        public void Consume_ReturnsAndClears()
        {
            var buffer = new InputBuffer();
            buffer.Push(BufferedAction.LightAttack);

            Assert.That(buffer.Consume(), Is.EqualTo(BufferedAction.LightAttack));
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.None));
            Assert.That(buffer.Consume(), Is.EqualTo(BufferedAction.None));
        }

        [Test]
        public void PushNone_IsIgnored()
        {
            var buffer = new InputBuffer();
            buffer.Push(BufferedAction.LightAttack);

            Assert.That(buffer.Push(BufferedAction.None), Is.False);
            Assert.That(buffer.Pending, Is.EqualTo(BufferedAction.LightAttack));
        }

        [Test]
        public void IsDefensive_OnlyForDodgeAndParry()
        {
            Assert.That(InputBuffer.IsDefensive(BufferedAction.Dodge), Is.True);
            Assert.That(InputBuffer.IsDefensive(BufferedAction.Parry), Is.True);
            Assert.That(InputBuffer.IsDefensive(BufferedAction.LightAttack), Is.False);
            Assert.That(InputBuffer.IsDefensive(BufferedAction.HeavyAttack), Is.False);
            Assert.That(InputBuffer.IsDefensive(BufferedAction.None), Is.False);
        }
    }
}
