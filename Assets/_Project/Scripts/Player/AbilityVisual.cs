using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// The look of one ability of the <see cref="PlayerAbilityCaster"/> (GDD 03 6.4, GDD 05): a burst at the caster (cone, nova,
    /// buff), sparks at every hit point (explosion, chain, strikes), a short light flash, a zigzag beam (lightning), a lasting
    /// object (burning ground, buff aura) and, for projectiles, the launcher with its own projectile template.
    /// </summary>
    /// <remarks>
    /// GameObject: a child of the player, built by the generator (menu "Testgelände/Eichental/Gruft erstellen"). Every part is
    /// optional. The impact particles simulate in world space and are emitted where the hits are, so one system serves many
    /// points in the same frame.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class AbilityVisual : MonoBehaviour
    {
        private const float FlashSeconds = 0.35f;
        private const int BeamPointsPerSegment = 9;

        [Tooltip("Partikel an der Figur beim Wirken (zeigen entlang +Z, werden zur Blickrichtung gedreht).")]
        [SerializeField] private ParticleSystem castEffect = null;

        [Tooltip("Partikel an jedem Trefferpunkt (Weltraum-Simulation; Explosion, Kette, Einschlag).")]
        [SerializeField] private ParticleSystem impactEffect = null;

        [Tooltip("So viele Partikel je Trefferpunkt.")]
        [Range(1, 200)] [SerializeField] private int impactParticles = 40;

        [Tooltip("Kurzer Lichtblitz (an der Figur oder am Trefferpunkt).")]
        [SerializeField] private Light flash = null;

        [Tooltip("Zickzack-Linie (Blitz) zwischen den Punkten der Kette oder vom Himmel zum Einschlag.")]
        [SerializeField] private LineRenderer beam = null;

        [Tooltip("Sekunden, die die Linie zu sehen ist.")]
        [Range(0.05f, 1f)] [SerializeField] private float beamSeconds = 0.25f;

        [Tooltip("Bleibendes Objekt: brennender Boden (wird an die Fläche gesetzt) oder Aura (bleibt an der Figur).")]
        [SerializeField] private GameObject lasting = null;

        [Tooltip("Geschoss-Werfer dieser Fähigkeit (nur für Geschosse; eigene Vorlage).")]
        [SerializeField] private ProjectileLauncher launcher = null;

        private Vector3[] _beamPoints = new Vector3[0];
        private float _flashTimer;
        private float _flashIntensity;
        private float _beamTimer;
        private bool _anchored;
        private Vector3 _anchor;
        private Quaternion _castTilt = Quaternion.identity;

        /// <summary>Launcher for projectiles (null for other kinds).</summary>
        public ProjectileLauncher Launcher => launcher;

        /// <summary>True while the beam is shown (tests, tours).</summary>
        public bool BeamVisible => beam != null && beam.enabled;

        /// <summary>True while the lasting object is shown.</summary>
        public bool LastingVisible => lasting != null && lasting.activeSelf;

        /// <summary>Plays the burst at the caster, turned to <paramref name="yaw"/>, and the flash there.</summary>
        /// <param name="yaw">Facing in degrees.</param>
        public void PlayCast(float yaw)
        {
            if (castEffect != null)
            {
                // Turned to the facing, keeping its own tilt (the frost ring lies flat on the ground).
                castEffect.transform.rotation = Quaternion.Euler(0f, yaw, 0f) * _castTilt;
                castEffect.Play(true);
            }

            Flash(null);
        }

        /// <summary>Sparks (and the flash) at a hit point.</summary>
        /// <param name="point">World position.</param>
        public void PlayImpact(Vector3 point)
        {
            if (impactEffect != null)
            {
                impactEffect.transform.position = point;
                impactEffect.Emit(impactParticles);
            }

            Flash(point);
        }

        /// <summary>Shows the zigzag beam through the points for a moment (chain: muzzle → targets; strike: sky → ground).</summary>
        /// <param name="points">Points in order.</param>
        /// <param name="count">Number of points used.</param>
        public void ShowBeam(Vector3[] points, int count)
        {
            if (beam == null || points == null || count < 2)
            {
                return;
            }

            int total = (count - 1) * BeamPointsPerSegment + 1;
            if (_beamPoints.Length < total)
            {
                _beamPoints = new Vector3[total];
            }

            int n = 0;
            for (int i = 0; i < count - 1; i++)
            {
                Vector3 a = points[i];
                Vector3 b = points[i + 1];
                float jitter = Mathf.Min(1.1f, Vector3.Distance(a, b) * 0.1f);
                for (int k = 0; k < BeamPointsPerSegment; k++)
                {
                    float t = k / (float)BeamPointsPerSegment;
                    Vector3 p = Vector3.Lerp(a, b, t);
                    if (k > 0)
                    {
                        p += Random.insideUnitSphere * jitter;
                    }

                    _beamPoints[n++] = p;
                }
            }

            _beamPoints[n++] = points[count - 1];
            beam.positionCount = n;
            beam.SetPositions(_beamPoints);
            beam.enabled = true;
            _beamTimer = beamSeconds;
        }

        /// <summary>Shows the lasting object: at a world point (burning ground) or on the caster (aura).</summary>
        /// <param name="atPoint">True: stays at <paramref name="point"/>; false: follows the caster.</param>
        /// <param name="point">World position for <paramref name="atPoint"/>.</param>
        public void ShowLasting(bool atPoint, Vector3 point)
        {
            if (lasting == null)
            {
                return;
            }

            _anchored = atPoint;
            _anchor = point;
            if (atPoint)
            {
                lasting.transform.position = point;
            }
            else
            {
                lasting.transform.localPosition = Vector3.zero;
            }

            lasting.SetActive(true);
        }

        /// <summary>Hides the lasting object.</summary>
        public void HideLasting()
        {
            if (lasting != null)
            {
                lasting.SetActive(false);
            }

            _anchored = false;
        }

        private void Awake()
        {
            _castTilt = castEffect != null ? castEffect.transform.localRotation : Quaternion.identity;
            _flashIntensity = flash != null ? flash.intensity : 0f;
            if (flash != null)
            {
                flash.enabled = false;
            }

            if (beam != null)
            {
                beam.enabled = false;
            }

            if (lasting != null)
            {
                lasting.SetActive(false);
            }
        }

        private void LateUpdate()
        {
            float deltaTime = Time.deltaTime;
            if (_anchored && lasting != null)
            {
                // The player moves; burning ground stays where it was cast.
                lasting.transform.SetPositionAndRotation(_anchor, Quaternion.identity);
            }

            if (_beamTimer > 0f)
            {
                _beamTimer -= deltaTime;
                if (_beamTimer <= 0f && beam != null)
                {
                    beam.enabled = false;
                }
            }

            if (flash != null && _flashTimer > 0f)
            {
                _flashTimer -= deltaTime;
                flash.intensity = _flashIntensity * Mathf.Clamp01(_flashTimer / FlashSeconds);
                if (_flashTimer <= 0f)
                {
                    flash.enabled = false;
                }
            }
        }

        private void Flash(Vector3? point)
        {
            if (flash == null)
            {
                return;
            }

            if (point.HasValue)
            {
                flash.transform.position = point.Value + Vector3.up * 1.2f;
            }
            else
            {
                flash.transform.localPosition = new Vector3(0f, 1.3f, 1.2f);
            }

            flash.enabled = true;
            flash.intensity = _flashIntensity;
            _flashTimer = FlashSeconds;
        }
    }
}
