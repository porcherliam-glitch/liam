using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Named colours of a layout (GDD 05 3.3). Names are camelCase keys such as <c>grass</c> or <c>ember</c>.</summary>
    public sealed class LayoutPalette
    {
        /// <summary>Colour names the Unity generator and the Blender preview need.</summary>
        public static readonly string[] RequiredNames =
        {
            "grass", "grassDry", "dirt", "rock", "ash", "water", "wood", "woodDark", "burnedWood", "plaster", "plasterBurned", "stone",
            "thatch", "shingle", "wheat", "wheatBurned", "stubble", "leafOak", "leafBeech", "leafBirch", "leafLinden", "barkOak",
            "barkBirch", "bush", "ember", "aether", "aetherCore", "aetherEdge", "cloth", "iron", "sheep", "npcMarker", "questMarker"
        };

        private readonly Dictionary<string, LayoutColor> _colors = new Dictionary<string, LayoutColor>(StringComparer.Ordinal);

        /// <summary>Number of colours.</summary>
        public int Count => _colors.Count;

        /// <summary>All colour names.</summary>
        public IEnumerable<string> Names => _colors.Keys;

        /// <summary>Looks a colour up.</summary>
        /// <param name="name">Colour name.</param>
        /// <param name="color">Colour.</param>
        public bool TryGet(string name, out LayoutColor color)
        {
            if (name == null)
            {
                color = default;
                return false;
            }

            return _colors.TryGetValue(name, out color);
        }

        /// <summary>Returns a colour or the fallback if it is missing.</summary>
        /// <param name="name">Colour name.</param>
        /// <param name="fallback">Fallback colour.</param>
        public LayoutColor Get(string name, LayoutColor fallback)
        {
            return TryGet(name, out LayoutColor color) ? color : fallback;
        }

        /// <summary>Adds or replaces a colour (used by the reader).</summary>
        /// <param name="name">Colour name.</param>
        /// <param name="color">Colour.</param>
        internal void Set(string name, LayoutColor color)
        {
            _colors[name] = color;
        }
    }
}
