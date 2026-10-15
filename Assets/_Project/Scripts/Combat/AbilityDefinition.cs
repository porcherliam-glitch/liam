using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;
using UnityEngine.Serialization;

namespace Aetherfall.Combat
{
    /// <summary>
    /// An active ability as data (architecture 11.5, GDD 03 6.3–6.5): id, name, mana cost, cooldown, cast times, the way it takes
    /// effect (cone, projectile, chain, ground area, strikes, self-buff), its element and status build-up. Lives in
    /// <c>Assets/_Project/Data/Combat/Abilities/</c>: the Aether-Stoß (<c>ability.aether.aether_stoss</c>, slot 4 of the first
    /// bar) and the nine spells of the mage (fire, ice, lightning, GDD 03 6.4 and 11.5).
    /// </summary>
    /// <remarks>
    /// Without animations the cast is a time line (wind-up → effect → recovery) like <see cref="AttackDefinition"/>. The id
    /// counts as existing content for the quest check (objective "Fähigkeit einsetzen"). Only the fields of the chosen kind are
    /// used; the others keep their defaults.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Kampf/Fähigkeit", fileName = "Ability", order = 12)]
    public sealed class AbilityDefinition : ScriptableObject, IContentIdProvider
    {
        [Tooltip("ID der Fähigkeit, z. B. ability.aether.aether_stoss oder ability.feuer.feuerball (Quest-Ziel „Fähigkeit einsetzen“).")]
        [SerializeField] private string abilityId = "ability.neu";

        [Tooltip("Name im HUD.")]
        [SerializeField] private string displayName = "Neue Fähigkeit";

        [Tooltip("Wie die Fähigkeit wirkt: Kegel, Geschoss, Kette, Bodenfläche, Einschläge, Selbstverstärkung.")]
        [SerializeField] private AbilityKind kind = AbilityKind.Cone;

        [Header("Kosten und Zeiten")]
        [Tooltip("Mana-Kosten auf Stufe 1 (Aether-Stoß: 15); steigen je Stufe um 2 % (GDD 03, 6.3).")]
        [Min(0f)] [SerializeField] private float manaCost = 15f;

        [Tooltip("Abklingzeit in Sekunden (Aether-Stoß: 8).")]
        [Min(0f)] [SerializeField] private float cooldownSeconds = 8f;

        [Tooltip("Ausholen bis zur Wirkung in Sekunden (sofort ≤ 0,3, kurz 0,6, lang 1,2).")]
        [Min(0f)] [SerializeField] private float windupSeconds = 0.25f;

        [Tooltip("Erholung nach der Wirkung in Sekunden.")]
        [Min(0f)] [SerializeField] private float recoverySeconds = 0.35f;

        [Header("Wirkung")]
        [Tooltip("Reichweite in Metern: Kegel-Länge, Flugweite, Abstand zum ersten Kettenziel oder zur Fläche (Aether-Stoß: 6).")]
        [Min(0.5f)] [SerializeField] private float range = 6f;

        [Tooltip("Öffnungswinkel des Kegels in Grad (Aether-Stoß: 90, Frostnova: 360).")]
        [Range(10f, 360f)] [SerializeField] private float coneAngle = 90f;

        [Tooltip("Schaden als Vielfaches des Bezugswerts (Aether-Stoß: 1,2 = 120 %; Bodenfläche: je Takt).")]
        [Min(0f)] [SerializeField] private float damageMultiplier = 1.2f;

        [Tooltip("Element des Schadens (Aether-Stoß: Aether).")]
        [SerializeField] private DamageType element = DamageType.Aether;

        [Tooltip("Anteil des Element-Schadens, der Rest ist Wucht (Aether-Stoß: 0,5; Zauber: 1).")]
        [FormerlySerializedAs("aetherShare")]
        [Range(0f, 1f)] [SerializeField] private float elementShare = 0.5f;

        [Tooltip("An: Bezugswert = max(Waffenschaden, Zauberkraft) (Aether-Stoß). Aus: nur die Zauberkraft (Zauber).")]
        [SerializeField] private bool scalesWithWeapon = true;

        [Tooltip("Haltungsschaden (Aether-Stoß: 30).")]
        [Min(0f)] [SerializeField] private float poiseDamage = 30f;

        [Tooltip("Rückstoß in Metern (Aether-Stoß: 3).")]
        [Min(0f)] [SerializeField] private float knockbackDistance = 3f;

        [Tooltip("Verderbnis pro Einsatz (Aether-Stoß: 2; Element-Zauber: 0).")]
        [Min(0f)] [SerializeField] private float corruption = 2f;

        [Tooltip("Statuseffekt, den jeder Treffer aufbaut.")]
        [SerializeField] private StatusEffectId buildupEffect = StatusEffectId.Burning;

        [Tooltip("Statusaufbau je Treffer (Feuerball: Brennen 30, Eislanze: Frieren 35; 0 = keiner).")]
        [Min(0f)] [SerializeField] private float buildup = 0f;

