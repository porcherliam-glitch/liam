using UnityEngine.InputSystem;
using Names = Aetherfall.Input.InputActionNames;

namespace Aetherfall.Input
{
    /// <summary>
    /// Builds the action maps of §7.3 in code with the official Input System setup API (<c>AddActionMap</c>,
    /// <c>AddAction</c>, <c>AddBinding</c>, <c>AddCompositeBinding</c>). Default bindings follow GDD 03 1.5 including the
    /// resolved conflicts of 1.3 (K3: Sneak on C / L3 with stick below 50 %, Dodge only on Ctrl; K6: F = ranged stance;
    /// K7: middle mouse button = lock-on; K8: additional actions).
    /// </summary>
    /// <remarks>
    /// <para>Context pairs share a control on purpose (A = Jump + Interact, L3 = Sprint + Sneak, R3 = LockOn + Investigate,
    /// right mouse button = HeavyAttack + Aim): the player components resolve them per state (GDD 03 1.4).</para>
    /// <para>Dead zone: gamepad sticks use the <c>stickDeadzone</c> processor with 10 % inner and 95 % outer dead zone
    /// (GDD 03 3.1, GDD 05 4.2).</para>
    /// <para>TODO (Options step): stick curve (exponential), sensitivity, Y inversion and dead zone as options
    /// (processor parameter overrides), rebinding persistence (<c>SaveBindingOverridesAsJson</c> → settings.json),
    /// "hold/toggle" options. Chord bindings (OneModifier) also trigger the plain action of the same button (LB + Y also
    /// fires HeavyAttack); the player combat controller resolves that: while Block is held, a heavy attack press counts as
    /// weapon art (GDD 03 1.5).</para>
    /// </remarks>
    public static class GameInputBindings
    {
        /// <summary>Processor of all gamepad sticks: 10 % inner, 95 % outer dead zone.</summary>
        public const string StickProcessor = "stickDeadzone(min=0.1,max=0.95)";

        private const string Pad = Names.GamepadScheme;
        private const string Kbm = Names.KeyboardMouseScheme;
        private const string Vector2Layout = "Vector2";
        private const string AxisLayout = "Axis";

        /// <summary>Adds the two control schemes and all five maps to an empty asset.</summary>
        /// <param name="asset">The asset to fill (created by <see cref="GameInputActions.Create"/>).</param>
        public static void Populate(InputActionAsset asset)
        {
            asset.AddControlScheme(Pad).WithRequiredDevice("<Gamepad>");
            asset.AddControlScheme(Kbm).WithRequiredDevice("<Keyboard>").WithRequiredDevice("<Mouse>");

            AddGameplay(asset.AddActionMap(Names.Gameplay.MapName));
            AddUI(asset.AddActionMap(Names.UI.MapName));
            AddDialog(asset.AddActionMap(Names.Dialog.MapName));
            AddRiding(asset.AddActionMap(Names.Riding.MapName));
            AddBuilding(asset.AddActionMap(Names.Building.MapName));
        }

