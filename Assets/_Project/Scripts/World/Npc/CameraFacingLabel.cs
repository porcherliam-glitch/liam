using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Turns a world text (the name sign of an NPC) toward the camera every frame, so it is readable from every side - NPCs
    /// walk their daily routines and turn around (GDD 01 7.1). Only the yaw follows: the text stays upright. During a cutscene or a
    /// conversation the sign is hidden, so it never shows up in the shots (S58; the speaker name is in the subtitle).
    /// </summary>
    /// <remarks>GameObject: the TextMesh of the sign.</remarks>
    [DisallowMultipleComponent]
    public sealed class CameraFacingLabel : MonoBehaviour
    {
        private Renderer _renderer;
        private IGameStateService _gameState;

        private void Awake()
        {
            TryGetComponent(out _renderer);
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "CameraFacingLabel could not resolve IGameStateService.");
            }
        }

        private void LateUpdate()
        {
            if (_renderer != null && _gameState != null)
            {
                GameState state = _gameState.Current;
                int modals = _gameState.ModalCount;
                // The pause menu over a conversation keeps the dialogue shot: the signs stay hidden there as well.
                bool pausedInConversation = state == GameState.Paused && modals >= 2 && _gameState.GetModalAt(modals - 2) == GameState.Dialogue;
                bool shown = state != GameState.Cutscene && state != GameState.Dialogue && !pausedInConversation;
                if (_renderer.enabled != shown)
                {
                    _renderer.enabled = shown;
                }
            }

            Camera view = Camera.main;
            if (view == null)
            {
                return;
            }

            Vector3 away = transform.position - view.transform.position;
            away.y = 0f;
            if (away.sqrMagnitude > 0.0001f)
            {
                transform.rotation = Quaternion.LookRotation(away, Vector3.up);
            }
        }
    }
}
