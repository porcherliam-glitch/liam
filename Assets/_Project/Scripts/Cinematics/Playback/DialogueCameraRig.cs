using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Unity.Cinemachine;
using UnityEngine;

namespace Aetherfall.Cinematics.Playback
{
    /// <summary>
    /// The dialogue cameras (S58, GDD 02 12.6): turns the setup of <see cref="IDialogueCameraDirector"/> into one of three
    /// Cinemachine cameras without body or aim – CM_Dialog_A (shot, close-up), CM_Dialog_B (reverse shot), CM_Dialog_Wide
    /// (two-shot) – at priority 40, exactly one enabled at a time (like the aiming camera). At every cut it places the camera from
    /// the feet of the player and the partner (<see cref="DialogueFraming"/>), trying the fallback poses when the view is blocked;
    /// the side of a conversation is picked once from where the game camera stands (180° rule). Without a partner position (the
    /// partner has no world marker) the game camera stays.
    /// </summary>
    /// <remarks>
    /// GameObject: "Dialogkamera" in Boot.unity (the cameras work in every world scene), built by DialogueCameraBuilder. The
    /// blends come from <see cref="CinematicBlendOverride"/>: 0.4 s into and out of the conversation, hard cuts in between.
    /// </remarks>
    [DefaultExecutionOrder(100)]
    [DisallowMultipleComponent]
    public sealed class DialogueCameraRig : MonoBehaviour
    {
        [Tooltip("CM_Dialog_A: Schuss über die Schulter des Spielers und Nahaufnahme.")]
        [SerializeField] private CinemachineCamera shotCamera = null;

        [Tooltip("CM_Dialog_B: Gegenschuss über die Schulter des Gesprächspartners.")]
        [SerializeField] private CinemachineCamera reverseCamera = null;

        [Tooltip("CM_Dialog_Wide: Halbtotale von der Seite.")]
        [SerializeField] private CinemachineCamera wideCamera = null;

        [Tooltip("Ebenen, die die Sicht verdecken (Umgebung, Gelände).")]
        [SerializeField] private LayerMask obstacles = 0;

        [Tooltip("Platz, den eine Kamera um sich braucht (Meter).")]
        [Min(0.05f)] [SerializeField] private float clearance = 0.2f;

        [Tooltip("Was die Kamera bei einer Antwortauswahl zeigt: Gegenschuss auf den Spieler oder den zuhörenden Partner in Nah.")]
        [SerializeField] private ChoiceFraming choiceFraming = ChoiceFraming.ReverseShot;

        private readonly List<Vector3> _positions = new List<Vector3>();
        private readonly List<KeyValuePair<DialogueSetup, CinePose>> _candidates = new List<KeyValuePair<DialogueSetup, CinePose>>();
        private Func<CinePose, bool> _isBlocked;
        private IDialogueCameraDirector _director;
        private IPlayerLocator _players;
        private IWorldMarkerRegistry _markers;
        private CinemachineCamera _live;
        private int _cutRevision = -1;
        private int _conversation = -1;
        private int _side = 1;
        private bool _missingLogged;

        /// <summary>The camera that is live now, or null (tours).</summary>
        public CinemachineCamera Live => _live;

        /// <summary>The setup the live camera shows (tours).</summary>
        public DialogueSetup LiveSetup { get; private set; }

        /// <summary>Side of the running conversation (+1 / −1, tours).</summary>
        public int Side => _side;

        private void Awake()
        {
            _isBlocked = IsBlocked;
            if (shotCamera == null || reverseCamera == null || wideCamera == null)
            {
                Log.Warning(LogCategory.Cinematics, "DialogueCameraRig on '" + name + "': cameras are not assigned; conversations keep the game camera.");
                enabled = false;
                return;
            }

            shotCamera.enabled = false;
            reverseCamera.enabled = false;
            wideCamera.enabled = false;
        }

        private void OnEnable()
        {
            CinematicBlendOverride.Register(shotCamera);
            CinematicBlendOverride.Register(reverseCamera);
            CinematicBlendOverride.Register(wideCamera);
        }

