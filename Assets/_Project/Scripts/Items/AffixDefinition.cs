using System.Collections.Generic;
using Aetherfall.Data;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Items
{
    /// <summary>
    /// An affix as data (architecture 11.6 "AffixDefinition (Stat, Wertebereich je Stufe, erlaubte Kategorien)", GDD 04
    /// 4.3/4.4): id <c>affix.&lt;name&gt;</c>, prefix or suffix, family, target stat, value range of tier I and tier VI,
    /// weight, allowed slots and excluded affixes. Lives in <c>Assets/_Project/Data/Items/Affixes/</c>; the item generator
    /// uses the plain copy from <see cref="CreateSpec"/>.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Items/Affix", fileName = "Affix", order = 31)]
    public sealed class AffixDefinition : GameDefinition
    {
        [Tooltip("Anzeigename, z. B. „Grausam“ oder „des Glücks“. TODO: später LocalizedString (Lokalisierungs-Schritt).")]
        [SerializeField] private string displayName = string.Empty;

        [Tooltip("Wirkungstext mit {0} für den Wert, z. B. „+{0} % Krit-Schaden“.")]
        [SerializeField] private string effectText = "+{0}";

        [Tooltip("Präfix (Angriff, Kernwerte) oder Suffix (Verteidigung, Attribute, Nutzen). Je Item höchstens 2 Präfixe und 2 Suffixe.")]
        [SerializeField] private AffixKind kind = AffixKind.Prefix;

        [Tooltip("Familie (GDD 04, 4.4), z. B. krit_schaden. Je Item höchstens ein Affix je Familie.")]
        [SerializeField] private string familyId = string.Empty;

        [Tooltip("Wie viele Affixe dieser Familie ein Item haben darf (Standard 1; Resistenzen 2 verschiedene).")]
        [Range(1, 4)] [SerializeField] private int familyLimit = 1;

        [Tooltip("Wert, den das Affix ändert.")]
        [SerializeField] private StatId stat = StatId.None;

        [Tooltip("Art der Änderung: Flat = addiert, PercentAdd = +X % auf den Wert, PercentMult = multiplikativ.")]
        [SerializeField] private StatModifierKind modifierKind = StatModifierKind.Flat;

        [Tooltip("Umrechnung vom Anzeigewert zum Modifikator (0,01 für „+X %“ auf Anteils-Werte wie Krit-Chance, 1 für Rüstung oder LP).")]
        [SerializeField] private float valueScale = 1f;

        [Header("Wertebereiche (GDD 04, 4.4)")]
        [Tooltip("Stufe I: Untergrenze.")]
        [SerializeField] private float tierOneMin = 1f;

        [Tooltip("Stufe I: Obergrenze.")]
        [SerializeField] private float tierOneMax = 1f;

        [Tooltip("Stufe VI: Untergrenze.")]
        [SerializeField] private float tierSixMin = 5f;

        [Tooltip("Stufe VI: Obergrenze.")]
        [SerializeField] private float tierSixMax = 5f;

        [Tooltip("Nachkommastellen der Werte (0 oder 1, z. B. Krit-Chance 1,5).")]
        [Range(0, 2)] [SerializeField] private int decimals = 0;

        [Header("Würfeln")]
        [Tooltip("Gewicht beim Würfeln (Standard 100, starke Affixe 50, Nutzen-Affixe 60).")]
        [Min(0)] [SerializeField] private int weight = 100;

        [Tooltip("Erlaubte Item-Plätze (Waffen, Rüstungsteile, Schild, Ring, Amulett).")]
        [SerializeField] private AffixSlots allowedSlots = AffixSlots.None;

        [Tooltip("Affixe, die nie zusammen mit diesem vorkommen (z. B. „des Blutegels“ nie mit „der Dornen“).")]
        [SerializeField, IdRef("affix.")] private List<string> excludedAffixIds = new List<string>();

        /// <summary>Display name (German).</summary>
        public string DisplayName => displayName;

        /// <summary>Creates the plain data for the item generator.</summary>
        public AffixSpec CreateSpec()
        {
            return new AffixSpec
            {
                Id = Id,
                DisplayName = displayName,
                EffectText = effectText,
                Kind = kind,
                FamilyId = familyId,
                FamilyLimit = familyLimit,
                Stat = stat,
                ModifierKind = modifierKind,
                ValueScale = valueScale,
                TierOneMin = tierOneMin,
                TierOneMax = tierOneMax,
                TierSixMin = tierSixMin,
                TierSixMax = tierSixMax,
                Decimals = decimals,
                Weight = weight,
                AllowedSlots = allowedSlots,
                ExcludedAffixIds = excludedAffixIds != null ? excludedAffixIds.ToArray() : System.Array.Empty<string>()
            };
        }
    }
}
