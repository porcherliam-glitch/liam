using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Hit detection of one fighter (architecture 11.4 "Keine Physik-Trigger"): while the hit window of an attack is open
    /// (<see cref="IHitWindowReceiver"/>, called by the <see cref="AttackRunner"/> today and by Animation Events later) it
    /// queries the attack's box or sphere every frame with <c>Physics.OverlapBoxNonAlloc</c>/<c>OverlapSphereNonAlloc</c>
    /// on the hurtbox layer, hits every target at most once per swing (<see cref="HitRegistry"/>), never its own side or
    /// itself, and picks the zone nearest to the swing centre if several hurtboxes of one target are touched
    /// (<see cref="Hurtbox.IsBetterZone"/>).
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the fighter root (or a child); <c>origin</c> defines the attack space (x right, y up, z forward).
    /// Runs after the brains in the frame (execution order 50). The attacker gets the hitstop once per swing (GDD 03 4.11).</para>
    /// <para>TODO (animation step): sweep between the old and new pose (CapsuleCastNonAlloc) once weapons move with bones.</para>
    /// </remarks>
    [DefaultExecutionOrder(50)]
    [DisallowMultipleComponent]
    public sealed class Hitbox : MonoBehaviour, IHitWindowReceiver
    {
        private const int MaxTargetsPerQuery = 8;

        [Tooltip("Die angreifende Figur. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant owner = null;

        [Tooltip("Bezugspunkt der Hitbox-Werte (Position und Drehung). Leer = dieses GameObject.")]
        [SerializeField] private Transform origin = null;

        [Tooltip("Layer der Trefferzonen (Architektur 2.8: Hurtbox = 9).")]
        [SerializeField] private LayerMask hurtboxLayers = 1 << 9;

        [Tooltip("Größe des Treffer-Puffers (gleichzeitig berührte Collider). 24 reicht für Gruppen.")]
        [Range(4, 64)] [SerializeField] private int bufferSize = 24;

        [Tooltip("Aktive Hitbox im Scene-Fenster als rotes Drahtgitter zeigen.")]
        [SerializeField] private bool drawGizmos = true;

        private readonly HitRegistry _registry = new HitRegistry();
        private readonly Combatant[] _candidates = new Combatant[MaxTargetsPerQuery];
        private readonly Hurtbox[] _candidateZones = new Hurtbox[MaxTargetsPerQuery];
        private readonly float[] _candidateDistances = new float[MaxTargetsPerQuery];
        private Collider[] _buffer;
        private AttackSpec _attack;
        private AttackProfile _profile;
        private bool _open;
        private bool _attackerStopped;

        /// <summary>True while a hit window is open.</summary>
        public bool IsOpen => _open;

        /// <summary>The attack of the open hit window, or null.</summary>
        public AttackSpec CurrentAttack => _open ? _attack : null;

        /// <summary>Targets hit in the current or last swing.</summary>
        public int HitCount => _registry.HitCount;

        /// <inheritdoc />
        public void OpenHitWindow(AttackSpec attack)
        {
            if (attack == null || owner == null)
            {
                return;
            }

            _attack = attack;
            ICombatantController controller = owner.Controller;
            _profile = controller != null ? controller.GetAttackProfile(attack) : default;
            _registry.BeginSwing(owner, owner.Team);
            _attackerStopped = false;
            _open = true;
            Sweep();
        }

        /// <inheritdoc />
        public void CloseHitWindow()
        {
            _open = false;
            _registry.EndSwing();
        }

        private void Awake()
        {
            if (owner == null && !TryGetComponent(out owner))
            {
                Log.Error(LogCategory.Combat, "Hitbox '" + name + "' finds no Combatant; it cannot hit anything.");
                enabled = false;
                return;
            }

            if (origin == null)
            {
                origin = transform;
            }

            _buffer = new Collider[Mathf.Max(4, bufferSize)];
        }

        private void Update()
        {
            if (_open)
            {
                Sweep();
            }
        }

        private void Sweep()
        {
            if (_buffer == null || _attack == null)
            {
                return;
            }

            Vector3 center = origin.TransformPoint(new Vector3(_attack.OffsetX, _attack.OffsetY, _attack.OffsetZ));
            int count = _attack.Shape == HitboxShape.Sphere
                ? Physics.OverlapSphereNonAlloc(center, _attack.Radius, _buffer, hurtboxLayers, QueryTriggerInteraction.Collide)
                : Physics.OverlapBoxNonAlloc(center, new Vector3(_attack.SizeX, _attack.SizeY, _attack.SizeZ) * 0.5f, _buffer, origin.rotation,
                    hurtboxLayers, QueryTriggerInteraction.Collide);

            int candidates = CollectCandidates(count, center);
            for (int i = 0; i < candidates; i++)
            {
                Combatant target = _candidates[i];
                Hurtbox zone = _candidateZones[i];
                _candidates[i] = null;
                _candidateZones[i] = null;
                if (!_open || !_registry.TryRegister(target, target.Team))
                {
                    continue;
                }

                var hit = new IncomingHit
                {
                    Attacker = owner,
                    Attack = _attack,
                    Profile = _profile,
                    Zone = zone.Zone,
                    Point = zone.transform.position,
                    AttackerPosition = owner.transform.position
                };
                HitReport report = target.ReceiveHit(hit);
                if (!_attackerStopped && report.Defense != DefenseOutcome.Evaded && report.Defense != DefenseOutcome.Ignored)
                {
                    // GDD 03 4.11: hitstop at most once per swing for the attacker, also with several targets.
                    _attackerStopped = true;
                    owner.HitStop.Request(report.HitStopSeconds);
                }
            }

            for (int i = 0; i < count; i++)
            {
                _buffer[i] = null;
            }
        }

        private int CollectCandidates(int count, Vector3 center)
        {
            int candidates = 0;
            for (int i = 0; i < count; i++)
            {
                Collider touched = _buffer[i];
                if (touched == null || !touched.TryGetComponent(out Hurtbox hurtbox))
                {
                    continue;
                }

                Combatant target = hurtbox.Owner;
                if (target == null || target == owner || !target.IsAlive || _registry.WasHit(target) ||
                    !CombatTeams.CanDamage(owner.Team, target.Team))
                {
                    continue;
                }

                int existing = -1;
                for (int c = 0; c < candidates; c++)
                {
                    if (_candidates[c] == target)
                    {
                        existing = c;
                        break;
                    }
                }

                // The zone nearest to the centre of the swing counts (ties: weak point > head > body).
                float distance = Vector3.Distance(center, hurtbox.transform.position);
                if (existing >= 0)
                {
                    if (Hurtbox.IsBetterZone(distance, hurtbox.Zone, _candidateDistances[existing], _candidateZones[existing].Zone))
                    {
                        _candidateZones[existing] = hurtbox;
                        _candidateDistances[existing] = distance;
                    }
                }
                else if (candidates < MaxTargetsPerQuery)
                {
                    _candidates[candidates] = target;
                    _candidateZones[candidates] = hurtbox;
                    _candidateDistances[candidates] = distance;
                    candidates++;
                }
            }

            return candidates;
        }

        private void OnDrawGizmos()
        {
            if (!drawGizmos || !_open || _attack == null)
            {
                return;
            }

            Transform space = origin != null ? origin : transform;
            Gizmos.color = new Color(1f, 0.2f, 0.2f, 0.9f);
            Gizmos.matrix = Matrix4x4.TRS(space.position, space.rotation, Vector3.one);
            var center = new Vector3(_attack.OffsetX, _attack.OffsetY, _attack.OffsetZ);
            if (_attack.Shape == HitboxShape.Sphere)
            {
                Gizmos.DrawWireSphere(center, _attack.Radius);
            }
            else
            {
                Gizmos.DrawWireCube(center, new Vector3(_attack.SizeX, _attack.SizeY, _attack.SizeZ));
            }

            Gizmos.matrix = Matrix4x4.identity;
        }
    }
}
