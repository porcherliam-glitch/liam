using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Tests.Shared;
using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Unit tests for <see cref="GlyphCatalog"/>, <see cref="GlyphNames"/> and <see cref="GlyphService"/> (GDD 05 1.5).</summary>
    [TestFixture]
    public sealed class GlyphTests
    {
        [TestCase(GlyphFamily.KeyboardMouse, "Enter", "Esc", "Q", "E")]
        [TestCase(GlyphFamily.Xbox, "A", "B", "LB", "RB")]
        [TestCase(GlyphFamily.PlayStation, "×", "○", "L1", "R1")]
        [TestCase(GlyphFamily.Nintendo, "B", "A", "L", "R")]
        [TestCase(GlyphFamily.Generic, "Süd", "Ost", "L", "R")]
        public void ConfirmBackAndTabs_FollowTheTableOfGdd05(GlyphFamily family, string confirm, string back, string tabPrev, string tabNext)
        {
            Assert.That(GlyphCatalog.Get(UiGlyph.Confirm, family), Is.EqualTo(confirm));
            Assert.That(GlyphCatalog.Get(UiGlyph.Back, family), Is.EqualTo(back));
            Assert.That(GlyphCatalog.Get(UiGlyph.TabPrev, family), Is.EqualTo(tabPrev));
            Assert.That(GlyphCatalog.Get(UiGlyph.TabNext, family), Is.EqualTo(tabNext));
        }

        [Test]
        public void Interact_IsTheConfirmPosition()
        {
            Assert.That(GlyphCatalog.Get(UiGlyph.Interact, GlyphFamily.KeyboardMouse), Is.EqualTo("E"));
            Assert.That(GlyphCatalog.Get(UiGlyph.Interact, GlyphFamily.Xbox), Is.EqualTo("A"));
            Assert.That(GlyphCatalog.Get(UiGlyph.Interact, GlyphFamily.PlayStation), Is.EqualTo("×"));
        }

        [Test]
        public void Skip_IsTheSouthButtonOrSpace()
        {
            // GDD 03 1.5: SkipCutscene = A (south button) or Space, held.
            Assert.That(GlyphCatalog.Get(UiGlyph.Skip, GlyphFamily.KeyboardMouse), Is.EqualTo("Leertaste"));
            foreach (GlyphFamily family in new[] { GlyphFamily.Xbox, GlyphFamily.PlayStation, GlyphFamily.Nintendo, GlyphFamily.Generic })
            {
                Assert.That(GlyphCatalog.Get(UiGlyph.Skip, family), Is.EqualTo(GlyphCatalog.Get(UiGlyph.Confirm, family)), family.ToString());
            }
        }

        [Test]
        public void EveryGlyphHasATextInEveryFamily()
        {
            foreach (GlyphFamily family in System.Enum.GetValues(typeof(GlyphFamily)))
            {
                foreach (UiGlyph glyph in System.Enum.GetValues(typeof(UiGlyph)))
                {
                    string text = GlyphCatalog.Get(glyph, family);
                    Assert.That(text, Is.Not.Empty.And.Not.EqualTo("?"), glyph + " / " + family);
                }

                Assert.That(GlyphCatalog.StyleClass(family), Does.StartWith("glyphs-"));
            }
        }

        [Test]
        public void PlayStationSymbols_UseOnlyWgl4Characters()
        {
            // × (Latin-1), ○ □ ▲ (WGL4 geometric shapes) exist in every common UI font; △ and ✕ do not.
            string text = string.Empty;
            foreach (UiGlyph glyph in System.Enum.GetValues(typeof(UiGlyph)))
            {
                text += GlyphCatalog.Get(glyph, GlyphFamily.PlayStation);
            }

            Assert.That(text, Does.Not.Contain("△").And.Not.Contain("✕"));
        }

        [TestCase("pause-hint-glyph-back", true, UiGlyph.Back)]
        [TestCase("hud-ability-2-glyph-ability2", true, UiGlyph.Ability2)]
        [TestCase("hud-quick-4-glyph-quick4", true, UiGlyph.QuickSlot4)]
        [TestCase("hud-prompt-glyph-interact", true, UiGlyph.Interact)]
        [TestCase("pause-tabs-glyph-tabnext", true, UiGlyph.TabNext)]
        [TestCase("cutscene-hint-glyph-skip", true, UiGlyph.Skip)]
        [TestCase("pause-hint-back", false, UiGlyph.Confirm)]
        [TestCase("x-glyph-unknown", false, UiGlyph.Confirm)]
        [TestCase(null, false, UiGlyph.Confirm)]
        public void GlyphNames_ParseElementNames(string name, bool ok, UiGlyph expected)
        {
            Assert.That(GlyphNames.TryParseElementName(name, out UiGlyph glyph), Is.EqualTo(ok));
            Assert.That(glyph, Is.EqualTo(expected));
        }

        [Test]
        public void Service_FollowsInputDeviceChanged_AndRaisesChanged()
        {
            using (new LogCapture())
            {
                var bus = new EventBus();
                var service = new GlyphService(bus, GlyphFamily.KeyboardMouse);
                service.PostInitialize();
                int changes = 0;
                service.Changed += () => changes++;

                var evt = new InputDeviceChanged(DeviceKind.Gamepad, GlyphFamily.PlayStation);
                bus.Publish(in evt);

                Assert.That(service.Family, Is.EqualTo(GlyphFamily.PlayStation));
                Assert.That(service.Get(UiGlyph.Confirm), Is.EqualTo("×"));
                Assert.That(changes, Is.EqualTo(1));

                bus.Publish(in evt);
                Assert.That(changes, Is.EqualTo(1), "no change, no event");

                service.SetStyleOverride(GlyphFamily.Xbox);
                Assert.That(service.Family, Is.EqualTo(GlyphFamily.Xbox));
                Assert.That(changes, Is.EqualTo(2));
                var keyboard = new InputDeviceChanged(DeviceKind.KeyboardMouse, GlyphFamily.KeyboardMouse);
                bus.Publish(in keyboard);
                Assert.That(service.Family, Is.EqualTo(GlyphFamily.Xbox), "the style option wins");
                Assert.That(service.DetectedFamily, Is.EqualTo(GlyphFamily.KeyboardMouse));

                service.SetStyleOverride(null);
                Assert.That(service.Family, Is.EqualTo(GlyphFamily.KeyboardMouse));
                service.Dispose();
                bus.Publish(in evt);
                Assert.That(service.DetectedFamily, Is.EqualTo(GlyphFamily.KeyboardMouse), "unsubscribed after Dispose");
                bus.Dispose();
            }
        }
    }
}
