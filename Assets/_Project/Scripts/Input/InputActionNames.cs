using System;

namespace Aetherfall.Input
{
    /// <summary>
    /// Names of the action maps and actions (GDD 03 1.5: action IDs are English). Used by <see cref="GameInputBindings"/>
    /// to build the asset and by readers to find actions. Pure constants; changing a name breaks saved binding overrides
    /// (rebinding, Options step).
    /// </summary>
    public static class InputActionNames
    {
        /// <summary>Returns the map name of an <see cref="ActionMapId"/>; null for <see cref="ActionMapId.None"/>.</summary>
        /// <param name="map">Map identifier.</param>
        public static string ForMap(ActionMapId map)
        {
            switch (map)
            {
                case ActionMapId.Gameplay:
                    return Gameplay.MapName;
                case ActionMapId.UI:
                    return UI.MapName;
                case ActionMapId.Dialog:
                    return Dialog.MapName;
                case ActionMapId.Riding:
                    return Riding.MapName;
                case ActionMapId.Building:
                    return Building.MapName;
                default:
                    return null;
            }
        }

        /// <summary>Returns the Gameplay action name of a <see cref="GameplayButton"/>.</summary>
        /// <param name="button">Button action.</param>
        /// <exception cref="ArgumentOutOfRangeException">Unknown value.</exception>
        public static string ForButton(GameplayButton button)
        {
            switch (button)
            {
                case GameplayButton.WalkToggle: return Gameplay.WalkToggle;
                case GameplayButton.Sprint: return Gameplay.Sprint;
                case GameplayButton.Sneak: return Gameplay.Sneak;
                case GameplayButton.Jump: return Gameplay.Jump;
                case GameplayButton.Interact: return Gameplay.Interact;
                case GameplayButton.Dodge: return Gameplay.Dodge;
                case GameplayButton.LightAttack: return Gameplay.LightAttack;
                case GameplayButton.HeavyAttack: return Gameplay.HeavyAttack;
                case GameplayButton.Block: return Gameplay.Block;
                case GameplayButton.WeaponArt: return Gameplay.WeaponArt;
                case GameplayButton.LockOn: return Gameplay.LockOn;
                case GameplayButton.Investigate: return Gameplay.Investigate;
                case GameplayButton.RangedStance: return Gameplay.RangedStance;
                case GameplayButton.Aim: return Gameplay.Aim;
                case GameplayButton.Fire: return Gameplay.Fire;
                case GameplayButton.SwapShoulder: return Gameplay.SwapShoulder;
                case GameplayButton.UseAbility: return Gameplay.UseAbility;
                case GameplayButton.AbilityWheel: return Gameplay.AbilityWheel;
                case GameplayButton.Ability1: return Gameplay.Ability1;
                case GameplayButton.Ability2: return Gameplay.Ability2;
                case GameplayButton.Ability3: return Gameplay.Ability3;
                case GameplayButton.Ability4: return Gameplay.Ability4;
                case GameplayButton.SwitchBar: return Gameplay.SwitchBar;
                case GameplayButton.QuickSlot1: return Gameplay.QuickSlot1;
                case GameplayButton.QuickSlot2: return Gameplay.QuickSlot2;
                case GameplayButton.QuickSlot3: return Gameplay.QuickSlot3;
                case GameplayButton.QuickSlot4: return Gameplay.QuickSlot4;
                case GameplayButton.CompanionCommand: return Gameplay.CompanionCommand;
                case GameplayButton.CallMount: return Gameplay.CallMount;
                case GameplayButton.Map: return Gameplay.Map;
                case GameplayButton.HudPeek: return Gameplay.HudPeek;
                case GameplayButton.Pause: return Gameplay.Pause;
                case GameplayButton.Inventory: return Gameplay.Inventory;
                case GameplayButton.QuestLog: return Gameplay.QuestLog;
                case GameplayButton.SkillTree: return Gameplay.SkillTree;
                case GameplayButton.QuickSave: return Gameplay.QuickSave;
                case GameplayButton.QuickLoad: return Gameplay.QuickLoad;
                default:
                    throw new ArgumentOutOfRangeException(nameof(button), button, "Unknown gameplay button.");
            }
        }

