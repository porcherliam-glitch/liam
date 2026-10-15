using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Input;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Lock-on of the player (GDD 03 2.3, 1.5 "LockOn"/"SwitchTarget"): R3 / middle mouse button (or T) picks the best target in a
    /// cone of ±30° around the camera direction within 25 m (angle 60 %, distance 40 %, <see cref="TargetingMath"/>);
    /// flicking the right stick, the mouse wheel or a quick mouse swipe switches to the next target on that side; the
    /// lock ends beyond 30 m, after 2 s without line of sight or when the target dies (then the next target is taken).
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root. The current target is a local C# event (<see cref="TargetChanged"/>, architecture
    /// 4.3 "Lock-On-Ziel als Transform laeuft nicht ueber den globalen Bus"); the lock-on camera and the combat controller
    /// listen to it. Candidates come from <see cref="ICombatService.Combatants"/> (resolved once in Start).</para>
    /// </remarks>
    [DefaultExecutionOrder(-45)]
    [DisallowMultipleComponent]
    public sealed class PlayerLockOn : MonoBehaviour
    {
        private const int MaxCandidates = 32;

        [Tooltip("Die Spielfigur (Combatant am Spieler). Leer = Komponente am selben GameObject.")]
        [SerializeField] private Combatant self = null;

        [Tooltip("Transform der Main Camera: der Suchkegel liegt um ihre Blickrichtung.")]
        [SerializeField] private Transform cameraTransform = null;

        [Header("Zielwahl (GDD 03, 2.3)")]
        [Tooltip("Halber Winkel des Suchkegels um die Kamerarichtung in Grad (GDD: 30).")]
        [Range(5f, 90f)] [SerializeField] private float coneHalfAngle = 30f;

        [Tooltip("Reichweite in Metern (GDD: 25; Nebel 20).")]
        [Range(5f, 60f)] [SerializeField] private float range = 25f;

        [Tooltip("Lock-On endet ab dieser Entfernung in Metern (GDD: 30).")]
        [Range(5f, 80f)] [SerializeField] private float releaseDistance = 30f;

        [Tooltip("Lock-On endet nach so vielen Sekunden ohne Sichtlinie (GDD: 2).")]
        [Range(0.2f, 10f)] [SerializeField] private float lostSightSeconds = 2f;

        [Tooltip("Layer, die die Sicht verdecken (Environment).")]
        [SerializeField] private LayerMask sightBlockers = 1 << 11;

        [Tooltip("Stirbt das Ziel, wird das nächste Ziel gewählt (Option, GDD 03, 2.3).")]
        [SerializeField] private bool nextTargetOnDeath = true;

        [Header("Ziel wechseln")]
        [Tooltip("Stick: so weit muss der rechte Stick gekippt werden, um das Ziel zu wechseln (0–1).")]
        [Range(0.3f, 1f)] [SerializeField] private float stickFlickThreshold = 0.7f;

        [Tooltip("Maus: so viele Pixel seitliche Bewegung in kurzer Zeit wechseln das Ziel (Maus-Schwenk).")]
        [Range(10f, 400f)] [SerializeField] private float mouseFlickPixels = 60f;

        private readonly Combatant[] _candidates = new Combatant[MaxCandidates];
        private readonly float[] _bearings = new float[MaxCandidates];
        private readonly float[] _distances = new float[MaxCandidates];
        private ICombatService _service;
        private IGameplayInput _gameplay;
        private float _noSightTime;
        private bool _stickArmed = true;
        private float _mouseSum;
        private float _mouseWindow;
        private float _switchCooldown;

        /// <summary>The locked target, or null.</summary>
        public Combatant Target { get; private set; }

        /// <summary>True while a target is locked.</summary>
        public bool HasTarget => Target != null;

        /// <summary>Raised when the target changes (null = lock released).</summary>
        public event Action<Combatant> TargetChanged;

        /// <summary>Locks the best target in the cone, or releases the current lock.</summary>
        /// <returns>True if a target is locked afterwards.</returns>
        public bool Toggle()
        {
            if (Target != null)
            {
                SetTarget(null);
                return false;
            }

            return TryAcquire();
        }

        /// <summary>Locks the best target in the cone (GDD 03 2.3).</summary>
        /// <returns>True if a target was found.</returns>
        public bool TryAcquire()
        {
            int count = CollectCandidates(null);
            int best = TargetingMath.SelectBest(_bearings, _distances, count, coneHalfAngle, range);
            Combatant chosen = best >= 0 ? _candidates[best] : null;
            ClearCandidates(count);
            if (chosen == null)
            {
                return false;
            }

            SetTarget(chosen);
            return true;
        }

        /// <summary>Switches to the next target on the given side (positive = right).</summary>
        /// <param name="direction">Side of the flick.</param>
        /// <returns>True if the target changed.</returns>
        public bool Switch(float direction)
        {
            if (Target == null)
            {
                return false;
            }

            float currentBearing = BearingFromCamera(Target.TargetPosition);
            int count = CollectCandidates(Target);
            int index = TargetingMath.SelectSwitch(currentBearing, _bearings, count, direction);
            Combatant chosen = index >= 0 ? _candidates[index] : null;
            ClearCandidates(count);
            if (chosen == null)
            {
                return false;
            }

            SetTarget(chosen);
            return true;
        }

        /// <summary>Releases the lock.</summary>
        public void Release()
        {
            SetTarget(null);
        }

        /// <summary>Locks a given target (tools, scripted sequences); ignored if it cannot be targeted.</summary>
        /// <param name="target">Target.</param>
        /// <returns>True if it is locked afterwards.</returns>
        public bool Lock(Combatant target)
        {
            if (target == null || !target.IsTargetable || target == self)
            {
                return false;
            }

            SetTarget(target);
            return true;
        }

        private void Awake()
        {
            if (self == null)
            {
                TryGetComponent(out self);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _service);
                if (locator.TryGet(out IInputService input))
                {
                    _gameplay = input.Gameplay;
                }

                if (_service == null)
                {
                    Log.Warning(LogCategory.Player, "PlayerLockOn: no ICombatService registered (CombatInstaller missing in the BootConfig), lock-on is off.");
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerLockOn could not resolve its services.");
            }
        }

        private void OnDisable()
        {
            SetTarget(null);
        }

        private void Update()
        {
            float deltaTime = Time.deltaTime;
            if (_switchCooldown > 0f)
            {
                _switchCooldown -= deltaTime;
            }

            if (Target != null)
            {
                ValidateTarget(deltaTime);
            }

            if (_gameplay == null || !_gameplay.IsActive || _service == null || self == null || !self.IsAlive)
            {
                if (self != null && !self.IsAlive && Target != null)
                {
                    SetTarget(null);
                }

                return;
            }

            if (_gameplay.WasPressedThisFrame(GameplayButton.LockOn))
            {
                Toggle();
            }

            if (Target != null)
            {
                ReadSwitchInput(deltaTime);
            }
        }

        private void ReadSwitchInput(float deltaTime)
        {
            float wheel = _gameplay.SwitchTarget;
            if (wheel != 0f && _switchCooldown <= 0f)
            {
                // Wheel up = to the right (Vorschlag); only the sign counts.
                Switch(wheel > 0f ? 1f : -1f);
                _switchCooldown = 0.15f;
                return;
            }

            Vector2 look = _gameplay.Look;
            if (_gameplay.LookIsPointerDelta)
            {
                _mouseWindow += deltaTime;
                _mouseSum += look.x;
                if (_mouseWindow > 0.2f)
                {
                    _mouseWindow = 0f;
                    _mouseSum = 0f;
                }

                if (Mathf.Abs(_mouseSum) >= mouseFlickPixels && _switchCooldown <= 0f)
                {
                    Switch(_mouseSum);
                    _mouseSum = 0f;
                    _mouseWindow = 0f;
                    _switchCooldown = 0.35f;
                }

                return;
            }

            float x = look.x;
            if (_stickArmed && Mathf.Abs(x) >= stickFlickThreshold)
            {
                _stickArmed = false;
                Switch(x);
            }
            else if (Mathf.Abs(x) < 0.3f)
            {
                _stickArmed = true;
            }
        }

        private void ValidateTarget(float deltaTime)
        {
            Combatant target = Target;
            if (!target.IsTargetable)
            {
                SetTarget(null);
                if (nextTargetOnDeath && !target.IsAlive)
                {
                    TryAcquireNearest();
                }

                return;
            }

            Vector3 from = self != null ? self.TargetPosition : transform.position + Vector3.up;
            Vector3 to = target.TargetPosition;
            if ((to - from).sqrMagnitude > releaseDistance * releaseDistance)
            {
                SetTarget(null);
                return;
            }

            bool blocked = Physics.Linecast(from, to, sightBlockers, QueryTriggerInteraction.Ignore);
            _noSightTime = blocked ? _noSightTime + deltaTime : 0f;
            if (_noSightTime >= lostSightSeconds)
            {
                SetTarget(null);
            }
        }

        private void TryAcquireNearest()
        {
            // After a kill: the next target in range regardless of the camera cone (360°), nearest first.
            int count = CollectCandidates(null);
            int best = TargetingMath.SelectBest(_bearings, _distances, count, 180f, range);
            Combatant chosen = best >= 0 ? _candidates[best] : null;
            ClearCandidates(count);
            if (chosen != null)
            {
                SetTarget(chosen);
            }
        }

        private int CollectCandidates(Combatant skip)
        {
            if (_service == null || self == null)
            {
                return 0;
            }

            Vector3 origin = transform.position;
            int count = 0;
            var combatants = _service.Combatants;
            for (int i = 0; i < combatants.Count && count < MaxCandidates; i++)
            {
                Combatant candidate = combatants[i];
                if (candidate == null || candidate == self || candidate == skip || !candidate.IsTargetable ||
                    !CombatTeams.IsHostileOrNeutral(self.Team, candidate.Team))
                {
                    continue;
                }

                Vector3 point = candidate.TargetPosition;
                _candidates[count] = candidate;
                _bearings[count] = BearingFromCamera(point);
                _distances[count] = CombatMath.PlanarDistance(origin.x, origin.z, point.x, point.z);
                count++;
            }

            return count;
        }

        private void ClearCandidates(int count)
        {
            for (int i = 0; i < count; i++)
            {
                _candidates[i] = null;
            }
        }

        private float BearingFromCamera(Vector3 point)
        {
            Vector3 origin = transform.position;
            float yaw = cameraTransform != null ? cameraTransform.eulerAngles.y : transform.eulerAngles.y;
            return CombatMath.BearingTo(origin.x, origin.z, yaw, point.x, point.z);
        }

        private void SetTarget(Combatant target)
        {
            if (Target == target)
            {
                return;
            }

            Target = target;
            _noSightTime = 0f;
            Action<Combatant> changed = TargetChanged;
            if (changed != null)
            {
                changed(target);
            }
        }
    }
}
