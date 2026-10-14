using System.Collections.Generic;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// A world state entry as data (architecture 8.2 "FlagDefinition"): id <c>flag.&lt;bereich&gt;.&lt;name&gt;</c> or
    /// <c>stat.&lt;bereich&gt;.&lt;name&gt;</c>, kind, start value, range, enum names and meaning. Defined flags protect
    /// against typos: conditions and actions pick them by id, the validator checks references and enum values (V04, V17),
    /// the world state warns about writes to undefined ids. Lives in <c>Assets/_Project/Data/WorldState/</c> and must be in
    /// the content catalog.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Welt/Flag", fileName = "Flag", order = 40)]
    public sealed class FlagDefinition : GameDefinition
    {
        [Tooltip("Art: Bool (ja/nein), Zähler (ab 0), Enum (benannte Zustände 0–9) oder Story-Zahl (mit Min/Max).")]
        [SerializeField] private FlagKind kind = FlagKind.Bool;

        [Tooltip("Startwert bei neuem Spiel (Bool: 0 = falsch, 1 = wahr).")]
        [SerializeField] private int defaultValue = 0;

        [Tooltip("Minimum (nur Story-Zahl).")]
        [SerializeField] private int min = 0;

        [Tooltip("Maximum (Story-Zahl; Zähler: 0 = kein Maximum).")]
        [SerializeField] private int max = 0;

        [Tooltip("Nur Enum: Name je Wert (Eintrag 0 = Wert 0 = unbekannt/Start, Eintrag 1 = Wert 1 …).")]
        [SerializeField] private List<string> enumValues = new List<string>();

        [Tooltip("Bedeutung und Besitzer (Quest, Region), z. B. „Harrik hat die Mühlbach-Quest lebend überstanden“.")]
        [TextArea(2, 4)] [SerializeField] private string description = string.Empty;

        [Tooltip("Vorschlag: Wert in New Game+ übernehmen.")]
        [SerializeField] private bool carryToNewGamePlus = false;

        /// <summary>Kind.</summary>
        public FlagKind Kind => kind;

        /// <summary>Creates the immutable spec used by the world state and the validator.</summary>
        public FlagSpec CreateSpec()
        {
            return new FlagSpec(Id, kind, defaultValue, min, max, enumValues, carryToNewGamePlus, description);
        }
    }
}