        /// <summary>Returns the UI action name of a <see cref="UiButton"/>.</summary>
        /// <param name="button">UI button action.</param>
        /// <exception cref="ArgumentOutOfRangeException">Unknown value.</exception>
        public static string ForUiButton(UiButton button)
        {
            switch (button)
            {
                case UiButton.Submit: return UI.Submit;
                case UiButton.Cancel: return UI.Cancel;
                case UiButton.TabPrev: return UI.TabPrev;
                case UiButton.TabNext: return UI.TabNext;
                case UiButton.CloseHub: return UI.CloseHub;
                default:
                    throw new ArgumentOutOfRangeException(nameof(button), button, "Unknown UI button.");
            }
        }

        /// <summary>Control scheme of gamepads (architecture 11.1).</summary>
        public const string GamepadScheme = "Gamepad";

        /// <summary>Control scheme of keyboard and mouse (architecture 11.1).</summary>
        public const string KeyboardMouseScheme = "KeyboardMouse";

        /// <summary>Gameplay map (on foot), GDD 03 1.5.</summary>
        public static class Gameplay
        {
            /// <summary>Map name.</summary>
            public const string MapName = "Gameplay";
            /// <summary>Move (Vector2).</summary>
            public const string Move = "Move";
            /// <summary>Camera (Vector2).</summary>
            public const string Look = "Look";
            /// <summary>Walk/run toggle.</summary>
            public const string WalkToggle = "WalkToggle";
            /// <summary>Sprint.</summary>
            public const string Sprint = "Sprint";
            /// <summary>Sneak.</summary>
            public const string Sneak = "Sneak";
            /// <summary>Jump.</summary>
            public const string Jump = "Jump";
            /// <summary>Interact.</summary>
            public const string Interact = "Interact";
            /// <summary>Dodge.</summary>
            public const string Dodge = "Dodge";
            /// <summary>Light attack.</summary>
            public const string LightAttack = "LightAttack";
            /// <summary>Heavy attack.</summary>
            public const string HeavyAttack = "HeavyAttack";
            /// <summary>Block.</summary>
            public const string Block = "Block";
            /// <summary>Weapon art.</summary>
            public const string WeaponArt = "WeaponArt";
            /// <summary>Lock-on.</summary>
            public const string LockOn = "LockOn";
            /// <summary>Switch lock-on target (axis).</summary>
            public const string SwitchTarget = "SwitchTarget";
            /// <summary>Investigate / Aether sight.</summary>
            public const string Investigate = "Investigate";
            /// <summary>Ranged stance.</summary>
            public const string RangedStance = "RangedStance";
            /// <summary>Aim.</summary>
            public const string Aim = "Aim";
            /// <summary>Fire.</summary>
            public const string Fire = "Fire";
            /// <summary>Cycle ammunition (axis).</summary>
            public const string CycleAmmo = "CycleAmmo";
            /// <summary>Swap shoulder.</summary>
            public const string SwapShoulder = "SwapShoulder";
            /// <summary>Use ability.</summary>
            public const string UseAbility = "UseAbility";
            /// <summary>Ability wheel.</summary>
            public const string AbilityWheel = "AbilityWheel";
            /// <summary>Ability 1.</summary>
            public const string Ability1 = "Ability1";
            /// <summary>Ability 2.</summary>
            public const string Ability2 = "Ability2";
            /// <summary>Ability 3.</summary>
            public const string Ability3 = "Ability3";
            /// <summary>Ability 4.</summary>
            public const string Ability4 = "Ability4";
            /// <summary>Switch ability bar.</summary>
            public const string SwitchBar = "SwitchBar";
            /// <summary>Quick slot 1.</summary>
            public const string QuickSlot1 = "QuickSlot1";
            /// <summary>Quick slot 2.</summary>
            public const string QuickSlot2 = "QuickSlot2";
            /// <summary>Quick slot 3.</summary>
            public const string QuickSlot3 = "QuickSlot3";
            /// <summary>Quick slot 4.</summary>
            public const string QuickSlot4 = "QuickSlot4";
            /// <summary>Companion commands.</summary>
            public const string CompanionCommand = "CompanionCommand";
            /// <summary>Call mount.</summary>
            public const string CallMount = "CallMount";
            /// <summary>Map.</summary>
            public const string Map = "Map";
            /// <summary>HUD peek.</summary>
            public const string HudPeek = "HudPeek";
            /// <summary>Pause menu.</summary>
            public const string Pause = "Pause";
            /// <summary>Inventory.</summary>
            public const string Inventory = "Inventory";
            /// <summary>Quest log.</summary>
            public const string QuestLog = "QuestLog";
            /// <summary>Skill tree.</summary>
            public const string SkillTree = "SkillTree";
            /// <summary>Quick save.</summary>
            public const string QuickSave = "QuickSave";
            /// <summary>Quick load.</summary>
            public const string QuickLoad = "QuickLoad";
        }

