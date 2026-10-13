namespace Aetherfall.Core
{
    /// <summary>
    /// Service that needs a synchronous step after every service finished <see cref="IInitializable.InitializeAsync"/>.
    /// This is the place to subscribe to events of other services (architecture 4.1, 4.3).
    /// Unsubscribe again in <see cref="System.IDisposable.Dispose"/>.
    /// </summary>
    public interface IPostInitializable
    {
        /// <summary>Called once per boot on the main thread, in registration order.</summary>
        void PostInitialize();
    }
}
