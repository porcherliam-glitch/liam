using System;
using System.Threading;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Unit tests for <see cref="Services.WaitForAsync{T}"/> (outside Unity the frame wait completes immediately).</summary>
    [TestFixture]
    public sealed class ServicesWaitForAsyncTests
    {
        private interface IExampleService
        {
        }

        private sealed class ExampleService : IExampleService
        {
        }

        private IServiceLocator _previous;

        [SetUp]
        public void SetUp()
        {
            _previous = Services.Locator;
        }

        [TearDown]
        public void TearDown()
        {
            Services.Set(_previous);
        }

        [Test]
        public void WaitForAsync_ServiceAlreadyRegistered_CompletesImmediatelyWithTheService()
        {
            var locator = new ServiceLocator();
            var service = new ExampleService();
            locator.Register<IExampleService>(service);
            Services.Set(locator);

            var awaiter = Services.WaitForAsync<IExampleService>(CancellationToken.None).GetAwaiter();

            Assert.That(awaiter.IsCompleted, Is.True);
            Assert.That(awaiter.GetResult(), Is.SameAs(service));
        }

        [Test]
        public void WaitForAsync_CancelledWhileNoLocator_ThrowsOperationCanceled()
        {
            Services.Reset();
            using (var cancellation = new CancellationTokenSource())
            {
                cancellation.Cancel();

                var awaiter = Services.WaitForAsync<IExampleService>(cancellation.Token).GetAwaiter();

                Assert.That(awaiter.IsCompleted, Is.True);
                Assert.Throws<OperationCanceledException>(() => awaiter.GetResult());
            }
        }

        [Test]
        public void WaitForAsync_CancelledWhileServiceMissing_ThrowsOperationCanceled()
        {
            Services.Set(new ServiceLocator());
            using (var cancellation = new CancellationTokenSource())
            {
                cancellation.Cancel();

                var awaiter = Services.WaitForAsync<IExampleService>(cancellation.Token).GetAwaiter();

                Assert.Throws<OperationCanceledException>(() => awaiter.GetResult());
            }
        }
    }
}
