using System;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Aetherfall.Core
{
    /// <summary>Boots the game in the Boot scene.</summary>
    [DisallowMultipleComponent]
    public sealed class GameBootstrapper : MonoBehaviour
    {
        [SerializeField] private float initializationTimeoutSeconds = 20f;

        private InitializationRunner _runner;

        private async Awaitable Start()
        {
            try
            {
                _runner = new InitializationRunner();
                Services.Set(new EventBus());
                await _runner.RunAsync(destroyCancellationToken);
                await Awaitable.NextFrameAsync(destroyCancellationToken);
#if UNITY_EDITOR
                EditorApplication.isPaused = false;
#endif
            }
            catch (OperationCanceledException)
            {
                // Boot object destroyed while booting.
            }
            catch (Exception exception)
            {
                Debug.LogException(exception, this);
            }
        }

        private void OnValidate()
        {
            initializationTimeoutSeconds = Mathf.Max(1f, initializationTimeoutSeconds);
        }
    }
}
