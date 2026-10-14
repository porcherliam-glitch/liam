using System;
using System.Collections.Generic;
using System.Reflection;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// The writer of the test quest assets (<see cref="QuestAssetWriter"/>) must know every serialized field of
    /// <see cref="QuestDefinition"/> and <see cref="FlagDefinition"/>: a field added later would otherwise stay empty in the
    /// assets the test ground menu writes. (Writing itself needs Unity's SerializedObject and is checked in Unity.)
    /// </summary>
    [TestFixture]
    public sealed class QuestAssetWriterTests
    {
        [Test]
        public void QuestWriter_CoversEverySerializedField()
        {
            Assert.That(QuestAssetWriter.QuestFields, Is.EquivalentTo(SerializedFields(typeof(QuestDefinition))));
        }

        [Test]
        public void FlagWriter_CoversEverySerializedField()
        {
            Assert.That(QuestAssetWriter.FlagFields, Is.EquivalentTo(SerializedFields(typeof(FlagDefinition))));
        }

        private static List<string> SerializedFields(Type type)
        {
            var names = new List<string>();
            for (Type current = type; current != null && current != typeof(ScriptableObject); current = current.BaseType)
            {
                FieldInfo[] fields = current.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
                for (int i = 0; i < fields.Length; i++)
                {
                    if (Attribute.IsDefined(fields[i], typeof(SerializeField)) || Attribute.IsDefined(fields[i], typeof(SerializeReference)) ||
                        (fields[i].IsPublic && !fields[i].IsInitOnly))
                    {
                        names.Add(fields[i].Name);
                    }
                }
            }

            return names;
        }
    }
}
