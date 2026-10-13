using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// <see cref="IJsonSerializer"/> with Newtonsoft.Json and <see cref="SaveJsonSettings"/>. Only types accepted by
    /// <see cref="SaveDtoValidator"/> are (de)serialized. Thread-safe.
    /// </summary>
    public sealed class NewtonsoftJsonSerializer : IJsonSerializer
    {
        private readonly JsonSerializerSettings _compact = SaveJsonSettings.Create(false);
        private readonly JsonSerializerSettings _indented = SaveJsonSettings.Create(true);
        private readonly Dictionary<Type, string> _checked = new Dictionary<Type, string>();
        private readonly object _lock = new object();

        /// <inheritdoc />
        public string Serialize(object value, bool indented)
        {
            if (value == null)
            {
                return "null";
            }

            RequireDto(value.GetType());
            return JsonConvert.SerializeObject(value, indented ? _indented : _compact);
        }

        /// <inheritdoc />
        public object Deserialize(string json, Type type)
        {
            if (type == null)
            {
                throw new ArgumentNullException(nameof(type));
            }

            RequireDto(type);
            return JsonConvert.DeserializeObject(json, type, _compact);
        }

        /// <inheritdoc />
        public T Deserialize<T>(string json) where T : class
        {
            return (T)Deserialize(json, typeof(T));
        }

        private void RequireDto(Type type)
        {
            string problem;
            lock (_lock)
            {
                if (!_checked.TryGetValue(type, out problem))
                {
                    SaveDtoValidator.Validate(type, out problem);
                    _checked[type] = problem;
                }
            }

            if (problem.Length > 0)
            {
                throw new ArgumentException("Type " + type.FullName + " is not a valid DTO: " + problem, nameof(type));
            }
        }
    }
}
