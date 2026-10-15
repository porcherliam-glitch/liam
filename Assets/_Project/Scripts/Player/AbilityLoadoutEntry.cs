using System;
using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// One ability the <see cref="PlayerAbilityCaster"/> can use (GDD 03 11.8): the data, how it is learned (world flag, from the
    /// start, or later: the class or the skill tree), the slot it wants on the bar and its look.
    /// </summary>
    [Serializable]
    public sealed class AbilityLoadoutEntry
    {
        [Tooltip("Die Fähigkeit (Assets/_Project/Data/Combat/Abilities/).")]
        [SerializeField] private AbilityDefinition ability = null;

        [Tooltip("Welt-Flag, ab dem sie gelernt ist (Aether-Stoß im Eichental: flag.eichental.aether_kraft). Leer = kein Flag.")]
        [SerializeField] private string unlockFlag = "";

        [Tooltip("Von Anfang an gelernt (Testgelände). Sonst: Flag, Klasse (Startzauber des Magiers) oder Skill-Baum.")]
        [SerializeField] private bool learnedAtStart = false;

        [Tooltip("Gewünschter Platz 1–8 auf der Leiste (Aether-Stoß: 4 = Leiste 1, Platz 4); 0 = erster freier Platz.")]
        [Range(0, AbilityBar.SlotCount)] [SerializeField] private int preferredSlot = 0;

        [Tooltip("Aussehen (Partikel, Licht, Blitz, Fläche; bei Geschossen der Werfer).")]
        [SerializeField] private AbilityVisual visual = null;

        /// <summary>Creates an empty entry (inspector).</summary>
        public AbilityLoadoutEntry()
        {
        }

        /// <summary>Creates an entry (generators, tests).</summary>
        /// <param name="ability">Ability data.</param>
        /// <param name="unlockFlag">World flag that teaches it (empty = none).</param>
        /// <param name="learnedAtStart">Known from the start.</param>
        /// <param name="preferredSlot">Wanted slot 1–8, 0 = first free.</param>
        /// <param name="visual">Look.</param>
        public AbilityLoadoutEntry(AbilityDefinition ability, string unlockFlag, bool learnedAtStart, int preferredSlot, AbilityVisual visual)
        {
            this.ability = ability;
            this.unlockFlag = unlockFlag ?? string.Empty;
            this.learnedAtStart = learnedAtStart;
            this.preferredSlot = preferredSlot;
            this.visual = visual;
        }

        /// <summary>Ability data.</summary>
        public AbilityDefinition Ability => ability;

        /// <summary>World flag that teaches it, or empty.</summary>
        public string UnlockFlag => unlockFlag ?? string.Empty;

        /// <summary>Known from the start.</summary>
        public bool LearnedAtStart => learnedAtStart;

        /// <summary>Wanted slot 0–7 on the bar, or −1.</summary>
        public int PreferredSlotIndex => preferredSlot - 1;

        /// <summary>Look (may be null).</summary>
        public AbilityVisual Visual => visual;
    }
}
