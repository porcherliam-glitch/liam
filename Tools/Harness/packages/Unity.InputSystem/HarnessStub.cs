// HARNESS ONLY - stub helper (not part of the real package).
using System;

namespace UnityEngine.InputSystem
{
    internal static class HarnessStub
    {
        internal static Exception NotSupported()
        {
            return new NotSupportedException("Harness stub of com.unity.inputsystem: only for compiling, behaviour needs Unity.");
        }
    }
}
