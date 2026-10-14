namespace Aetherfall.Core
{
    /// <summary>
    /// A running scene load or unload of an <see cref="ISceneBackend"/> (wraps Unity's <c>AsyncOperation</c>, a fake in tests).
    /// </summary>
    public interface ISceneLoadOperation
    {
        /// <summary>Unity progress: 0 to 0.9 while loading, 0.9 while waiting for activation, 1 when done.</summary>
        float Progress { get; }

        /// <summary>True when the operation finished (the scene is loaded and activated, or unloaded).</summary>
        bool IsDone { get; }

        /// <summary>False keeps a loaded scene waiting at 0.9 until it is set to true (activation = one frame spike).</summary>
        bool AllowActivation { get; set; }
    }
}