        /// <summary>UI map (menus, hub, trading, workbench, pause menu), GDD 03 1.5.</summary>
        public static class UI
        {
            /// <summary>Map name.</summary>
            public const string MapName = "UI";
            /// <summary>Move the focus (Vector2).</summary>
            public const string Navigate = "Navigate";
            /// <summary>Confirm.</summary>
            public const string Submit = "Submit";
            /// <summary>Back.</summary>
            public const string Cancel = "Cancel";
            /// <summary>Main tab back.</summary>
            public const string TabPrev = "TabPrev";
            /// <summary>Main tab forward.</summary>
            public const string TabNext = "TabNext";
            /// <summary>Pointer position (Vector2).</summary>
            public const string Point = "Point";
            /// <summary>Pointer click.</summary>
            public const string Click = "Click";
            /// <summary>Close the hub / the pause menu.</summary>
            public const string CloseHub = "CloseHub";
            /// <summary>Skip the cutscene (hold).</summary>
            public const string SkipCutscene = "SkipCutscene";
        }

        /// <summary>Dialog map, GDD 03 1.5.</summary>
        public static class Dialog
        {
            /// <summary>Map name.</summary>
            public const string MapName = "Dialog";
            /// <summary>Choose an answer (Vector2).</summary>
            public const string DialogNavigate = "DialogNavigate";
            /// <summary>Choose / continue.</summary>
            public const string DialogSubmit = "DialogSubmit";
            /// <summary>Back / end the conversation.</summary>
            public const string DialogBack = "DialogBack";
            /// <summary>Pause menu.</summary>
            public const string Pause = "Pause";
        }

        /// <summary>Riding map, GDD 03 1.5.</summary>
        public static class Riding
        {
            /// <summary>Map name.</summary>
            public const string MapName = "Riding";
            /// <summary>Steer (Vector2).</summary>
            public const string MountSteer = "MountSteer";
            /// <summary>Camera (Vector2).</summary>
            public const string MountLook = "MountLook";
            /// <summary>Dismount.</summary>
            public const string Dismount = "Dismount";
            /// <summary>Pause menu.</summary>
            public const string Pause = "Pause";
        }

        /// <summary>Building map, GDD 03 1.5.</summary>
        public static class Building
        {
            /// <summary>Map name.</summary>
            public const string MapName = "Building";
            /// <summary>Move the building cursor (Vector2).</summary>
            public const string BuildCursor = "BuildCursor";
            /// <summary>Rotate the camera (Vector2).</summary>
            public const string BuildOrbit = "BuildOrbit";
            /// <summary>Cancel / deselect.</summary>
            public const string BuildCancel = "BuildCancel";
            /// <summary>Building menu: leave, pause, options.</summary>
            public const string BuildMenu = "BuildMenu";
        }
    }
}
