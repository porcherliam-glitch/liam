using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using Aetherfall.Core;
using Aetherfall.Events;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Structure rules of global events (architecture 4.3): every <see cref="IGameEvent"/> in Aetherfall.Core and
    /// Aetherfall.Events is a readonly struct with only values (no UnityEngine.Object references) and at most 64 bytes.
    /// Also checks the payload of the new events of this step.
    /// </summary>
    [TestFixture]
    public sealed class GameEventStructureTests
    {
        private const int MaxEventSizeBytes = 64;

        private static IEnumerable<Type> AllEventTypes()
        {
            foreach (Assembly assembly in new[] { typeof(GameStateChanged).Assembly, typeof(InputDeviceChanged).Assembly })
            {
                foreach (Type type in assembly.GetTypes())
                {
                    if (typeof(IGameEvent).IsAssignableFrom(type) && !type.IsInterface)
                    {
                        yield return type;
                    }
                }
            }
        }

        [Test]
        public void EventsAssembly_ContainsTheEventsOfThisStep()
        {
            var names = new List<string>();
            foreach (Type type in AllEventTypes())
            {
                names.Add(type.Name);
            }

            Assert.That(names, Does.Contain(nameof(InputDeviceChanged)));
            Assert.That(names, Does.Contain(nameof(PlayerSpawned)));
            Assert.That(names, Does.Contain(nameof(GameStateChanged)));
        }

        [Test]
        public void AllEvents_AreReadonlyValueStructsWithoutUnityObjects()
        {
            foreach (Type type in AllEventTypes())
            {
                Assert.That(type.IsValueType, Is.True, type.Name + " must be a struct.");
                foreach (FieldInfo field in type.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
                {
                    Assert.That(field.IsInitOnly, Is.True, type.Name + "." + field.Name + " must be readonly.");
                    Assert.That(typeof(UnityEngine.Object).IsAssignableFrom(field.FieldType), Is.False,
                        type.Name + "." + field.Name + " references a UnityEngine.Object (only IDs and values allowed).");
                }
            }
        }

        [Test]
        public void AllEvents_AreAtMost64Bytes()
        {
            foreach (Type type in AllEventTypes())
            {
                int size = Marshal.SizeOf(type);
                Assert.That(size, Is.LessThanOrEqualTo(MaxEventSizeBytes), type.Name + " has " + size + " bytes.");
            }
        }

        [Test]
        public void InputDeviceChanged_KeepsPayload()
        {
            var evt = new InputDeviceChanged(DeviceKind.Gamepad, GlyphFamily.PlayStation);

            Assert.That(evt.DeviceKind, Is.EqualTo(DeviceKind.Gamepad));
            Assert.That(evt.GlyphFamily, Is.EqualTo(GlyphFamily.PlayStation));
            Assert.That(evt.ToString(), Does.Contain("Gamepad").And.Contain("PlayStation"));
        }

        [Test]
        public void PlayerSpawned_KeepsPayload()
        {
            // Fields set directly: outside Unity the harness reference assemblies have no Vector3 constructor body.
            Vector3 position = default;
            position.x = 1f;
            position.y = 2f;
            position.z = 3f;

            var evt = new PlayerSpawned(position, "worldspace.test.testgelaende");

            Assert.That(evt.Position.x, Is.EqualTo(1f));
            Assert.That(evt.Position.y, Is.EqualTo(2f));
            Assert.That(evt.Position.z, Is.EqualTo(3f));
            Assert.That(evt.WorldSpaceId, Is.EqualTo("worldspace.test.testgelaende"));
        }

        [Test]
        public void DeviceAndGlyphEnums_HaveStableValues()
        {
            // Values may be serialized (options, glyph style): never renumber them.
            Assert.That((int)DeviceKind.Unknown, Is.EqualTo(0));
            Assert.That((int)DeviceKind.KeyboardMouse, Is.EqualTo(1));
            Assert.That((int)DeviceKind.Gamepad, Is.EqualTo(2));
            Assert.That((int)GlyphFamily.KeyboardMouse, Is.EqualTo(0));
            Assert.That((int)GlyphFamily.Xbox, Is.EqualTo(1));
            Assert.That((int)GlyphFamily.PlayStation, Is.EqualTo(2));
            Assert.That((int)GlyphFamily.Nintendo, Is.EqualTo(3));
            Assert.That((int)GlyphFamily.Generic, Is.EqualTo(4));
        }
    }
}
