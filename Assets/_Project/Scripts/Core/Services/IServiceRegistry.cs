namespace Aetherfall.Core
{
    /// <summary>
    /// Write side of the service locator. Only installers register services, and only during boot
    /// (architecture 4.2). Register interfaces, not implementations.
    /// </summary>
    public interface IServiceRegistry
    {
        /// <summary>Registers a service under the interface <typeparamref name="T"/>.</summary>
        /// <typeparam name="T">Interface under which the service can be resolved.</typeparam>
        /// <param name="service">The service instance (not null).</param>
        /// <exception cref="System.ArgumentNullException"><paramref name="service"/> is null.</exception>
        /// <exception cref="System.InvalidOperationException"><typeparamref name="T"/> is already registered.</exception>
        void Register<T>(T service) where T : class;
    }
}
