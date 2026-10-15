using Aetherfall.Events;
using Aetherfall.UI.Screens;
using NUnit.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// <see cref="InvestigateOverlayView"/> (task list S37): hidden until the detective mode starts, then a frame with the number
    /// of lit clues; Aether sight switches the frame to turquoise.
    /// </summary>
    [TestFixture]
    public sealed class InvestigateOverlayViewTests
    {
        [Test]
        public void ShowsTheFrameWhileInvestigating()
        {
            var root = new VisualElement();
            var view = new InvestigateOverlayView(root);
            VisualElement frame = root.Q<VisualElement>("hud-investigate");

            Assert.That(frame.style.display.value, Is.EqualTo(DisplayStyle.None));

            view.Apply(new InvestigateModeChanged(true, false, 2));
            Assert.That(view.IsVisible, Is.True);
            Assert.That(frame.style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(view.Text, Is.EqualTo("Untersuchen: 2 Hinweise leuchten."));
            Assert.That(frame.ClassListContains("af-investigate--aether"), Is.False);

            view.Apply(new InvestigateModeChanged(true, true, 1));
            Assert.That(view.Text, Is.EqualTo("Aether-Sicht: 1 Hinweis leuchtet."));
            Assert.That(frame.ClassListContains("af-investigate--aether"), Is.True);

            view.Apply(new InvestigateModeChanged(false, false, 0));
            Assert.That(view.IsVisible, Is.False);
            Assert.That(frame.style.display.value, Is.EqualTo(DisplayStyle.None));
        }

        [Test]
        public void SaysWhenThereIsNothingNearby()
        {
            Assert.That(InvestigateOverlayView.TextFor(true, false, 0), Is.EqualTo("Untersuchen: hier ist nichts zu finden."));
            Assert.That(InvestigateOverlayView.TextFor(false, false, 3), Is.Empty);
        }
    }
}
