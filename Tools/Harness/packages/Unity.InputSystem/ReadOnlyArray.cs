// HARNESS ONLY - stub of UnityEngine.InputSystem.Utilities.ReadOnlyArray<TValue> (com.unity.inputsystem 1.x).
using System;
using System.Collections;
using System.Collections.Generic;

namespace UnityEngine.InputSystem.Utilities
{
    public struct ReadOnlyArray<TValue> : IReadOnlyList<TValue>
    {
        public int Count => throw InputSystem.HarnessStub.NotSupported();
        public TValue this[int index] => throw InputSystem.HarnessStub.NotSupported();
        public ReadOnlyArray(TValue[] array) { }
        public ReadOnlyArray(TValue[] array, int index, int length) { }
        public TValue[] ToArray() { throw InputSystem.HarnessStub.NotSupported(); }
        public int IndexOf(Predicate<TValue> predicate) { throw InputSystem.HarnessStub.NotSupported(); }
        public IEnumerator<TValue> GetEnumerator() { throw InputSystem.HarnessStub.NotSupported(); }
        IEnumerator IEnumerable.GetEnumerator() { throw InputSystem.HarnessStub.NotSupported(); }
    }
}
