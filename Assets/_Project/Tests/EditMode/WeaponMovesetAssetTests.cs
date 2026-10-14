using System.Linq;
using Aetherfall.Combat;
using Aetherfall.Events;
using NUnit.Framework;
using UnityEditor;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// The generated weapon movesets in <c>Data/Combat/Weapons</c> (TestGroundCombatAssets): every one must build a valid
    /// <see cref="WeaponSpec"/>, and the one-handed mace must have the values of GDD 03 5.1/5.3.
    /// </summary>
    public sealed class WeaponMovesetAssetTests
    {
        private const string Folder = "Assets/_Project/Data/Combat/Weapons";

        [Test]
        public void EveryWeaponAsset_CreatesAValidSpec()
        {
            WeaponDefinition[] weapons = AssetDatabase.FindAssets("t:WeaponDefinition", new[] { Folder })
                .Select(guid => AssetDatabase.LoadAssetAtPath<WeaponDefinition>(AssetDatabase.GUIDToAssetPath(guid)))
                .Where(w => w != null)
                .ToArray();
            Assert.That(weapons.Length, Is.GreaterThanOrEqualTo(3), "Schwert, Zauberstab und Streitkolben fehlen (Generator ausführen).");
            foreach (WeaponDefinition weapon in weapons)
            {
                Assert.That(weapon.CreateSpec(null, out string problem), Is.Not.Null, weapon.name + ": " + problem);
            }
        }

        [Test]
        public void Mace_HasTheValuesOfGdd03()
        {
            var mace = AssetDatabase.LoadAssetAtPath<WeaponDefinition>(Folder + "/Streitkolben.asset");
            Assert.That(mace, Is.Not.Null, "Streitkolben.asset fehlt (Generator ausführen).");
            WeaponSpec spec = mace.CreateSpec(null, out string problem);
            Assert.That(spec, Is.Not.Null, problem);

            Assert.That(spec.LightCombo.Length, Is.EqualTo(3), "Kombo leicht 3");
            Assert.That(spec.DamageType, Is.EqualTo(DamageType.Blunt));
            Assert.That(spec.WeaponPoise, Is.EqualTo(14f));
            Assert.That(spec.Scaling.Strength, Is.EqualTo(0.6f).Within(0.001f));
            Assert.That(spec.Scaling.Wisdom, Is.EqualTo(0.4f).Within(0.001f));
            Assert.That(spec.Scaling.Dexterity, Is.EqualTo(0f));
            Assert.That(spec.LightCombo[0].StaminaCost, Is.EqualTo(14f));
            Assert.That(spec.Heavy.StaminaCost, Is.EqualTo(28f));
            // Tempo = duration of a light blow up to the combo window (GDD 03 5.1): 600 ms.
            Assert.That(spec.LightCombo[0].ComboWindowStartSeconds, Is.EqualTo(0.6f).Within(0.001f));
            Assert.That(spec.LightCombo.All(a => !a.IsProjectile), Is.True);
        }
    }
}
