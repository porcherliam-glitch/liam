using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// <see cref="IServiceRegistry"/> decorator that forwards every registration and records the registered interface types.
    /// The bootstrapper passes it to each installer and compares the recorded types with the installer's
    /// <see cref="IInstallerDescription.Provides"/> declaration (<see cref="InstallerOrderValidator.CheckRegistrations"/>).
    /// </summary>
    public sealed class RecordingServiceRegistry : IServiceRegistry
    {
        private readonly IServiceRegistry _inner;
        private readonly List<Type> _recordedTypes = new List<Type>();

        /// <summary>Creates a recorder around <paramref name="inner"/>.</summary>
        /// <param name="inner">Registry that receives the registrations.</param>
        public RecordingServiceRegistry(IServiceRegistry inner)
        {
            _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        }

        /// <summary>Types registered since the last <see cref="ClearRecording"/>, in call order.</summary>
        public IReadOnlyList<Type> RecordedTypes => _recordedTypes;

        /// <inheritdoc />
        public void Register<T>(T service) where T : class
        {
            _inner.Register(service);
            _recordedTypes.Add(typeof(T));
        }

        /// <summary>Forgets the recorded types (call before each installer).</summary>
        public void ClearRecording()
        {
            _recordedTypes.Clear();
        }
    }
}
