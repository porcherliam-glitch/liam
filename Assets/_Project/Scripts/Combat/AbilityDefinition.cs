using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// An active ability as data (architecture 11.5, GDD 03 6.5): id, name, mana cost, cooldown, cast times and the cone it
    /// hits. Lives in <c>Assets/_Project/Data/Combat/Abilities/</c>; the first one is the Aether-Stoß
    /// (<c>ability.aether.aether_stoss</c>, slot 4 of the first bar).
    /// </summary>
    /// <remarks>
    /// Without animations the cast is a time line (wind-up → effect → recovery) like <see cref="AttackDefinition"/>. The id
    /// counts as existing content for the quest check (objective "Fähigkeit einsetzen").
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Kampf/Fähigkeit", fileName = "Ability", order = 12)]
    public sealed class AbilityDefinition : ScriptableObject, IContentIdProvider
    {
        [Tooltip("ID der Fähigkeit, z. B. ability.aether.aether_stoss (Quest-Ziel „Fähigkeit einsetzen“).")]
        [SerializeField] private string abilityId = "ability.neu";

        [Tooltip("Name im HUD.")]
        [SerializeField] private string displayName = "Neue Fähigkeit";

        [Header("Kosten und Zeiten")]
        [Tooltip("Mana-Kosten (Aether-Stoß: 15).")]
        [Min(0f)] [SerializeField] private float manaCost = 15f;

        [Tooltip("Abklingzeit in Sekunden (Aether-Stoß: 8).")]
        [Min(0f)] [SerializeField] private float cooldownSeconds = 8f;

        [Tooltip("Ausholen bis zur Wirkung in Sekunden.")]
        [Min(0f)] [SerializeField] private float windupSeconds = 0.25f;

        [Tooltip("Erholung nach der Wirkung in Sekunden.")]
        [Min(0f)] [SerializeField] private float recoverySeconds = 0.35f;

        [Header("Wirkung (Kegel vor der Figur)")]
        [Tooltip("Reichweite in Metern (Aether-Stoß: 6).")]
        [Min(0.5f)] [SerializeField] private float range = 6f;

        [Tooltip("Öffnungswinkel in Grad (Aether-Stoß: 90).")]
        [Range(10f, 360f)] [SerializeField] private float coneAngle = 90f;

        [Tooltip("Schaden als Vielfaches des Bezugswerts max(Waffenschaden, Zauberkraft) (Aether-Stoß: 1,2 = 120 %).")]
        [Min(0f)] [SerializeField] private float damageMultiplier = 1.2f;

        [Tooltip("Anteil Aether-Schaden, der Rest ist Wucht (Aether-Stoß: 0,5).")]
        [Range(0f, 1f)] [SerializeField] private float aetherShare = 0.5f;

        [Tooltip("Haltungsschaden (Aether-Stoß: 30).")]
        [Min(0f)] [SerializeField] private float poiseDamage = 30f;

        [Tooltip("Rückstoß in Metern (Aether-Stoß: 3).")]
        [Min(0f)] [SerializeField] private float knockbackDistance = 3f;

        [Tooltip("Verderbnis pro Einsatz (Aether-Stoß: 2; wirkt, sobald es die Verderbnis gibt).")]
        [Min(0f)] [SerializeField] private float corruption = 2f;

        /// <summary>Ability id.</summary>
        public string AbilityId => abilityId ?? string.Empty;

        /// <summary>Name for the HUD.</summary>
        public string DisplayName => displayName ?? string.Empty;

        /// <inheritdoc />
        public string ContentId => AbilityId;

        /// <summary>Builds the plain data.</summary>
        /// <param name="problem">Error text if a value is invalid.</param>
        /// <returns>The spec, or null if a value is invalid.</returns>
        public AbilitySpec CreateSpec(out string problem)
        {
            var spec = new AbilitySpec
            {
                Id = AbilityId,
                DisplayName = DisplayName,
                ManaCost = manaCost,
                CooldownSeconds = cooldownSeconds,
                WindupSeconds = windupSeconds,
                RecoverySeconds = recoverySeconds,
                Range = range,
                ConeAngle = coneAngle,
                DamageMultiplier = damageMultiplier,
                AetherShare = aetherShare,
                PoiseDamage = poiseDamage,
                KnockbackDistance = knockbackDistance,
                Corruption = corruption
            };
            problem = spec.Validate();
            return problem.Length == 0 ? spec : null;
        }
    }
}
