namespace Aetherfall.UI.Framework
{
    /// <summary>Logical buttons that the UI shows as glyphs (GDD 05 1.5); the shown symbol depends on the device family.</summary>
    public enum UiGlyph
    {
        /// <summary>Confirm (A / Cross / south button / Enter).</summary>
        Confirm = 0,

        /// <summary>Back (B / Circle / east button / Esc).</summary>
        Back = 1,

        /// <summary>Secondary action (X / Square / west button / F).</summary>
        Secondary = 2,

        /// <summary>Sort and filter (Y / Triangle / north button / R).</summary>
        Sort = 3,

        /// <summary>Main tab back (LB / L1 / Q).</summary>
        TabPrev = 4,

        /// <summary>Main tab forward (RB / R1 / E).</summary>
        TabNext = 5,

        /// <summary>Sub category back (LT / L2 / Z).</summary>
        SubTabPrev = 6,

        /// <summary>Sub category forward (RT / R2 / C).</summary>
        SubTabNext = 7,

        /// <summary>Details (R3 / Shift).</summary>
        Details = 8,

        /// <summary>Map (View / Touchpad / M).</summary>
        Map = 9,

        /// <summary>Menu (Menu / Options / Esc).</summary>
        Menu = 10,

        /// <summary>Interact in the game (A / Cross / E).</summary>
        Interact = 11,

        /// <summary>Ability slot 1 (RB + X / key 1).</summary>
        Ability1 = 12,

        /// <summary>Ability slot 2 (RB + Y / key 2).</summary>
        Ability2 = 13,

        /// <summary>Ability slot 3 (RB + B / key 3).</summary>
        Ability3 = 14,

        /// <summary>Ability slot 4 (RB + A / key 4).</summary>
        Ability4 = 15,

        /// <summary>Quick slot 1 (D-pad up / key 5).</summary>
        QuickSlot1 = 16,

        /// <summary>Quick slot 2 (D-pad right / key 6).</summary>
        QuickSlot2 = 17,

        /// <summary>Quick slot 3 (D-pad down / key 7).</summary>
        QuickSlot3 = 18,

        /// <summary>Quick slot 4 (D-pad left / key 8).</summary>
        QuickSlot4 = 19,

        /// <summary>Skip a cutscene (A / Cross / south button / Space; held).</summary>
        Skip = 20
    }
}
