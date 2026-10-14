using System.Globalization;

namespace Aetherfall.World
{
    /// <summary>Colour of the layout palette as sRGB components 0..1, written as <c>#RRGGBB</c> in the JSON.</summary>
    public readonly struct LayoutColor
    {
        /// <summary>Creates a colour.</summary>
        /// <param name="r">Red 0..1 (sRGB).</param>
        /// <param name="g">Green 0..1 (sRGB).</param>
        /// <param name="b">Blue 0..1 (sRGB).</param>
        public LayoutColor(double r, double g, double b)
        {
            R = r;
            G = g;
            B = b;
        }

        /// <summary>Red 0..1 (sRGB).</summary>
        public double R { get; }

        /// <summary>Green 0..1 (sRGB).</summary>
        public double G { get; }

        /// <summary>Blue 0..1 (sRGB).</summary>
        public double B { get; }

        /// <summary>Parses <c>#RRGGBB</c> (the leading # is optional).</summary>
        /// <param name="text">Colour text.</param>
        /// <param name="color">Result.</param>
        /// <returns>False if the text is not a six-digit hex colour.</returns>
        public static bool TryParse(string text, out LayoutColor color)
        {
            color = default;
            if (string.IsNullOrEmpty(text))
            {
                return false;
            }

            string hex = text[0] == '#' ? text.Substring(1) : text;
            if (hex.Length != 6 || !int.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int value))
            {
                return false;
            }

            color = new LayoutColor(((value >> 16) & 0xFF) / 255.0, ((value >> 8) & 0xFF) / 255.0, (value & 0xFF) / 255.0);
            return true;
        }

        /// <summary>The colour as <c>#RRGGBB</c>.</summary>
        public string ToHex()
        {
            return "#" + Byte(R).ToString("X2", CultureInfo.InvariantCulture) + Byte(G).ToString("X2", CultureInfo.InvariantCulture) +
                   Byte(B).ToString("X2", CultureInfo.InvariantCulture);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return ToHex();
        }

        private static int Byte(double value)
        {
            int v = (int)System.Math.Round(value * 255.0);
            return v < 0 ? 0 : (v > 255 ? 255 : v);
        }
    }
}