        private static void AddGameplay(InputActionMap map)
        {
            InputAction move = Value(map, Names.Gameplay.Move, Vector2Layout);
            move.AddBinding("<Gamepad>/leftStick", processors: StickProcessor, groups: Pad);
            AddWasd(move);

            InputAction look = Value(map, Names.Gameplay.Look, Vector2Layout);
            look.AddBinding("<Gamepad>/rightStick", processors: StickProcessor, groups: Pad);
            look.AddBinding("<Mouse>/delta", groups: Kbm);

            Button(map, Names.Gameplay.WalkToggle, null, "<Keyboard>/capsLock");

            // L3 is shared by Sprint and Sneak; the player resolves it by stick deflection (GDD 03 1.3 K3).
            Button(map, Names.Gameplay.Sprint, "<Gamepad>/leftStickPress", "<Keyboard>/leftShift");
            Button(map, Names.Gameplay.Sneak, "<Gamepad>/leftStickPress", "<Keyboard>/c");
            Button(map, Names.Gameplay.Jump, "<Gamepad>/buttonSouth", "<Keyboard>/space");
            // TODO (interaction step): "hold 0.5 s = alternative action" (GDD 03 1.4).
            Button(map, Names.Gameplay.Interact, "<Gamepad>/buttonSouth", "<Keyboard>/e");
            Button(map, Names.Gameplay.Dodge, "<Gamepad>/buttonEast", "<Keyboard>/leftCtrl");
            Button(map, Names.Gameplay.LightAttack, "<Gamepad>/buttonWest", "<Mouse>/leftButton");
            Button(map, Names.Gameplay.HeavyAttack, "<Gamepad>/buttonNorth", "<Mouse>/rightButton");
            Button(map, Names.Gameplay.Block, "<Gamepad>/leftShoulder", "<Keyboard>/q");

            InputAction weaponArt = Button(map, Names.Gameplay.WeaponArt, null, null);
            Chord(weaponArt, "<Gamepad>/leftShoulder", "<Gamepad>/buttonNorth", Pad);
            Chord(weaponArt, "<Keyboard>/q", "<Mouse>/rightButton", Kbm);

            InputAction lockOn = Button(map, Names.Gameplay.LockOn, "<Gamepad>/rightStickPress", "<Mouse>/middleButton");
            // Vorschlag: T as a second key, because Mac trackpads and the Magic Mouse have no middle button.
            lockOn.AddBinding("<Keyboard>/t", groups: Kbm);
            // On the gamepad the target is switched by flicking the right stick (PlayerLockOn reads it from Look).
            InputAction switchTarget = Value(map, Names.Gameplay.SwitchTarget, AxisLayout);
            switchTarget.AddBinding("<Mouse>/scroll/y", groups: Kbm);

            Button(map, Names.Gameplay.Investigate, "<Gamepad>/rightStickPress", "<Keyboard>/r");
            Button(map, Names.Gameplay.RangedStance, null, "<Keyboard>/f");
            Button(map, Names.Gameplay.Aim, "<Gamepad>/leftTrigger", "<Mouse>/rightButton");
            Button(map, Names.Gameplay.Fire, "<Gamepad>/rightTrigger", "<Mouse>/leftButton");

            InputAction cycleAmmo = Value(map, Names.Gameplay.CycleAmmo, AxisLayout);
            cycleAmmo.AddCompositeBinding("1DAxis")
                .With("Negative", "<Gamepad>/dpad/left", Pad)
                .With("Positive", "<Gamepad>/dpad/right", Pad);
            cycleAmmo.AddBinding("<Mouse>/scroll/y", groups: Kbm);

            Button(map, Names.Gameplay.SwapShoulder, "<Gamepad>/rightStickPress", "<Mouse>/middleButton");

            // RB: tap (< 0.2 s) = selected ability, hold (≥ 0.2 s) = ability wheel (GDD 03 1.3 K2).
            Button(map, Names.Gameplay.UseAbility, null, null).AddBinding("<Gamepad>/rightShoulder", "tap(duration=0.2)", groups: Pad);
            Button(map, Names.Gameplay.AbilityWheel, null, null).AddBinding("<Gamepad>/rightShoulder", "hold(duration=0.2)", groups: Pad);

            AbilitySlot(map, Names.Gameplay.Ability1, "<Gamepad>/buttonWest", "<Keyboard>/1");
            AbilitySlot(map, Names.Gameplay.Ability2, "<Gamepad>/buttonNorth", "<Keyboard>/2");
            AbilitySlot(map, Names.Gameplay.Ability3, "<Gamepad>/buttonEast", "<Keyboard>/3");
            AbilitySlot(map, Names.Gameplay.Ability4, "<Gamepad>/buttonSouth", "<Keyboard>/4");
            AbilitySlot(map, Names.Gameplay.SwitchBar, "<Gamepad>/leftShoulder", "<Keyboard>/x");

            Button(map, Names.Gameplay.QuickSlot1, "<Gamepad>/dpad/up", "<Keyboard>/5");
            Button(map, Names.Gameplay.QuickSlot2, "<Gamepad>/dpad/right", "<Keyboard>/6");
            Button(map, Names.Gameplay.QuickSlot3, "<Gamepad>/dpad/down", "<Keyboard>/7");
            Button(map, Names.Gameplay.QuickSlot4, "<Gamepad>/dpad/left", "<Keyboard>/8");

            // TODO (companion step): which D-pad direction / number key was chosen; G held = command wheel.
            InputAction companion = Button(map, Names.Gameplay.CompanionCommand, null, "<Keyboard>/g");
            Chord(companion, "<Gamepad>/leftShoulder", "<Gamepad>/dpad/up", Pad);
            Chord(companion, "<Gamepad>/leftShoulder", "<Gamepad>/dpad/right", Pad);
            Chord(companion, "<Gamepad>/leftShoulder", "<Gamepad>/dpad/down", Pad);
            Chord(companion, "<Gamepad>/leftShoulder", "<Gamepad>/dpad/left", Pad);

            InputAction callMount = Button(map, Names.Gameplay.CallMount, null, "<Keyboard>/h");
            Chord(callMount, "<Gamepad>/leftShoulder", "<Gamepad>/buttonSouth", Pad);

            InputAction mapAction = Button(map, Names.Gameplay.Map, null, null);
            mapAction.AddBinding("<Gamepad>/select", "tap(duration=0.4)", groups: Pad);
            mapAction.AddBinding("<Keyboard>/m", "tap(duration=0.4)", groups: Kbm);
            InputAction hudPeek = Button(map, Names.Gameplay.HudPeek, null, null);
            hudPeek.AddBinding("<Gamepad>/select", "hold(duration=0.4)", groups: Pad);
            hudPeek.AddBinding("<Keyboard>/m", "hold(duration=0.4)", groups: Kbm);

            Button(map, Names.Gameplay.Pause, "<Gamepad>/start", "<Keyboard>/escape");
            Button(map, Names.Gameplay.Inventory, null, "<Keyboard>/tab");
            Button(map, Names.Gameplay.QuestLog, null, "<Keyboard>/j");
            Button(map, Names.Gameplay.SkillTree, null, "<Keyboard>/k");
            Button(map, Names.Gameplay.QuickSave, null, "<Keyboard>/f5");
            Button(map, Names.Gameplay.QuickLoad, null, "<Keyboard>/f9");
        }

