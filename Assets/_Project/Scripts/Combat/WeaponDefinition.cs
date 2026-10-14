using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// A weapon type with its moveset as data (§9.3, GDD 03 5.1): weapon damage W, damage type, poise value, attribute
    /// weights, light combo, heavy, sprint, jump, counter and finisher attack, block values without shield. Lives in
    /// <c>Assets/_Project/Data/Combat/Weapons/</c>. Item data (Items step) will later provide W per item level.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Kampf/Waffe", fileName = "Weapon", order = 12)]
    public sealed class WeaponDefinition : ScriptableObject
    {
        [Tooltip("ID der Waffe, z. B. item.weapon.einhandschwert_eisen.")]
        [SerializeField] private string weaponId = "item.weapon.neu";

        [Header("Werte (GDD 03, 5.1 und 8.2)")]
        [Tooltip("Waffenschaden W. Platzhalter bis zum Item-System: Einhandschwert Stufe 10, selten = 50 (GDD 03, 8.3).")]
        [Min(0f)] [SerializeField] private float baseDamage = 50f;

        [Tooltip("Haupt-Schadensart (Einhandschwert: Schnitt).")]
        [SerializeField] private DamageType damageType = DamageType.Slash;

        [Tooltip("Haltungswert H_Waffe (Einhandschwert 10).")]
        [Min(0f)] [SerializeField] private float weaponPoise = 10f;

        [Tooltip("Skalierung mit Stärke (Einhandschwert 0,6).")]
        [Range(0f, 1f)] [SerializeField] private float strengthWeight = 0.6f;

        [Tooltip("Skalierung mit Geschick (Einhandschwert 0,4).")]
        [Range(0f, 1f)] [SerializeField] private float dexterityWeight = 0.4f;

        [Tooltip("Skalierung mit Intelligenz (Zauberstab 1,0, GDD 03 5.3).")]
        [Range(0f, 1f)] [SerializeField] private float intelligenceWeight = 0f;

        [Header("Moveset")]
        [Tooltip("Leichte Kombo (3–5 Schläge).")]
        [SerializeField] private ComboDefinition lightCombo = null;

        [Tooltip("Schwerer Angriff (ungeladen; Aufladen skaliert ihn, GDD 03, 4.5).")]
        [SerializeField] private AttackDefinition heavyAttack = null;

        [Tooltip("Sprintangriff (nach mindestens 0,5 s Sprint).")]
        [SerializeField] private AttackDefinition sprintAttack = null;

        [Tooltip("Sprungangriff (leichter Angriff in der Luft).")]
        [SerializeField] private AttackDefinition jumpAttack = null;

        [Tooltip("Konter nach perfekter Parade (×3,0, Haltung ×2).")]
        [SerializeField] private AttackDefinition counterAttack = null;

        [Tooltip("Finisher gegen betäubte Gegner (GDD 03, 4.10).")]
        [SerializeField] private AttackDefinition finisher = null;

        [Header("Blocken ohne Schild (GDD 03, 4.7)")]
        [Tooltip("Abgedeckter Winkel der Waffe in Grad (Einhandwaffe 120°).")]
        [Range(30f, 360f)] [SerializeField] private float blockAngle = 120f;

        [Tooltip("Schadensminderung physisch (Einhandwaffe 0,6).")]
        [Range(0f, 1f)] [SerializeField] private float blockPhysicalReduction = 0.6f;

        [Tooltip("Schadensminderung elementar (Einhandwaffe 0).")]
        [Range(0f, 1f)] [SerializeField] private float blockElementalReduction = 0f;

        [Tooltip("Stabilität (Einhandwaffe 0,1).")]
        [Range(0f, 1f)] [SerializeField] private float blockStability = 0.1f;

        /// <summary>Id of the weapon.</summary>
        public string WeaponId => weaponId;

        /// <summary>
        /// Creates the plain data for the combat state machine; <paramref name="shield"/> replaces the block values. Returns
        /// null (and an error text) if the moveset is incomplete.
        /// </summary>
        /// <param name="shield">Shield in the off hand, or null.</param>
        /// <param name="problem">Error text, empty on success.</param>
        public WeaponSpec CreateSpec(ShieldDefinition shield, out string problem)
        {
            AttackSpec[] combo = lightCombo != null ? lightCombo.CreateSpecs() : null;
            if (combo == null || combo.Length == 0)
            {
                problem = "Waffe '" + name + "': die leichte Kombo fehlt oder hat leere Einträge.";
                return null;
            }

            if (heavyAttack == null || sprintAttack == null || jumpAttack == null || counterAttack == null || finisher == null)
            {
                problem = "Waffe '" + name + "': schwerer, Sprint-, Sprung-, Konterangriff oder Finisher fehlt.";
                return null;
            }

            var spec = new WeaponSpec
            {
                Id = weaponId,
                BaseDamage = baseDamage,
                DamageType = damageType,
                WeaponPoise = weaponPoise,
                Scaling = new AttributeScaling(strengthWeight, dexterityWeight, intelligenceWeight),
                LightCombo = combo,
                Heavy = heavyAttack.CreateSpec(),
                Sprint = sprintAttack.CreateSpec(),
                Jump = jumpAttack.CreateSpec(),
                Counter = counterAttack.CreateSpec(),
                Finisher = finisher.CreateSpec(),
                Block = shield != null
                    ? shield.CreateBlockSpec()
                    : new BlockSpec(blockAngle, blockPhysicalReduction, blockElementalReduction, blockStability)
            };
            problem = spec.Validate();
            return problem.Length == 0 ? spec : null;
        }
    }
}
