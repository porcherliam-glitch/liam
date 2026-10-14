using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// When HUD elements are visible (GDD 05 1.2, column "Kontextabhaengig / immersiver Modus"), pure logic with timers:
    /// health at below 100 %, in combat and for 4 s after combat; stamina while used and for 2 s after it is full again;
    /// mana while used or in combat; abilities and quick slots in combat (4 s after-glow); tracked quests for 8 s after quest
    /// progress; the experience bar for 4 s after experience; the "HUD peek" (hold Select / M for 0.4 s) shows everything for
    /// 5 s.
    /// </summary>
    public sealed class HudVisibilityRules
    {
        /// <summary>Health stays visible this long after combat ends (s).</summary>
        public const float HealthAfterCombatSeconds = 4f;

        /// <summary>Stamina stays visible this long after it is full again (s).</summary>
        public const float StaminaAfterFullSeconds = 2f;

        /// <summary>Mana stays visible this long after it is full again (s).</summary>
        public const float ManaAfterFullSeconds = 2f;

        /// <summary>Abilities and quick slots stay visible this long after combat (s).</summary>
        public const float BarsAfterCombatSeconds = 4f;

        /// <summary>Duration of the HUD peek (s).</summary>
        public const float PeekSeconds = 5f;

        /// <summary>Tracked quests stay visible this long after quest activity (s, GDD 05 1.2 "blendet bei Fortschritt 8 s ein").</summary>
        public const float QuestsAfterActivitySeconds = 8f;

        /// <summary>The experience bar stays visible this long after experience was gained (s, GDD 05 1.2).</summary>
        public const float XpAfterGainSeconds = 4f;

        /// <summary>Health threshold of the minimal mode.</summary>
        public const float MinimalHealthThreshold = 0.3f;

        private float _sinceCombat = float.PositiveInfinity;
        private float _staminaFullFor = float.PositiveInfinity;
        private float _manaFullFor = float.PositiveInfinity;
        private float _peekRemaining;
        private float _questsRemaining;
        private float _xpRemaining;

        /// <summary>Mode option.</summary>
        public HudMode Mode { get; set; } = HudMode.Contextual;

        /// <summary>Health bar visible.</summary>
        public bool ShowHealth { get; private set; }

        /// <summary>Stamina bar visible.</summary>
        public bool ShowStamina { get; private set; }

        /// <summary>Mana bar visible.</summary>
        public bool ShowMana { get; private set; }

        /// <summary>Ability bar visible.</summary>
        public bool ShowAbilities { get; private set; }

        /// <summary>Quick slots visible.</summary>
        public bool ShowQuickSlots { get; private set; }

        /// <summary>Compass visible (off only in the minimal mode).</summary>
        public bool ShowCompass { get; private set; }

        /// <summary>Tracked quests visible (top right).</summary>
        public bool ShowQuests { get; private set; }

        /// <summary>Experience bar visible (bottom centre).</summary>
        public bool ShowXp { get; private set; }

        /// <summary>True while the HUD peek is active.</summary>
        public bool IsPeeking => _peekRemaining > 0f;

        /// <summary>Shows all elements for <see cref="PeekSeconds"/>.</summary>
        public void Peek()
        {
            _peekRemaining = PeekSeconds;
        }

        /// <summary>
        /// A quest started, progressed or changed its stage, or the quest log was closed: the tracked quests show for
        /// <see cref="QuestsAfterActivitySeconds"/>.
        /// </summary>
        public void NotifyQuestActivity()
        {
            _questsRemaining = QuestsAfterActivitySeconds;
        }

        /// <summary>Experience was gained: the experience bar shows for <see cref="XpAfterGainSeconds"/>.</summary>
        public void NotifyXpGained()
        {
            _xpRemaining = XpAfterGainSeconds;
        }

        /// <summary>Forgets timers (new game, loaded game): elements follow the current values at once.</summary>
        public void Reset()
        {
            _sinceCombat = float.PositiveInfinity;
            _staminaFullFor = float.PositiveInfinity;
            _manaFullFor = float.PositiveInfinity;
            _peekRemaining = 0f;
            _questsRemaining = 0f;
            _xpRemaining = 0f;
        }

        /// <summary>Updates the visibility for one frame.</summary>
        /// <param name="context">State of the player.</param>
        /// <param name="deltaTime">Frame time in seconds (unscaled).</param>
        public void Update(in HudContext context, float deltaTime)
        {
            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            _sinceCombat = context.InCombat ? 0f : Add(_sinceCombat, dt);
            _staminaFullFor = context.Stamina01 >= 1f ? Add(_staminaFullFor, dt) : 0f;
            _manaFullFor = context.Mana01 >= 1f ? Add(_manaFullFor, dt) : 0f;
            _peekRemaining = Math.Max(0f, _peekRemaining - dt);
            _questsRemaining = Math.Max(0f, _questsRemaining - dt);
            _xpRemaining = Math.Max(0f, _xpRemaining - dt);

            bool combatGlow = _sinceCombat <= BarsAfterCombatSeconds;
            switch (Mode)
            {
                case HudMode.Full:
                    SetAll(true);
                    return;
                case HudMode.Minimal:
                    ShowHealth = context.Health01 < MinimalHealthThreshold;
                    ShowStamina = context.Exhausted;
                    ShowMana = false;
                    ShowAbilities = false;
                    ShowQuickSlots = false;
                    ShowCompass = false;
                    ShowQuests = false;
                    ShowXp = false;
                    break;
                default:
                    ShowHealth = context.Health01 < 1f || _sinceCombat <= HealthAfterCombatSeconds;
                    ShowStamina = _staminaFullFor <= StaminaAfterFullSeconds || context.Exhausted;
                    ShowMana = _manaFullFor <= ManaAfterFullSeconds || context.InCombat;
                    ShowAbilities = combatGlow;
                    ShowQuickSlots = combatGlow;
                    ShowCompass = true;
                    ShowQuests = _questsRemaining > 0f;
                    ShowXp = _xpRemaining > 0f;
                    break;
            }

            if (IsPeeking)
            {
                SetAll(true);
            }
        }

        private void SetAll(bool visible)
        {
            ShowHealth = visible;
            ShowStamina = visible;
            ShowMana = visible;
            ShowAbilities = visible;
            ShowQuickSlots = visible;
            ShowCompass = visible;
            ShowQuests = visible;
            ShowXp = visible;
        }

        private static float Add(float value, float dt)
        {
            return float.IsPositiveInfinity(value) ? value : value + dt;
        }
    }
}
