using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// Unit tests for the small value rules of the UI: <see cref="UiScaleRules"/> (GDD 05 1.6), <see cref="DelayedBar"/> and
    /// <see cref="HudVisibilityRules"/> (1.2), <see cref="CompassMath"/> (1.8), <see cref="SaveSlotText"/> (5.5),
    /// <see cref="UiFlowRules"/> and <see cref="UiPreferences"/>.
    /// </summary>
    [TestFixture]
    public sealed class ValueRulesTests
    {
        [TestCase(100, 100)]
        [TestCase(84, 80)]
        [TestCase(86, 90)]
        [TestCase(40, 80)]
        [TestCase(200, 150)]
        public void UiPercent_SnapsToStepsBetween80And150(int requested, int expected)
        {
            Assert.That(UiScaleRules.ClampUiPercent(requested), Is.EqualTo(expected));
        }

        [Test]
        public void UiPercent_StepStopsAtTheEnds()
        {
            Assert.That(UiScaleRules.Step(100, 1), Is.EqualTo(110));
            Assert.That(UiScaleRules.Step(150, 1), Is.EqualTo(150));
            Assert.That(UiScaleRules.Step(80, -1), Is.EqualTo(80));
        }

        [Test]
        public void PanelScale_IsLimitedSoThatTheMenusKeep1620x840()
        {
            Assert.That(UiScaleRules.PanelScale(100, 1920, 1080), Is.EqualTo(1f).Within(0.0001f));
            Assert.That(UiScaleRules.PanelScale(110, 1920, 1080), Is.EqualTo(1.1f).Within(0.0001f));
            // 16:9: limited by the width, 1920 / 1620 = 1.185.
            Assert.That(UiScaleRules.PanelScale(150, 1920, 1080), Is.EqualTo(1920f / 1620f).Within(0.0001f));
            Assert.That(UiScaleRules.PanelScale(150, 3840, 2160), Is.EqualTo(1920f / 1620f).Within(0.0001f));
            // 16:10 (MacBook): 1080 * 1.6 / 1620 = 1.067.
            Assert.That(UiScaleRules.PanelScale(150, 2560, 1600), Is.EqualTo(1728f / 1620f).Within(0.0001f));
            Assert.That(UiScaleRules.PanelScale(100, 2880, 1800), Is.EqualTo(1f).Within(0.0001f));
            // 21:9: limited by the height, 1080 / 840 = 1.286.
            Assert.That(UiScaleRules.PanelScale(150, 3440, 1440), Is.EqualTo(1080f / 840f).Within(0.0001f));
            // 4:3: even 100 % would not fit (1440 < 1620): 1440 / 1620 = 0.889; 80 % stays 80 %.
            Assert.That(UiScaleRules.PanelScale(100, 1024, 768), Is.EqualTo(1440f / 1620f).Within(0.0001f));
            Assert.That(UiScaleRules.PanelScale(80, 1024, 768), Is.EqualTo(0.8f).Within(0.0001f));
        }

        [TestCase(1920, 1080)]
        [TestCase(2560, 1600)]
        [TestCase(2880, 1800)]
        [TestCase(3440, 1440)]
        [TestCase(1280, 720)]
        [TestCase(1680, 1050)]
        public void PanelScale_KeepsTheLogicalLayoutAtLeastTheMenuSize_AtEveryUiSize(int width, int height)
        {
            for (int percent = UiScaleRules.MinUiPercent; percent <= UiScaleRules.MaxUiPercent; percent += UiScaleRules.StepPercent)
            {
                // ScaleWithScreenSize (match = height) times PanelSettings.scale: logical size = screen / (height / 1080 * scale).
                float scale = UiScaleRules.PanelScale(percent, width, height);
                float logicalHeight = UiScaleRules.ReferenceHeight / scale;
                float logicalWidth = logicalHeight * width / height;
                Assert.That(logicalWidth, Is.GreaterThanOrEqualTo(UiScaleRules.MinLogicalWidth - 0.01f), percent + " %: width");
                Assert.That(logicalHeight, Is.GreaterThanOrEqualTo(UiScaleRules.MinLogicalHeight - 0.01f), percent + " %: height");
                Assert.That(scale, Is.LessThanOrEqualTo(percent / 100f + 0.0001f), percent + " %: never larger than chosen");
            }
        }

        [Test]
        public void DelayedBar_LossTrailWaits600msThenDrains()
        {
            var bar = new DelayedBar();
            bar.SetValue(0.5f);
            Assert.That(bar.Value, Is.EqualTo(0.5f));
            Assert.That(bar.Trail, Is.EqualTo(1f));
            bar.Update(0.5f);
            Assert.That(bar.Trail, Is.EqualTo(1f), "still waiting");
            bar.Update(0.2f);
            Assert.That(bar.Trail, Is.LessThan(1f).And.GreaterThan(0.5f));
            bar.Update(2f);
            Assert.That(bar.Trail, Is.EqualTo(0.5f));
        }

        [Test]
        public void DelayedBar_GainMovesBothAtOnce_AndSnapResets()
        {
            var bar = new DelayedBar();
            bar.SetValue(0.2f);
            bar.SetValue(0.9f);
            Assert.That(bar.Value, Is.EqualTo(0.9f));
            Assert.That(bar.Trail, Is.EqualTo(1f).Or.EqualTo(0.9f));
            bar.Snap(0.3f);
            Assert.That(bar.Trail, Is.EqualTo(0.3f));
            bar.SetValue(float.NaN);
            Assert.That(bar.Value, Is.EqualTo(0f));
        }

        [Test]
        public void HudContextual_HealthShowsBelowFullAndFourSecondsAfterCombat()
        {
            var rules = new HudVisibilityRules();
            var context = new HudContext { Health01 = 1f, Stamina01 = 1f, Mana01 = 1f };
            rules.Update(context, 0.1f);
            Assert.That(rules.ShowHealth, Is.False);
            Assert.That(rules.ShowCompass, Is.True);

            context.Health01 = 0.8f;
            rules.Update(context, 0.1f);
            Assert.That(rules.ShowHealth, Is.True);

            context.Health01 = 1f;
            context.InCombat = true;
            rules.Update(context, 0.1f);
            Assert.That(rules.ShowHealth && rules.ShowAbilities && rules.ShowQuickSlots && rules.ShowMana, Is.True);

            context.InCombat = false;
            rules.Update(context, 3.9f);
            Assert.That(rules.ShowHealth, Is.True);
            rules.Update(context, 0.2f);
            Assert.That(rules.ShowHealth, Is.False);
        }

        [Test]
        public void HudContextual_StaminaHidesTwoSecondsAfterFull()
        {
            var rules = new HudVisibilityRules();
            var context = new HudContext { Health01 = 1f, Stamina01 = 0.5f, Mana01 = 1f };
            rules.Update(context, 0.1f);
            Assert.That(rules.ShowStamina, Is.True);
            context.Stamina01 = 1f;
            rules.Update(context, 1.9f);
            Assert.That(rules.ShowStamina, Is.True);
            rules.Update(context, 0.2f);
            Assert.That(rules.ShowStamina, Is.False);
        }

        [Test]
        public void HudModes_FullShowsAll_MinimalOnlyLowHealth_PeekShowsAllForFiveSeconds()
        {
            var rules = new HudVisibilityRules { Mode = HudMode.Full };
            var context = new HudContext { Health01 = 1f, Stamina01 = 1f, Mana01 = 1f };
            rules.Update(context, 0.1f);
            Assert.That(rules.ShowHealth && rules.ShowStamina && rules.ShowMana && rules.ShowAbilities && rules.ShowQuickSlots && rules.ShowCompass, Is.True);

            rules.Mode = HudMode.Minimal;
            context.Health01 = 0.5f;
            rules.Update(context, 0.1f);
            Assert.That(rules.ShowHealth, Is.False);
            Assert.That(rules.ShowCompass, Is.False);
            context.Health01 = 0.2f;
            rules.Update(context, 0.1f);
            Assert.That(rules.ShowHealth, Is.True);

            rules.Peek();
            rules.Update(context, 4.9f);
            Assert.That(rules.ShowCompass, Is.True);
            rules.Update(context, 0.2f);
            Assert.That(rules.ShowCompass, Is.False);
        }

        [TestCase(0f, 90f, 90f)]
        [TestCase(350f, 10f, 20f)]
        [TestCase(10f, 350f, -20f)]
        [TestCase(0f, 180f, 180f)]
        public void Compass_DeltaAngle(float from, float to, float expected)
        {
            Assert.That(CompassMath.DeltaAngle(from, to), Is.EqualTo(expected).Within(0.001f));
        }

        [Test]
        public void Compass_StripPositions()
        {
            Assert.That(CompassMath.TryGetStripPosition(0f, 0f, 180f, out float north), Is.True);
            Assert.That(north, Is.EqualTo(0.5f).Within(0.0001f));
            Assert.That(CompassMath.TryGetStripPosition(90f, 0f, 180f, out float east), Is.True);
            Assert.That(east, Is.EqualTo(1f).Within(0.0001f));
            Assert.That(CompassMath.TryGetStripPosition(180f, 0f, 180f, out _), Is.False, "south is behind the player");
            Assert.That(CompassMath.TryGetStripPosition(315f, 0f, 180f, out float northWest), Is.True);
            Assert.That(northWest, Is.EqualTo(0.25f).Within(0.0001f));
            Assert.That(CompassMath.HeadingOf(1f, 0f), Is.EqualTo(90f).Within(0.001f));
            Assert.That(CompassMath.HeadingOf(0f, -1f), Is.EqualTo(180f).Within(0.001f));
            Assert.That(CompassMath.HeadingOf(-1f, 0f), Is.EqualTo(270f).Within(0.001f));
        }

        [Test]
        public void SaveSlotTexts()
        {
            Assert.That(SaveSlotText.KindName(SaveKind.Quick), Is.EqualTo("Schnellspeicherung"));
            Assert.That(SaveSlotText.KindName(SaveKind.Auto), Is.EqualTo("Autospeicherung"));
            Assert.That(SaveSlotText.Playtime(0d), Is.EqualTo("0:00 h"));
            Assert.That(SaveSlotText.Playtime(23 * 3600 + 41 * 60 + 59), Is.EqualTo("23:41 h"));
            Assert.That(SaveSlotText.PlaytimeLine(125), Is.EqualTo("Spielzeit 0:02 h"));
            Assert.That(SaveSlotText.DateTime("2026-10-12T19:14:00Z", utc => utc.AddHours(2)), Is.EqualTo("12.10.2026, 21:14"));
            Assert.That(SaveSlotText.DateTime("kaputt"), Is.Empty);
            Assert.That(SaveSlotText.DateTime(null), Is.Empty);
        }

        [Test]
        public void FlowRules_HudAndMessagesPerGameState()
        {
            Assert.That(UiFlowRules.ShowsHud(GameState.Playing), Is.True);
            Assert.That(UiFlowRules.ShowsHud(GameState.Paused), Is.True);
            Assert.That(UiFlowRules.ShowsHud(GameState.MainMenu), Is.False);
            Assert.That(UiFlowRules.ShowsHud(GameState.Loading), Is.False);
            Assert.That(UiFlowRules.ShowsHud(GameState.Cutscene), Is.False);
            Assert.That(UiFlowRules.SuppressesNotifications(GameState.Playing), Is.False);
            Assert.That(UiFlowRules.SuppressesNotifications(GameState.Paused), Is.True);
            Assert.That(UiFlowRules.SuppressesNotifications(GameState.Menu), Is.True);
            Assert.That(UiFlowRules.SuppressesNotifications(GameState.Dialogue), Is.True);
            Assert.That(UiFlowRules.UsesMenuCamera(GameState.Boot), Is.True);
            Assert.That(UiFlowRules.UsesMenuCamera(GameState.MainMenu), Is.True);
            Assert.That(UiFlowRules.UsesMenuCamera(GameState.Loading), Is.True);
            Assert.That(UiFlowRules.UsesMenuCamera(GameState.Playing), Is.False, "in the game the camera of the scene renders");
            Assert.That(UiFlowRules.UsesMenuCamera(GameState.Paused), Is.False);
            Assert.That(UiFlowRules.UsesMenuCamera(GameState.Menu), Is.False);
            Assert.That(UiFlowRules.UsesMenuCamera(GameState.Cutscene), Is.False);
        }

        [Test]
        public void Preferences_CycleAndRaiseChanged()
        {
            var preferences = new UiPreferences();
            int changes = 0;
            preferences.Changed += () => changes++;

            preferences.UiPercent = 120;
            preferences.UiPercent = 120;
            Assert.That(changes, Is.EqualTo(1));
            preferences.CycleHudMode(1);
            Assert.That(preferences.HudMode, Is.EqualTo(HudMode.Full));
            preferences.CycleHudMode(-1);
            preferences.CycleHudMode(-1);
            Assert.That(preferences.HudMode, Is.EqualTo(HudMode.Minimal));
            Assert.That(preferences.HudModeText(), Is.EqualTo("Minimal"));

            Assert.That(preferences.GlyphStyle, Is.Null);
            Assert.That(preferences.GlyphStyleText(), Is.EqualTo("Automatisch"));
            preferences.CycleGlyphStyle(1);
            Assert.That(preferences.GlyphStyle, Is.EqualTo(GlyphFamily.KeyboardMouse));
            preferences.CycleGlyphStyle(-1);
            preferences.CycleGlyphStyle(-1);
            Assert.That(preferences.GlyphStyle, Is.EqualTo(GlyphFamily.Generic));
        }
    }
}
