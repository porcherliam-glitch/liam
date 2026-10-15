using System;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// One flying projectile (staff bolt, later arrows; GDD 03 6.1, 6.3): flies along its <see cref="ProjectileFlight"/>, sweeps
    /// every step with a sphere against hurtboxes and solid ground and walls, hits the first combatant its owner can damage
    /// (hit zone of the hurtbox: head ×1.75 for projectiles) or stops at a wall, plays its impact and goes back to the pool.
    /// </summary>
    /// <remarks>GameObject: a pooled copy of the template under the <see cref="ProjectileLauncher"/> (visual, light, trail).</remarks>
    [DisallowMultipleComponent]
    public sealed class Projectile : MonoBehaviour
    {
        private const int MaxHits = 16;
        private const float ImpactSeconds = 0.35f;

        [Tooltip("Sichtbarer Körper des Geschosses (wird beim Einschlag ausgeblendet).")]
        [SerializeField] private GameObject body = null;

        [Tooltip("Spur hinter dem Geschoss (optional).")]
        [SerializeField] private TrailRenderer trail = null;

        [Tooltip("Licht des Geschosses (optional).")]
        [SerializeField] private Light glow = null;

        [Tooltip("Partikel beim Einschlag (optional).")]
        [SerializeField] private ParticleSystem impact = null;

        private readonly RaycastHit[] _hits = new RaycastHit[MaxHits];
        private readonly System.Collections.Generic.List<Combatant> _struck = new System.Collections.Generic.List<Combatant>(4);
        private ProjectileFlight _flight;
        private Combatant _owner;
        private AttackSpec _attack;
        private AttackProfile _profile;
        private LayerMask _mask;
        private int _hurtboxLayers;
        private Action<Projectile> _release;
        private float _impactTimer;

        /// <summary>True while it flies.</summary>
        public bool IsFlying => _flight != null && _impactTimer <= 0f;

        /// <summary>The combatant it hit last (null if it hit a wall or nothing; a piercing projectile: the last of its targets).</summary>
        public Combatant LastHit { get; private set; }

        /// <summary>The attack it carries (null before the first launch).</summary>
        public AttackSpec Attack => _attack;

        /// <summary>Where it stopped last (a hit, a wall, or the end of its range).</summary>
        public Vector3 LastImpactPoint { get; private set; }

        /// <summary>Raised when it stops: hit its last combatant (<see cref="LastHit"/>), a wall, or reached its range.</summary>

        /// <summary>Combatants hit during the current flight (a piercing projectile hits several).</summary>
        public int StruckCount => _struck.Count;
        public event Action<Projectile> Impacted;

        /// <summary>Starts the flight.</summary>
        /// <param name="owner">Attacker.</param>
        /// <param name="attack">Attack with the projectile values.</param>
        /// <param name="profile">Damage profile of the attacker.</param>
        /// <param name="origin">Launch point.</param>
        /// <param name="direction">Flight direction.</param>
        /// <param name="hurtboxLayers">Layers of the hurtboxes.</param>
        /// <param name="solidLayers">Ground and walls.</param>
        /// <param name="release">Called when the projectile is done (back to the pool).</param>
        public void Launch(Combatant owner, AttackSpec attack, in AttackProfile profile, Vector3 origin, Vector3 direction, LayerMask hurtboxLayers,
            LayerMask solidLayers, Action<Projectile> release)
        {
            _owner = owner;
            _attack = attack;
            _profile = profile;
            _hurtboxLayers = hurtboxLayers;
            _mask = hurtboxLayers | solidLayers;
            _release = release;
            _impactTimer = 0f;
            LastHit = null;
            _struck.Clear();
            _flight = new ProjectileFlight(origin, direction, attack.ProjectileSpeed, attack.ProjectileGravity, attack.ProjectileRange);
            transform.SetPositionAndRotation(origin, Quaternion.LookRotation(_flight.Velocity.sqrMagnitude > 0f ? _flight.Velocity : Vector3.forward));
            gameObject.SetActive(true);
            if (body != null)
            {
                body.SetActive(true);
            }

            if (glow != null)
            {
                glow.enabled = true;
            }

            if (trail != null)
            {
                trail.Clear();
                trail.emitting = true;
            }
        }

        private void Update()
        {
            if (_flight == null)
            {
                return;
            }

            float deltaTime = Time.deltaTime;
            if (_impactTimer > 0f)
            {
                _impactTimer -= deltaTime;
                if (_impactTimer <= 0f)
                {
                    Finish();
                }

                return;
            }

            Vector3 to = _flight.Step(deltaTime, out Vector3 from);
            if (Sweep(from, to))
            {
                return;
            }

            transform.position = to;
            if (_flight.Velocity.sqrMagnitude > 0f)
            {
                transform.rotation = Quaternion.LookRotation(_flight.Velocity);
            }

            if (_flight.Expired)
            {
                Impact(to);
            }
        }

        private bool Sweep(Vector3 from, Vector3 to)
        {
            // A piercing projectile (ProjectileMaxTargets above 1) flies on through its first targets: the sweep goes on from the
            // hit point and skips everyone already struck.
            Vector3 start = from;
            int maxTargets = Math.Max(1, _attack.ProjectileMaxTargets);
            for (int pass = 0; pass <= maxTargets; pass++)
            {
                Vector3 path = to - start;
                float length = path.magnitude;
                if (length < 1e-5f)
                {
                    return false;
                }

                int count = Physics.SphereCastNonAlloc(start, _attack.ProjectileRadius, path / length, _hits, length, _mask, QueryTriggerInteraction.Collide);
                float best = float.MaxValue;
                int bestIndex = -1;
                Hurtbox bestZone = null;
                for (int i = 0; i < count; i++)
                {
                    RaycastHit candidate = _hits[i];
                    if (candidate.distance >= best || candidate.collider == null)
                    {
                        continue;
                    }

                    bool hurtboxLayer = (_hurtboxLayers & (1 << candidate.collider.gameObject.layer)) != 0;
                    if (hurtboxLayer)
                    {
                        if (!candidate.collider.TryGetComponent(out Hurtbox zone) || zone.Owner == null || zone.Owner == _owner || !zone.Owner.IsAlive ||
                            _owner == null || !CombatTeams.CanDamage(_owner.Team, zone.Owner.Team) || _struck.Contains(zone.Owner))
                        {
                            continue;
                        }

                        best = candidate.distance;
                        bestIndex = i;
                        bestZone = zone;
                    }
                    else if (!candidate.collider.isTrigger)
                    {
                        best = candidate.distance;
                        bestIndex = i;
                        bestZone = null;
                    }
                }

                if (bestIndex < 0)
                {
                    return false;
                }

                RaycastHit hit = _hits[bestIndex];
                Vector3 point = hit.point == Vector3.zero && hit.distance <= 0f ? start : hit.point;
                if (bestZone != null)
                {
                    Combatant target = bestZone.Owner;
                    LastHit = target;
                    _struck.Add(target);
                    var incoming = new IncomingHit
                    {
                        Attacker = _owner,
                        Attack = _attack,
                        Profile = _profile,
                        Zone = bestZone.Zone,
                        Point = point,
                        // Block angle and knockback come from where the projectile flew in.
                        AttackerPosition = from - (to - from).normalized * 2f
                    };
                    target.ReceiveHit(incoming);
                    if (_struck.Count < maxTargets)
                    {
                        start = point;
                        continue;
                    }
                }

                Impact(point);
                return true;
            }

            return false;
        }

        private void Impact(Vector3 point)
        {
            transform.position = point;
            _impactTimer = ImpactSeconds;
            if (body != null)
            {
                body.SetActive(false);
            }

            if (glow != null)
            {
                glow.enabled = false;
            }

            if (trail != null)
            {
                trail.emitting = false;
            }

            if (impact != null)
            {
                impact.Play(true);
            }

            LastImpactPoint = point;
            Action<Projectile> impacted = Impacted;
            if (impacted != null)
            {
                impacted(this);
            }
        }

        private void Finish()
        {
            _flight = null;
            gameObject.SetActive(false);
            _release?.Invoke(this);
        }
    }
}
