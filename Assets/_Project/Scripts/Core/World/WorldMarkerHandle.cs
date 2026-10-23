using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// One registration of a scene component in the <see cref="IWorldMarkerRegistry"/>: <see cref="Show"/> in <c>OnEnable</c>,
    /// <see cref="Hide"/> in <c>OnDisable</c> (or when the thing is used up or dead), <see cref="Connect"/> once the services
    /// exist (after the wait in <c>Start</c>). Shown before the connection, it registers on connecting; without a registry
    /// (no World installer) it does nothing.
    /// </summary>
    public sealed class WorldMarkerHandle
    {
        private IWorldMarkerRegistry _registry;
        private string _id = string.Empty;
        private Transform _anchor;
        private bool _shown;

        /// <summary>True while the point is meant to be registered.</summary>
        public bool IsShown => _shown;

        /// <summary>Resolves the registry once (later calls do nothing).</summary>
        /// <param name="locator">Service locator (null: nothing happens).</param>
        public void Connect(IServiceLocator locator)
        {
            if (_registry != null || locator == null || !locator.TryGet(out IWorldMarkerRegistry registry))
            {
                return;
            }

            Connect(registry);
        }

        /// <summary>Uses this registry (tests; once).</summary>
        /// <param name="registry">Registry.</param>
        public void Connect(IWorldMarkerRegistry registry)
        {
            if (_registry != null || registry == null)
            {
                return;
            }

            _registry = registry;
            if (_shown)
            {
                _registry.Register(_id, _anchor);
            }
        }

        /// <summary>Registers the point (replaces an earlier one of this handle; an empty id registers nothing).</summary>
        /// <param name="id">Id.</param>
        /// <param name="anchor">Transform.</param>
        public void Show(string id, Transform anchor)
        {
            Hide();
            if (string.IsNullOrEmpty(id) || anchor == null)
            {
                return;
            }

            _id = id;
            _anchor = anchor;
            _shown = true;
            _registry?.Register(id, anchor);
        }

        /// <summary>Removes the point.</summary>
        public void Hide()
        {
            if (!_shown)
            {
                return;
            }

            _shown = false;
            _registry?.Unregister(_id, _anchor);
        }
    }
}
