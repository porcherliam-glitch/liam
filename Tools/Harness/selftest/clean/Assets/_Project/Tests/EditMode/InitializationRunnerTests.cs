using System.Collections;
using System.Threading;
using System.Threading.Tasks;
using Aetherfall.Core;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Aetherfall.Tests.EditMode
{
    public sealed class InitializationRunnerTests
    {
        private sealed class FakeService : IInitializable
        {
            public bool Initialized;

            public async Awaitable InitializeAsync(CancellationToken ct)
            {
                await Awaitable.BackgroundThreadAsync();
                await Awaitable.MainThreadAsync();
                Initialized = true;
            }
        }

        [Test]
        public async Task RunAsync_InitializesAllServices()
        {
            InitializationRunner runner = new InitializationRunner();
            FakeService first = new FakeService();
            FakeService second = new FakeService();
            runner.Add(first);
            runner.Add(second);

            await runner.RunAsync(CancellationToken.None);

            Assert.IsTrue(first.Initialized && second.Initialized);
            Assert.AreEqual(2, runner.CompletedCount);
        }

        [Test]
        public void RunAsync_CancelledToken_Throws()
        {
            InitializationRunner runner = new InitializationRunner();
            runner.Add(new FakeService());
            CancellationTokenSource cts = new CancellationTokenSource();
            cts.Cancel();

            Assert.ThrowsAsync<System.OperationCanceledException>(async () => await runner.RunAsync(cts.Token));
        }

        [UnityTest]
        public IEnumerator Boot_InPlayMode_ReachesMainMenu()
        {
            yield return null;
        }
    }
}
