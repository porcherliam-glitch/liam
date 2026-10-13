using System;
using System.Collections.Generic;
using Aetherfall.Input;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>Checks the action names of the Gameplay map (GDD 03 1.5) used by <see cref="IGameplayInput"/>.</summary>
    [TestFixture]
    public sealed class InputActionNamesTests
    {
        [Test]
        public void ForButton_EveryButtonHasADistinctName()
        {
            var names = new HashSet<string>();
            foreach (GameplayButton button in (GameplayButton[])Enum.GetValues(typeof(GameplayButton)))
            {
                string name = InputActionNames.ForButton(button);
                Assert.That(name, Is.Not.Null.And.Not.Empty, button.ToString());
                Assert.That(names.Add(name), Is.True, "duplicate action name " + name);
                Assert.That(name, Is.EqualTo(button.ToString()), "action IDs follow GDD 03 1.5");
            }
        }

        [Test]
        public void ForButton_UnknownValue_Throws()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => InputActionNames.ForButton((GameplayButton)999));
        }

        [Test]
        public void GameplayButtons_AreNumberedWithoutGaps()
        {
            var values = (GameplayButton[])Enum.GetValues(typeof(GameplayButton));
            for (int i = 0; i < values.Length; i++)
            {
                Assert.That((int)values[i], Is.EqualTo(i), "GameplayInput indexes an array with these values");
            }
        }

        [Test]
        public void ContextPairs_ResolvedConflictsOfGdd03_UseTheDocumentedIds()
        {
            // K3: Sneak exists as its own action; K6/K7/K8: additional actions of the Gameplay map.
            Assert.That(InputActionNames.Gameplay.Sneak, Is.EqualTo("Sneak"));
            Assert.That(InputActionNames.Gameplay.RangedStance, Is.EqualTo("RangedStance"));
            Assert.That(InputActionNames.Gameplay.LockOn, Is.EqualTo("LockOn"));
            Assert.That(InputActionNames.Gameplay.Investigate, Is.EqualTo("Investigate"));
            Assert.That(InputActionNames.Gameplay.WalkToggle, Is.EqualTo("WalkToggle"));
        }
    }
}
