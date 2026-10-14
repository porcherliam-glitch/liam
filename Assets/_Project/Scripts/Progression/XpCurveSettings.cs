using UnityEngine;

namespace Aetherfall.Progression
{
    /// <summary>
    /// The tunable parameters of the experience curve (GDD 03 12.3: "Parameter (200, 30, Exponent 2) … liegen in einem
    /// XpCurve-SO", §28 "zentral einstellbar") and of the kill experience (GDD 03 12.7). Optional: without an asset the
    /// <see cref="ProgressionInstaller"/> uses the GDD values.
    /// </summary>
    /// <remarks>Asset: <c>Assets/_Project/Settings/Progression/XpCurve.asset</c> (menu Assets > Create > Aetherfall > Fortschritt > XP-Kurve).</remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Fortschritt/XP-Kurve", fileName = "XpCurve", order = 1)]
    public sealed class XpCurveSettings : ScriptableObject
    {
        [Header("Kurve (GDD 03, 12.3)")]
        [Tooltip("Grundfaktor: XP_next(L) = runden_auf_10(Grundfaktor × L × (1 + (L / Teiler)^Exponent)). GDD: 200.")]
        [Min(1f)] [SerializeField] private float baseXp = XpCurve.DefaultBaseXp;

        [Tooltip("Teiler des kubischen Anteils. GDD: 30.")]
        [Min(1f)] [SerializeField] private float levelDivisor = XpCurve.DefaultLevelDivisor;

        [Tooltip("Exponent des kubischen Anteils. GDD: 2.")]
        [Min(0f)] [SerializeField] private float exponent = XpCurve.DefaultExponent;

        [Tooltip("Höchstes Level. GDD: 80.")]
        [Range(2, 200)] [SerializeField] private int maxLevel = XpCurve.DefaultMaxLevel;

        [Header("Erfahrung aus Kämpfen (GDD 03, 12.7)")]
        [Tooltip("XP_Kill = (Sockel + Faktor × Gegnerlevel) × Variante × Level-Differenz. GDD: Sockel 4.")]
        [Min(0f)] [SerializeField] private float killBase = KillXpRules.DefaultBase;

        [Tooltip("GDD: Faktor 1,5 je Gegnerlevel.")]
        [Min(0f)] [SerializeField] private float killPerLevel = KillXpRules.DefaultPerLevel;

        /// <summary>Creates the curve from the parameters.</summary>
        public XpCurve CreateCurve()
        {
            return new XpCurve(baseXp, levelDivisor, exponent, maxLevel);
        }

        /// <summary>Creates the kill rules from the parameters.</summary>
        public KillXpRules CreateKillRules()
        {
            return new KillXpRules(killBase, killPerLevel);
        }
    }
}
