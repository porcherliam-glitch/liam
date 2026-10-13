namespace Aetherfall.Core
{
    /// <summary>
    /// Read side of the service locator (architecture 4.2).
    /// Use it only in installers and in MonoBehaviours (Awake/Start, result cached) – never in Update,
    /// never in pure domain classes (those get their dependencies through the constructor).
    /// </summary>
    public interface IServiceLocator
    {
        /// <summary>Returns the service registered under <typeparamref name="T"/>.</summary>
        /// <typeparam name="T">Registered interface.</typeparam>
        /// <exception cref="System.Collections.Generic.KeyNotFoundException">
        /// No service is registered under <typeparamref name="T"/>; the message names the missing type.
        /// </exception>
        T Get<T>() where T : class;

        /// <summary>Tries to resolve the service registered under <typeparamref name="T"/>.</summary>
        /// <typeparam name="T">Registered interface.</typeparam>
        /// <param name="service">The service, or null if it is not registered.</param>
        /// <returns>True if the service is registered.</returns>
        bool TryGet<T>(out T service) where T : class;
    }
}
