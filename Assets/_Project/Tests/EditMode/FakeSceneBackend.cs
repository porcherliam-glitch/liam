using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="ISceneBackend"/> test double: scenes "load" over a fixed number of progress polls; records every call.
    /// </summary>
    public sealed class FakeSceneBackend : ISceneBackend
    {
        private readonly HashSet<string> _loaded = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _known = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Number of polls of <see cref="ISceneLoadOperation.IsDone"/> until an operation finishes.</summary>
        public int PollsPerOperation { get; set; } = 3;

        /// <summary>Calls in order, e.g. "load:A", "unload:A", "active:A".</summary>
        public List<string> Calls { get; } = new List<string>();

        /// <summary>Operations started so far.</summary>
        public List<FakeOperation> Operations { get; } = new List<FakeOperation>();

        /// <summary>Scene that is active.</summary>
        public string ActiveScene { get; private set; } = string.Empty;

        /// <inheritdoc />
        public double RealtimeSeconds { get; set; }

        /// <summary>Makes a scene loadable (it is "in the scene list").</summary>
        /// <param name="sceneKey">Scene key.</param>
        public void AddScene(string sceneKey)
        {
            _known.Add(sceneKey);
        }

        /// <summary>Marks a scene as already loaded (e.g. the start scene of the editor).</summary>
        /// <param name="sceneKey">Scene key.</param>
        public void MarkLoaded(string sceneKey)
        {
            _known.Add(sceneKey);
            _loaded.Add(sceneKey);
        }

        /// <inheritdoc />
        public bool IsLoaded(string sceneKey)
        {
            return _loaded.Contains(sceneKey);
        }

        /// <inheritdoc />
        public ISceneLoadOperation LoadAdditive(string sceneKey)
        {
            Calls.Add("load:" + sceneKey);
            if (!_known.Contains(sceneKey))
            {
                return null;
            }

            var operation = new FakeOperation(this, PollsPerOperation, () => _loaded.Add(sceneKey));
            Operations.Add(operation);
            return operation;
        }

        /// <inheritdoc />
        public ISceneLoadOperation Unload(string sceneKey)
        {
            Calls.Add("unload:" + sceneKey);
            if (!_loaded.Contains(sceneKey))
            {
                return null;
            }

            var operation = new FakeOperation(this, PollsPerOperation, () => _loaded.Remove(sceneKey));
            Operations.Add(operation);
            return operation;
        }

        /// <inheritdoc />
        public bool SetActive(string sceneKey)
        {
            Calls.Add("active:" + sceneKey);
            if (!_loaded.Contains(sceneKey))
            {
                return false;
            }

            ActiveScene = sceneKey;
            return true;
        }

        /// <summary>A fake operation: each IsDone poll advances the progress and the clock by one step.</summary>
        public sealed class FakeOperation : ISceneLoadOperation
        {
            private readonly FakeSceneBackend _owner;
            private readonly int _polls;
            private readonly Action _complete;
            private int _pollCount;
            private bool _done;

            internal FakeOperation(FakeSceneBackend owner, int polls, Action complete)
            {
                _owner = owner;
                _polls = Math.Max(1, polls);
                _complete = complete;
            }

            /// <inheritdoc />
            public float Progress => _done ? 1f : Math.Min(0.9f, 0.9f * _pollCount / _polls);

            /// <inheritdoc />
            public bool IsDone
            {
                get
                {
                    if (_done)
                    {
                        return true;
                    }

                    _pollCount++;
                    _owner.RealtimeSeconds += 0.1;
                    if (_pollCount >= _polls && AllowActivation)
                    {
                        _done = true;
                        _complete();
                    }

                    return _done;
                }
            }

            /// <inheritdoc />
            public bool AllowActivation { get; set; } = true;
        }
    }
}
