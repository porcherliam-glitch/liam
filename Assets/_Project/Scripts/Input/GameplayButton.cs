namespace Aetherfall.Input
{
    /// <summary>
    /// The button actions of the Gameplay map (GDD 03 1.5) for package-free reading through <see cref="IGameplayInput"/>.
    /// The action name of each value is defined in <see cref="InputActionNames.ForButton"/>.
    /// Values are only used at run time (array index); append new ones at the end.
    /// </summary>
    public enum GameplayButton
    {
        /// <summary>Walk/run toggle (Caps Lock). Read with <see cref="IGameplayInput.WasToggledThisFrame"/> (macOS lock state).</summary>
        WalkToggle = 0,

        /// <summary>Sprint (L3 with stick ≥ 50 %, Shift).</summary>
        Sprint = 1,

        /// <summary>Sneak (L3 with stick &lt; 50 %, C).</summary>
        Sneak = 2,

        /// <summary>Jump (A, Space).</summary>
        Jump = 3,

        /// <summary>Interact (A with target, E).</summary>
        Interact = 4,

        /// <summary>Dodge roll / back step (B, Ctrl).</summary>
        Dodge = 5,

        /// <summary>Light attack (X, left mouse button).</summary>
        LightAttack = 6,

        /// <summary>Heavy attack (Y, right mouse button).</summary>
        HeavyAttack = 7,

        /// <summary>Block / parry (LB, Q).</summary>
        Block = 8,

        /// <summary>Weapon art (LB + Y, Q + right mouse button).</summary>
        WeaponArt = 9,

        /// <summary>Lock-on (R3 with target, middle mouse button).</summary>
        LockOn = 10,

        /// <summary>Investigate / Aether sight (R3 without target, R).</summary>
        Investigate = 11,

        /// <summary>Ranged stance (F).</summary>
        RangedStance = 12,

        /// <summary>Aim (LT, right mouse button in ranged stance).</summary>
        Aim = 13,

        /// <summary>Fire (RT, left mouse button in ranged stance).</summary>
        Fire = 14,

        /// <summary>Swap shoulder while aiming (R3 during LT, middle mouse button while aiming).</summary>
        SwapShoulder = 15,

        /// <summary>
        /// Use the selected ability (RB tap). Read with <see cref="IGameplayInput.WasPerformedThisFrame"/>: the press of RB
        /// is also reported for <see cref="AbilityWheel"/>.
        /// </summary>
        UseAbility = 16,

        /// <summary>
        /// Ability wheel (RB hold). Read with <see cref="IGameplayInput.WasPerformedThisFrame"/>: the press of RB is also
        /// reported for <see cref="UseAbility"/>.
        /// </summary>
        AbilityWheel = 17,

        /// <summary>Ability 1 of the active bar (RB + X, key 1).</summary>
        Ability1 = 18,

        /// <summary>Ability 2 of the active bar (RB + Y, key 2).</summary>
        Ability2 = 19,

        /// <summary>Ability 3 of the active bar (RB + B, key 3).</summary>
        Ability3 = 20,

        /// <summary>Ability 4 of the active bar (RB + A, key 4).</summary>
        Ability4 = 21,

        /// <summary>Switch ability bar (RB + LB, X).</summary>
        SwitchBar = 22,

        /// <summary>Quick slot 1 (D-pad up, key 5).</summary>
        QuickSlot1 = 23,

        /// <summary>Quick slot 2 (D-pad right, key 6).</summary>
        QuickSlot2 = 24,

        /// <summary>Quick slot 3 (D-pad down, key 7).</summary>
        QuickSlot3 = 25,

        /// <summary>Quick slot 4 (D-pad left, key 8).</summary>
        QuickSlot4 = 26,

        /// <summary>Companion commands (LB + D-pad, G).</summary>
        CompanionCommand = 27,

        /// <summary>Call the mount (LB + A, H).</summary>
        CallMount = 28,

        /// <summary>
        /// Map (View/Touchpad tap, M tap). Read with <see cref="IGameplayInput.WasPerformedThisFrame"/>: the press is also
        /// reported for <see cref="HudPeek"/>.
        /// </summary>
        Map = 29,

        /// <summary>
        /// Show the HUD for 5 s (View/Touchpad hold, M hold). Read with <see cref="IGameplayInput.WasPerformedThisFrame"/>:
        /// the press is also reported for <see cref="Map"/>.
        /// </summary>
        HudPeek = 30,

        /// <summary>Pause menu (Menu/Options, Esc).</summary>
        Pause = 31,

        /// <summary>Inventory tab of the hub (Tab).</summary>
        Inventory = 32,

        /// <summary>Quest log tab of the hub (J).</summary>
        QuestLog = 33,

        /// <summary>Skill tree tab of the hub (K).</summary>
        SkillTree = 34,

        /// <summary>Quick save (F5).</summary>
        QuickSave = 35,

        /// <summary>Quick load (F9).</summary>
        QuickLoad = 36
    }
}
