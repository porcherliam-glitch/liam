using System;
using System.Collections.Generic;
using System.Threading;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Default <see cref="ISceneLoader"/> (architecture 4.5, simple version without Addressables): additive loading through an
    /// <see cref="ISceneBackend"/> (<c>SceneManager</c> in the game), loading screen orchestration and the events
    /// <see cref="SceneLoadStarted"/> / <see cref="SceneLoadCompleted"/>.
    /// </summary>
    /// <remarks>
    /// <para>Pure logic apart from the frame wait (<see cref="FrameWait"/>): every operation polls the backend once per frame.
    /// Created by <see cref="SceneLoaderInstaller"/> in boot step 8b.</para>
    /// <para><b>Loading screen:</b> resolved lazily through the provider passed to the constructor (the UI registers it later,
    /// boot step 15, architecture 4.5). Without one, scenes load without a loading screen.</para>
    /// <para>TODO (Addressables step): scene keys become Addressables keys, background loading priority (BelowNormal in the
    /// open world, High behind the loading screen), cell requests of the streaming controller.</para>
    /// </remarks>
    public sealed class SceneLoader : ISceneLoader
    {
        private readonly IEventBus _eventBus;
        private readonly ISceneBackend _backend;
        private readonly Func<ILoadingScreen> _loadingScreenProvider;
        private readonly FrameWait _nextFrame;
        private readonly Dictionary<string, PendingActivation> _pending = new Dictionary<string, PendingActivation>(StringComparer.Ordinal);
        private bool _busy;
        private float _progress = 1f;
        private string _currentWorldSpace = string.Empty;
        private ILoadingScreen _progressTarget;
        private int _phase;
        private int _phaseCount = 1;

        /// <summary>Creates the loader.</summary>
        /// <param name="eventBus">Bus for the scene load events.</param>
        /// <param name="backend">Scene operations.</param>
        /// <param name="loadingScreenProvider">Returns the loading screen or null; called at the start of every world space change.</param>
        /// <param name="nextFrame">Waits one frame between polls; null = <see cref="FrameWaits.NextFrame"/>.</param>
        public SceneLoader(IEventBus eventBus, ISceneBackend backend, Func<ILoadingScreen> loadingScreenProvider, FrameWait nextFrame = null)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            _backend = backend ?? throw new ArgumentNullException(nameof(backend));
            _loadingScreenProvider = loadingScreenProvider;
            _nextFrame = nextFrame ?? FrameWaits.NextFrame;
        }

        /// <inheritdoc />
        public bool IsBusy => _busy;

        /// <inheritdoc />
        public float Progress => _progress;

        /// <inheritdoc />
        public string CurrentWorldSpace => _currentWorldSpace;

        /// <inheritdoc />
        public bool IsLoaded(string sceneKey)
        {
            return SceneKeys.IsValid(sceneKey) && _backend.IsLoaded(sceneKey);
        }

        /// <inheritdoc />
        public async Awaitable<SceneHandle> LoadAdditiveAsync(string sceneKey, bool activate, CancellationToken ct)
        {
            BeginOperation("LoadAdditiveAsync", sceneKey);
            try
            {
                return await LoadCoreAsync(sceneKey, activate, ct);
            }
            finally
            {
                EndOperation();
            }
        }

        /// <inheritdoc />
        public async Awaitable ActivateAsync(SceneHandle handle, CancellationToken ct)
        {
            if (!handle.IsValid || !_pending.TryGetValue(handle.Key, out PendingActivation pending))
            {
                Log.Warning(LogCategory.Streaming, "ActivateAsync(" + handle + "): no scene is waiting for activation under this key.");
                return;
            }

            BeginOperation("ActivateAsync", handle.Key);
            try
            {
                _pending.Remove(handle.Key);
                pending.Operation.AllowActivation = true;
                while (!pending.Operation.IsDone)
                {
                    await _nextFrame(ct);
                }

                PublishCompleted(handle.Key, pending.StartTime);
            }
            finally
            {
                EndOperation();
            }
        }

        /// <inheritdoc />
        public async Awaitable UnloadAsync(SceneHandle handle, CancellationToken ct)
        {
            if (!handle.IsValid)
            {
                return;
            }

            BeginOperation("UnloadAsync", handle.Key);
            try
            {
                await UnloadCoreAsync(handle.Key, ct);
            }
            finally
            {
                EndOperation();
            }
        }

        /// <inheritdoc />
        public async Awaitable<SceneHandle> ChangeWorldSpaceAsync(WorldSpaceRequest request, CancellationToken ct)
        {
            BeginOperation("ChangeWorldSpaceAsync", request.SceneKey);
            ILoadingScreen loadingScreen = _loadingScreenProvider != null ? _loadingScreenProvider() : null;
            bool keepLoadingScreen = request.KeepLoadingScreen;
            try
            {
                if (loadingScreen != null)
                {
                    loadingScreen.Show(request.Title);
                    loadingScreen.SetProgress(0f);
                }

                _progressTarget = loadingScreen;
                string previous = _currentWorldSpace;
                bool unloadPrevious = previous.Length > 0 && !string.Equals(previous, request.SceneKey, StringComparison.Ordinal) &&
                                      _backend.IsLoaded(previous);
                bool reloadTarget = _backend.IsLoaded(request.SceneKey);
                _phaseCount = 1 + (unloadPrevious ? 1 : 0) + (reloadTarget ? 1 : 0);
                _phase = 0;

                if (unloadPrevious)
                {
                    await UnloadCoreAsync(previous, ct);
                    _phase++;
                }

                _currentWorldSpace = string.Empty;
                if (reloadTarget)
                {
                    // A fresh copy: the scene objects (player, enemies, chests) start from their scene state again.
                    await UnloadCoreAsync(request.SceneKey, ct);
                    _phase++;
                }

                SceneHandle handle = await LoadCoreAsync(request.SceneKey, true, ct);
                if (!handle.IsValid)
                {
                    keepLoadingScreen = false;
                    return handle;
                }

                if (!_backend.SetActive(request.SceneKey))
                {
                    Log.Warning(LogCategory.Streaming, "World space '" + request.SceneKey + "' is loaded but could not be made the active scene.");
                }

                _currentWorldSpace = request.SceneKey;
                Log.Info(LogCategory.Streaming, "World space is now '" + request.SceneKey + "'.");
                return handle;
            }
            finally
            {
                _progressTarget = null;
                _phase = 0;
                _phaseCount = 1;
                if (loadingScreen != null)
                {
                    if (keepLoadingScreen)
                    {
                        loadingScreen.SetProgress(1f);
                    }
                    else
                    {
                        loadingScreen.Hide();
                    }
                }

                EndOperation();
            }
        }

        private async Awaitable<SceneHandle> LoadCoreAsync(string sceneKey, bool activate, CancellationToken ct)
        {
            double start = _backend.RealtimeSeconds;
            var started = new SceneLoadStarted(sceneKey, _progressTarget != null);
            _eventBus.Publish(in started);

            ISceneLoadOperation operation = _backend.LoadAdditive(sceneKey);
            if (operation == null)
            {
                Log.Error(LogCategory.Streaming, "Scene '" + sceneKey + "' could not be loaded. Is it in the scene list (File > Build Profiles > Scene List)? " +
                                                 "Run the menu Aetherfall > Testgelaende erstellen again to add the test ground behind Boot.");
                return default;
            }

            operation.AllowActivation = activate;
            ReportProgress(0f);
            while (!operation.IsDone)
            {
                if (!activate && operation.Progress >= 0.9f)
                {
                    _pending[sceneKey] = new PendingActivation(operation, start);
                    ReportProgress(1f);
                    Log.Info(LogCategory.Streaming, "Scene '" + sceneKey + "' is loaded and waits for activation.");
                    return new SceneHandle(sceneKey);
                }

                ReportProgress(SceneKeys.NormalizeProgress(operation.Progress));
                await _nextFrame(ct);
            }

            ReportProgress(1f);
            PublishCompleted(sceneKey, start);
            return new SceneHandle(sceneKey);
        }

        private async Awaitable UnloadCoreAsync(string sceneKey, CancellationToken ct)
        {
            _pending.Remove(sceneKey);
            ISceneLoadOperation operation = _backend.Unload(sceneKey);
            if (operation == null)
            {
                Log.Info(LogCategory.Streaming, "Unload '" + sceneKey + "': the scene is not loaded, nothing to do.");
                return;
            }

            ReportProgress(0f);
            while (!operation.IsDone)
            {
                ReportProgress(operation.Progress);
                await _nextFrame(ct);
            }

            ReportProgress(1f);
            if (string.Equals(_currentWorldSpace, sceneKey, StringComparison.Ordinal))
            {
                _currentWorldSpace = string.Empty;
            }

            Log.Info(LogCategory.Streaming, "Scene '" + sceneKey + "' unloaded.");
        }

        private void PublishCompleted(string sceneKey, double startTime)
        {
            float duration = (float)Math.Max(0d, _backend.RealtimeSeconds - startTime);
            Log.Info(LogCategory.Streaming, "Scene '" + sceneKey + "' loaded in " + duration.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) + " s.");
            var completed = new SceneLoadCompleted(sceneKey, duration);
            _eventBus.Publish(in completed);
        }

        private void ReportProgress(float phaseProgress01)
        {
            _progress = SceneKeys.CombinePhases(_phase, _phaseCount, phaseProgress01);
            if (_progressTarget != null)
            {
                _progressTarget.SetProgress(_progress);
            }
        }

        private void BeginOperation(string operation, string sceneKey)
        {
            if (!SceneKeys.IsValid(sceneKey))
            {
                throw new ArgumentException(operation + ": invalid scene key '" + sceneKey + "'.", nameof(sceneKey));
            }

            if (_busy)
            {
                throw new InvalidOperationException(operation + "('" + sceneKey + "'): another scene operation is still running (IsBusy).");
            }

            _busy = true;
            _progress = 0f;
        }

        private void EndOperation()
        {
            _busy = false;
            _progress = 1f;
        }

        private readonly struct PendingActivation
        {
            public readonly ISceneLoadOperation Operation;
            public readonly double StartTime;

            public PendingActivation(ISceneLoadOperation operation, double startTime)
            {
                Operation = operation;
                StartTime = startTime;
            }
        }
    }
}
