using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Core;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Developer inventory (IMGUI, mouse; placeholder until the inventory screen of the UI step): the Inventory action (Tab,
    /// GDD 03 1.5 / §7.2) pushes the game state Menu and opens a list of the bag, the equipment, weight and gold; CloseHub
    /// (Tab, Esc, Start) or Cancel pops Menu again. Left click on a bag entry equips it (consumables go into a quick slot),
    /// right click drops it into the world; left click on an equipment slot takes the item off.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: "InventoryOverlay" in the test ground (the menu adds it and sets the player). Active only in the
    /// editor and in development builds. Services are resolved once in <c>Start</c>; texts are rebuilt when the inventory
    /// revision changes.</para>
    /// <para>Developer buttons: drop one random item per rarity (beams of all colours), add 25 kg ballast (overload test),
    /// add 100 gold. They are cheats and exist only in this overlay.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class InventoryDebugOverlay : MonoBehaviour
    {
        /// <summary>Item id of the developer ballast stone (25 kg, created by the test ground menu).</summary>
        public const string BallastItemId = "item.misc.ballaststein";

        private const float ReferenceHeight = 1080f;
        private const string Reason = "Debug-Inventar";
        private const string DebugSource = "debug";

        [Tooltip("Spielfigur (Position für „Wegwerfen“ und Testbeute).")]
        [SerializeField] private Transform player = null;

        [Tooltip("Ausrüstungs-Brücke der Figur (Angriffswert). Optional.")]
        [SerializeField] private Aetherfall.Player.PlayerEquipment playerEquipment = null;

        [Tooltip("Zusätzliche Skalierung. Ab 1080 Pixeln Bildschirmhöhe wird automatisch mitskaliert.")]
        [Range(0.5f, 3f)] [SerializeField] private float uiScale = 1f;

        [Tooltip("Unter jedem Ausrüstungsteil die Affixe anzeigen.")]
        [SerializeField] private bool showDetails = true;

        private readonly List<ItemInstance> _rows = new List<ItemInstance>();
        private readonly List<string> _rowTexts = new List<string>();
        private readonly List<string> _slotTexts = new List<string>();
        private readonly List<string> _lines = new List<string>();
        private IGameStateService _gameState;
        private IInputService _input;
        private IInventoryService _inventory;
        private ILootService _loot;
        private InventorySortMode _sortMode = InventorySortMode.Rarity;
        private Vector2 _scroll;
        private bool _open;
        private int _openFrame = -1;
        private int _builtRevision = -1;
        private string _header = string.Empty;
        private string _message = string.Empty;
        private GUIStyle _rowStyle;
        private GUIStyle _labelStyle;

        private static bool IsAvailableInThisBuild
        {
            get
            {
#if UNITY_EDITOR || DEVELOPMENT_BUILD || AETHERFALL_DEV
                return true;
#else
                return false;
#endif
            }
        }

        /// <summary>True while the developer inventory is open.</summary>
        public bool IsOpen => _open;

        private void Awake()
        {
            if (!IsAvailableInThisBuild)
            {
                enabled = false;
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters; all exceptions are handled here.
            if (!enabled)
            {
                return;
            }

            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _input);
                locator.TryGet(out _inventory);
                locator.TryGet(out _loot);
                if (_inventory == null)
                {
                    _message = "Kein Inventar: InventoryInstaller fehlt in der BootConfig (Testgelände neu erstellen).";
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.DevTools, exception, "InventoryDebugOverlay could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_gameState == null || _input == null || _inventory == null)
            {
                return;
            }

            if (!_open)
            {
                if (_gameState.Current == GameState.Playing && _input.Gameplay.IsActive && _input.Gameplay.WasPressedThisFrame(GameplayButton.Inventory))
                {
                    Open();
                }

                return;
            }

            if (_gameState.Current != GameState.Menu)
            {
                // Someone else changed the state (load, debug overlay): the inventory closes with it.
                _open = false;
                return;
            }

            if (Time.frameCount != _openFrame && (_input.UI.WasPressedThisFrame(UiButton.CloseHub) || _input.UI.WasPressedThisFrame(UiButton.Cancel)))
            {
                Close();
                return;
            }

            if (_builtRevision != _inventory.Revision)
            {
                // Lists change only here, never inside OnGUI: IMGUI needs the same controls in its layout and input passes.
                Rebuild();
            }
        }

        private void Open()
        {
            if (!_gameState.Push(GameState.Menu, Reason))
            {
                return;
            }

            _open = true;
            _openFrame = Time.frameCount;
            _message = "Linksklick: anlegen/ablegen · Rechtsklick: wegwerfen · Tab, Esc oder B: schließen";
            Rebuild();
        }

        private void Close()
        {
            _open = false;
            if (_gameState.Current == GameState.Menu)
            {
                _gameState.Pop(GameState.Menu);
            }
        }

        private void Rebuild()
        {
            _builtRevision = _inventory.Revision;
            IItemCatalog catalog = _inventory.Catalog;
            InventorySorting.Query(_inventory.PlayerContainer.Entries, catalog, InventoryFilter.All, _sortMode, _rows);
            _rowTexts.Clear();
            for (int i = 0; i < _rows.Count; i++)
            {
                _rowTexts.Add(DescribeItem(_rows[i], catalog, false));
            }

            _slotTexts.Clear();
            Equipment equipment = _inventory.PlayerEquipment;
            for (int i = 0; i < EquipmentSlotIds.All.Length; i++)
            {
                EquipmentSlot slot = EquipmentSlotIds.All[i];
                string label = EquipmentSlotIds.GermanName(slot) + ": ";
                if (EquipmentSlotIds.IsQuickSlot(slot))
                {
                    string itemId = equipment.GetQuickSlot(slot);
                    string name = itemId.Length > 0 && catalog.TryGetItem(itemId, out ItemSpec quickSpec) ? quickSpec.DisplayName : itemId;
                    _slotTexts.Add(label + (itemId.Length > 0 ? name + " (" + _inventory.CountOf(InventoryOwners.Player, itemId) + " im Rucksack)" : "–"));
                    continue;
                }

                ItemInstance item = equipment.Get(slot);
                _slotTexts.Add(label + (item != null ? DescribeItem(item, catalog, showDetails) : "–"));
            }

            BuildHeader();
        }

        private void BuildHeader()
        {
            EncumbranceState load = _inventory.PlayerEncumbrance;
            StatCollection stats = _inventory.PlayerStats;
            string text = "Gewicht " + ItemTexts.Kilograms(load.Load) + " / " + ItemTexts.Kilograms(load.Capacity) + " (" +
                          (load.Ratio * 100f).ToString("0", CultureInfo.InvariantCulture) + " %) – " + EncumbranceRules.GermanName(load.Level) +
                          "\nGold " + _inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold) +
                          "   Rüstungsklasse " + ArmorRules.GermanName(_inventory.PlayerEquipment.ArmorClass);
            if (stats != null)
            {
                text += "   Rüstung " + Floor(stats.Get(StatId.Armor)) + "   Standfestigkeit " + Floor(stats.Get(StatId.Poise)) +
                        "   Tempo " + (stats.Get(StatId.MoveSpeed) * 100f).ToString("0", CultureInfo.InvariantCulture) + " %" +
                        "   Glück " + stats.Get(StatId.Luck).ToString("0.#", CultureInfo.InvariantCulture);
            }

            if (playerEquipment != null)
            {
                text += "   Angriff " + Floor(playerEquipment.AttackDisplay) + " (Waffenschaden " + Floor(playerEquipment.WeaponDamage) + ")";
            }

            if (_loot != null)
            {
                text += "\nPech-Schutz: " + _loot.Pity.LegendaryCounter + " Ausrüstungs-Funde ohne Legendär (ab 50 steigt die Chance, bei 200 garantiert)";
            }

            _header = text;
        }

        private string DescribeItem(ItemInstance item, IItemCatalog catalog, bool details)
        {
            catalog.TryGetItem(item.ItemId, out ItemSpec spec);
            string color = RarityRules.Color(item.Rarity).Hex;
            string text = (item.IsNew ? "● " : string.Empty) + "<color=" + color + "><b>" + ItemTexts.Title(spec, item) + "</b></color>  " +
                          ItemTexts.Summary(spec, item) + (item.IsLocked ? "  [gesperrt]" : string.Empty);
            if (!details && (spec == null || !spec.IsEquipment))
            {
                return text;
            }

            _lines.Clear();
            ItemTexts.Details(spec, item, catalog.Affixes, _lines);
            for (int i = 0; i < _lines.Count; i++)
            {
                text += "\n      " + _lines[i];
            }

            return text;
        }

        private void OnGUI()
        {
            if (_inventory == null)
            {
                return;
            }

            EnsureStyles();
            float scale = uiScale * Mathf.Max(1f, Screen.height / ReferenceHeight);
            Matrix4x4 previous = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            try
            {
                float width = Screen.width / scale;
                float height = Screen.height / scale;
                if (!_open)
                {
                    DrawClosedHint(height);
                    return;
                }

                float panelWidth = Mathf.Min(1100f, width - 20f);
                GUILayout.BeginArea(new Rect((width - panelWidth) * 0.5f, 20f, panelWidth, height - 40f));
                GUILayout.BeginVertical(GUI.skin.box);
                DrawPanel(panelWidth);
                GUILayout.EndVertical();
                GUILayout.EndArea();
            }
            finally
            {
                GUI.matrix = previous;
            }
        }

        private void DrawClosedHint(float height)
        {
            bool canOpen = _gameState != null && GameStateTransitions.CanPush(_gameState.Current, GameState.Menu);
            GUI.enabled = canOpen;
            if (GUI.Button(new Rect(10f, height - 36f, 190f, 26f), "Inventar (Tab)"))
            {
                Open();
            }

            GUI.enabled = true;
        }

        private void DrawPanel(float panelWidth)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("<b>Inventar (Debug)</b> – Platzhalter bis zur echten Oberfläche", _labelStyle);
            bool close = GUILayout.Button("Schließen (Tab)", GUILayout.Width(140f));
            GUILayout.EndHorizontal();
            if (close)
            {
                // Closing in the click event is safe: the next IMGUI event starts with a new layout pass.
                Close();
            }
            GUILayout.Label(_header, _labelStyle);
            DrawButtons();
            if (_message.Length > 0)
            {
                GUILayout.Label(_message, _labelStyle);
            }

            GUILayout.BeginHorizontal();
            GUILayout.BeginVertical(GUILayout.Width(panelWidth * 0.45f));
            GUILayout.Label("<b>Ausrüstung</b> (Klick = ablegen)", _labelStyle);
            for (int i = 0; i < _slotTexts.Count && i < EquipmentSlotIds.All.Length; i++)
            {
                if (GUILayout.Button(_slotTexts[i], _rowStyle))
                {
                    Unequip(EquipmentSlotIds.All[i]);
                }
            }

            GUILayout.EndVertical();
            GUILayout.BeginVertical();
            GUILayout.Label("<b>Rucksack</b> (" + _rows.Count + " Einträge; Linksklick = anlegen, Rechtsklick = wegwerfen)", _labelStyle);
            _scroll = GUILayout.BeginScrollView(_scroll);
            for (int i = 0; i < _rows.Count && i < _rowTexts.Count; i++)
            {
                if (GUILayout.Button(_rowTexts[i], _rowStyle))
                {
                    OnRowClicked(_rows[i], Event.current.button);
                }
            }

            GUILayout.EndScrollView();
            GUILayout.EndVertical();
            GUILayout.EndHorizontal();
        }

        private void DrawButtons()
        {
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Sortierung: " + SortName(_sortMode), GUILayout.Width(220f)))
            {
                _sortMode = (InventorySortMode)(((int)_sortMode + 1) % 8);
                _builtRevision = -1;
            }

            if (GUILayout.Button("Alle als gesehen"))
            {
                _inventory.MarkAllSeen();
            }

            bool details = GUILayout.Toggle(showDetails, "Affixe zeigen");
            if (details != showDetails)
            {
                showDetails = details;
                _builtRevision = -1;
            }

            if (GUILayout.Button("Testbeute (je Seltenheit)"))
            {
                DropTestLoot();
            }

            if (GUILayout.Button("+25 kg Ballast"))
            {
                _message = _inventory.TryAddNew(InventoryOwners.Player, BallastItemId, 1, DebugSource)
                    ? "Ballaststein (25 kg) in den Rucksack gelegt."
                    : "Ballaststein fehlt im Inhaltskatalog (Testgelände neu erstellen).";
            }

            if (GUILayout.Button("+100 Gold"))
            {
                _inventory.TryChangeCurrency(InventoryOwners.Player, CurrencyIds.Gold, 100, DebugSource);
            }

            GUILayout.EndHorizontal();
        }

        private void OnRowClicked(ItemInstance item, int mouseButton)
        {
            if (mouseButton == 1)
            {
                if (_loot == null)
                {
                    _message = "Wegwerfen nicht möglich: kein Loot-Dienst.";
                    return;
                }

                _message = _loot.DropFromInventory(item.InstanceId, item.Count, DropPosition(), out string reason)
                    ? "Weggeworfen: " + item.ItemId + (_loot.HasSpawner ? " (liegt vor der Figur)." : " (kein LootWorldSpawner in der Szene).")
                    : "Wegwerfen nicht möglich: " + reason;
                return;
            }

            _message = _inventory.TryEquip(item.InstanceId, EquipmentSlot.None, out string equipReason)
                ? "Angelegt: " + item.ItemId
                : "Anlegen nicht möglich: " + equipReason;
        }

        private void Unequip(EquipmentSlot slot)
        {
            _message = _inventory.TryUnequip(slot, out string reason)
                ? EquipmentSlotIds.GermanName(slot) + " abgelegt."
                : EquipmentSlotIds.GermanName(slot) + ": " + reason;
        }

        private void DropTestLoot()
        {
            if (_loot == null)
            {
                _message = "Kein Loot-Dienst registriert.";
                return;
            }

            int count = _loot.SpawnDebugLoot(DropPosition());
            _message = count + " Teststücke (Gewöhnlich bis Legendär) " + (_loot.HasSpawner ? "liegen vor der Figur – Inventar schließen, um die Strahlen zu sehen." : "sind im Rucksack (kein LootWorldSpawner).");
        }

        private Vector3 DropPosition()
        {
            if (player == null)
            {
                return Vector3.zero;
            }

            Vector3 forward = player.forward;
            forward.y = 0f;
            return player.position + (forward.sqrMagnitude > 0.01f ? forward.normalized : Vector3.forward) * 1.6f;
        }

        private void EnsureStyles()
        {
            if (_rowStyle != null)
            {
                return;
            }

            _rowStyle = new GUIStyle(GUI.skin.button) { alignment = TextAnchor.MiddleLeft, richText = true, wordWrap = true };
            _labelStyle = new GUIStyle(GUI.skin.label) { richText = true, wordWrap = true };
        }

        private static string SortName(InventorySortMode mode)
        {
            switch (mode)
            {
                case InventorySortMode.Newest: return "Neu zuerst";
                case InventorySortMode.ItemLevel: return "Item-Level";
                case InventorySortMode.Value: return "Wert";
                case InventorySortMode.Weight: return "Gewicht";
                case InventorySortMode.ValuePerKilogram: return "Wert je kg";
                case InventorySortMode.Name: return "Name";
                case InventorySortMode.Category: return "Typ";
                default: return "Seltenheit";
            }
        }

        private static string Floor(float value)
        {
            return Math.Floor(value + 1e-3).ToString("0", CultureInfo.InvariantCulture);
        }
    }
}
