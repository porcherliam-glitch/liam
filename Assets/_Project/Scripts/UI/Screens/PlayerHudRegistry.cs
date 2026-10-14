using System;

namespace Aetherfall.UI.Screens
{
    /// <summary>Default <see cref="IPlayerHudRegistry"/> (pure logic, registered by <see cref="UIInstaller"/>).</summary>
    public sealed class PlayerHudRegistry : IPlayerHudRegistry
    {
        /// <inheritdoc />
        public IPlayerHudSource Current { get; private set; }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public void Register(IPlayerHudSource source)
        {
            if (source == null || ReferenceEquals(Current, source))
            {
                return;
            }

            Current = source;
            Raise();
        }

        /// <inheritdoc />
        public void Unregister(IPlayerHudSource source)
        {
            if (source == null || !ReferenceEquals(Current, source))
            {
                return;
            }

            Current = null;
            Raise();
        }

        private void Raise()
        {
            Action changed = Changed;
            if (changed != null)
            {
                changed();
            }
        }
    }
}
