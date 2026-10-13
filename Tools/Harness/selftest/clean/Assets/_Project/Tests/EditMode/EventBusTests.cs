using System.Collections.Generic;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    public sealed class EventBusTests
    {
        private readonly struct TestEvent : IGameEvent
        {
            public readonly int Value;

            public TestEvent(int value)
            {
                Value = value;
            }
        }

        [Test]
        public void Publish_DeliversToHandlersInSubscriptionOrder()
        {
            EventBus bus = new EventBus();
            List<string> calls = new List<string>();
            bus.Subscribe<TestEvent>(e => calls.Add("a" + e.Value));
            bus.Subscribe<TestEvent>(e => calls.Add("b" + e.Value));

            bus.Publish(new TestEvent(7));

            Assert.That(calls, Is.EqualTo(new[] { "a7", "b7" }));
        }

        [Test]
        public void Unsubscribe_RemovesOnlyThatHandler()
        {
            EventBus bus = new EventBus();
            int count = 0;
            System.Action<TestEvent> handler = e => count += 1;
            bus.Subscribe(handler);
            bus.Unsubscribe(handler);

            bus.Publish(new TestEvent(1));

            Assert.AreEqual(0, count);
        }

        [TestCase(1)]
        [TestCase(3)]
        public void Publish_WithoutSubscribers_DoesNothing(int value)
        {
            Assert.DoesNotThrow(() => new EventBus().Publish(new TestEvent(value)));
        }
    }
}
