using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Type picker of the inspector (architecture 7.4, editor assembly Narrative): the menu entries come from
    /// <c>[TypeMenu]</c> with German paths, sorted by folder and order, types without attribute go to "Sonstige" at the end,
    /// abstract types and types without a parameterless constructor are not offered, types of assemblies that are not part of
    /// the player (test assemblies, editor tools) are not offered, and the type names Unity stores for managed references are
    /// resolved.
    /// </summary>
    [TestFixture]
    public sealed class TypeMenuCatalogTests
    {
        [Test]
        public void Entries_AreSortedByFolderAndOrder_WithGermanNames()
        {
            List<TypeMenuEntry> entries = TypeMenuCatalog.BuildEntries(new[]
            {
                typeof(QuestStatusIs), typeof(FlagIs), typeof(Not), typeof(AllOf), typeof(AnyOf), typeof(FlagAge), typeof(UnlabeledCondition)
            });

            var paths = entries.ConvertAll(e => e.Path);
            Assert.That(paths, Is.EqualTo(new[]
            {
                "Logik/UND (alle)", "Logik/ODER (eines)", "Logik/NICHT", "Quest/Status ist", "Welt/Flag", "Welt/Flag seit mindestens n Stunden",
                "Sonstige/UnlabeledCondition"
            }));
            Assert.That(entries[0].DisplayName, Is.EqualTo("UND (alle)"));
            Assert.That(entries[0].Folder, Is.EqualTo("Logik"));
        }

        [Test]
        public void NotSelectable_AbstractOrWithoutParameterlessConstructor()
        {
            Assert.That(TypeMenuCatalog.IsSelectable(typeof(Condition)), Is.False, "abstract");
            Assert.That(TypeMenuCatalog.IsSelectable(typeof(RecordAction)), Is.False, "no parameterless constructor");
            Assert.That(TypeMenuCatalog.IsSelectable(typeof(KillObjective)), Is.True);
            Assert.That(TypeMenuCatalog.BuildEntries(new[] { typeof(RecordAction), typeof(SetFlag), typeof(SetFlag) }).Count, Is.EqualTo(1));
        }

        [Test]
        public void TypesOfEditorOnlyAssemblies_AreNotOffered()
        {
            string testAssembly = typeof(TypeMenuCatalogTests).Assembly.GetName().Name;
            HashSet<string> editorOnly = TypeMenuCatalog.EditorOnlyAssemblyNames(
                new[] { "Aetherfall.Conditions", "Aetherfall.WorldState", "Aetherfall.Quests", "Aetherfall.EditorTools.Narrative", testAssembly },
                new[] { "Aetherfall.Conditions", "Aetherfall.WorldState", "Aetherfall.Quests", "Aetherfall.UI.Screens" });

            Assert.That(editorOnly, Is.EquivalentTo(new[] { "Aetherfall.EditorTools.Narrative", testAssembly }));

            List<TypeMenuEntry> entries = TypeMenuCatalog.BuildEntries(new[]
            {
                typeof(SetFlag), typeof(GiveTestItem), typeof(GiveTestGold), typeof(FlagIs), typeof(TestHourBetween), typeof(PolledTestCondition),
                typeof(UnlabeledCondition)
            }, editorOnly);

            Assert.That(entries.ConvertAll(e => e.Path), Is.EqualTo(new[] { "Welt/Flag", "Welt/Flag setzen" }));
            foreach (TypeMenuEntry entry in entries)
            {
                Assert.That(entry.Type.Assembly.GetName().Name, Does.Not.StartWith("Aetherfall.Tests"), entry.Path);
            }
        }

        [Test]
        public void ObjectiveMenu_StartsWithZiele()
        {
            List<TypeMenuEntry> entries = TypeMenuCatalog.BuildEntries(new[] { typeof(TalkToObjective), typeof(KillObjective), typeof(GoToObjective) });

            Assert.That(entries.ConvertAll(e => e.Path), Is.EqualTo(new[] { "Ziele/Töte Gegner (Anzahl)", "Ziele/Rede mit NPC", "Ziele/Gehe zu Ort" }));
            Assert.That(TypeMenuCatalog.MenuPath(typeof(UnlabeledCondition)), Is.EqualTo("Sonstige/UnlabeledCondition"));
            Assert.That(TypeMenuCatalog.DisplayName(typeof(SetFlag)), Is.EqualTo("Flag setzen"));
        }

        [Test]
        public void ResolveUnityTypeName_ReadsAssemblyAndTypeName()
        {
            Assert.That(TypeMenuCatalog.ResolveUnityTypeName("Aetherfall.Conditions Aetherfall.Conditions.AllOf"), Is.EqualTo(typeof(AllOf)));
            Assert.That(TypeMenuCatalog.ResolveUnityTypeName("Aetherfall.Quests Aetherfall.Quests.QuestObjective"), Is.EqualTo(typeof(QuestObjective)));
            Assert.That(TypeMenuCatalog.ResolveUnityTypeName(string.Empty), Is.Null);
            Assert.That(TypeMenuCatalog.ResolveUnityTypeName("Aetherfall.Quests Aetherfall.Quests.GibtEsNicht"), Is.Null);
        }
    }
}
