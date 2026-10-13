using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Default implementation of <see cref="IServiceRegistry"/> and <see cref="IServiceLocator"/> (architecture 4.2).
    /// Created fresh by <see cref="GameBootstrapper"/> at every boot. Pure logic, no Unity calls.
    /// </summary>
    /// <remarks>
    /// Not thread-safe: register and resolve on the main thread.
    /// Services are compared by reference; a destroyed <c>UnityEngine.Object</c> registered as a service is not detected.
    /// </remarks>
    public sealed class ServiceLocator : IServiceRegistry, IServiceLocator
    {
        private readonly Dictionary<Type, object> _services = new Dictionary<Type, object>();
        private readonly List<object> _instances = new List<object>();

        /// <summary>Number of registered service types.</summary>
        public int Count => _services.Count;

        /// <summary>
        /// Distinct service instances in the order of their first registration.
        /// An instance registered under several interfaces appears once.
        /// The bootstrapper uses this order for initialization and the reverse order for disposal.
        /// </summary>
        public IReadOnlyList<object> Instances => _instances;

        /// <inheritdoc />
        public void Register<T>(T service) where T : class
        {
            Type type = typeof(T);
            if (service == null)
            {
                throw new ArgumentNullException(nameof(service), "Cannot register null as service " + type.FullName + ".");
            }

            if (_services.TryGetValue(type, out object existing))
            {
                throw new InvalidOperationException(
                    "Service " + type.FullName + " is already registered (existing implementation: " + existing.GetType().FullName +
                    ", new implementation: " + service.GetType().FullName + "). Each service may be registered only once.");
            }

            _services.Add(type, service);
            if (!ContainsInstance(service))
            {
                _instances.Add(service);
            }
        }

        /// <inheritdoc />
        public T Get<T>() where T : class
        {
            if (_services.TryGetValue(typeof(T), out object service))
            {
                return (T)service;
            }

            throw new KeyNotFoundException(
                "Service " + typeof(T).FullName + " is not registered. Check that the installer providing it is part of the BootConfig " +
                "and that the caller does not run before the boot sequence registered it.");
        }

        /// <inheritdoc />
        public bool TryGet<T>(out T service) where T : class
        {
            if (_services.TryGetValue(typeof(T), out object found))
            {
                service = (T)found;
                return true;
            }

            service = null;
            return false;
        }

        /// <summary>Returns true if a service is registered under <paramref name="serviceType"/>.</summary>
        /// <param name="serviceType">Registered interface type.</param>
        public bool IsRegistered(Type serviceType)
        {
            return serviceType != null && _services.ContainsKey(serviceType);
        }

        private bool ContainsInstance(object service)
        {
            for (int i = 0; i < _instances.Count; i++)
            {
                if (ReferenceEquals(_instances[i], service))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
