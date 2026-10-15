using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Shows the running status effects of a fighter (GDD 03 7.2): flames around the body while burning, circling sparks above
    /// the head while stunned or frozen. Pure presentation: reads <see cref="Combatant.Status"/> every frame and only switches
    /// the emission of its particle systems when something changes.
    /// </summary>
    /// <remarks>GameObject: the fighter root; the particle systems are children built by the generators
    /// (<c>StatusVisualsBuilder</c>). TODO (VFX step): own effects for poison, frost, shock and the corruption glow.</remarks>
    [DisallowMultipleComponent]
    public sealed class StatusEffectVisuals : MonoBehaviour
    {
        [Tooltip("Kampf-Wurzel der Figur. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Flammen am Körper (läuft, solange die Figur brennt).")]
        [SerializeField] private ParticleSystem burning = null;

        [Tooltip("Licht der Flammen (optional).")]
        [SerializeField] private Light burningLight = null;

        [Tooltip("Kreisende Funken über dem Kopf (betäubt oder eingefroren).")]
        [SerializeField] private ParticleSystem stunned = null;

        private bool _burningShown;
        private bool _stunnedShown;

        private void Awake()
        {
            if (combatant == null)
            {
                TryGetComponent(out combatant);
            }

            Show(burning, false);
            Show(stunned, false);
            if (burningLight != null)
            {
                burningLight.enabled = false;
            }
        }

        private void LateUpdate()
        {
            StatusEffectController status = combatant != null && combatant.IsAlive ? combatant.Status : null;
            bool burn = status != null && status.IsBurning;
            bool stun = status != null && (status.IsStunned || status.IsFrozen);
            if (burn != _burningShown)
            {
                _burningShown = burn;
                Show(burning, burn);
                if (burningLight != null)
                {
                    burningLight.enabled = burn;
                }
            }

            if (stun != _stunnedShown)
            {
                _stunnedShown = stun;
                Show(stunned, stun);
            }
        }

        private static void Show(ParticleSystem system, bool on)
        {
            if (system == null)
            {
                return;
            }

            if (on)
            {
                system.Play(true);
            }
            else
            {
                system.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            }
        }
    }
}
