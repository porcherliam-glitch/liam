using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Serialization binder that refuses every type name (architecture 9.1: no <c>TypeNameHandling</c>; "zusaetzlich ein
    /// ISerializationBinder, der alles ablehnt"). Defense in depth: even if type name handling were switched on by
    /// mistake, a manipulated save could not create arbitrary CLR types.
    /// </summary>
    public sealed class RejectAllSerializationBinder : ISerializationBinder
    {
        /// <inheritdoc />
        public Type BindToType(string assemblyName, string typeName)
        {
            throw new JsonSerializationException("Type names are not allowed in save data (found '" + typeName + "').");
        }

        /// <inheritdoc />
        public void BindToName(Type serializedType, out string assemblyName, out string typeName)
        {
            throw new JsonSerializationException("Type names are not written to save data (" + serializedType + ").");
        }
    }
}
