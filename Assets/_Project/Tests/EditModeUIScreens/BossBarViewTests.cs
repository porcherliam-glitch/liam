using System.Linq;
using Aetherfall.AI.Bosses;
using Aetherfall.UI.Screens;
using NUnit.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// <see cref="BossBarView"/> (guide 12, 11.3): sits in the column of the target panel, shows name, title and phase marks
    /// while a boss is visible and hides again at the end of the fight.
    /// </summary>
    [TestFixture]
    public sealed class BossBarViewTests
    {
        [Test]
        public void ShowsTheBossWithPhaseMarks_AndHidesAfterTheFight()
        {
            var root = new VisualElement();
            var column = new VisualElement();
            var target = new VisualElement { name = "hud-target" };
            column.Add(target);
            root.Add(column);
            var view = new BossBarView(root);

            VisualElement panel = root.Q<VisualElement>("hud-boss");
            Assert.That(panel.parent, Is.SameAs(column), "under the compass, next to the target panel");
            Assert.That(column.IndexOf(panel), Is.LessThan(column.IndexOf(target)));
            Assert.That(panel.style.display.value, Is.EqualTo(DisplayStyle.None));
            Assert.That(view.IsVisible, Is.False);

            view.Apply(new BossBarState("boss.eichental.wachender_ritter", "Der Wachende Ritter", "Hüter der Siegelkammer", 1f, 1, 2, true));
            view.Tick(0.1f);

            Assert.That(view.IsVisible, Is.True);
            Assert.That(panel.style.display.value, Is.EqualTo(DisplayStyle.Flex));
            string[] texts = panel.Query<Label>().ToList().Select(l => l.text).ToArray();
            Assert.That(texts, Does.Contain("Der Wachende Ritter").And.Contain("Hüter der Siegelkammer"));
            Assert.That(panel.Query<VisualElement>(className: "af-boss__mark").ToList().Count, Is.EqualTo(1), "2 phases = 1 mark");

            view.Apply(new BossBarState("boss.eichental.wachender_ritter", "Der Wachende Ritter", string.Empty, 0.4f, 2, 2, true));
            view.Tick(0.1f);
            Assert.That(panel.Query<VisualElement>(className: "af-boss__mark").ToList().Count, Is.EqualTo(1), "marks are not duplicated");

            view.Apply(new BossBarState("boss.eichental.wachender_ritter", "Der Wachende Ritter", string.Empty, 0f, 2, 2, false));
            Assert.That(view.IsVisible, Is.False);
            Assert.That(panel.style.display.value, Is.EqualTo(DisplayStyle.None));
        }

        [Test]
        public void WithoutTargetPanel_SitsAtTheEndOfTheHud()
        {
            var root = new VisualElement();
            root.Add(new VisualElement());

            new BossBarView(root);

            Assert.That(root[root.childCount - 1].name, Is.EqualTo("hud-boss"));
        }
    }
}
