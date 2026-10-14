using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Unit tests for <see cref="HoldToConfirm"/> (GDD 05 1.4) and <see cref="ScreenStack{T}"/> (architecture 4.9).</summary>
    [TestFixture]
    public sealed class HoldAndStackTests
    {
        [Test]
        public void Hold_CompletesAfterTheDuration()
        {
            var hold = new HoldToConfirm();
            hold.Begin(2);
            Assert.That(hold.Update(true, 0.5f), Is.EqualTo(HoldStep.Progressed));
            Assert.That(hold.Progress, Is.EqualTo(0.5f).Within(0.0001f));
            Assert.That(hold.Target, Is.EqualTo(2));
            Assert.That(hold.Update(true, 0.5f), Is.EqualTo(HoldStep.Completed));
            Assert.That(hold.IsHolding, Is.False);
            Assert.That(hold.Update(true, 0.5f), Is.EqualTo(HoldStep.Idle));
        }

        [Test]
        public void Hold_ReleasingEarlyCancels()
        {
            var hold = new HoldToConfirm();
            hold.Begin(0);
            hold.Update(true, 0.9f);
            Assert.That(hold.Update(false, 0.01f), Is.EqualTo(HoldStep.Cancelled));
            Assert.That(hold.Progress, Is.EqualTo(0f));
        }

        [TestCase(0.1f, HoldToConfirm.MinDuration)]
        [TestCase(1.2f, 1.2f)]
        [TestCase(9f, HoldToConfirm.MaxDuration)]
        [TestCase(float.NaN, HoldToConfirm.DefaultDuration)]
        public void Hold_DurationIsClampedToTheOptionRange(float requested, float expected)
        {
            Assert.That(new HoldToConfirm(requested).Duration, Is.EqualTo(expected));
        }

        [Test]
        public void Stack_TopOwnsTheFocus_AndRemovingRevealsTheOneBelow()
        {
            var stack = new ScreenStack<string>();
            Assert.That(stack.Top, Is.Null);
            Assert.That(stack.Push("a"), Is.True);
            Assert.That(stack.Push("b"), Is.True);
            Assert.That(stack.Push("b"), Is.False, "already on top");
            Assert.That(stack.Top, Is.EqualTo("b"));
            Assert.That(stack.Remove("b"), Is.True);
            Assert.That(stack.Top, Is.EqualTo("a"));
            Assert.That(stack.Remove("b"), Is.False);
        }

        [Test]
        public void Stack_PushingAScreenThatIsLowerMovesItToTheTop()
        {
            var stack = new ScreenStack<string>();
            stack.Push("a");
            stack.Push("b");
            stack.Push("a");
            Assert.That(stack.Count, Is.EqualTo(2));
            Assert.That(stack[0], Is.EqualTo("b"));
            Assert.That(stack.Top, Is.EqualTo("a"));
            stack.Clear();
            Assert.That(stack.Count, Is.EqualTo(0));
        }
    }
}
