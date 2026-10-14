using System.Collections.Generic;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Keeps the data assets of a generator run alive across scene switches. Opening or creating a scene in single mode
    /// unloads every asset that is not reachable from a scene or a static field; asset references held only in local
    /// variables then turn into destroyed objects ("MissingReferenceException"). The holders (combat, items, materials …)
    /// register themselves here; the latest holder per key replaces the previous one, so the list stays small.
    /// </summary>
    internal static class GeneratorAssetPins
    {
        private static readonly Dictionary<string, object> Pins = new Dictionary<string, object>();

        /// <summary>Keeps <paramref name="value"/> (and everything it references) reachable from a static field.</summary>
        /// <param name="value">Asset or asset holder.</param>
        /// <param name="key">Slot; defaults to the type name, so a new holder of the same type replaces the old one.</param>
        /// <typeparam name="T">Type of the value.</typeparam>
        /// <returns><paramref name="value"/>.</returns>
        public static T Hold<T>(T value, string key = null) where T : class
        {
            if (value != null)
            {
                Pins[key ?? typeof(T).FullName] = value;
            }

            return value;
        }
    }
}
