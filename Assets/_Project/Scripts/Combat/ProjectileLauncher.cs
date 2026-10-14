using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Fires the projectiles of one fighter (staff bolts, later arrows): a small pool of copies of the template, launched from
    /// the muzzle (staff tip) towards a point or along a direction. The copies live in the fighter's scene, not under the fighter,
    /// so they fly on in world space when he turns (architecture 11.5: projectiles are pooled).
    /// </summary>
    /// <remarks>GameObject: the fighter root; the template is an inactive child with <see cref="Projectile"/>.</remarks>
    [DisallowMultipleComponent]
    public sealed class ProjectileLauncher : MonoBehaviour
    {
        [Tooltip("Vorlage des Geschosses (inaktives Kind mit Projectile).")]
        [SerializeField] private Projectile template = null;

        [Tooltip("Abschusspunkt (Spitze des Zauberstabs). Leer = vor der Brust.")]
        [SerializeField] private Transform muzzle = null;

        [Tooltip("Layer der Trefferzonen (Hurtbox).")]
        [SerializeField] private LayerMask hurtboxLayers = 1 << 9;

        [Tooltip("Boden und Wände: hier schlägt das Geschoss ein.")]
        [SerializeField] private LayerMask solidLayers = 1 << 11;

        [Tooltip("So viele Geschosse können gleichzeitig fliegen.")]
        [Range(1, 32)] [SerializeField] private int poolSize = 8;

        private readonly Stack<Projectile> _free = new Stack<Projectile>();
        private bool _built;

        /// <summary>Projectiles fired so far (tests, tools).</summary>
        public int FiredCount { get; private set; }

        /// <summary>The projectile fired last, or null.</summary>
        public Projectile LastFired { get; private set; }

        /// <summary>Launch point: the muzzle, or in front of the chest.</summary>
        public Vector3 MuzzlePosition => muzzle != null ? muzzle.position : transform.position + Vector3.up * 1.4f + transform.forward * 0.6f;

        /// <summary>Fires towards a point (with gravity aimed a little higher so it arrives there).</summary>
        /// <param name="owner">Attacker.</param>
        /// <param name="attack">Attack with projectile values.</param>
        /// <param name="profile">Damage profile.</param>
        /// <param name="target">Aimed point.</param>
        /// <returns>False if the pool is empty or the attack is no projectile.</returns>
        public bool FireAt(Combatant owner, AttackSpec attack, in AttackProfile profile, Vector3 target)
        {
            if (attack == null)
            {
                return false;
            }

            Vector3 origin = MuzzlePosition;
            return FireAlong(owner, attack, profile, ProjectileFlight.AimDirection(origin, target, attack.ProjectileSpeed, attack.ProjectileGravity));
        }

        /// <summary>Fires along a direction.</summary>
        /// <param name="owner">Attacker.</param>
        /// <param name="attack">Attack with projectile values.</param>
        /// <param name="profile">Damage profile.</param>
        /// <param name="direction">Flight direction.</param>
        /// <returns>False if the pool is empty or the attack is no projectile.</returns>
        public bool FireAlong(Combatant owner, AttackSpec attack, in AttackProfile profile, Vector3 direction)
        {
            if (attack == null || !attack.IsProjectile || template == null)
            {
                return false;
            }

            BuildPool();
            if (_free.Count == 0)
            {
                return false;
            }

            Projectile projectile = _free.Pop();
            projectile.Launch(owner, attack, profile, MuzzlePosition, direction, hurtboxLayers, solidLayers, Release);
            LastFired = projectile;
            FiredCount++;
            return true;
        }

        private void Awake()
        {
            if (template != null)
            {
                template.gameObject.SetActive(false);
            }
        }

        private void OnDestroy()
        {
            foreach (Projectile projectile in _free)
            {
                if (projectile != null)
                {
                    Destroy(projectile.gameObject);
                }
            }

            _free.Clear();
        }

        private void BuildPool()
        {
            if (_built)
            {
                return;
            }

            _built = true;
            for (int i = 0; i < poolSize; i++)
            {
                Projectile copy = Instantiate(template);
                copy.name = template.name + " " + (i + 1);
                copy.gameObject.SetActive(false);
                SceneManager.MoveGameObjectToScene(copy.gameObject, gameObject.scene);
                _free.Push(copy);
            }
        }

        private void Release(Projectile projectile)
        {
            if (projectile != null)
            {
                _free.Push(projectile);
            }
        }
    }
}
