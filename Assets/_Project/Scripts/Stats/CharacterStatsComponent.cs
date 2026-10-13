using UnityEngine;

namespace Aetherfall.Stats
{
    /// <summary>
    /// Scene adapter for the stats of one character (player, companion, enemy): owns a <see cref="StatCollection"/> with
    /// the base attributes and level from the inspector, plus the <see cref="Stamina"/> and <see cref="Mana"/> pools.
    /// Ticks the pools and flushes the stat change events once per frame.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the character root (the test ground menu adds it to "Player"). Health lives in
    /// <c>Aetherfall.Combat.DamageableComponent</c>, which reads <see cref="StatId.MaxHealth"/> from here.</para>
    /// <para>The collection and the pools are created on first access, so other components may use them in their own
    /// <c>Awake</c> regardless of the execution order. Later, Progression sets attributes and level, Inventory adds
    /// equipment modifiers (<c>item:&lt;instanceId&gt;</c>).</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class CharacterStatsComponent : MonoBehaviour
    {
        [Tooltip("Art der Figur: bestimmt die Obergrenzen (GDD 03, 10.5). Spieler und Begleiter: Resistenz max. 75 %, Gegner: 90 %.")]
        [SerializeField] private StatActorKind actorKind = StatActorKind.Player;

        [Header("Grundwerte (GDD 03, 10.1 – Prolog: alle 11)")]
        [Tooltip("Stärke: Nahkampf-Skalierung, Traglast.")]
        [Range(1f, 60f)] [SerializeField] private float strength = StatFormulas.PrologueAttributeValue;

        [Tooltip("Geschick: Fernkampf, Dolche, kritische Treffer, Kosten der Rolle.")]
        [Range(1f, 60f)] [SerializeField] private float dexterity = StatFormulas.PrologueAttributeValue;

        [Tooltip("Intelligenz: Zauberkraft, Mana.")]
        [Range(1f, 60f)] [SerializeField] private float intelligence = StatFormulas.PrologueAttributeValue;

        [Tooltip("Weisheit: Heilung, Mana-Regeneration, Statusresistenz.")]
        [Range(1f, 60f)] [SerializeField] private float wisdom = StatFormulas.PrologueAttributeValue;

        [Tooltip("Konstitution: Lebenspunkte (+15 je effektivem Punkt), Ausdauer (+2), Standfestigkeit.")]
        [Range(1f, 60f)] [SerializeField] private float constitution = StatFormulas.PrologueAttributeValue;

        [Tooltip("Charisma: Dialogproben, Händlerpreise, Glück.")]
        [Range(1f, 60f)] [SerializeField] private float charisma = StatFormulas.PrologueAttributeValue;

        [Tooltip("Stufe 1–80. Jede Stufe über 1 gibt +12 LP, +0,5 Ausdauer, +2 Mana (GDD 03, 10.3).")]
        [Range(1, 80)] [SerializeField] private int level = 1;

        [Tooltip("In Kampf (später vom Kampfsystem gesetzt): Mana regeneriert dann 2,5 % statt 6 % pro Sekunde.")]
        [SerializeField] private bool inCombat;

        private StatCollection _stats;
        private ResourcePool _stamina;
        private ResourcePool _mana;

        /// <summary>The stats of this character (created on first access).</summary>
        public StatCollection Stats
        {
            get
            {
                EnsureCreated();
                return _stats;
            }
        }

        /// <summary>Stamina pool: max from <see cref="StatId.MaxStamina"/>, regeneration from <see cref="StatId.StaminaRegen"/> after 0.8 s.</summary>
        public ResourcePool Stamina
        {
            get
            {
                EnsureCreated();
                return _stamina;
            }
        }

        /// <summary>Mana pool: max from <see cref="StatId.MaxMana"/>, 6 % (2.5 % in combat) × wisdom factor per second.</summary>
        public ResourcePool Mana
        {
            get
            {
                EnsureCreated();
                return _mana;
            }
        }

        /// <summary>Kind of character (selects the caps).</summary>
        public StatActorKind ActorKind => actorKind;

        /// <summary>Combat state for the regeneration rules (set by the combat system later).</summary>
        public bool InCombat
        {
            get => inCombat;
            set => inCombat = value;
        }

        private void Awake()
        {
            EnsureCreated();
        }

        private void Update()
        {
            float deltaTime = Time.deltaTime;
            float manaFactor = _stats.Get(StatId.ManaRegenFactor);
            if (inCombat)
            {
                manaFactor *= StatFormulas.ManaRegenFractionInCombat / StatFormulas.ManaRegenFractionOutOfCombat;
            }

            _mana.RegenMultiplier = manaFactor;
            _stamina.Tick(deltaTime);
            _mana.Tick(deltaTime);
            _stats.FlushChanges();
        }

        private void EnsureCreated()
        {
            if (_stats != null)
            {
                return;
            }

            _stats = new StatCollection(StatFormulaSet.CreateDefault(), StatRuleSet.Create(actorKind));
            _stats.SetBase(StatId.Strength, strength);
            _stats.SetBase(StatId.Dexterity, dexterity);
            _stats.SetBase(StatId.Intelligence, intelligence);
            _stats.SetBase(StatId.Wisdom, wisdom);
            _stats.SetBase(StatId.Constitution, constitution);
            _stats.SetBase(StatId.Charisma, charisma);
            _stats.SetBase(StatId.Level, level);
            _stamina = new ResourcePool(_stats, StatId.MaxStamina, ResourcePoolSettings.Stamina, StatId.StaminaRegen);
            _mana = new ResourcePool(_stats, StatId.MaxMana, ResourcePoolSettings.Mana);
        }
    }
}
