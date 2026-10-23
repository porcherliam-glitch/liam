using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>Colour palette of the interface (dark tactical style of the HTML version).</summary>
    public static class UiColors
    {
        public static readonly Color Bg = new Color(0.04f, 0.055f, 0.065f, 0.94f);
        public static readonly Color Panel = new Color(0.075f, 0.095f, 0.11f, 0.95f);
        public static readonly Color Panel2 = new Color(0.11f, 0.135f, 0.155f, 0.96f);
        public static readonly Color Line = new Color(0.22f, 0.27f, 0.3f, 1f);
        public static readonly Color Text = new Color(0.9f, 0.92f, 0.92f, 1f);
        public static readonly Color Muted = new Color(0.55f, 0.6f, 0.63f, 1f);
        public static readonly Color Accent = new Color(0.85f, 0.64f, 0.26f, 1f);
        public static readonly Color AccentDim = new Color(0.5f, 0.38f, 0.16f, 1f);
        public static readonly Color Good = new Color(0.35f, 0.76f, 0.48f, 1f);
        public static readonly Color Bad = new Color(0.88f, 0.35f, 0.31f, 1f);
        public static readonly Color Info = new Color(0.4f, 0.65f, 0.95f, 1f);
        public static readonly Color Warn = new Color(0.95f, 0.72f, 0.3f, 1f);
        public static readonly Color Hp = new Color(0.82f, 0.25f, 0.25f, 1f);
        public static readonly Color Stamina = new Color(0.9f, 0.78f, 0.3f, 1f);
        public static readonly Color Food = new Color(0.6f, 0.75f, 0.3f, 1f);
        public static readonly Color Water = new Color(0.3f, 0.6f, 0.92f, 1f);

        public static Color Category(string cat)
        {
            switch (cat)
            {
                case "weapon": return new Color(0.62f, 0.38f, 0.24f);
                case "ammo": return new Color(0.7f, 0.6f, 0.22f);
                case "medical": return new Color(0.8f, 0.27f, 0.27f);
                case "food": return new Color(0.5f, 0.65f, 0.24f);
                case "water": return new Color(0.24f, 0.5f, 0.8f);
                case "material": return new Color(0.48f, 0.48f, 0.48f);
                case "electronics": return new Color(0.22f, 0.66f, 0.6f);
                case "tool": return new Color(0.66f, 0.45f, 0.22f);
                case "armor": return new Color(0.32f, 0.4f, 0.55f);
                case "backpack": return new Color(0.45f, 0.38f, 0.24f);
                case "key": return new Color(0.85f, 0.72f, 0.22f);
                case "mission": return new Color(0.7f, 0.38f, 0.85f);
                case "collectible": return new Color(0.85f, 0.58f, 0.25f);
                case "grenade": return new Color(0.36f, 0.5f, 0.24f);
            }
            return new Color(0.4f, 0.4f, 0.4f);
        }

        public static Color Kind(string kind)
        {
            switch (kind)
            {
                case "success": return Good;
                case "warning": return Warn;
                case "danger": return Bad;
                default: return Info;
            }
        }
    }
}
