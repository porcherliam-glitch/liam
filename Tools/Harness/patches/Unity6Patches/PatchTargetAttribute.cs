// HARNESS ONLY. Marks a declaration type whose public members RefPatcher merges into
// an existing type of a Unity reference assembly.
using System;

namespace Harness.Unity6Patches
{
    /// <summary>Merge the public members of this type into <c>TypeFullName</c> of <c>Assembly</c>.</summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct | AttributeTargets.Enum, AllowMultiple = false)]
    internal sealed class PatchTargetAttribute : Attribute
    {
        public PatchTargetAttribute(string assembly, string typeFullName)
        {
            Assembly = assembly;
            TypeFullName = typeFullName;
        }

        public string Assembly { get; }

        public string TypeFullName { get; }
    }
}
