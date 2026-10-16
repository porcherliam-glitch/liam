using System.Collections.Generic;
using Aetherfall.Core;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// The world marker registry (S60: where quest targets stand) and the handle the scene components use: several transforms
    /// per id, prefix patterns, removal only of the own transform, destroyed transforms, register on connect.
    /// </summary>
    [TestFixture]
    public sealed class WorldMarkerRegistryTests
    {
        private readonly List<GameObject> _objects = new List<GameObject>();
        private readonly List<Vector3> _positions = new List<Vector3>();
        private WorldMarkerRegistry _registry;

        [SetUp]
        public void SetUp()
        {
            _registry = new WorldMarkerRegistry();
            _positions.Clear();
        }

        [TearDown]
        public void TearDown()
        {
            foreach (GameObject go in _objects)
            {
                if (go != null)
                {
                    Object.DestroyImmediate(go);
                }
            }

            _objects.Clear();
        }

        [Test]
        public void Register_ResolvesTheLivePosition()
        {
            Transform npc = Make(new Vector3(1f, 2f, 3f));
            _registry.Register("npc.eichental.corvin", npc);
            npc.position = new Vector3(5f, 0f, 9f);

            Assert.That(_registry.CollectPositions("npc.eichental.corvin", _positions), Is.EqualTo(1));
            Assert.That(_positions[0], Is.EqualTo(new Vector3(5f, 0f, 9f)), "NPCs walk: the position is read when asked");
            Assert.That(_registry.CollectPositions("npc.eichental.unbekannt", _positions), Is.EqualTo(0));
        }

        [Test]
        public void SeveralTransformsPerId_EachCountsOnce_UnregisterRemovesOnlyItsOwn()
        {
            Transform a = Make(Vector3.zero);
            Transform b = Make(new Vector3(10f, 0f, 0f));
            _registry.Register("enemy.wolf.grauwolf", a);
            _registry.Register("enemy.wolf.grauwolf", a);
            _registry.Register("enemy.wolf.grauwolf", b);

            Assert.That(_registry.CollectPositions("enemy.wolf.grauwolf", _positions), Is.EqualTo(2));

            _registry.Unregister("enemy.wolf.grauwolf", a);
            _positions.Clear();
            Assert.That(_registry.CollectPositions("enemy.wolf.grauwolf", _positions), Is.EqualTo(1));
            Assert.That(_positions[0], Is.EqualTo(new Vector3(10f, 0f, 0f)));

            _registry.Unregister("enemy.wolf.grauwolf", b);
            Assert.That(_registry.Count, Is.EqualTo(0), "an empty id is removed");
        }

        [Test]
        public void PrefixPattern_MatchesAGroupOfIds()
        {
            _registry.Register("obj.eichental.strohziel_1", Make(Vector3.zero));
            _registry.Register("obj.eichental.strohziel_2", Make(Vector3.one));
            _registry.Register("obj.eichental.balken_tobold", Make(Vector3.up));

            Assert.That(_registry.CollectPositions("obj.eichental.strohziel_*", _positions), Is.EqualTo(2));
        }

        [Test]
        public void TransformsOfOneIdCloseTogether_AreOneTarget_FarApartStaySeparate()
        {
            _registry.Register("obj.eichental.aethersplitter_bau", Make(new Vector3(0f, 0f, 0f)));
            _registry.Register("obj.eichental.aethersplitter_bau", Make(new Vector3(0.5f, 0.2f, 0f)));
            _registry.Register("enemy.wolf.grauwolf", Make(new Vector3(0f, 0f, 0f)));
            _registry.Register("enemy.wolf.grauwolf", Make(new Vector3(20f, 0f, 0f)));
            _registry.Register("enemy.wolf.grauwolf", Make(new Vector3(40f, 0f, 0f)));

            Assert.That(_registry.CollectPositions("obj.eichental.aethersplitter_bau", _positions), Is.EqualTo(1));
            Assert.That(_registry.CollectPositions("enemy.wolf.grauwolf", _positions), Is.EqualTo(3));
        }

        [Test]
        public void SkipIds_LeaveOutCountedTargets_AlsoInAGroup()
        {
            _registry.Register("obj.eichental.strohziel_1", Make(Vector3.zero));
            _registry.Register("obj.eichental.strohziel_2", Make(Vector3.right * 10f));
            _registry.Register("obj.eichental.strohziel_3", Make(Vector3.right * 20f));
            var counted = new HashSet<string> { "obj.eichental.strohziel_2" };

            Assert.That(_registry.CollectPositions("obj.eichental.strohziel_*", _positions, counted), Is.EqualTo(2));
            Assert.That(_registry.CollectPositions("obj.eichental.strohziel_2", _positions, counted), Is.EqualTo(0));
        }

        [Test]
        public void DestroyedTransform_GivesNoPosition_AndCanStillBeUnregistered()
        {
            Transform gone = Make(Vector3.zero);
            _registry.Register("clue.eichental.weide_schaf", gone);
            Object.DestroyImmediate(gone.gameObject);

            Assert.That(_registry.CollectPositions("clue.eichental.weide_schaf", _positions), Is.EqualTo(0));
            _registry.Unregister("clue.eichental.weide_schaf", gone);
            Assert.That(_registry.Count, Is.EqualTo(0));
        }

        [Test]
        public void Handle_ShownBeforeTheBoot_RegistersOnConnect_HideRemoves()
        {
            Transform node = Make(new Vector3(4f, 0f, 4f));
            var handle = new WorldMarkerHandle();
            handle.Show(WorldMarkerIds.TrailNode("spur.eichental.wolfsspur", 2), node);
            Assert.That(handle.IsShown, Is.True);

            handle.Connect(_registry);
            Assert.That(_registry.CollectPositions("spur.eichental.wolfsspur#2", _positions), Is.EqualTo(1));

            handle.Hide();
            Assert.That(_registry.Count, Is.EqualTo(0));
            handle.Show(string.Empty, node);
            Assert.That(handle.IsShown, Is.False, "an empty id registers nothing");
        }

        [Test]
        public void Handle_ShowWithAnotherId_ReplacesTheOldOne()
        {
            Transform t = Make(Vector3.zero);
            var handle = new WorldMarkerHandle();
            handle.Connect(_registry);
            handle.Show("loc.eichental.dorfplatz", t);
            handle.Show("loc.eichental.dorfrand", t);

            Assert.That(_registry.CollectPositions("loc.eichental.dorfplatz", _positions), Is.EqualTo(0));
            Assert.That(_registry.CollectPositions("loc.eichental.dorfrand", _positions), Is.EqualTo(1));
        }

        private Transform Make(Vector3 position)
        {
            var go = new GameObject("Marker " + _objects.Count);
            go.transform.position = position;
            _objects.Add(go);
            return go.transform;
        }
    }
}
