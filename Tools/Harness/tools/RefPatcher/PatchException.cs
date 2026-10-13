// HARNESS ONLY - RefPatcher
using System;

namespace Harness.RefPatcher
{
    /// <summary>Fatal problem with the patch declarations or the reference assemblies.</summary>
    internal sealed class PatchException : Exception
    {
        public PatchException(string message)
            : base(message)
        {
        }
    }
}
