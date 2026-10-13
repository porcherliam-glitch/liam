using Aetherfall.Data;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Items
{
    /// <summary>
    /// An item as data (architecture 5.1 "ItemDefinition", GDD 04 1–4): id <c>item.&lt;kategorie&gt;.&lt;name&gt;</c>, name,
    /// category, slot, weapon type or armor class, weight, stack size, value, base rarity, fixed item level, base values,
    /// implicit stat, quest flag and the shield block values. Lives in <c>Assets/_Project/Data/Items/</c>. Instances
    /// (<see cref="ItemInstance"/>) reference it by id; the pure logic uses the copy from <see cref="CreateSpec"/>.
    /// </summary>
    /// <remarks>
    /// TODO (later steps): name and description as LocalizedString, icon as AssetReferenceSprite, tags, data components
    /// (<c>[SerializeReference]</c>: consumable effect, book, sockets) instead of the flat fields (architecture 5.1, P4).
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Items/Item", fileName = "Item", order = 30)]
    public sealed class ItemDefinition : GameDefinition
    {
        [Header("Anzeige")]
        [Tooltip("Anzeigename, z. B. „Eisernes Einhandschwert“. TODO: später LocalizedString (Lokalisierungs-Schritt).")]
        [SerializeField] private string displayName = string.Empty;

        [Tooltip("Kurzbeschreibung (optional). TODO: später LocalizedString.")]
        [TextArea(2, 4)] [SerializeField] private string description = string.Empty;

        [Header("Art (GDD 04, 1.1 und 2.1)")]
        [Tooltip("Inventar-Kategorie: Waffen, Rüstung, Schmuck, Verbrauchsgüter, Materialien, Questgegenstände, Bücher, Sonstiges.")]
        [SerializeField] private ItemCategory category = ItemCategory.Material;

        [Tooltip("Passender Ausrüstungsplatz (Keiner = nicht anlegbar; Schnellslot = Tränke, Nahrung, Werkzeuge).")]
        [SerializeField] private EquipKind equipKind = EquipKind.None;

        [Tooltip("Waffentyp (nur Waffen und Schilde). Der Typ bestimmt das Bewegungsset im Kampf.")]
        [SerializeField] private WeaponType weaponType = WeaponType.None;

        [Tooltip("Rüstungsklasse (nur Rüstungsteile): Stoff leicht, Leder mittel, Platte schwer. Umhänge: keine.")]
        [SerializeField] private ArmorClass armorClass = ArmorClass.None;

        [Header("Werte")]
        [Tooltip("Gewicht eines Stücks in kg (Questgegenstände 0).")]
        [Min(0f)] [SerializeField] private float weight = 0.1f;

        [Tooltip("Stapelgröße (1 = Einzelstück; Tränke 20, Materialien 99).")]
        [Min(1)] [SerializeField] private int stackSize = 1;

        [Tooltip("Wert: bei Ausrüstung V_Kat (GDD 04, 8.6, wächst mit Item-Level und Seltenheit), sonst fester Goldwert.")]
        [Min(0f)] [SerializeField] private float value = 1f;

        [Tooltip("Seltenheit fester Stücke (Materialien gewöhnlich). Zufalls-Ausrüstung würfelt ihre Seltenheit beim Fund.")]
        [SerializeField] private ItemRarity baseRarity = ItemRarity.Common;

        [Tooltip("Festes Item-Level (benannte Items, Questbelohnungen). 0 = das Level kommt von der Quelle (Gegner, Truhe).")]
        [Range(0, 80)] [SerializeField] private int fixedItemLevel = 0;

        [Tooltip("Basis_Typ bei Item-Level 1 (GDD 04, 4.2): Waffenschaden W (Einhandschwert 20), Zauberkraft (Stab, Buch) oder Rüstung (Rüstungsteil, Schild).")]
        [Min(0f)] [SerializeField] private float baseStat = 0f;

        [Header("Implizitwert (Schmuck, Leder, Stoff – GDD 04, 4.2)")]
        [Tooltip("Wert, den das Item immer gibt (z. B. Eisenring: Rüstung). Keiner = kein Implizitwert.")]
        [SerializeField] private StatId implicitStat = StatId.None;

        [Tooltip("Art der Änderung des Implizitwerts.")]
        [SerializeField] private StatModifierKind implicitKind = StatModifierKind.Flat;

        [Tooltip("Umrechnung vom Anzeigewert zum Modifikator (0,01 für Prozent auf Anteils-Werte).")]
        [SerializeField] private float implicitScale = 1f;

        [Tooltip("Implizitwert bei Item-Level 1 (Anzeigeeinheit, z. B. 2 = +2 Rüstung).")]
        [SerializeField] private float implicitAtLevel1 = 0f;

        [Tooltip("Implizitwert bei Item-Level 80 (dazwischen linear).")]
        [SerializeField] private float implicitAtLevel80 = 0f;

        [Tooltip("Text des Implizitwerts mit {0}, z. B. „+{0} Rüstung“.")]
        [SerializeField] private string implicitText = string.Empty;

        [Header("Regeln")]
        [Tooltip("Questgegenstand: 0 kg, nicht verkaufbar, nicht ablegbar (GDD 04, 1.8).")]
        [SerializeField] private bool questItem = false;

        [Tooltip("Gehört zum Pool der Zufalls-Ausrüstung (Loot-Einträge der Art „Ausrüstung“).")]
        [SerializeField] private bool randomDrop = false;

        [Tooltip("Gewicht innerhalb seiner Gruppe (Waffen, Rüstung, Schmuck) im Zufalls-Pool.")]
        [Min(0)] [SerializeField] private int dropWeight = 100;

        [Header("Schild (GDD 03, 4.7)")]
        [Tooltip("Abgedeckter Winkel in Grad (Holzschild 150°). 0 bei anderen Items.")]
        [Range(0f, 360f)] [SerializeField] private float blockAngle = 0f;

        [Tooltip("Schadensminderung physisch (Holzschild 0,8).")]
        [Range(0f, 1f)] [SerializeField] private float blockPhysical = 0f;

        [Tooltip("Schadensminderung elementar (Holzschild 0,2).")]
        [Range(0f, 1f)] [SerializeField] private float blockElemental = 0f;

        [Tooltip("Stabilität (Holzschild 0,4).")]
        [Range(0f, 1f)] [SerializeField] private float blockStability = 0f;

        /// <summary>Display name (German).</summary>
        public string DisplayName => displayName;

        /// <summary>Description (German).</summary>
        public string Description => description;

        /// <summary>Inventory category.</summary>
        public ItemCategory Category => category;

        /// <summary>Creates the plain data for the item and loot logic.</summary>
        public ItemSpec CreateSpec()
        {
            return new ItemSpec
            {
                Id = Id,
                DisplayName = string.IsNullOrEmpty(displayName) ? name : displayName,
                Category = category,
                EquipKind = equipKind,
                WeaponType = weaponType,
                ArmorClass = armorClass,
                Weight = questItem ? 0f : weight,
                StackSize = stackSize,
                Value = value,
                BaseRarity = baseRarity,
                FixedItemLevel = fixedItemLevel,
                BaseStat = baseStat,
                ImplicitStat = implicitStat,
                ImplicitKind = implicitKind,
                ImplicitScale = implicitScale,
                ImplicitAtLevel1 = implicitAtLevel1,
                ImplicitAtLevel80 = implicitAtLevel80,
                ImplicitText = implicitText,
                IsQuestItem = questItem,
                RandomDrop = randomDrop,
                DropWeight = dropWeight,
                BlockAngle = blockAngle,
                BlockPhysical = blockPhysical,
                BlockElemental = blockElemental,
                BlockStability = blockStability
            };
        }
    }
}
