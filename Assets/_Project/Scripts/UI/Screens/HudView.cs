using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The HUD (Hud.uxml, GDD 05 1.2): health, stamina and mana bars with delayed loss bar, target bar at the top while locked
    /// on (name, health, poise), compass placeholder, 4 ability slots (placeholders with glyphs), 4 quick slots (items from
    /// the equipment), interaction prompt with glyph, and - when attached - the tracked quests (<see cref="QuestTrackerView"/>)
    /// and the experience bar (<see cref="XpBarView"/>). Visibility follows <see cref="HudVisibilityRules"/> (option
    /// "HUD-Anzeige").
    /// </summary>
    /// <remarks>
    /// Ticked by <see cref="UIRoot"/> every frame. Writes styles only when values change (the bar helpers compare first) and
    /// builds no strings per frame except when a shown text changes.
    /// </remarks>
    public sealed class HudView
    {
        private const float ExhaustedBlinkSeconds = 0.25f;
        private const float CompassEpsilonDegrees = 0.2f;
        private const float LowHealth = 0.3f;

        private static readonly string[] CompassNames =
        {
            "hud-compass-n", "hud-compass-ne", "hud-compass-e", "hud-compass-se", "hud-compass-s", "hud-compass-sw", "hud-compass-w", "hud-compass-nw"
        };

        private static readonly EquipmentSlot[] QuickSlots =
        {
            EquipmentSlot.QuickSlot1, EquipmentSlot.QuickSlot2, EquipmentSlot.QuickSlot3, EquipmentSlot.QuickSlot4
        };

        private readonly VisualElement _root;
        private readonly IPlayerHudRegistry _players;
        private readonly IInventoryService _inventory;
        private readonly UiPreferences _preferences;
        private readonly IGlyphService _glyphs;
        private readonly List<KeyValuePair<Label, UiGlyph>> _glyphLabels = new List<KeyValuePair<Label, UiGlyph>>();
        private readonly HudVisibilityRules _rules = new HudVisibilityRules();
        private readonly DelayedBar _health = new DelayedBar();
        private readonly DelayedBar _stamina = new DelayedBar();
        private readonly DelayedBar _mana = new DelayedBar();
        private readonly DelayedBar _target = new DelayedBar();
        private readonly VisualElement _healthBar;
        private readonly VisualElement _healthFill;
        private readonly VisualElement _healthTrail;
        private readonly VisualElement _staminaBar;
        private readonly VisualElement _staminaFill;
        private readonly VisualElement _staminaTrail;
        private readonly VisualElement _manaBar;
        private readonly VisualElement _manaFill;
        private readonly VisualElement _manaTrail;
        private readonly Label _exhausted;
        private readonly VisualElement _targetPanel;
        private readonly Label _targetName;
        private readonly VisualElement _targetFill;
        private readonly VisualElement _targetTrail;
        private readonly VisualElement _targetPoise;
        private readonly VisualElement _targetPoiseFill;
        private readonly VisualElement _compass;
        private readonly Label[] _compassLabels = new Label[8];
        private readonly VisualElement _prompt;
        private readonly Label _promptText;
        private readonly VisualElement _abilities;
        private readonly VisualElement[] _abilitySlots = new VisualElement[4];
        private readonly VisualElement[] _abilityCooldowns = new VisualElement[4];
        private readonly Label[] _abilityTimes = new Label[4];
        private readonly int[] _shownSeconds = { -1, -1, -1, -1 };
        private readonly VisualElement _quickSlots;
        private readonly VisualElement[] _quickSlotElements = new VisualElement[4];
        private readonly Label[] _quickNames = new Label[4];
        private readonly Label[] _quickCounts = new Label[4];
        private IPlayerHudSource _source;
        private QuestTrackerView _questTracker;
        private XpBarView _xpBar;
        private bool _inCombat;
        private int _targetVersion = -1;
        private bool _targetHidden;
        private float _blinkTimer;
        private bool _blinkOn = true;
        private float _shownHeading = float.NaN;
        private int _inventoryRevision = -1;

        /// <summary>Binds the view to the HUD document.</summary>
        /// <param name="root">Root of the HUD document.</param>
        /// <param name="players">Registered player.</param>
        /// <param name="inventory">Inventory for the quick slots (null = slots stay empty).</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="preferences">UI options (HUD mode).</param>
        public HudView(VisualElement root, IPlayerHudRegistry players, IInventoryService inventory, IGlyphService glyphs, UiPreferences preferences)
        {
            _root = root ?? throw new ArgumentNullException(nameof(root));
            _players = players ?? throw new ArgumentNullException(nameof(players));
            _inventory = inventory;
            _glyphs = glyphs;
            _preferences = preferences ?? throw new ArgumentNullException(nameof(preferences));
            UiElementUtility.ApplyTexts(root);
            UiElementUtility.CollectGlyphLabels(root, _glyphLabels);

            _healthBar = root.Q<VisualElement>("hud-health");
            _healthFill = root.Q<VisualElement>("hud-health-fill");
            _healthTrail = root.Q<VisualElement>("hud-health-trail");
            _staminaBar = root.Q<VisualElement>("hud-stamina");
            _staminaFill = root.Q<VisualElement>("hud-stamina-fill");
            _staminaTrail = root.Q<VisualElement>("hud-stamina-trail");
            _manaBar = root.Q<VisualElement>("hud-mana");
            _manaFill = root.Q<VisualElement>("hud-mana-fill");
            _manaTrail = root.Q<VisualElement>("hud-mana-trail");
            _exhausted = root.Q<Label>("hud-stamina-exhausted");
            _targetPanel = root.Q<VisualElement>("hud-target");
            _targetName = root.Q<Label>("hud-target-name");
            _targetFill = root.Q<VisualElement>("hud-target-health-fill");
            _targetTrail = root.Q<VisualElement>("hud-target-health-trail");
            _targetPoise = root.Q<VisualElement>("hud-target-poise");
            _targetPoiseFill = root.Q<VisualElement>("hud-target-poise-fill");
            _compass = root.Q<VisualElement>("hud-compass");
            for (int i = 0; i < CompassNames.Length; i++)
            {
                _compassLabels[i] = root.Q<Label>(CompassNames[i]);
            }

            _prompt = root.Q<VisualElement>("hud-prompt");
            _promptText = root.Q<Label>("hud-prompt-text");
            _abilities = root.Q<VisualElement>("hud-abilities");
            _quickSlots = root.Q<VisualElement>("hud-quickslots");
            for (int i = 0; i < 4; i++)
            {
                string ability = "hud-ability-" + (i + 1).ToString(CultureInfo.InvariantCulture);
                _abilitySlots[i] = root.Q<VisualElement>(ability);
                _abilityCooldowns[i] = root.Q<VisualElement>(ability + "-cooldown");
                _abilityTimes[i] = root.Q<Label>(ability + "-time");
                string prefix = "hud-quick-" + (i + 1).ToString(CultureInfo.InvariantCulture);
                _quickSlotElements[i] = root.Q<VisualElement>(prefix);
                _quickNames[i] = root.Q<Label>(prefix + "-name");
                _quickCounts[i] = root.Q<Label>(prefix + "-count");
            }

            UiElementUtility.SetDisplayed(_exhausted, false);
            UiElementUtility.SetDisplayed(_targetPanel, false);
            UiElementUtility.SetDisplayed(_prompt, false);
            RefreshGlyphs();
        }

        /// <summary>Visibility rules (mode, peek).</summary>
        public HudVisibilityRules Rules => _rules;

        /// <summary>The quest tracker, or null if none is attached.</summary>
        public QuestTrackerView QuestTracker => _questTracker;

        /// <summary>
        /// Lower edge of the visible quest tracker in panel coordinates (0 while hidden); the P1 messages move below it.
        /// </summary>
        public float QuestTrackerBottom => _questTracker != null ? _questTracker.BottomEdge : 0f;

        /// <summary>Attaches the quest tracker and the experience bar (each may be null: the element stays hidden).</summary>
        /// <param name="questTracker">Tracker of the element <c>hud-quests</c>.</param>
        /// <param name="xpBar">Bar of the element <c>hud-xp</c>.</param>
        public void AttachProgressViews(QuestTrackerView questTracker, XpBarView xpBar)
        {
            _questTracker = questTracker;
            _xpBar = xpBar;
            UiElementUtility.SetDisplayed(_root.Q<VisualElement>("hud-quests"), false);
            UiElementUtility.SetDisplayed(_root.Q<VisualElement>("hud-xp"), false);
        }

        /// <summary>Reports the combat state (CombatStateChanged).</summary>
        /// <param name="inCombat">True while in combat.</param>
        public void SetInCombat(bool inCombat)
        {
            _inCombat = inCombat;
        }

        /// <summary>Hides the lock-on target bar while the boss bar is shown (GDD 05 1.2, guide 12, 11.3).</summary>
        /// <param name="hidden">True while a boss bar is visible.</param>
        public void SetTargetHidden(bool hidden)
        {
            _targetHidden = hidden;
        }

        /// <summary>Shows all elements for 5 s (HUD peek: hold Select / M).</summary>
        public void Peek()
        {
            _rules.Peek();
        }

        /// <summary>Snaps all bars and forgets timers (new game, loaded game, new player).</summary>
        public void ResetState()
        {
            _rules.Reset();
            _inCombat = false;
            _targetVersion = -1;
            _inventoryRevision = -1;
            _shownHeading = float.NaN;
            if (_questTracker != null)
            {
                _questTracker.Reset();
            }

            IPlayerHudSource source = _players.Current;
            _health.Snap(Normalized(source != null ? source.Health : null, 1f));
            _stamina.Snap(Normalized(source != null ? source.Stamina : null, 1f));
            _mana.Snap(Normalized(source != null ? source.Mana : null, 1f));
        }

        /// <summary>Shows the glyphs of the current device family.</summary>
        public void RefreshGlyphs()
        {
            UiElementUtility.RefreshGlyphs(_root, _glyphLabels, _glyphs);
        }

        /// <summary>Updates the HUD for one frame.</summary>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        public void Tick(float deltaTime)
        {
            IPlayerHudSource source = _players.Current;
            if (!ReferenceEquals(source, _source))
            {
                _source = source;
                ResetState();
            }

            if (source == null)
            {
                SetPlayerElementsVisible(false);
                UiElementUtility.SetDisplayed(_targetPanel, false);
                UiElementUtility.SetDisplayed(_prompt, false);
                UpdateCompass(0f);
                TickProgressViews(deltaTime, false, false);
                return;
            }

            ResourcePool staminaPool = source.Stamina;
            float health = Normalized(source.Health, 0f);
            float stamina = Normalized(staminaPool, 1f);
            float mana = Normalized(source.Mana, 1f);
            bool exhausted = staminaPool != null && staminaPool.IsExhausted;

            _health.SetValue(health);
            _stamina.SetValue(stamina);
            _mana.SetValue(mana);
            _health.Update(deltaTime);
            _stamina.Update(deltaTime);
            _mana.Update(deltaTime);
            UiElementUtility.SetFill(_healthFill, _health.Value);
            UiElementUtility.SetFill(_healthTrail, _health.Trail);
            UiElementUtility.SetFill(_staminaFill, _stamina.Value);
            UiElementUtility.SetFill(_staminaTrail, _stamina.Trail);
            UiElementUtility.SetFill(_manaFill, _mana.Value);
            UiElementUtility.SetFill(_manaTrail, _mana.Trail);
            _healthBar.EnableInClassList("is-low", health < LowHealth);
            _staminaBar.EnableInClassList("is-exhausted", exhausted);

            bool hasTarget = source.TryGetTarget(out HudTargetInfo target);
            var context = new HudContext
            {
                Health01 = health,
                Stamina01 = stamina,
                Mana01 = mana,
                InCombat = _inCombat,
                Exhausted = exhausted,
                HasTarget = hasTarget
            };
            _rules.Mode = _preferences.HudMode;
            _rules.Update(context, deltaTime);
            UiElementUtility.SetDisplayed(_healthBar, _rules.ShowHealth);
            UiElementUtility.SetDisplayed(_staminaBar, _rules.ShowStamina);
            UiElementUtility.SetDisplayed(_manaBar, _rules.ShowMana && source.Mana != null);
            UiElementUtility.SetDisplayed(_abilities, _rules.ShowAbilities);
            UiElementUtility.SetDisplayed(_quickSlots, _rules.ShowQuickSlots);
            UiElementUtility.SetDisplayed(_compass, _rules.ShowCompass);
            UpdateExhausted(exhausted, deltaTime);
            UpdateTarget(hasTarget && !_targetHidden, target, deltaTime);
            UpdatePrompt(source.InteractionPrompt);
            UpdateCompass(source.CameraYaw);
            UpdateAbilities(source);
            UpdateQuickSlots();
            TickProgressViews(deltaTime, _rules.ShowQuests, _rules.ShowXp);
        }

        private void UpdateAbilities(IPlayerHudSource source)
        {
            for (int i = 0; i < _abilitySlots.Length; i++)
            {
                bool learned = source.TryGetAbility(i, out HudAbilityInfo ability);
                VisualElement slot = _abilitySlots[i];
                if (slot != null)
                {
                    slot.EnableInClassList("is-learned", learned);
                    slot.EnableInClassList("is-unaffordable", learned && !ability.Affordable);
                }

                if (_abilityCooldowns[i] != null)
                {
                    _abilityCooldowns[i].style.height = Length.Percent(learned ? ability.Cooldown01 * 100f : 0f);
                }

                // Whole seconds left, shown while the cooldown runs (the text only changes once per second).
                int seconds = learned && ability.CooldownSeconds > 0f ? (int)Math.Ceiling(ability.CooldownSeconds) : 0;
                if (seconds != _shownSeconds[i])
                {
                    _shownSeconds[i] = seconds;
                    UiElementUtility.SetText(_abilityTimes[i], seconds > 0 ? seconds.ToString(CultureInfo.InvariantCulture) : string.Empty);
                }
            }
        }

        private void TickProgressViews(float deltaTime, bool showQuests, bool showXp)
        {
            if (_questTracker != null)
            {
                _questTracker.Tick(deltaTime, showQuests);
            }

            if (_xpBar != null)
            {
                _xpBar.Tick(showXp);
            }
        }

        private void SetPlayerElementsVisible(bool visible)
        {
            UiElementUtility.SetDisplayed(_healthBar, visible);
            UiElementUtility.SetDisplayed(_staminaBar, visible);
            UiElementUtility.SetDisplayed(_manaBar, visible);
            UiElementUtility.SetDisplayed(_exhausted, visible);
            UiElementUtility.SetDisplayed(_abilities, visible);
            UiElementUtility.SetDisplayed(_quickSlots, visible);
        }

        private void UpdateExhausted(bool exhausted, float deltaTime)
        {
            UiElementUtility.SetDisplayed(_exhausted, exhausted);
            if (!exhausted)
            {
                _blinkTimer = 0f;
                _blinkOn = true;
                _exhausted.RemoveFromClassList("is-blink-off");
                return;
            }

            // GDD 05 1.2: the stamina bar blinks at 0 ("Erschoepft").
            _blinkTimer += deltaTime;
            if (_blinkTimer >= ExhaustedBlinkSeconds)
            {
                _blinkTimer = 0f;
                _blinkOn = !_blinkOn;
                _exhausted.EnableInClassList("is-blink-off", !_blinkOn);
            }
        }

        private void UpdateTarget(bool hasTarget, in HudTargetInfo target, float deltaTime)
        {
            UiElementUtility.SetDisplayed(_targetPanel, hasTarget);
            if (!hasTarget)
            {
                return;
            }

            if (target.Version != _targetVersion)
            {
                _targetVersion = target.Version;
                _target.Snap(target.Health01);
                UiElementUtility.SetText(_targetName, target.Name);
            }

            _target.SetValue(target.Health01);
            _target.Update(deltaTime);
            UiElementUtility.SetFill(_targetFill, _target.Value);
            UiElementUtility.SetFill(_targetTrail, _target.Trail);
            UiElementUtility.SetFill(_targetPoiseFill, target.Poise01);
            _targetPoise.EnableInClassList("is-broken", target.PoiseBroken);
        }

        private void UpdatePrompt(string prompt)
        {
            bool visible = !string.IsNullOrEmpty(prompt);
            UiElementUtility.SetDisplayed(_prompt, visible);
            if (visible)
            {
                UiElementUtility.SetText(_promptText, prompt);
            }
        }

        private void UpdateCompass(float heading)
        {
            if (!float.IsNaN(_shownHeading) && Math.Abs(CompassMath.DeltaAngle(_shownHeading, heading)) < CompassEpsilonDegrees)
            {
                return;
            }

            _shownHeading = heading;
            for (int i = 0; i < _compassLabels.Length; i++)
            {
                Label label = _compassLabels[i];
                if (label == null)
                {
                    continue;
                }

                bool visible = CompassMath.TryGetStripPosition(CompassMath.CardinalBearings[i], heading, CompassMath.DefaultFieldOfView, out float position);
                UiElementUtility.SetDisplayed(label, visible);
                if (visible)
                {
                    label.style.left = Length.Percent(position * 100f);
                }
            }
        }

        private void UpdateQuickSlots()
        {
            if (_inventory == null || _inventory.Revision == _inventoryRevision)
            {
                return;
            }

            _inventoryRevision = _inventory.Revision;
            Equipment equipment = _inventory.PlayerEquipment;
            for (int i = 0; i < QuickSlots.Length; i++)
            {
                string itemId = equipment != null ? equipment.GetQuickSlot(QuickSlots[i]) : null;
                bool empty = string.IsNullOrEmpty(itemId);
                string name = UiTexts.Get(UiTextKeys.QuickSlotEmpty);
                string count = string.Empty;
                if (!empty)
                {
                    name = _inventory.Catalog.TryGetItem(itemId, out ItemSpec spec) ? spec.DisplayName : itemId;
                    int amount = _inventory.CountInBag(InventoryOwners.Player, itemId);
                    count = amount.ToString(CultureInfo.InvariantCulture);
                }

                UiElementUtility.SetText(_quickNames[i], name);
                UiElementUtility.SetText(_quickCounts[i], count);
                if (_quickSlotElements[i] != null)
                {
                    _quickSlotElements[i].EnableInClassList("is-empty", empty);
                }
            }
        }

        private static float Normalized(ResourcePool pool, float fallback)
        {
            return pool != null ? pool.Normalized : fallback;
        }
    }
}
