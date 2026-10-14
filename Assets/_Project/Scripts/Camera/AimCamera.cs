using Aetherfall.Core;
using Aetherfall.Player;
using Unity.Cinemachine;
using UnityEngine;

namespace Aetherfall.CameraSystem
{
    /// <summary>
    /// Aim camera <c>CM_Aim</c> (GDD 03 2.1 "Zielen"): while <see cref="PlayerBow.IsAiming"/> a third
    /// <see cref="CinemachineCamera"/> with higher priority looks over the right shoulder (GDD: 1.4 m behind, 0.6 m to the
    /// right; built with 1.9 m and 0.7 m so the head does not cover the view; field of view 42°, fully drawn 38°). It follows the axes of the exploration camera: the mouse and stick keep turning
    /// <c>CM_Explore</c>'s orbit (<see cref="CameraLookInput"/>), and this component turns the aim pivot to that yaw and pitch,
    /// so leaving the aim does not jump. While aiming the pitch does not recenter.
    /// </summary>
    /// <remarks>GameObject: <c>CM_Aim</c> with <see cref="CinemachineThirdPersonFollow"/> and
    /// <see cref="CinemachineRotateWithFollowTarget"/>; the follow target is the aim pivot (a child of the player at shoulder
    /// height). Runs after the camera input (order 100) and before the brain (LateUpdate).</remarks>
    [DefaultExecutionOrder(100)]
    [DisallowMultipleComponent]
    public sealed class AimCamera : MonoBehaviour
    {
        /// <summary>Exploration pitch that counts as a level aim (the orbit centre).</summary>
        private const float LevelPitch = 15f;

        [Tooltip("Bogen des Spielers.")]
        [SerializeField] private PlayerBow bow = null;

        [Tooltip("Die Ziel-Kamera (CinemachineCamera an CM_Aim). Leer = Komponente am selben GameObject.")]
        [SerializeField] private CinemachineCamera aimCamera = null;

        [Tooltip("Drehpunkt an der Schulter, dem die Ziel-Kamera folgt (Kind des Spielers).")]
        [SerializeField] private Transform aimPivot = null;

        [Tooltip("Orbital Follow der Erkundungskamera CM_Explore (liefert Gier- und Nickwinkel).")]
        [SerializeField] private CinemachineOrbitalFollow exploreOrbital = null;

        [Tooltip("Sichtfeld beim Zielen (GDD 03 2.1: Basis −13° = 42°).")]
        [Range(20f, 70f)] [SerializeField] private float aimFieldOfView = 42f;

        [Tooltip("Sichtfeld voll gespannt (−17° = 38°).")]
        [Range(20f, 70f)] [SerializeField] private float drawnFieldOfView = 38f;

        private bool _live;
        private bool _recenterWasEnabled;

        private void Awake()
        {
            if (aimCamera == null)
            {
                TryGetComponent(out aimCamera);
            }

            if (bow == null || aimCamera == null || aimPivot == null || exploreOrbital == null)
            {
                Log.Warning(LogCategory.Camera, "AimCamera on '" + name + "': bow, camera, pivot or exploration orbit is not assigned; aiming keeps the normal camera.");
                enabled = false;
                return;
            }

            aimCamera.enabled = false;
        }

        private void OnDisable()
        {
            SetLive(false);
        }

        private void Update()
        {
            float yaw = exploreOrbital.HorizontalAxis.Value;
            float pitch = exploreOrbital.VerticalAxis.Value - LevelPitch;
            aimPivot.rotation = Quaternion.Euler(pitch, yaw, 0f);
            SetLive(bow.IsAiming);
            if (_live)
            {
                LensSettings lens = aimCamera.Lens;
                lens.FieldOfView = Mathf.Lerp(aimFieldOfView, drawnFieldOfView, bow.Draw01);
                aimCamera.Lens = lens;
            }
        }

        private void SetLive(bool live)
        {
            if (live == _live || aimCamera == null)
            {
                return;
            }

            _live = live;
            aimCamera.enabled = live;
            if (live)
            {
                _recenterWasEnabled = exploreOrbital.VerticalAxis.Recentering.Enabled;
                exploreOrbital.VerticalAxis.Recentering.Enabled = false;
            }
            else
            {
                exploreOrbital.VerticalAxis.Recentering.Enabled = _recenterWasEnabled;
            }
        }
    }
}
