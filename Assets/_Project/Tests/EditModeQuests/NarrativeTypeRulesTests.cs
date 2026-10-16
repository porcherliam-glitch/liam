using System;
using System.Collections.Generic;
using System.Reflection;
using Aetherfall.Conditions;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Rules of architecture 7.6 for every concrete <c>[SerializeReference]</c> type of the narrative assemblies (Conditions,
    /// WorldState, Quests, Cinematics): <c>[Serializable]</c>, <c>sealed</c>, not generic, public parameterless constructor, a German
    /// <c>[TypeMenu]</c> in the right folder, no two types with the same menu path, no mutable state outside serialized
    /// fields. Also checks the list of types of architecture 7.7 that this step delivers.
    /// </summary>
    [TestFixture]
    public sealed class NarrativeTypeRulesTests
    {
        private static readonly Assembly[] Assemblies =
        {
            typeof(Condition).Assembly,
            typeof(FlagIs).Assembly,
            typeof(QuestObjective).Assembly,
            typeof(Aetherfall.Cinematics.PlayCutscene).Assembly
        };

        [Test]
        public void ConcreteTypes_FollowArchitecture76()
        {
            var paths = new Dictionary<string, Type>(StringComparer.Ordinal);
            int checkedTypes = 0;
            foreach (Type type in ConcreteTypes())
            {
                checkedTypes++;
                Assert.That(type.IsSealed, Is.True, type.Name + " must be sealed");
                Assert.That(Attribute.IsDefined(type, typeof(SerializableAttribute), false), Is.True, type.Name + " must be [Serializable]");
                Assert.That(type.IsGenericType, Is.False, type.Name + " must not be generic");
                Assert.That(type.GetConstructor(Type.EmptyTypes), Is.Not.Null, type.Name + " needs a public parameterless constructor");

                var menu = type.GetCustomAttribute<TypeMenuAttribute>(false);
                Assert.That(menu, Is.Not.Null, type.Name + " needs a German [TypeMenu]");
                Assert.That(menu.Path, Does.StartWith(ExpectedFolder(type)), type.Name);
                Assert.That(paths.ContainsKey(menu.Path), Is.False, type.Name + " uses the menu path of " + (paths.ContainsKey(menu.Path) ? paths[menu.Path].Name : string.Empty));
                paths[menu.Path] = type;
            }

            Assert.That(checkedTypes, Is.GreaterThanOrEqualTo(34), "7 logic, 4 world state, 9 quest conditions and actions, 14 objectives");
        }

        [Test]
        public void ConcreteTypes_CanBeCreatedWithoutArguments()
        {
            foreach (Type type in ConcreteTypes())
            {
                object instance = Activator.CreateInstance(type);
                string description;
                switch (instance)
                {
                    case Condition condition:
                        description = condition.Describe();
                        break;
                    case GameAction action:
                        description = action.Describe();
                        break;
                    default:
                        description = ((QuestObjective)instance).Describe();
                        break;
                }

                Assert.That(description, Is.Not.Empty, type.Name + ": Describe of an empty instance");
            }
        }

        [Test]
        public void TypesOfArchitecture77_ThatThisStepDelivers_Exist()
        {
            Type[] expected =
            {
                typeof(AllOf), typeof(AnyOf), typeof(Not), typeof(AtLeastNOf), typeof(Always), typeof(Never), typeof(ConditionalAction),
                typeof(FlagIs), typeof(FlagAge), typeof(SetFlag), typeof(AddToFlag),
                typeof(QuestStatusIs), typeof(QuestStageReached), typeof(StartQuest), typeof(CompleteQuest), typeof(FailQuest),
                typeof(SetQuestStage), typeof(AddLedgerEntry)
            };

            var all = new List<Type>(ConcreteTypes());
            for (int i = 0; i < expected.Length; i++)
            {
                Assert.That(all, Does.Contain(expected[i]));
            }
        }

        [Test]
        public void ObjectiveTypes_OfGdd02_Exist()
        {
            Type[] expected =
            {
                typeof(KillObjective), typeof(KillSpecificObjective), typeof(CollectObjective), typeof(DeliverItemObjective),
                typeof(TalkToObjective), typeof(GoToObjective), typeof(InteractObjective), typeof(ReachInTimeObjective),
                typeof(FollowTrailObjective), typeof(InspectCluesObjective), typeof(WaitUntilTimeObjective), typeof(ChooseObjective),
                typeof(UseAbilityObjective), typeof(ConditionObjective)
            };

            var shortCodes = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < expected.Length; i++)
            {
                var objective = (QuestObjective)Activator.CreateInstance(expected[i]);
                Assert.That(shortCodes.Add(objective.ShortCode), Is.True, "short code " + objective.ShortCode + " twice");
            }
        }

        private static IEnumerable<Type> ConcreteTypes()
        {
            for (int a = 0; a < Assemblies.Length; a++)
            {
                foreach (Type type in Assemblies[a].GetTypes())
                {
                    if (type.IsAbstract || type.IsInterface)
                    {
                        continue;
                    }

                    if (typeof(Condition).IsAssignableFrom(type) || typeof(GameAction).IsAssignableFrom(type) || typeof(QuestObjective).IsAssignableFrom(type))
                    {
                        yield return type;
                    }
                }
            }
        }

        private static string ExpectedFolder(Type type)
        {
            if (typeof(QuestObjective).IsAssignableFrom(type))
            {
                return "Ziele/";
            }

            if (type.Assembly == typeof(Aetherfall.Cinematics.PlayCutscene).Assembly)
            {
                return "Inszenierung/";
            }

            if (type.Assembly == typeof(FlagIs).Assembly)
            {
                return "Welt/";
            }

            return type.Assembly == typeof(QuestObjective).Assembly ? "Quest/" : "Logik/";
        }
    }
}
