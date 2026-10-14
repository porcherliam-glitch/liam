using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Unit tests for <see cref="SceneKeys"/> and <see cref="PlayModeStart"/>.</summary>
    [TestFixture]
    public sealed class SceneKeysTests
    {
        [TestCase("Assets/_Project/Scenes/Test/Testgelaende.unity", true)]
        [TestCase("Testgelaende", true)]
        [TestCase("#1", true)]
        [TestCase("#", false)]
        [TestCase("#x", false)]
        [TestCase("", false)]
        [TestCase(" Boot", false)]
        [TestCase(null, false)]
        public void IsValid(string key, bool expected)
        {
            Assert.That(SceneKeys.IsValid(key), Is.EqualTo(expected));
        }

        [Test]
        public void BuildIndexKeys_RoundTrip()
        {
            Assert.That(SceneKeys.FromBuildIndex(3), Is.EqualTo("#3"));
            Assert.That(SceneKeys.TryGetBuildIndex("#12", out int index), Is.True);
            Assert.That(index, Is.EqualTo(12));
            Assert.That(SceneKeys.TryGetBuildIndex("Boot", out _), Is.False);
        }

        [Test]
        public void IsPathAndDisplayName()
        {
            Assert.That(SceneKeys.IsPath("Assets/_Project/Scenes/Boot/Boot.unity"), Is.True);
            Assert.That(SceneKeys.IsPath("Boot"), Is.False);
            Assert.That(SceneKeys.DisplayName("Assets/_Project/Scenes/Test/Testgelaende.unity"), Is.EqualTo("Testgelaende"));
            Assert.That(SceneKeys.DisplayName("#2"), Is.EqualTo("#2"));
        }

        [TestCase(0f, 0f)]
        [TestCase(0.45f, 0.5f)]
        [TestCase(0.9f, 1f)]
        [TestCase(1f, 1f)]
        [TestCase(-1f, 0f)]
        public void NormalizeProgress_MapsUnityProgress(float unity, float expected)
        {
            Assert.That(SceneKeys.NormalizeProgress(unity), Is.EqualTo(expected).Within(0.0001f));
        }

        [Test]
        public void CombinePhases_SplitsTheBarEvenly()
        {
            Assert.That(SceneKeys.CombinePhases(0, 2, 0.5f), Is.EqualTo(0.25f).Within(0.0001f));
            Assert.That(SceneKeys.CombinePhases(1, 2, 0f), Is.EqualTo(0.5f).Within(0.0001f));
            Assert.That(SceneKeys.CombinePhases(1, 2, 1f), Is.EqualTo(1f).Within(0.0001f));
            Assert.That(SceneKeys.CombinePhases(0, 0, 0.3f), Is.EqualTo(1f));
        }

        [Test]
        public void PlayModeStart_RecordsTheDirectStartScene()
        {
            try
            {
                PlayModeStart.Reset();
                Assert.That(PlayModeStart.IsDirectStartOf("Assets/A.unity"), Is.False);

                PlayModeStart.RecordDirectStart("Assets/A.unity");

                Assert.That(PlayModeStart.StartedOutsideBootScene, Is.True);
                Assert.That(PlayModeStart.IsDirectStartOf("Assets/A.unity"), Is.True);
                Assert.That(PlayModeStart.IsDirectStartOf("Assets/B.unity"), Is.False);
                Assert.That(PlayModeStart.IsDirectStartOf(string.Empty), Is.False);
            }
            finally
            {
                PlayModeStart.Reset();
            }
        }
    }
}
