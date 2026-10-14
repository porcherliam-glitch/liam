using System;
using Aetherfall.Core;
using Aetherfall.Events;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Default <see cref="IGlyphService"/>: listens to <see cref="InputDeviceChanged"/> (subscribed in
    /// <see cref="PostInitialize"/>, unsubscribed in <see cref="Dispose"/>). Pure logic; the initial family comes from the input
    /// service (the event is only sent on changes).
    /// </summary>
    public sealed class GlyphService : IGlyphService, IPostInitializable, IDisposable
    {
        private readonly IEventBus _eventBus;
        private bool _subscribed;
        private bool _disposed;

        /// <summary>Creates the service.</summary>
        /// <param name="eventBus">Bus for <see cref="InputDeviceChanged"/>.</param>
        /// <param name="initialFamily">Family of the device that is active at boot.</param>
        public GlyphService(IEventBus eventBus, GlyphFamily initialFamily)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            DetectedFamily = initialFamily;
        }

        /// <inheritdoc />
        public GlyphFamily Family => StyleOverride ?? DetectedFamily;

        /// <inheritdoc />
        public GlyphFamily DetectedFamily { get; private set; }

        /// <inheritdoc />
        public GlyphFamily? StyleOverride { get; private set; }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_subscribed || _disposed)
            {
                return;
            }

            _eventBus.Subscribe<InputDeviceChanged>(OnInputDeviceChanged);
            _subscribed = true;
        }

        /// <inheritdoc />
        public void SetStyleOverride(GlyphFamily? family)
        {
            GlyphFamily before = Family;
            StyleOverride = family;
            RaiseIfChanged(before);
        }

        /// <inheritdoc />
        public string Get(UiGlyph glyph)
        {
            return GlyphCatalog.Get(glyph, Family);
        }

        /// <summary>Unsubscribes from the event bus.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            if (_subscribed)
            {
                _eventBus.Unsubscribe<InputDeviceChanged>(OnInputDeviceChanged);
                _subscribed = false;
            }

            Changed = null;
        }

        private void OnInputDeviceChanged(InputDeviceChanged evt)
        {
            GlyphFamily before = Family;
            DetectedFamily = evt.GlyphFamily;
            RaiseIfChanged(before);
        }

        private void RaiseIfChanged(GlyphFamily before)
        {
            if (before == Family)
            {
                return;
            }

            Action changed = Changed;
            if (changed != null)
            {
                changed();
            }
        }
    }
}
