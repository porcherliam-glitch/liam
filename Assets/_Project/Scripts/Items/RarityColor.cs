namespace Aetherfall.Items
{
    /// <summary>Colour of a rarity as bytes and hex text (pure data; presentation converts it to a Unity colour).</summary>
    public readonly struct RarityColor
    {
        /// <summary>Red 0–255.</summary>
        public readonly byte R;

        /// <summary>Green 0–255.</summary>
        public readonly byte G;

        /// <summary>Blue 0–255.</summary>
        public readonly byte B;

        /// <summary>Creates the colour.</summary>
        /// <param name="r">Red.</param>
        /// <param name="g">Green.</param>
        /// <param name="b">Blue.</param>
        public RarityColor(byte r, byte g, byte b)
        {
            R = r;
            G = g;
            B = b;
        }

        /// <summary>Hex text like <c>#3D8BFF</c>.</summary>
        public string Hex => "#" + R.ToString("X2") + G.ToString("X2") + B.ToString("X2");
    }
}
