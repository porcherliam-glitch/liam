using System;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using Unity.Cinemachine;
using UnityEngine;

namespace Aetherfall.CameraSystem
{
    /// <summary>
    /// Turns the third-person exploration camera (<c>CM_Explore</c>, architecture 11.2) with the Look action: writes the
    /// horizontal and vertical axis of <see cref="CinemachineOrbitalFollow"/>. Mouse and stick have separate sensitivities
    /// (mouse = degrees per pixel, stick = degrees per second); the Y axis can be inverted. After
    /// <see cref="PlayerSpawned"/> the camera snaps behind the player.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the <see cref="CinemachineCamera"/> with <see cref="CinemachineOrbitalFollow"/>,
    /// <see cref="CinemachineRotationComposer"/> and <see cref="CinemachineDeoccluder"/> (soft wall collision). Used instead
    /// of Cinemachine's own input controller, because input comes from the game's InputService (one action instance,
    /// map switching per game state). The orbital follow detects the value changes itself, so its recentering settings
    /// (wait time after the last input) keep working.</para>
    /// <para>Input is read only while the Gameplay map is active: in menus, pause and dialogues the camera stays still.</para>
    /// <para>TODO (Options step): sensitivities and Y inversion from the options (GDD 05 4.2: stick 5/5, mouse 1.0), stick
    /// curve. TODO (later camera steps): sprint distance/FOV (+0.5 m, +5°), sneak framing, lock-on, aiming, mount, dialogue
    /// cameras, camera mode service with priorities (GDD 03 2.1, architecture 11.2).</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class CameraLookInput : MonoBehaviour
    {
        [Tooltip("Orbital Follow der Kamera, deren Achsen gedreht werden. Leer = Komponente am selben GameObject.")]
        [SerializeField] private CinemachineOrbitalFollow orbitalFollow = null;

        [Tooltip("Die Cinemachine-Kamera (für das Zurücksetzen nach dem Spawn). Leer = Komponente am selben GameObject.")]
        [SerializeField] private CinemachineCamera cinemachineCamera = null;

        [Header("Empfindlichkeit")]
        [Tooltip("Maus: Grad Drehung pro Pixel Mausbewegung (Vorschlag 0,1; entspricht Maus-Empfindlichkeit 1,0).")]
        [Range(0.01f, 1f)]
        [SerializeField] private float mouseDegreesPerPixel = 0.1f;

        [Tooltip("Stick: Grad pro Sekunde bei vollem Ausschlag, X = horizontal, Y = vertikal (Vorschlag 200/130; entspricht Stufe 5/5).")]
        [SerializeField] private Vector2 stickDegreesPerSecond = new Vector2(200f, 130f);

        [Tooltip("Y-Achse invertieren: Maus/Stick nach oben = Kamera schaut nach unten (Option, Standard aus).")]
        [SerializeField] private bool invertY = false;

        [Tooltip("Nach dem Spawnen des Spielers die Kamera hinter ihn setzen.")]
        [SerializeField] private bool snapBehindPlayerOnSpawn = true;

        private IGameplayInput _gameplay;
        private IEventBus _eventBus;
        private bool _subscribed;

        private void Awake()
        {
            if (orbitalFollow == null)
            {
                TryGetComponent(out orbitalFollow);
            }

            if (cinemachineCamera == null)
            {
                TryGetComponent(out cinemachineCamera);
            }

            if (orbitalFollow == null)
            {
                Log.Error(LogCategory.Camera, "CameraLookInput on '" + name + "' finds no CinemachineOrbitalFollow; the camera cannot be turned.");
                enabled = false;
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                // All installers run in the same frame: once the game state service exists, a missing input service is a
                // configuration error (InputInstaller not in the BootConfig), not a timing question.
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                _eventBus = locator.Get<IEventBus>();
                Subscribe();
                if (!locator.TryGet(out IInputService inputService))
                {
                    Log.Error(LogCategory.Camera, "CameraLookInput: no IInputService registered, the camera cannot be turned. " +
                                                  "Add the InputInstaller to the BootConfig behind the GameState installer.");
                    return;
                }

                _gameplay = inputService.Gameplay;
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Camera, exception, "CameraLookInput could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (_subscribed)
            {
                _eventBus.Unsubscribe<PlayerSpawned>(OnPlayerSpawned);
                _subscribed = false;
            }
        }

        private void Update()
        {
            if (_gameplay == null || !_gameplay.IsActive)
            {
                return;
            }

            Vector2 look = _gameplay.Look;
            if (look.x == 0f && look.y == 0f)
            {
                return;
            }

            float yawDelta;
            float pitchDelta;
            if (_gameplay.LookIsPointerDelta)
            {
                // Mouse: pixels moved this frame, already a distance.
                yawDelta = look.x * mouseDegreesPerPixel;
                pitchDelta = look.y * mouseDegreesPerPixel;
            }
            else
            {
                // Stick: a rate, scaled by the frame time.
                float deltaTime = Time.deltaTime;
                yawDelta = look.x * stickDegreesPerSecond.x * deltaTime;
                pitchDelta = look.y * stickDegreesPerSecond.y * deltaTime;
            }

            // Not inverted: up looks up, i.e. the camera moves down on its orbit (smaller vertical value).
            if (!invertY)
            {
                pitchDelta = -pitchDelta;
            }

            orbitalFollow.HorizontalAxis.Value = orbitalFollow.HorizontalAxis.ClampValue(orbitalFollow.HorizontalAxis.Value + yawDelta);
            orbitalFollow.VerticalAxis.Value = orbitalFollow.VerticalAxis.ClampValue(orbitalFollow.VerticalAxis.Value + pitchDelta);
        }

        private void Subscribe()
        {
            if (_eventBus == null || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _eventBus.Subscribe<PlayerSpawned>(OnPlayerSpawned);
            _subscribed = true;
        }

        private void OnPlayerSpawned(PlayerSpawned evt)
        {
            if (!snapBehindPlayerOnSpawn || cinemachineCamera == null)
            {
                return;
            }

            Transform target = cinemachineCamera.Target.TrackingTarget;
            if (target != null)
            {
                orbitalFollow.HorizontalAxis.Value = orbitalFollow.HorizontalAxis.ClampValue(target.eulerAngles.y);
            }

            orbitalFollow.VerticalAxis.Value = orbitalFollow.VerticalAxis.ClampValue(orbitalFollow.VerticalAxis.Center);
            cinemachineCamera.PreviousStateIsValid = false;
        }

        private void OnValidate()
        {
            stickDegreesPerSecond.x = Mathf.Max(0f, stickDegreesPerSecond.x);
            stickDegreesPerSecond.y = Mathf.Max(0f, stickDegreesPerSecond.y);
        }
    }
}
