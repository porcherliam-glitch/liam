using System.Collections.Generic;
using Aetherfall.Items;
using Aetherfall.Stats;
using UnityEditor;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Affix definitions of the test ground: 26 affixes of the GDD 04 4.4 pool that change existing stats (sharp, cruel,
    /// precise, quick, armoured, vital, the six attributes, the six resistances, stamina, fox, haste, luck, steadfastness,
    /// source, healing, learned). Effects without a stat yet (elemental damage, leech, thorns, purity, night) follow with their
    /// systems. Weights: standard 100, strong 50, utility 60 (GDD 04 4.3; which affix is strong or utility is a Vorschlag of
    /// this step). Existing assets are never overwritten.
    /// </summary>
    public sealed class TestGroundAffixAssets
    {
        private const AffixSlots Weapons = AffixSlots.AllWeapons;
        private const AffixSlots Melee = AffixSlots.MeleeWeapon;
        private const AffixSlots Ranged = AffixSlots.RangedWeapon;
        private const AffixSlots Magic = AffixSlots.MagicWeapon;
        private const AffixSlots Armor = AffixSlots.AllArmor;
        private const AffixSlots Jewelry = AffixSlots.Ring | AffixSlots.Amulet;

        private readonly TestGroundReport _report;
        private readonly List<AffixDefinition> _all = new List<AffixDefinition>();

        /// <summary>Creates or loads all affix assets (the folder must exist).</summary>
        /// <param name="report">Protocol.</param>
        public TestGroundAffixAssets(TestGroundReport report)
        {
            _report = report;
            Prefix("Scharf", "affix.scharf", "Scharf", "+{0} % Schaden", "waffenschaden", StatId.DamageBonus, 0.01f, 5, 8, 25, 35, 0, 50, Melee | Ranged);
            Prefix("Grausam", "affix.grausam", "Grausam", "+{0} % Krit-Schaden", "krit_schaden", StatId.CritDamage, 0.01f, 5, 8, 25, 35, 0, 50,
                Weapons | AffixSlots.Hands | Jewelry);
            Prefix("Praezise", "affix.praezise", "Präzise", "+{0} % Krit-Chance", "krit_chance", StatId.CritChance, 0.01f, 1f, 1.5f, 4f, 5f, 1, 50,
                Ranged | AffixSlots.Head | AffixSlots.Hands | Jewelry);
            Prefix("Flink", "affix.flink", "Flink", "+{0} % Angriffstempo", "tempo", StatId.AttackSpeed, 0.01f, 2, 3, 7, 9, 0, 50,
                Melee | AffixSlots.Hands | AffixSlots.Ring);
            Prefix("Gepanzert", "affix.gepanzert", "Gepanzert", "+{0} Rüstung", "ruestung", StatId.Armor, 1f, 3, 5, 60, 80, 0, 100, Armor | AffixSlots.Shield);
            Prefix("Vital", "affix.vital", "Vital", "+{0} max. LP", "leben", StatId.MaxHealth, 1f, 10, 15, 160, 220, 0, 100,
                Armor | AffixSlots.Shield | Jewelry);
            Prefix("Gelehrt", "affix.gelehrt", "Gelehrt", "+{0} % Zauberkraft", "zauberkraft", StatId.SpellPower, 0.01f, 4, 6, 18, 24, 0, 100,
                Magic | AffixSlots.Head | Jewelry, StatModifierKind.PercentAdd);

            AffixSlots attributeSlots = AffixSlots.Head | AffixSlots.Chest | AffixSlots.Legs | Jewelry;
            Attribute("Staerke", "affix.staerke", "der Stärke", "Stärke", StatId.Strength, attributeSlots);
            Attribute("Geschick", "affix.geschick", "des Geschicks", "Geschick", StatId.Dexterity, attributeSlots);
            Attribute("Intelligenz", "affix.intelligenz", "der Intelligenz", "Intelligenz", StatId.Intelligence, attributeSlots);
            Attribute("Weisheit", "affix.weisheit", "der Weisheit", "Weisheit", StatId.Wisdom, attributeSlots);
            Attribute("Konstitution", "affix.konstitution", "der Konstitution", "Konstitution", StatId.Constitution, attributeSlots);
            Attribute("Charisma", "affix.charisma", "des Charismas", "Charisma", StatId.Charisma, attributeSlots);

            Resistance("Feuerschutz", "affix.feuerschutz", "des Feuerschutzes", "Feuer", StatId.ResistFire);
            Resistance("Eiswehr", "affix.eiswehr", "der Eiswehr", "Eis", StatId.ResistIce);
            Resistance("Blitzableiter", "affix.blitzableiter", "des Blitzableiters", "Blitz", StatId.ResistLightning);
            Resistance("Gegengift", "affix.gegengift", "des Gegengifts", "Gift", StatId.ResistPoison);
            Resistance("Licht", "affix.licht", "des Lichts", "Schatten", StatId.ResistShadow);
            Resistance("Aetherwehr", "affix.aetherwehr", "der Aetherwehr", "Aether", StatId.ResistAether);

            Suffix("Ausdauer", "affix.ausdauer", "der Ausdauer", "+{0} max. Ausdauer", "ausdauer", StatId.MaxStamina, 1f, 3, 5, 20, 28, 0, 100,
                AffixSlots.Chest | AffixSlots.Legs | AffixSlots.Feet | AffixSlots.Cloak);
            Suffix("Fuchs", "affix.fuchs", "des Fuchses", "+{0} % Bewegungstempo", "bewegung", StatId.MoveSpeed, 0.01f, 2, 2, 6, 8, 0, 60,
                AffixSlots.Feet | AffixSlots.Cloak, StatModifierKind.PercentAdd);
            Suffix("Eile", "affix.eile", "der Eile", "−{0} % Abklingzeit", "abklingzeit", StatId.CooldownReduction, 0.01f, 1, 2, 5, 7, 0, 50,
                AffixSlots.Head | Jewelry | Magic);
            Suffix("Glueck", "affix.glueck", "des Glücks", "+{0} Glück", "glueck", StatId.Luck, 1f, 2, 3, 10, 14, 0, 60,
                AffixSlots.Head | AffixSlots.Cloak | Jewelry);
            Suffix("Standhaftigkeit", "affix.standhaftigkeit", "der Standhaftigkeit", "+{0} Standfestigkeit", "standfestigkeit", StatId.Poise, 1f, 2, 3, 12, 16,
                0, 100, AffixSlots.Chest | AffixSlots.Legs | AffixSlots.Feet | AffixSlots.Shield);
            Suffix("Quelle", "affix.quelle", "der Quelle", "+{0} % Mana-Regeneration", "mana", StatId.ManaRegenFactor, 0.01f, 4, 6, 20, 28, 0, 60,
                Magic | AffixSlots.Head | Jewelry);
            Suffix("Heilkunst", "affix.heilkunst", "der Heilkunst", "+{0} % Heilungsstärke", "heilung", StatId.HealingFactor, 0.01f, 3, 5, 15, 20, 0, 60,
                Magic | Jewelry);
        }

        /// <summary>All affix definitions (null entries if a path was blocked).</summary>
        public IReadOnlyList<AffixDefinition> All => _all;

        private void Prefix(string file, string id, string name, string text, string family, StatId stat, float scale, float oneMin, float oneMax,
            float sixMin, float sixMax, int decimals, int weight, AffixSlots slots, StatModifierKind kind = StatModifierKind.Flat)
        {
            Create(file, id, name, text, AffixKind.Prefix, family, 1, stat, kind, scale, oneMin, oneMax, sixMin, sixMax, decimals, weight, slots);
        }

        private void Suffix(string file, string id, string name, string text, string family, StatId stat, float scale, float oneMin, float oneMax,
            float sixMin, float sixMax, int decimals, int weight, AffixSlots slots, StatModifierKind kind = StatModifierKind.Flat)
        {
            Create(file, id, name, text, AffixKind.Suffix, family, 1, stat, kind, scale, oneMin, oneMax, sixMin, sixMax, decimals, weight, slots);
        }

        private void Attribute(string file, string id, string name, string attribute, StatId stat, AffixSlots slots)
        {
            // GDD 04 4.4 #16: +1 at tier I, +5–6 at tier VI.
            Create(file, id, name, "+{0} " + attribute, AffixKind.Suffix, "attribut", 1, stat, StatModifierKind.Flat, 1f, 1, 1, 5, 6, 0, 100, slots);
        }

        private void Resistance(string file, string id, string name, string element, StatId stat)
        {
            // GDD 04 4.4 #17: 3–5 % at tier I, 15–20 % at tier VI; at most 2 different resistances per item.
            Create(file, id, name, "+{0} % " + element + "-Resistenz", AffixKind.Suffix, "resistenz", 2, stat, StatModifierKind.Flat, 0.01f, 3, 5, 15, 20,
                0, 100, AffixSlots.AllArmor | AffixSlots.Shield | Jewelry);
        }

        private void Create(string file, string id, string name, string text, AffixKind kind, string family, int familyLimit, StatId stat,
            StatModifierKind modifierKind, float scale, float oneMin, float oneMax, float sixMin, float sixMax, int decimals, int weight, AffixSlots slots)
        {
            string path = TestGroundPaths.AffixFolder + "/Affix_" + file + ".asset";
            TestGroundReport report = _report;
            AffixDefinition asset = TestGroundSerialized.EnsureAsset<AffixDefinition>(path, report, so =>
            {
                TestGroundSerialized.Set(so, "id", id, report);
                TestGroundSerialized.Set(so, "displayName", name, report);
                TestGroundSerialized.Set(so, "effectText", text, report);
                TestGroundSerialized.Set(so, "kind", (int)kind, report);
                TestGroundSerialized.Set(so, "familyId", family, report);
                TestGroundSerialized.Set(so, "familyLimit", familyLimit, report);
                TestGroundSerialized.Set(so, "stat", (int)stat, report);
                TestGroundSerialized.Set(so, "modifierKind", (int)modifierKind, report);
                TestGroundSerialized.Set(so, "valueScale", scale, report);
                TestGroundSerialized.Set(so, "tierOneMin", oneMin, report);
                TestGroundSerialized.Set(so, "tierOneMax", oneMax, report);
                TestGroundSerialized.Set(so, "tierSixMin", sixMin, report);
                TestGroundSerialized.Set(so, "tierSixMax", sixMax, report);
                TestGroundSerialized.Set(so, "decimals", decimals, report);
                TestGroundSerialized.Set(so, "weight", weight, report);
                TestGroundSerialized.Set(so, "allowedSlots", (int)slots, report);
            });
            _all.Add(asset);
        }
    }
}
