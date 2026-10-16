using System.Collections.Generic;
using Unity.Cinemachine;
using UnityEngine;

namespace Aetherfall.Cinematics.Playback
{
    /// <summary>
    /// Applies <see cref="CinematicBlendRules"/> to the Cinemachine brains (S58): hooks <see cref="CinemachineCore.GetBlendOverride"/>
    /// while dialogue cameras are registered, chains a handler that was there before and puts it back when the last camera goes.
    /// No CustomBlends asset and no change to the world scenes is needed.
    /// </summary>
    public static class CinematicBlendOverride
    {
        private static readonly HashSet<ICinemachineCamera> DialogueCameras = new HashSet<ICinemachineCamera>();
        private static readonly CinemachineCore.GetBlendOverrideDelegate Handler = Override;
        private static CinemachineCore.GetBlendOverrideDelegate _previous;
        private static bool _installed;

        /// <summary>A dialogue camera comes (rig enabled).</summary>
        /// <param name="camera">Camera.</param>
        public static void Register(ICinemachineCamera camera)
        {
            if (camera == null)
            {
                return;
            }

            DialogueCameras.Add(camera);
            if (!_installed)
            {
                _previous = CinemachineCore.GetBlendOverride;
                CinemachineCore.GetBlendOverride = Handler;
                _installed = true;
            }
        }

        /// <summary>A dialogue camera goes (rig disabled).</summary>
        /// <param name="camera">Camera.</param>
        public static void Unregister(ICinemachineCamera camera)
        {
            if (camera == null || !DialogueCameras.Remove(camera) || DialogueCameras.Count > 0 || !_installed)
            {
                return;
            }

            if (CinemachineCore.GetBlendOverride == Handler)
            {
                CinemachineCore.GetBlendOverride = _previous;
            }

            _previous = null;
            _installed = false;
        }

        /// <summary>The role of a camera.</summary>
        /// <param name="camera">Camera or null.</param>
        public static CinematicCameraRole RoleOf(ICinemachineCamera camera)
        {
            return camera != null && DialogueCameras.Contains(camera) ? CinematicCameraRole.Dialogue : CinematicCameraRole.Gameplay;
        }

        private static CinemachineBlendDefinition Override(ICinemachineCamera from, ICinemachineCamera to, CinemachineBlendDefinition defaultBlend,
            Object owner)
        {
            CinemachineBlendDefinition blend = _previous != null ? _previous(from, to, defaultBlend, owner) : defaultBlend;
            CinematicBlend rule = CinematicBlendRules.Choose(RoleOf(from), RoleOf(to));
            switch (rule.Kind)
            {
                case CinematicBlendKind.Cut:
                    return new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.Cut, 0f);
                case CinematicBlendKind.Ease:
                    return new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.EaseInOut, rule.Seconds);
                default:
                    return blend;
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            // Domain reload is off (like Services.ResetStatics): start every play session clean.
            DialogueCameras.Clear();
            _previous = null;
            _installed = false;
        }
    }
}
