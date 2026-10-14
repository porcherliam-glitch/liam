using System;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Unit tests for <see cref="SceneLoader"/> (architecture 4.5) with a fake backend; the Awaitable shim completes frame
    /// waits immediately, so every operation finishes synchronously.
    /// </summary>
    [TestFixture]
    public sealed class SceneLoaderTests
    {
        private const string Test = "Assets/_Project/Scenes/Test/Testgelaende.unity";
        private const string Other = "Assets/_Project/Scenes/Test/Other.unity";

        private LogCapture _log;
        private EventBus _bus;
        private FakeSceneBackend _backend;
        private FakeLoadingScreen _screen;
        private SceneLoader _loader;
        private EventRecorder<SceneLoadStarted> _started;
        private EventRecorder<SceneLoadCompleted> _completed;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _backend = new FakeSceneBackend();
            _backend.AddScene(Test);
            _backend.AddScene(Other);
            _screen = new FakeLoadingScreen();
            _loader = new SceneLoader(_bus, _backend, () => _screen);
            _started = new EventRecorder<SceneLoadStarted>(_bus);
            _completed = new EventRecorder<SceneLoadCompleted>(_bus);
        }

        [TearDown]
        public void TearDown()
        {
            _started.Dispose();
            _completed.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void LoadAdditive_LoadsTheSceneAndPublishesStartedAndCompleted()
        {
            SceneHandle handle = Run(_loader.LoadAdditiveAsync(Test, true, CancellationToken.None));

            Assert.That(handle.IsValid, Is.True);
            Assert.That(handle.Key, Is.EqualTo(Test));
            Assert.That(_loader.IsLoaded(Test), Is.True);
            Assert.That(_started.Count, Is.EqualTo(1));
            Assert.That(_started.Last.SceneKey, Is.EqualTo(Test));
            Assert.That(_started.Last.ShowLoadingScreen, Is.False);
            Assert.That(_completed.Count, Is.EqualTo(1));
            Assert.That(_completed.Last.DurationSeconds, Is.GreaterThan(0f));
            Assert.That(_loader.IsBusy, Is.False);
            Assert.That(_loader.Progress, Is.EqualTo(1f));
        }

        [Test]
        public void LoadAdditive_SceneNotInSceneList_ReturnsInvalidHandleAndLogsError()
        {
            SceneHandle handle = Run(_loader.LoadAdditiveAsync("Assets/Missing.unity", true, CancellationToken.None));

            Assert.That(handle.IsValid, Is.False);
            Assert.That(_completed.Count, Is.EqualTo(0));
            Assert.That(_log.Sink.Count(LogLevel.Error), Is.EqualTo(1));
            Assert.That(_loader.IsBusy, Is.False);
        }

        [Test]
        public void LoadAdditive_InvalidKey_Throws()
        {
            var awaiter = _loader.LoadAdditiveAsync(" ", true, CancellationToken.None).GetAwaiter();

            Assert.Throws<ArgumentException>(() => awaiter.GetResult());
            Assert.That(_loader.IsBusy, Is.False);
        }

        [Test]
        public void LoadAdditive_WithoutActivation_WaitsUntilActivateAsync()
        {
            SceneHandle handle = Run(_loader.LoadAdditiveAsync(Test, false, CancellationToken.None));

            Assert.That(handle.IsValid, Is.True);
            Assert.That(_loader.IsLoaded(Test), Is.False, "the scene waits for activation");
            Assert.That(_completed.Count, Is.EqualTo(0));

            Run(_loader.ActivateAsync(handle, CancellationToken.None));

            Assert.That(_loader.IsLoaded(Test), Is.True);
            Assert.That(_completed.Count, Is.EqualTo(1));
        }

        [Test]
        public void Unload_RemovesTheScene_AndNotLoadedIsNoError()
        {
            Run(_loader.LoadAdditiveAsync(Test, true, CancellationToken.None));

            Run(_loader.UnloadAsync(new SceneHandle(Test), CancellationToken.None));
            Run(_loader.UnloadAsync(new SceneHandle(Test), CancellationToken.None));

            Assert.That(_loader.IsLoaded(Test), Is.False);
            Assert.That(_log.Sink.Count(LogLevel.Error), Is.EqualTo(0));
        }

        [Test]
        public void ChangeWorldSpace_ShowsLoadingScreen_SetsActiveScene_AndHidesItAtTheEnd()
        {
            SceneHandle handle = Run(_loader.ChangeWorldSpaceAsync(new WorldSpaceRequest(Test, "Testgelände", false), CancellationToken.None));

            Assert.That(handle.IsValid, Is.True);
            Assert.That(_screen.Titles, Is.EqualTo(new[] { "Testgelände" }));
            Assert.That(_screen.IsVisible, Is.False);
            Assert.That(_screen.HideCount, Is.EqualTo(1));
            Assert.That(_backend.ActiveScene, Is.EqualTo(Test));
            Assert.That(_loader.CurrentWorldSpace, Is.EqualTo(Test));
            Assert.That(_started.Last.ShowLoadingScreen, Is.True);
            Assert.That(_screen.Progress[_screen.Progress.Count - 1], Is.EqualTo(1f));
            for (int i = 1; i < _screen.Progress.Count; i++)
            {
                Assert.That(_screen.Progress[i], Is.GreaterThanOrEqualTo(_screen.Progress[i - 1]), "progress never goes back");
            }
        }

        [Test]
        public void ChangeWorldSpace_KeepLoadingScreen_LeavesItVisibleAtFullProgress()
        {
            Run(_loader.ChangeWorldSpaceAsync(new WorldSpaceRequest(Test, "Testgelände", true), CancellationToken.None));

            Assert.That(_screen.IsVisible, Is.True);
            Assert.That(_screen.HideCount, Is.EqualTo(0));
            Assert.That(_screen.Progress[_screen.Progress.Count - 1], Is.EqualTo(1f));
        }

        [Test]
        public void ChangeWorldSpace_UnloadsThePreviousWorldSpaceFirst()
        {
            Run(_loader.ChangeWorldSpaceAsync(new WorldSpaceRequest(Test, string.Empty, false), CancellationToken.None));
            _backend.Calls.Clear();

            Run(_loader.ChangeWorldSpaceAsync(new WorldSpaceRequest(Other, string.Empty, false), CancellationToken.None));

            Assert.That(_backend.Calls, Is.EqualTo(new[] { "unload:" + Test, "load:" + Other, "active:" + Other }));
            Assert.That(_loader.IsLoaded(Test), Is.False);
            Assert.That(_loader.CurrentWorldSpace, Is.EqualTo(Other));
        }

        [Test]
        public void ChangeWorldSpace_TargetAlreadyLoaded_ReloadsAFreshCopy()
        {
            _backend.MarkLoaded(Test);

            Run(_loader.ChangeWorldSpaceAsync(new WorldSpaceRequest(Test, string.Empty, false), CancellationToken.None));

            Assert.That(_backend.Calls, Is.EqualTo(new[] { "unload:" + Test, "load:" + Test, "active:" + Test }));
            Assert.That(_loader.IsLoaded(Test), Is.True);
        }

        [Test]
        public void ChangeWorldSpace_SceneMissing_HidesTheLoadingScreenAndReturnsInvalid()
        {
            SceneHandle handle = Run(_loader.ChangeWorldSpaceAsync(new WorldSpaceRequest("Assets/Missing.unity", "x", true), CancellationToken.None));

            Assert.That(handle.IsValid, Is.False);
            Assert.That(_screen.IsVisible, Is.False, "a failed change never leaves the loading screen on");
            Assert.That(_loader.CurrentWorldSpace, Is.Empty);
        }

        [Test]
        public void ChangeWorldSpace_WithoutLoadingScreen_StillLoads()
        {
            var loader = new SceneLoader(_bus, _backend, () => null);

            SceneHandle handle = Run(loader.ChangeWorldSpaceAsync(new WorldSpaceRequest(Test, "x", true), CancellationToken.None));

            Assert.That(handle.IsValid, Is.True);
            Assert.That(_started.Last.ShowLoadingScreen, Is.False);
        }

        [Test]
        public void Cancelled_ThrowsAndIsNoLongerBusy()
        {
            using (var cancellation = new CancellationTokenSource())
            {
                cancellation.Cancel();
                var awaiter = _loader.LoadAdditiveAsync(Test, true, cancellation.Token).GetAwaiter();

                Assert.Throws<OperationCanceledException>(() => awaiter.GetResult());
                Assert.That(_loader.IsBusy, Is.False);
            }
        }

        private static T Run<T>(UnityEngine.Awaitable<T> awaitable)
        {
            var awaiter = awaitable.GetAwaiter();
            Assert.That(awaiter.IsCompleted, Is.True, "the fake backend completes synchronously");
            return awaiter.GetResult();
        }

        private static void Run(UnityEngine.Awaitable awaitable)
        {
            var awaiter = awaitable.GetAwaiter();
            Assert.That(awaiter.IsCompleted, Is.True, "the fake backend completes synchronously");
            awaiter.GetResult();
        }
    }
}
