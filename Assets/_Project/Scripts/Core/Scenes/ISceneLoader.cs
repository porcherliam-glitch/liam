using System.Threading;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Loads, activates and unloads scenes additively (architecture 4.5). The boot scene stays loaded the whole session; the
    /// world space (for now the test ground) is loaded on top of it. Every load publishes <see cref="SceneLoadStarted"/> and
    /// <see cref="SceneLoadCompleted"/>.
    /// </summary>
    /// <remarks>
    /// <para>For now without Addressables: the scene key is a scene path, a scene name or <c>#n</c> for build index n
    /// (<see cref="SceneKeys"/>). The scene must be in the scene list of the build profile (the test ground menu adds the test
    /// ground behind Boot).</para>
    /// <para>Only one operation runs at a time (<see cref="IsBusy"/>); starting another one throws. All members are main
    /// thread only. Cancelling stops waiting, but Unity cannot cancel a running scene load: the scene still finishes loading.</para>
    /// </remarks>
    public interface ISceneLoader
    {
        /// <summary>True while a load, activation, unload or world space change runs.</summary>
        bool IsBusy { get; }

        /// <summary>Progress of the running operation from 0 to 1 (1 when idle).</summary>
        float Progress { get; }

        /// <summary>Scene key of the current world space (empty if none was loaded through <see cref="ChangeWorldSpaceAsync"/>).</summary>
        string CurrentWorldSpace { get; }

        /// <summary>True if the scene is loaded (also if it was loaded by someone else, e.g. the editor's start scene).</summary>
        /// <param name="sceneKey">Scene key.</param>
        bool IsLoaded(string sceneKey);

        /// <summary>Loads a scene additively.</summary>
        /// <param name="sceneKey">Scene key.</param>
        /// <param name="activate">
        /// True: the scene is activated as soon as it is loaded. False: it waits (Unity progress 0.9) until
        /// <see cref="ActivateAsync"/> is called; the activation is a one-frame spike, so it can be timed.
        /// </param>
        /// <param name="ct">Stops waiting.</param>
        /// <returns>The handle; <see cref="SceneHandle.IsValid"/> is false if the scene could not be loaded (logged).</returns>
        Awaitable<SceneHandle> LoadAdditiveAsync(string sceneKey, bool activate, CancellationToken ct);

        /// <summary>Activates a scene that was loaded with <c>activate = false</c> and waits until it is active.</summary>
        /// <param name="handle">Handle of the waiting scene.</param>
        /// <param name="ct">Stops waiting.</param>
        Awaitable ActivateAsync(SceneHandle handle, CancellationToken ct);

        /// <summary>Unloads a scene; does nothing if it is not loaded.</summary>
        /// <param name="handle">Handle (or a handle created from a scene key).</param>
        /// <param name="ct">Stops waiting.</param>
        Awaitable UnloadAsync(SceneHandle handle, CancellationToken ct);

        /// <summary>
        /// Switches the world space: shows the loading screen (if one is registered), unloads the current world space and a
        /// still loaded copy of the target, loads the target, makes it the active scene and hides the loading screen unless
        /// <see cref="WorldSpaceRequest.KeepLoadingScreen"/> is set.
        /// </summary>
        /// <param name="request">Target scene and loading screen settings.</param>
        /// <param name="ct">Stops waiting.</param>
        /// <returns>Handle of the new world space; invalid if it could not be loaded.</returns>
        Awaitable<SceneHandle> ChangeWorldSpaceAsync(WorldSpaceRequest request, CancellationToken ct);
    }
}
