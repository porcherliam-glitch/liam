using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>Unity adapter of <see cref="ISceneLoadOperation"/> around an <see cref="AsyncOperation"/>.</summary>
    public sealed class UnitySceneLoadOperation : ISceneLoadOperation
    {
        private readonly AsyncOperation _operation;

        /// <summary>Wraps an operation.</summary>
        /// <param name="operation">Operation returned by <c>SceneManager.LoadSceneAsync</c> or <c>UnloadSceneAsync</c>.</param>
        public UnitySceneLoadOperation(AsyncOperation operation)
        {
            _operation = operation;
        }

        /// <inheritdoc />
        public float Progress => _operation.progress;

        /// <inheritdoc />
        public bool IsDone => _operation.isDone;

        /// <inheritdoc />
        public bool AllowActivation
        {
            get => _operation.allowSceneActivation;
            set => _operation.allowSceneActivation = value;
        }
    }
}
