using System;
using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>Type whitelist of save DTOs (architecture 9.1, <see cref="SaveDtoValidator"/>).</summary>
    [TestFixture]
    public sealed class SaveDtoValidatorTests
    {
        public sealed class GoodDto
        {
            public int Count;
            public float Value;
            public double Seconds;
            public bool Flag;
            public string Id = string.Empty;
            public SaveKind Kind;
            public int? Optional;
            public string[] Ids = Array.Empty<string>();
            public List<NestedDto> Children = new List<NestedDto>();
            public Dictionary<string, int> Counts = new Dictionary<string, int>();
            public NestedDto Single = new NestedDto();
        }

        public sealed class NestedDto
        {
            public string Name = string.Empty;
            public NestedDto Next;
        }

        public sealed class WithVector3
        {
            public Vector3 Position;
        }

        public sealed class WithObject
        {
            public object Anything;
        }

        public sealed class WithProperty
        {
            public int Value { get; set; }
        }

        public sealed class WithReadOnly
        {
            public readonly int Value = 1;
        }

        public sealed class WithIntKeys
        {
            public Dictionary<int, string> Map = new Dictionary<int, string>();
        }

        public sealed class WithHashSet
        {
            public HashSet<string> Set = new HashSet<string>();
        }

        public sealed class WithUnityObject
        {
            public ScriptableObject Definition;
        }

        public sealed class WithDelegate
        {
            public Action Callback;
        }

        public sealed class WithoutDefaultConstructor
        {
            public int Value;

            public WithoutDefaultConstructor(int value)
            {
                Value = value;
            }
        }

        public abstract class AbstractDto
        {
            public int Value;
        }

        [Test]
        public void AcceptsNumbersStringsEnumsCollectionsAndNestedDtos()
        {
            Assert.That(SaveDtoValidator.Validate(typeof(GoodDto), out string problem), Is.True, problem);
            Assert.That(SaveDtoValidator.Validate(typeof(SaveHeader), out problem), Is.True, problem);
        }

        [TestCase(typeof(WithVector3), "struct")]
        [TestCase(typeof(WithObject), "Object")]
        [TestCase(typeof(WithProperty), "properties")]
        [TestCase(typeof(WithReadOnly), "read-only")]
        [TestCase(typeof(WithIntKeys), "keys")]
        [TestCase(typeof(WithHashSet), "HashSet")]
        [TestCase(typeof(WithUnityObject), "Unity")]
        [TestCase(typeof(WithDelegate), "not allowed")]
        [TestCase(typeof(WithoutDefaultConstructor), "parameterless")]
        [TestCase(typeof(AbstractDto), "abstract")]
        [TestCase(typeof(string), "not a class")]
        public void RejectsForbiddenTypes(Type type, string expectedText)
        {
            Assert.That(SaveDtoValidator.Validate(type, out string problem), Is.False);
            Assert.That(problem, Does.Contain(expectedText));
        }
    }
}
