using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// A scene loaded (or being loaded) through <see cref="ISceneLoader"/>. Identified by its scene key (scene path such as
    /// <c>Assets/_Project/Scenes/Test/Testgelaende.unity</c>, scene name, or <c>#n</c> for build index n, see <see cref="SceneKeys"/>).
    /// </summary>
    public readonly struct SceneHandle : IEquatable<SceneHandle>
    {
        /// <summary>Scene key the scene was loaded with.</summary>
        public readonly string Key;

        /// <summary>Creates a handle.</summary>
        /// <param name="key">Scene key.</param>
        public SceneHandle(string key)
        {
            Key = key ?? string.Empty;
        }

        /// <summary>False for the default value (no scene, e.g. after a failed load).</summary>
        public bool IsValid => !string.IsNullOrEmpty(Key);

        /// <inheritdoc />
        public bool Equals(SceneHandle other)
        {
            return string.Equals(Key ?? string.Empty, other.Key ?? string.Empty, StringComparison.Ordinal);
        }

        /// <inheritdoc />
        public override bool Equals(object obj)
        {
            return obj is SceneHandle other && Equals(other);
        }

        /// <inheritdoc />
        public override int GetHashCode()
        {
            return StringComparer.Ordinal.GetHashCode(Key ?? string.Empty);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return IsValid ? "SceneHandle(" + Key + ")" : "SceneHandle(none)";
        }
    }
}
