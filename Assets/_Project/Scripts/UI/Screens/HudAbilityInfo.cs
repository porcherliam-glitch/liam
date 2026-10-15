namespace Aetherfall.UI.Screens
{
    /// <summary>An ability slot as the HUD shows it (bottom right: name, element colour, cooldown, mana; GDD 05 1.2, GDD 03 6.5, 11.8).</summary>
    public readonly struct HudAbilityInfo
    {
        /// <summary>Display name, e.g. "Aether-Stoß".</summary>
        public readonly string Name;

        /// <summary>Share of the cooldown still to run, 1 right after the use, 0 when ready.</summary>
        public readonly float Cooldown01;

        /// <summary>Seconds of cooldown left.</summary>
        public readonly float CooldownSeconds;

        /// <summary>True if the mana suffices.</summary>
        public readonly bool Affordable;

        /// <summary>Element key for the colour of the slot: fire, ice, lightning, aether (empty = neutral).</summary>
        public readonly string Element;

        /// <summary>Creates the info.</summary>
        /// <param name="name">Display name.</param>
        /// <param name="cooldown01">Cooldown share 0..1.</param>
        /// <param name="cooldownSeconds">Seconds left.</param>
        /// <param name="affordable">True if the mana suffices.</param>
        /// <param name="element">Element key (fire, ice, lightning, aether; empty = neutral).</param>
        public HudAbilityInfo(string name, float cooldown01, float cooldownSeconds, bool affordable, string element = "")
        {
            Name = name ?? string.Empty;
            Cooldown01 = cooldown01 < 0f ? 0f : cooldown01 > 1f ? 1f : cooldown01;
            CooldownSeconds = cooldownSeconds > 0f ? cooldownSeconds : 0f;
            Affordable = affordable;
            Element = element ?? string.Empty;
        }
    }
}