        private static void AddUI(InputActionMap map)
        {
            InputAction navigate = Value(map, Names.UI.Navigate, Vector2Layout);
            navigate.AddBinding("<Gamepad>/leftStick", processors: StickProcessor, groups: Pad);
            navigate.AddBinding("<Gamepad>/dpad", groups: Pad);
            AddWasd(navigate);
            AddArrows(navigate);

            InputAction submit = Button(map, Names.UI.Submit, "<Gamepad>/buttonSouth", "<Keyboard>/enter");
            submit.AddBinding("<Keyboard>/space", groups: Kbm);
            InputAction cancel = Button(map, Names.UI.Cancel, "<Gamepad>/buttonEast", "<Keyboard>/escape");
            cancel.AddBinding("<Mouse>/rightButton", groups: Kbm);
            Button(map, Names.UI.TabPrev, "<Gamepad>/leftShoulder", "<Keyboard>/q");
            Button(map, Names.UI.TabNext, "<Gamepad>/rightShoulder", "<Keyboard>/e");

            InputAction point = map.AddAction(Names.UI.Point, InputActionType.PassThrough, expectedControlLayout: Vector2Layout);
            point.AddBinding("<Mouse>/position", groups: Kbm);
            InputAction click = map.AddAction(Names.UI.Click, InputActionType.PassThrough, expectedControlLayout: "Button");
            click.AddBinding("<Mouse>/leftButton", groups: Kbm);

            // GDD 03 1.5: CloseHub = Menu or Esc, and the direct key of the open tab (Tab for the inventory, J for the quest log;
            // M or View for the map; K follows with its screen).
            InputAction closeHub = Button(map, Names.UI.CloseHub, "<Gamepad>/start", "<Keyboard>/escape");
            closeHub.AddBinding("<Keyboard>/tab", groups: Kbm);
            closeHub.AddBinding("<Keyboard>/j", groups: Kbm);
            closeHub.AddBinding("<Keyboard>/m", groups: Kbm);
            closeHub.AddBinding("<Gamepad>/select", groups: Pad);

            // GDD 05 1.4/1.5: LT/RT = sub categories (Z/C by position: Unity binds keys by their US position, so QWERTZ uses Y/C),
            // X = secondary action (F).
            Button(map, Names.UI.SubTabPrev, "<Gamepad>/leftTrigger", "<Keyboard>/z");
            Button(map, Names.UI.SubTabNext, "<Gamepad>/rightTrigger", "<Keyboard>/c");
            Button(map, Names.UI.Secondary, "<Gamepad>/buttonWest", "<Keyboard>/f");

            // GDD 03 1.5: SkipCutscene = A or Space held. No hold interaction here: the cutscene screen times the hold itself
            // (CutsceneSkipHold), so it can draw the progress bar and the hold duration option applies.
            Button(map, Names.UI.SkipCutscene, "<Gamepad>/buttonSouth", "<Keyboard>/space");
            // TODO (inventory screen): SortFilter (Y / R), Details (R3 / Shift), ScrollRotate (RS / mouse wheel) – GDD 03 1.5.
        }

