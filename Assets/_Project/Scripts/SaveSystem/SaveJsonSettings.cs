using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// The Newtonsoft settings of all save data (architecture 9.1): no type names, a binder that refuses all types,
    /// camelCase names, enums as text, invariant culture, no automatic date parsing, objects replaced instead of reused.
    /// </summary>
    public static class SaveJsonSettings
    {
        /// <summary>Deepest allowed nesting (protects against malicious files).</summary>
        public const int MaxDepth = 64;

        /// <summary>Creates new settings (one instance per serializer; Newtonsoft caches contracts per resolver).</summary>
        /// <param name="indented">True = readable, indented output (dev builds, architecture 9.3).</param>
        public static JsonSerializerSettings Create(bool indented)
        {
            var settings = new JsonSerializerSettings
            {
                TypeNameHandling = TypeNameHandling.None,
                SerializationBinder = new RejectAllSerializationBinder(),
                MetadataPropertyHandling = MetadataPropertyHandling.Ignore,
                MissingMemberHandling = MissingMemberHandling.Ignore,
                NullValueHandling = NullValueHandling.Include,
                DefaultValueHandling = DefaultValueHandling.Include,
                ObjectCreationHandling = ObjectCreationHandling.Replace,
                ReferenceLoopHandling = ReferenceLoopHandling.Error,
                PreserveReferencesHandling = PreserveReferencesHandling.None,
                DateParseHandling = DateParseHandling.None,
                FloatParseHandling = FloatParseHandling.Double,
                Culture = CultureInfo.InvariantCulture,
                MaxDepth = MaxDepth,
                Formatting = indented ? Formatting.Indented : Formatting.None,
                ContractResolver = new DefaultContractResolver
                {
                    NamingStrategy = new CamelCaseNamingStrategy { ProcessDictionaryKeys = false, OverrideSpecifiedNames = true }
                }
            };
            settings.Converters.Add(new StringEnumConverter { NamingStrategy = new CamelCaseNamingStrategy() });
            return settings;
        }
    }
}