        private void OnDisable()
        {
            SetLive(null);
            CinematicBlendOverride.Unregister(shotCamera);
            CinematicBlendOverride.Unregister(reverseCamera);
            CinematicBlendOverride.Unregister(wideCamera);
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                IDialogueCameraDirector director = await Services.WaitForAsync<IDialogueCameraDirector>(destroyCancellationToken);
                IPlayerLocator players = await Services.WaitForAsync<IPlayerLocator>(destroyCancellationToken);
                IWorldMarkerRegistry markers = await Services.WaitForAsync<IWorldMarkerRegistry>(destroyCancellationToken);
                _director = director;
                _players = players;
                _markers = markers;
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Cinematics, exception, "DialogueCameraRig could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_director == null)
            {
                return;
            }

            _director.ChoiceFraming = choiceFraming;
            DialogueShot shot = _director.Current;
            if (!shot.Active)
            {
                SetLive(null);
                _cutRevision = -1;
                return;
            }

            if (shot.CutRevision == _cutRevision)
            {
                return;
            }

            _cutRevision = shot.CutRevision;
            if (shot.Conversation != _conversation)
            {
                _conversation = shot.Conversation;
                _missingLogged = false;
                _side = 0;
            }

            if (!TryGetFeet(shot.PartnerId, out CinePoint player, out CinePoint partner))
            {
                if (!_missingLogged)
                {
                    _missingLogged = true;
                    Log.Info(LogCategory.Cinematics, "Dialogue camera: no position for '" + shot.PartnerId + "' – the game camera stays.");
                }

                SetLive(null);
                return;
            }

            if (_side == 0)
            {
                Camera view = Camera.main;
                CinePoint from = view != null ? ToCine(view.transform.position) : player;
                _side = DialogueFraming.ChooseSide(from, player, partner, _isBlocked);
            }

            DialogueFraming.Candidates(shot.Setup, player, partner, _side, _candidates);
            int free = -1;
            for (int i = 0; i < _candidates.Count && free < 0; i++)
            {
                if (!IsBlocked(_candidates[i].Value))
                {
                    free = i;
                }
            }

            if (free < 0)
            {
                // Every pose is blocked (a wall behind, a house beside): keep the shot on screen, or at the start the game camera,
                // which avoids walls by itself.
                if (_live == null)
                {
                    SetLive(null);
                }

                return;
            }

            KeyValuePair<DialogueSetup, CinePose> chosen = _candidates[free];
            CinemachineCamera camera = CameraFor(chosen.Key);
            Place(camera, chosen.Value);
            LiveSetup = chosen.Key;
            SetLive(camera);
        }

        private bool TryGetFeet(string partnerId, out CinePoint player, out CinePoint partner)
        {
            player = default;
            partner = default;
            IPlayerAnchor anchor = _players != null ? _players.Current : null;
            if (anchor == null || _markers == null || string.IsNullOrEmpty(partnerId))
            {
                return false;
            }

            Vector3 feet = anchor.Position;
            _positions.Clear();
            if (_markers.CollectPositions(partnerId, _positions) == 0)
            {
                return false;
            }

            Vector3 nearest = _positions[0];
            for (int i = 1; i < _positions.Count; i++)
            {
                if ((_positions[i] - feet).sqrMagnitude < (nearest - feet).sqrMagnitude)
                {
                    nearest = _positions[i];
                }
            }

            player = ToCine(feet);
            partner = ToCine(nearest);
            Vector3 apart = nearest - feet;
            apart.y = 0f;
            // Somebody this far away is not the one the player talks to (e.g. another placeholder of the same NPC).
            return apart.magnitude <= DialogueCameraRules.MaxPartnerMeters;
        }

        private CinemachineCamera CameraFor(DialogueSetup setup)
        {
            switch (setup)
            {
                case DialogueSetup.ReverseShot:
                    return reverseCamera;
                case DialogueSetup.Wide:
                    return wideCamera;
                default:
                    return shotCamera;
            }
        }

        private static void Place(CinemachineCamera camera, CinePose pose)
        {
            Vector3 position = ToVector(pose.Position);
            Vector3 look = ToVector(pose.LookAt) - position;
            camera.transform.SetPositionAndRotation(position, look.sqrMagnitude > 1e-6f ? Quaternion.LookRotation(look, Vector3.up) : camera.transform.rotation);
            LensSettings lens = camera.Lens;
            lens.FieldOfView = (float)pose.FieldOfView;
            lens.Dutch = (float)pose.Dutch;
            camera.Lens = lens;
            // A re-placed camera jumps (hard cut), it does not glide.
            camera.PreviousStateIsValid = false;
        }

        private void SetLive(CinemachineCamera camera)
        {
            if (camera == _live)
            {
                return;
            }

            if (_live != null)
            {
                _live.enabled = false;
            }

            _live = camera;
            if (_live != null)
            {
                _live.enabled = true;
            }
        }

        private bool IsBlocked(CinePose pose)
        {
            Vector3 position = ToVector(pose.Position);
            Vector3 target = ToVector(pose.LookAt);
            return Physics.CheckSphere(position, clearance, obstacles, QueryTriggerInteraction.Ignore) ||
                   Physics.Linecast(position, target, obstacles, QueryTriggerInteraction.Ignore);
        }

        private static CinePoint ToCine(Vector3 value)
        {
            return new CinePoint(value.x, value.y, value.z);
        }

        private static Vector3 ToVector(CinePoint value)
        {
            return new Vector3((float)value.X, (float)value.Y, (float)value.Z);
        }
    }
}