        private static void AddDialog(InputActionMap map)
        {
            InputAction navigate = Value(map, Names.Dialog.DialogNavigate, Vector2Layout);
            navigate.AddBinding("<Gamepad>/leftStick", processors: StickProcessor, groups: Pad);
            navigate.AddBinding("<Gamepad>/dpad", groups: Pad);
            AddWasd(navigate);
            AddArrows(navigate);

            InputAction submit = Button(map, Names.Dialog.DialogSubmit, "<Gamepad>/buttonSouth", "<Keyboard>/e");
            submit.AddBinding("<Keyboard>/space", groups: Kbm);
            submit.AddBinding("<Keyboard>/enter", groups: Kbm);
            submit.AddBinding("<Mouse>/leftButton", groups: Kbm);
            Button(map, Names.Dialog.DialogBack, "<Gamepad>/buttonEast", "<Mouse>/rightButton");
            Button(map, Names.Dialog.Pause, "<Gamepad>/start", "<Keyboard>/escape");
            for (int i = 1; i <= 9; i++)
            {
                Button(map, Names.Dialog.DialogDirectPrefix + i, null, "<Keyboard>/" + i);
            }

            Button(map, Names.Dialog.DialogAuto, "<Gamepad>/buttonWest", "<Keyboard>/f");
            // TODO: DialogDetails (R3 / Shift), DialogLog (Y / Tab) - GDD 03 1.5.
        }

        private static void AddRiding(InputActionMap map)
        {
            InputAction steer = Value(map, Names.Riding.MountSteer, Vector2Layout);
            steer.AddBinding("<Gamepad>/leftStick", processors: StickProcessor, groups: Pad);
            AddWasd(steer);

            InputAction look = Value(map, Names.Riding.MountLook, Vector2Layout);
            look.AddBinding("<Gamepad>/rightStick", processors: StickProcessor, groups: Pad);
            look.AddBinding("<Mouse>/delta", groups: Kbm);

            Button(map, Names.Riding.Dismount, "<Gamepad>/buttonEast", "<Keyboard>/e");
            Button(map, Names.Riding.Pause, "<Gamepad>/start", "<Keyboard>/escape");
            // TODO (riding step): MountGallop (L3 / Shift), MountJump (A / Space), MountAttack (X / LMB),
            // MountAim/MountFire (LT/RT, RMB/LMB), QuickSlot1–4, Map – GDD 03 1.5.
        }

        private static void AddBuilding(InputActionMap map)
        {
            InputAction cursor = Value(map, Names.Building.BuildCursor, Vector2Layout);
            cursor.AddBinding("<Gamepad>/leftStick", processors: StickProcessor, groups: Pad);
            AddWasd(cursor);

            // TODO (building step): on keyboard/mouse the orbit only applies while the right mouse button is held.
            InputAction orbit = Value(map, Names.Building.BuildOrbit, Vector2Layout);
            orbit.AddBinding("<Gamepad>/rightStick", processors: StickProcessor, groups: Pad);
            orbit.AddBinding("<Mouse>/delta", groups: Kbm);

            Button(map, Names.Building.BuildCancel, "<Gamepad>/buttonEast", "<Mouse>/rightButton");
            Button(map, Names.Building.BuildMenu, "<Gamepad>/start", "<Keyboard>/escape");
            // TODO (building step): BuildZoom, BuildPlace, BuildRotate, BuildHeight, BuildVariant, BuildGrid, BuildStore,
            // BuildCopy, BuildCatalog, BuildUndo – GDD 03 1.5.
        }

        private static InputAction Value(InputActionMap map, string name, string layout)
        {
            return map.AddAction(name, InputActionType.Value, expectedControlLayout: layout);
        }

        private static InputAction Button(InputActionMap map, string name, string gamepadPath, string keyboardMousePath)
        {
            InputAction action = map.AddAction(name, InputActionType.Button);
            if (gamepadPath != null)
            {
                action.AddBinding(gamepadPath, groups: Pad);
            }

            if (keyboardMousePath != null)
            {
                action.AddBinding(keyboardMousePath, groups: Kbm);
            }

            return action;
        }

        private static void AbilitySlot(InputActionMap map, string name, string gamepadFaceButton, string key)
        {
            // Gamepad: hold RB (ability wheel) + face button (GDD 03 1.3 K2); keyboard: number key.
            InputAction action = Button(map, name, null, key);
            Chord(action, "<Gamepad>/rightShoulder", gamepadFaceButton, Pad);
        }

        private static void Chord(InputAction action, string modifier, string button, string group)
        {
            action.AddCompositeBinding("OneModifier")
                .With("Modifier", modifier, group)
                .With("Binding", button, group);
        }

        private static void AddWasd(InputAction action)
        {
            action.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/w", Kbm)
                .With("Down", "<Keyboard>/s", Kbm)
                .With("Left", "<Keyboard>/a", Kbm)
                .With("Right", "<Keyboard>/d", Kbm);
        }

        private static void AddArrows(InputAction action)
        {
            action.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/upArrow", Kbm)
                .With("Down", "<Keyboard>/downArrow", Kbm)
                .With("Left", "<Keyboard>/leftArrow", Kbm)
                .With("Right", "<Keyboard>/rightArrow", Kbm);
        }
    }
}
