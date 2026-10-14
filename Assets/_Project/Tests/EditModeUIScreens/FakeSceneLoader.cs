using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary><see cref="ISceneLoader"/> test double: loads and unloads synchronously; records calls.</summary>
    public sealed class FakeSceneLoader : ISceneLoader
    {
        private readonly HashSet<string> _loaded = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Scenes that cannot be loaded.</summary>
        public HashSet<string> Missing { get; } = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Calls in order.</summary>
        public List<string> Calls { get; } = new List<string>();

        /// <summary>Loading screen used by world space changes.</summary>
        public ILoadingScreen LoadingScreen { get; set; }

        /// <inheritdoc />
        public bool IsBusy => false;

        /// <inheritdoc />
        public float Progress => 1f;

        /// <inheritdoc />
        public string CurrentWorldSpace { get; private set; } = string.Empty;

        /// <inheritdoc />
        public bool IsLoaded(string sceneKey)
        {
            return _loaded.Contains(sceneKey);
        }

        /// <inheritdoc />
        public Awaitable<SceneHandle> LoadAdditiveAsync(string sceneKey, bool activate, CancellationToken ct)
        {
            Calls.Add("load:" + sceneKey);
            return Done(Load(sceneKey));
        }

        /// <inheritdoc />
        public Awaitable ActivateAsync(SceneHandle handle, CancellationToken ct)
        {
            return Done();
        }

        /// <inheritdoc />
        public Awaitable UnloadAsync(SceneHandle handle, CancellationToken ct)
        {
            Calls.Add("unload:" + handle.Key);
            _loaded.Remove(handle.Key);
            return Done();
        }

        /// <inheritdoc />
        public Awaitable<SceneHandle> ChangeWorldSpaceAsync(WorldSpaceRequest request, CancellationToken ct)
        {
            Calls.Add("world:" + request.SceneKey);
            if (LoadingScreen != null)
            {
                LoadingScreen.Show(request.Title);
            }

            SceneHandle handle = Load(request.SceneKey);
            if (LoadingScreen != null && (!request.KeepLoadingScreen || !handle.IsValid))
            {
                LoadingScreen.Hide();
            }

            CurrentWorldSpace = handle.IsValid ? request.SceneKey : string.Empty;
            return Done(handle);
        }

        private SceneHandle Load(string sceneKey)
        {
            if (Missing.Contains(sceneKey))
            {
                return default;
            }

            _loaded.Add(sceneKey);
            return new SceneHandle(sceneKey);
        }

        private static Awaitable<T> Done<T>(T value)
        {
            var source = new AwaitableCompletionSource<T>();
            source.SetResult(value);
            return source.Awaitable;
        }

        private static Awaitable Done()
        {
            var source = new AwaitableCompletionSource();
            source.SetResult();
            return source.Awaitable;
        }
    }
}
