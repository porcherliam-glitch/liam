// HARNESS ONLY. Tells RefPatcher to put [Obsolete(message, isError)] on an existing member
// of a Unity reference assembly, mirroring Unity 6.3, so that the harness reports CS0618 /
// CS0619 like the Unity 6.3 compiler would.
using System;

namespace Harness.Unity6Patches
{
    /// <summary>Mark all overloads of <c>Member</c> (optionally filtered by first parameter type) obsolete.</summary>
    [AttributeUsage(AttributeTargets.Assembly, AllowMultiple = true)]
    internal sealed class MarkObsoleteAttribute : Attribute
    {
        public MarkObsoleteAttribute(string assembly, string typeFullName, string member, string message, bool isError)
        {
            Assembly = assembly;
            TypeFullName = typeFullName;
            Member = member;
            Message = message;
            IsError = isError;
        }

        public string Assembly { get; }

        public string TypeFullName { get; }

        public string Member { get; }

        public string Message { get; }

        public bool IsError { get; }

        /// <summary>Only overloads whose first parameter has this full type name.</summary>
        public string FirstParameterType { get; set; }
    }
}
