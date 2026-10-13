// HARNESS ONLY - stand-in for UnityEditor.Build.NamedBuildTarget (Unity 2021.2+ / 6000.x).
// The UnityEditor.dll (2021.1) reference used by the harness does not contain it.
// Public surface follows Unity 6000.3; only compile-time behaviour matters (editor code
// cannot run outside Unity).
using System;

namespace UnityEditor.Build
{
    /// <summary>Harness stand-in for Unity's <c>NamedBuildTarget</c> (build target identified by name).</summary>
    public readonly struct NamedBuildTarget : IEquatable<NamedBuildTarget>, IComparable<NamedBuildTarget>
    {
        /// <summary>Unknown build target.</summary>
        public static readonly NamedBuildTarget Unknown = new NamedBuildTarget("");
        /// <summary>Desktop players (Windows, macOS, Linux).</summary>
        public static readonly NamedBuildTarget Standalone = new NamedBuildTarget("Standalone");
        /// <summary>Dedicated server.</summary>
        public static readonly NamedBuildTarget Server = new NamedBuildTarget("Server");
        /// <summary>iOS.</summary>
        public static readonly NamedBuildTarget iOS = new NamedBuildTarget("iPhone");
        /// <summary>Android.</summary>
        public static readonly NamedBuildTarget Android = new NamedBuildTarget("Android");
        /// <summary>WebGL.</summary>
        public static readonly NamedBuildTarget WebGL = new NamedBuildTarget("WebGL");
        /// <summary>Universal Windows Platform.</summary>
        public static readonly NamedBuildTarget WindowsStoreApps = new NamedBuildTarget("Windows Store Apps");
        /// <summary>PS4.</summary>
        public static readonly NamedBuildTarget PS4 = new NamedBuildTarget("PS4");
        /// <summary>PS5.</summary>
        public static readonly NamedBuildTarget PS5 = new NamedBuildTarget("PS5");
        /// <summary>Xbox One.</summary>
        public static readonly NamedBuildTarget XboxOne = new NamedBuildTarget("XboxOne");
        /// <summary>tvOS.</summary>
        public static readonly NamedBuildTarget tvOS = new NamedBuildTarget("tvOS");
        /// <summary>visionOS.</summary>
        public static readonly NamedBuildTarget VisionOS = new NamedBuildTarget("VisionOS");
        /// <summary>Nintendo Switch.</summary>
        public static readonly NamedBuildTarget NintendoSwitch = new NamedBuildTarget("Nintendo Switch");
        /// <summary>Nintendo Switch 2.</summary>
        public static readonly NamedBuildTarget NintendoSwitch2 = new NamedBuildTarget("Nintendo Switch 2");
        /// <summary>Stadia.</summary>
        public static readonly NamedBuildTarget Stadia = new NamedBuildTarget("Stadia");
        /// <summary>Linux headless simulation.</summary>
        public static readonly NamedBuildTarget LinuxHeadlessSimulation = new NamedBuildTarget("LinuxHeadlessSimulation");
        /// <summary>Alias of <see cref="LinuxHeadlessSimulation"/>.</summary>
        public static readonly NamedBuildTarget CloudRendering = LinuxHeadlessSimulation;
        /// <summary>Embedded Linux.</summary>
        public static readonly NamedBuildTarget EmbeddedLinux = new NamedBuildTarget("EmbeddedLinux");
        /// <summary>QNX.</summary>
        public static readonly NamedBuildTarget QNX = new NamedBuildTarget("QNX");

        internal NamedBuildTarget(string targetName)
        {
            TargetName = targetName;
        }

        /// <summary>Unity's internal name of the build target.</summary>
        public string TargetName { get; }

        /// <summary>Converts to the legacy BuildTargetGroup.</summary>
        public BuildTargetGroup ToBuildTargetGroup()
        {
            switch (TargetName)
            {
                case "Server":
                case "Standalone":
                    return BuildTargetGroup.Standalone;
                case "iPhone":
                    return BuildTargetGroup.iOS;
                case "Android":
                    return BuildTargetGroup.Android;
                case "WebGL":
                    return BuildTargetGroup.WebGL;
                default:
                    return BuildTargetGroup.Unknown;
            }
        }

        /// <summary>Converts from the legacy BuildTargetGroup.</summary>
        public static NamedBuildTarget FromBuildTargetGroup(BuildTargetGroup buildTargetGroup)
        {
            switch (buildTargetGroup)
            {
                case BuildTargetGroup.Unknown:
                    return Unknown;
                case BuildTargetGroup.Standalone:
                    return Standalone;
                case BuildTargetGroup.iOS:
                    return iOS;
                case BuildTargetGroup.Android:
                    return Android;
                case BuildTargetGroup.WebGL:
                    return WebGL;
                default:
                    throw new ArgumentException($"[Harness] No NamedBuildTarget mapping for BuildTargetGroup '{buildTargetGroup}'.");
            }
        }

        /// <summary>Equality by target name.</summary>
        public static bool operator ==(NamedBuildTarget lhs, NamedBuildTarget rhs)
        {
            return lhs.Equals(rhs);
        }

        /// <summary>Inequality by target name.</summary>
        public static bool operator !=(NamedBuildTarget lhs, NamedBuildTarget rhs)
        {
            return !lhs.Equals(rhs);
        }

        /// <inheritdoc />
        public override int GetHashCode()
        {
            return TargetName == null ? 0 : TargetName.GetHashCode();
        }

        /// <inheritdoc />
        public override bool Equals(object obj)
        {
            return obj is NamedBuildTarget other && Equals(other);
        }

        /// <inheritdoc />
        public bool Equals(NamedBuildTarget other)
        {
            return TargetName == other.TargetName;
        }

        /// <inheritdoc />
        public int CompareTo(NamedBuildTarget other)
        {
            return string.CompareOrdinal(TargetName, other.TargetName);
        }
    }
}
