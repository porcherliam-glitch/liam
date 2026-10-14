namespace Aetherfall.UI.Framework
{
    /// <summary>What the HUD knows about the player in one frame (input of <see cref="HudVisibilityRules"/>).</summary>
    public struct HudContext
    {
        /// <summary>Health 0..1.</summary>
        public float Health01;

        /// <summary>Stamina 0..1.</summary>
        public float Stamina01;

        /// <summary>Mana 0..1.</summary>
        public float Mana01;

        /// <summary>True while in combat (CombatStateChanged).</summary>
        public bool InCombat;

        /// <summary>True while the stamina is exhausted ("Erschoepft").</summary>
        public bool Exhausted;

        /// <summary>True while a target is locked on.</summary>
        public bool HasTarget;
    }
}
