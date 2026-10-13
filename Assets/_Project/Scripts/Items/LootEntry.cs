using System;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Items
{
    /// <summary>One entry of a <see cref="LootTableDefinition"/> in the inspector (GDD 04 5.1); converted into a <see cref="LootEntrySpec"/>.</summary>
    [Serializable]
    public sealed class LootEntry
    {
        [Tooltip("Art: Nichts, Item, Tabelle (verschachtelt), Ausrüstung (Zufalls-Generator), Gold, Währung.")]
        [SerializeField] private LootEntryKind kind = LootEntryKind.Nothing;

        [Tooltip("Gewicht relativ zur Summe aller verfügbaren Einträge (garantierte Einträge ignorieren es).")]
        [Min(0)] [SerializeField] private int weight = 100;

        [Tooltip("ID des Items, der Tabelle oder der Währung (bei Nichts, Ausrüstung und Gold leer).")]
        [SerializeField, IdRef("")] private string refId = string.Empty;

        [Tooltip("Anzahl von (Items, Währung, Gold ohne Faktor; Tabelle: so oft wird sie gewürfelt).")]
        [Min(0)] [SerializeField] private int minCount = 1;

        [Tooltip("Anzahl bis.")]
        [Min(0)] [SerializeField] private int maxCount = 1;

        [Tooltip("Nur Gold: Faktor von × G(L) mit G(L) = 15 + 6 × Level (0 = Anzahl als festes Gold).")]
        [Min(0f)] [SerializeField] private float goldFactorMin = 0f;

        [Tooltip("Nur Gold: Faktor bis × G(L).")]
        [Min(0f)] [SerializeField] private float goldFactorMax = 0f;

        [Tooltip("Bedingung: frühestens ab diesem Level der Quelle (0 = immer).")]
        [Min(0)] [SerializeField] private int minSourceLevel = 0;

        [Tooltip("Bedingung: höchstens bis zu diesem Level der Quelle (0 = immer).")]
        [Min(0)] [SerializeField] private int maxSourceLevel = 0;

        [Tooltip("Garantiert (immer zusätzlich), ignoriert Glück, zählt nicht für den Pech-Schutz.")]
        [SerializeField] private LootEntryFlags flags = LootEntryFlags.None;

        [Tooltip("Nur Ausrüstung: Anteil Waffen und Schilde (GDD 04, 5.1: 50).")]
        [Min(0)] [SerializeField] private int weaponShare = 50;

        [Tooltip("Nur Ausrüstung: Anteil Rüstung (40).")]
        [Min(0)] [SerializeField] private int armorShare = 40;

        [Tooltip("Nur Ausrüstung: Anteil Schmuck (10).")]
        [Min(0)] [SerializeField] private int jewelryShare = 10;

        /// <summary>Creates the plain data.</summary>
        public LootEntrySpec CreateSpec()
        {
            return new LootEntrySpec
            {
                Kind = kind,
                Weight = weight,
                RefId = refId ?? string.Empty,
                MinCount = minCount,
                MaxCount = Math.Max(minCount, maxCount),
                GoldFactorMin = goldFactorMin,
                GoldFactorMax = Math.Max(goldFactorMin, goldFactorMax),
                MinSourceLevel = minSourceLevel,
                MaxSourceLevel = maxSourceLevel,
                Flags = flags,
                WeaponShare = weaponShare,
                ArmorShare = armorShare,
                JewelryShare = jewelryShare
            };
        }
    }
}