        [Header("Geschoss")]
        [Tooltip("Fluggeschwindigkeit in m/s.")]
        [Min(0.1f)] [SerializeField] private float projectileSpeed = 24f;

        [Tooltip("Radius des Geschosses in Metern.")]
        [Min(0.05f)] [SerializeField] private float projectileRadius = 0.3f;

        [Tooltip("So viele Gegner trifft das Geschoss, bevor es stoppt (Eislanze: 2 = durchbohrt den ersten).")]
        [Min(1)] [SerializeField] private int maxTargets = 1;

        [Tooltip("Explosion am Einschlag in Metern (Feuerball: 2; 0 = keine).")]
        [Min(0f)] [SerializeField] private float explosionRadius = 0f;

        [Tooltip("Schaden der Explosion für alle anderen als Anteil eines direkten Treffers.")]
        [Range(0f, 1f)] [SerializeField] private float explosionShare = 0.7f;

        [Header("Kette")]
        [Tooltip("Ziele der Kette einschließlich des ersten (Kettenblitz: 3).")]
        [Min(1)] [SerializeField] private int chainTargets = 3;

        [Tooltip("Weitester Sprung von Ziel zu Ziel in Metern.")]
        [Min(0.5f)] [SerializeField] private float chainRange = 6f;

        [Tooltip("Schadensverlust je Sprung (0,2 = −20 %).")]
        [Range(0f, 0.95f)] [SerializeField] private float chainFalloff = 0.2f;

        [Header("Fläche und Einschläge")]
        [Tooltip("Radius der Fläche bzw. des Einschlaggebiets in Metern (Flammenteppich: 4, Gewitterruf: 6).")]
        [Min(0.5f)] [SerializeField] private float areaRadius = 4f;

        [Tooltip("Dauer der Bodenfläche in Sekunden (Flammenteppich: 6).")]
        [Min(0.1f)] [SerializeField] private float areaSeconds = 6f;

        [Tooltip("Sekunden zwischen zwei Takten der Bodenfläche.")]
        [Min(0.1f)] [SerializeField] private float areaTickSeconds = 0.5f;

        [Tooltip("Anzahl der Einschläge (Gewitterruf: 3).")]
        [Min(1)] [SerializeField] private int strikeCount = 3;

        [Tooltip("Sekunden zwischen zwei Einschlägen.")]
        [Min(0f)] [SerializeField] private float strikeInterval = 0.35f;

        [Tooltip("Radius eines Einschlags in Metern.")]
        [Min(0.2f)] [SerializeField] private float strikeRadius = 2f;

        [Header("Selbstverstärkung")]
        [Tooltip("Art der Verstärkung (Glutmantel, Eispanzer, Sturmschritt).")]
        [SerializeField] private AbilityBuffKind buffKind = AbilityBuffKind.None;

        [Tooltip("Dauer in Sekunden (Glutmantel 10, Eispanzer 12, Sturmschritt 8).")]
        [Min(0.1f)] [SerializeField] private float buffSeconds = 10f;

        [Tooltip("Stärke (Glutmantel 0,2 = +20 % als Feuer, Eispanzer 0,3 = Rüstung +30 %, Sturmschritt 0,2 = +20 % Tempo).")]
        [Min(0f)] [SerializeField] private float buffValue = 0.2f;

        /// <summary>Ability id.</summary>
        public string AbilityId => abilityId ?? string.Empty;

        /// <summary>Name for the HUD.</summary>
        public string DisplayName => displayName ?? string.Empty;

        /// <summary>How it takes effect.</summary>
        public AbilityKind Kind => kind;

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
                Kind = kind,
                ManaCost = manaCost,
                CooldownSeconds = cooldownSeconds,
                WindupSeconds = windupSeconds,
                RecoverySeconds = recoverySeconds,
                Range = range,
                ConeAngle = coneAngle,
                DamageMultiplier = damageMultiplier,
                Element = element,
                ElementShare = elementShare,
                ScalesWithWeapon = scalesWithWeapon,
                PoiseDamage = poiseDamage,
                KnockbackDistance = knockbackDistance,
                Corruption = corruption,
                BuildupEffect = buildupEffect,
                Buildup = buildup,
                ProjectileSpeed = projectileSpeed,
                ProjectileRadius = projectileRadius,
                MaxTargets = maxTargets,
                ExplosionRadius = explosionRadius,
                ExplosionShare = explosionShare,
                ChainTargets = chainTargets,
                ChainRange = chainRange,
                ChainFalloff = chainFalloff,
                AreaRadius = areaRadius,
                AreaSeconds = areaSeconds,
                AreaTickSeconds = areaTickSeconds,
                StrikeCount = strikeCount,
                StrikeInterval = strikeInterval,
                StrikeRadius = strikeRadius,
                BuffKind = buffKind,
                BuffSeconds = buffSeconds,
                BuffValue = buffValue
            };
            problem = spec.Validate();
            return problem.Length == 0 ? spec : null;
        }
    }
}
