using System.Collections.Generic;
using System.Linq;
using DeadZone.Core;
using DeadZone.Core.Data;
using UnityEngine;

namespace DeadZone.Game
{
    public sealed partial class UiRoot
    {
        private sealed class SlotRef
        {
            public string kind;   // stash, loadout, secure, equip, pinv, psecure, pequip, container
            public int index = -1;
            public string slot;
            public bool Same(SlotRef o) => o != null && o.kind == kind && o.index == index && o.slot == slot;
        }

        private sealed class DragState { public SlotRef from; public ItemInst inst; public Vector2 start; public bool active; }

        private SlotRef _selected;
        private DragState _drag;
        private readonly List<(SlotRef target, Rect rect)> _dropTargets = new List<(SlotRef, Rect)>();
        private ItemInst _hoverItem;
        private Rect? _viewport;      // visible area of the scroll view being drawn (virtual canvas coordinates)
        private Vector2 _mouseVirtual; // mouse position on the virtual canvas, outside any group/scroll view
        private string _hoverExtra;

        // ------------------------------------------------------------------ data access
        private Profile Prof => game.core.Profile;
        private Player RaidPlayer => game.Raid?.player;

        private Inventory InvOf(SlotRef s)
        {
            switch (s.kind)
            {
                case "stash": return Prof?.stash;
                case "loadout": return Prof?.loadout;
                case "secure": return Prof?.secure;
                case "pinv": return RaidPlayer?.inventory;
                case "psecure": return RaidPlayer?.secure;
            }
            return null;
        }

        private Equipment EqOf(SlotRef s) => s.kind == "equip" ? Prof?.equipment : s.kind == "pequip" ? RaidPlayer?.equipment : null;

        private ItemInst ItemAt(SlotRef s)
        {
            if (s == null) return null;
            if (s.kind == "container") return lootContainer?.items != null && s.index >= 0 && s.index < lootContainer.items.Count ? lootContainer.items[s.index] : null;
            var eq = EqOf(s);
            if (eq != null) return eq[s.slot];
            return InvOf(s)?.Get(s.index);
        }

        // ------------------------------------------------------------------ icons
        private static string Glyph(ItemDef d)
        {
            if (d == null) return "?";
            if (d.weapon != null)
            {
                switch (d.weapon.@class) { case "pistol": return "PST"; case "smg": return "MP"; case "rifle": return "STG"; case "shotgun": return "SFL"; case "sniper": return "PRÄ"; case "lmg": return "MG"; case "melee": return "NAH"; }
            }
            if (d.ammo != null && DataTables.AMMO_CALIBERS.TryGetValue(d.ammo.caliber ?? "", out var cal)) return cal;
            switch (d.cat)
            {
                case "medical": return "+";
                case "food": return "ESS";
                case "water": return "H₂O";
                case "armor": return d.armor != null && d.armor.slot == "head" ? "HELM" : "WEST";
                case "backpack": return "PACK";
                case "key": return "KEY";
                case "grenade": return "GR";
                case "mission": return "!";
                case "collectible": return "$";
                case "electronics": return "EL";
                case "tool": return "WZ";
                case "material": return "MAT";
            }
            return "?";
        }

        private void DrawItemIcon(Rect r, ItemInst inst, bool selected, string caption = null)
        {
            var d = Items.Def(inst);
            if (d == null) return;
            var cat = UiColors.Category(d.cat);
            Fill(r, new Color(cat.r * 0.32f, cat.g * 0.32f, cat.b * 0.32f, 1f));
            Fill(new Rect(r.x, r.y, r.width, r.height * 0.45f), new Color(cat.r * 0.45f, cat.g * 0.45f, cat.b * 0.45f, 1f));
            var rar = Mats.Hex(Items.Rarity(inst).color, Color.grey);
            Frame(r, selected ? Color.white : rar, selected ? 3 : 2);
            Text(new Rect(r.x, r.y + 4, r.width, r.height * 0.45f), Glyph(d), d.ammo != null ? 14 : 20, new Color(1, 1, 1, 0.9f), TextAnchor.MiddleCenter, true);
            Text(new Rect(r.x + 4, r.y + r.height * 0.48f, r.width - 8, r.height * 0.5f - 6), d.name, 11, new Color(0.92f, 0.92f, 0.92f), TextAnchor.UpperCenter, false, true);
            if (inst.count > 1) Text(new Rect(r.x + 2, r.y + 2, r.width - 6, 16), "×" + inst.count, 13, UiColors.Accent, TextAnchor.UpperRight, true);
            if (inst.durability.HasValue && d.durabilityMax > 0)
            {
                float k = (float)(inst.durability.Value / d.durabilityMax);
                Fill(new Rect(r.x + 3, r.yMax - 6, r.width - 6, 3), new Color(0, 0, 0, 0.7f));
                Fill(new Rect(r.x + 3, r.yMax - 6, (r.width - 6) * k, 3), k > 0.5f ? UiColors.Good : k > 0.25f ? UiColors.Warn : UiColors.Bad);
            }
            if (inst.mag.HasValue && d.weapon != null) Text(new Rect(r.x + 4, r.y + 2, r.width, 16), inst.mag.Value + "/" + d.weapon.magSize, 12, new Color(0.85f, 0.95f, 1f), TextAnchor.UpperLeft, true);
            if (caption != null)
            {
                Fill(new Rect(r.x, r.yMax - 18, r.width, 18), new Color(0, 0, 0, 0.75f));
                Text(new Rect(r.x, r.yMax - 18, r.width, 18), caption, 11, UiColors.Accent, TextAnchor.MiddleCenter);
            }
            if (GUI.enabled && Hover(r) && _drag == null && (_viewport == null || _viewport.Value.Contains(_mouseVirtual))) { _hoverItem = inst; }
        }

        /// <summary>One inventory slot with selection, drag & drop and right-click quick move.</summary>
        private void DrawSlot(Rect r, SlotRef sref, string emptyLabel = null)
        {
            var inst = ItemAt(sref);
            bool sel = sref.Same(_selected);
            bool dropHover = _drag != null && _drag.active && Hover(r);
            Fill(r, dropHover ? new Color(0.25f, 0.3f, 0.2f, 1f) : new Color(0.06f, 0.075f, 0.085f, 1f));
            Frame(r, sel ? Color.white : UiColors.Line);
            if (inst != null && !(_drag != null && _drag.active && _drag.from.Same(sref))) DrawItemIcon(new Rect(r.x + 2, r.y + 2, r.width - 4, r.height - 4), inst, sel);
            else if (emptyLabel != null) Text(r, emptyLabel, 12, UiColors.Muted, TextAnchor.MiddleCenter, false, true);
            if (Event.current.type == EventType.Repaint) _dropTargets.Add((sref, r));
            var e = Event.current;
            if (!GUI.enabled) return;
            if (e.type == EventType.MouseDown && r.Contains(e.mousePosition))
            {
                if (e.button == 0 && inst != null)
                {
                    if (e.clickCount >= 2) { _selected = sref; DoubleClick(sref); _drag = null; }
                    else _drag = new DragState { from = sref, inst = inst, start = e.mousePosition };
                    e.Use();
                }
                else if (e.button == 1 && inst != null) { _selected = sref; QuickMove(sref); e.Use(); }
                else if (e.button == 0) { _selected = null; e.Use(); }
            }
            else if (e.type == EventType.MouseDrag && _drag != null && !_drag.active && (e.mousePosition - _drag.start).magnitude > 6) _drag.active = true;
        }

        private void HandleDragRelease()
        {
            var e = Event.current;
            if (_drag == null) return;
            if (e.type == EventType.MouseDrag && !_drag.active && (e.mousePosition - _drag.start).magnitude > 6) _drag.active = true;
            if (e.type != EventType.MouseUp) return;
            var d = _drag;
            _drag = null;
            if (!d.active) { _selected = d.from; e.Use(); return; }
            foreach (var (target, rect) in _dropTargets)
            {
                if (!rect.Contains(e.mousePosition)) continue;
                if (!target.Same(d.from)) MoveItem(d.from, target);
                break;
            }
            e.Use();
        }

        private void DrawDragAndTooltip()
        {
            if (_drag != null && _drag.active)
            {
                var m = Event.current.mousePosition;
                DrawItemIcon(new Rect(m.x - 30, m.y - 30, 60, 60), _drag.inst, true);
            }
            else if (_hoverItem != null) DrawTooltip(_hoverItem);
            else if (_tooltipText != null)
            {
                var m = Event.current.mousePosition;
                float w = 360, h = TextHeight(_tooltipText, w - 20, 15) + 16;
                var r = new Rect(Mathf.Min(m.x + 18, W - w - 10), Mathf.Min(m.y + 18, H - h - 10), w, h);
                Panel(r, UiColors.Bg);
                Text(new Rect(r.x + 10, r.y + 8, w - 20, h - 16), _tooltipText, 15, UiColors.Text, TextAnchor.UpperLeft, false, true);
            }
        }

        private void DrawTooltip(ItemInst inst)
        {
            var d = Items.Def(inst);
            if (d == null) return;
            var lines = Items.Describe(inst);
            string body = string.Join("\n", lines);
            float w = 380;
            float descH = TextHeight(d.desc ?? "", w - 24, 14);
            float bodyH = TextHeight(body, w - 24, 15);
            float h = 70 + descH + bodyH + 46;
            var m = Event.current.mousePosition;
            var r = new Rect(Mathf.Min(m.x + 20, W - w - 10), Mathf.Min(m.y + 20, H - h - 10), w, h);
            Panel(r, new Color(0.03f, 0.04f, 0.05f, 0.97f));
            var rar = Items.Rarity(inst);
            Text(new Rect(r.x + 12, r.y + 8, w - 24, 28), d.name, 20, Mats.Hex(rar.color, Color.white), TextAnchor.MiddleLeft, true);
            Text(new Rect(r.x + 12, r.y + 36, w - 24, 22), rar.name + " · " + Items.CategoryName(d.cat), 14, UiColors.Muted);
            float y = r.y + 62;
            Text(new Rect(r.x + 12, y, w - 24, descH), d.desc ?? "", 14, new Color(0.75f, 0.78f, 0.8f), TextAnchor.UpperLeft, false, true);
            y += descH + 6;
            Text(new Rect(r.x + 12, y, w - 24, bodyH), body, 15, UiColors.Text, TextAnchor.UpperLeft, false, true);
            y += bodyH + 8;
            string price = game.state == "base" && Prof != null ? " · Verkauf: " + M.FormatCredits(game.core.profileMgr.SellPrice(inst)) : "";
            Text(new Rect(r.x + 12, y, w - 24, 24), "Wert " + M.FormatCredits(Items.Value(inst)) + " · " + M.FormatWeight(Items.Weight(inst)) + price, 14, UiColors.Accent);
        }

        // ------------------------------------------------------------------ moving items
        private void MoveItem(SlotRef from, SlotRef to)
        {
            var inst = ItemAt(from);
            if (inst == null) return;
            bool raid = game.state == "raid";
            // container (raid)
            if (from.kind == "container")
            {
                if (to.kind == "pinv" || to.kind == "psecure")
                {
                    var r = game.Raid.TakeFromContainer(lootContainer, from.index, int.MaxValue, InvOf(to));
                    if (r.remaining != null) Toast(to.kind == "psecure" ? "Sicherer Behälter voll" : "Inventar voll", "warning", 1500);
                }
                else if (to.kind == "pequip")
                {
                    var pl = RaidPlayer;
                    if (!Equipment.Accepts(to.slot, inst)) { Toast("Passt nicht in diesen Platz", "warning", 1500); game.audioSys.Play("ui_error", null); return; }
                    var r = game.Raid.TakeFromContainer(lootContainer, from.index);
                    if (r.remaining != null) { Toast("Inventar voll", "warning", 1500); return; }
                    int idx = pl.inventory.IndexOf(inst.uid);
                    if (idx >= 0) MoveItem(new SlotRef { kind = "pinv", index = idx }, to);
                }
                return;
            }
            // a backpack change in the base must not lose items: undo it when the overflow does not fit into the stash
            if (!raid && !_backpackGuard && ((to.slot == "backpack" && EqOf(to) != null) || (from.slot == "backpack" && EqOf(from) != null)))
            {
                _backpackGuard = true;
                bool fits;
                try { fits = game.core.profileMgr.TryBackpackChange(() => MoveItem(from, to)); }
                finally { _backpackGuard = false; }
                if (!fits) { Toast("Lager voll – der Rucksack-Inhalt passt nicht ins Lager", "warning", 2500); game.audioSys.Play("ui_error", null); }
                _selected = null; _drag = null;
                return;
            }
            if (to.kind == "container")
            {
                if (from.kind == "pequip") return;
                var inv = InvOf(from);
                if (game.Raid.PutIntoContainer(lootContainer, inst)) { if (inst.count <= 0 || lootContainer.items.Contains(inst)) inv.items[from.index] = null; }
                else Toast("Behälter ist voll", "warning", 1500);
                return;
            }
            var fromEq = EqOf(from);
            var toEq = EqOf(to);
            if (fromEq == null && toEq == null)
            {
                InvOf(from).Transfer(from.index, InvOf(to), to.index);
                if (to.kind == "psecure" || to.kind == "secure") CheckSecure(InvOf(to));
                return;
            }
            if (fromEq == null && toEq != null)
            {
                var inv = InvOf(from);
                if (!Equipment.Accepts(to.slot, inst)) { Toast("Passt nicht in diesen Platz", "warning", 1500); game.audioSys.Play("ui_error", null); return; }
                inv.items[from.index] = null;
                var res = toEq.Equip(inst, to.slot);
                if (res.replaced != null) inv.items[from.index] = res.replaced;
                AfterEquipmentChange(raid, to.slot);
                game.audioSys.Play("pickup", null, 0.6f);
                return;
            }
            if (fromEq != null && toEq == null)
            {
                var inv = InvOf(to);
                var target = inv.Get(to.index);
                if (target == null) { fromEq.Unequip(from.slot); inv.items[to.index] = inst; }
                else if (Equipment.Accepts(from.slot, target)) { fromEq.Unequip(from.slot); fromEq.Equip(target, from.slot); inv.items[to.index] = inst; }
                else if (inv.CanAdd(inst)) { fromEq.Unequip(from.slot); inv.Add(inst); }
                else { Toast("Kein Platz", "warning", 1500); return; }
                AfterEquipmentChange(raid, from.slot);
                return;
            }
            // equipment -> equipment (primary <-> secondary)
            var other = toEq[to.slot];
            if (!Equipment.Accepts(to.slot, inst) || (other != null && !Equipment.Accepts(from.slot, other))) { Toast("Passt nicht in diesen Platz", "warning", 1500); return; }
            fromEq.Unequip(from.slot);
            toEq.Unequip(to.slot);
            toEq.Equip(inst, to.slot);
            if (other != null) fromEq.Equip(other, from.slot);
            AfterEquipmentChange(raid, to.slot);
        }

        private void CheckSecure(Inventory inv) { }
        private bool _backpackGuard;

        private void AfterEquipmentChange(bool raid, string slot)
        {
            if (slot != "backpack") return;
            if (!raid)
            {
                if (_backpackGuard) return; // TryBackpackChange stows the overflow itself
                var pm = game.core.profileMgr;
                pm.StowOverflow(pm.FixLoadoutSlots());
            }
            else
            {
                var pl = RaidPlayer;
                foreach (var it in pl.inventory.SetSlots(pl.equipment.BackpackSlots())) game.Raid.DropItem(it, pl.x, pl.y);
            }
        }

        /// <summary>Right click: move to the "other" side.</summary>
        private void QuickMove(SlotRef s)
        {
            var inst = ItemAt(s);
            if (inst == null) return;
            var pm = game.core.profileMgr;
            switch (s.kind)
            {
                case "stash":
                    if (_baseTab == "trader") { var r = pm.Sell(inst.uid); if (r.ok) Toast("Verkauft: +" + M.FormatCredits(r.credits), "success", 1500); }
                    else if (!pm.MoveStashToLoadout(inst.uid)) Toast("Rucksack voll", "warning", 1500);
                    break;
                case "loadout":
                case "secure": pm.MoveLoadoutToStash(inst.uid); break;
                case "equip": if (!pm.UnequipToStash(s.slot)) Toast("Lager voll", "warning", 1500); else AfterEquipmentChange(false, s.slot); break;
                case "container": MoveItem(s, new SlotRef { kind = "pinv" }); break;
                case "pinv": if (lootContainer != null) MoveItem(s, new SlotRef { kind = "container" }); else RaidUse(s); break;
                case "psecure": { var pl = RaidPlayer; var it = pl.secure.Remove(inst.uid); var add = pl.inventory.Add(it); if (add.remaining != null) pl.secure.Add(add.remaining); break; }
                case "pequip": { var pl = RaidPlayer; if (pl.inventory.CanAdd(inst)) { pl.equipment.Unequip(s.slot); pl.inventory.Add(inst); AfterEquipmentChange(true, s.slot); } break; }
            }
            game.audioSys.Play("ui_click", null, 0.5f);
        }

        private void DoubleClick(SlotRef s)
        {
            var inst = ItemAt(s);
            if (inst == null) return;
            var slot = Equipment.SlotFor(inst);
            if (s.kind == "stash" || s.kind == "loadout" || s.kind == "secure" || s.kind == "pinv" || s.kind == "psecure")
            {
                if (slot != null) MoveItem(s, new SlotRef { kind = game.state == "raid" ? "pequip" : "equip", slot = slot });
                else if (game.state == "raid" && Items.IsUsable(inst)) RaidUse(s);
                else if (s.kind == "stash" && Items.IsUsable(inst)) { var r = game.core.profileMgr.UseFromStash(inst.uid); if (r.ok) Toast(Items.Def(inst).name + " benutzt", "success", 1200); }
            }
            else QuickMove(s);
        }

        private void RaidUse(SlotRef s)
        {
            var inst = ItemAt(s);
            if (inst == null || !Items.IsUsable(inst)) return;
            if (RaidPlayer.UseItem(inst)) { inventoryOpen = false; lootContainer = null; }
        }

        private void RaidDropSelected()
        {
            var s = _selected;
            var inst = ItemAt(s);
            if (inst == null || s.kind == "container") return;
            var pl = RaidPlayer;
            if (s.kind == "pequip") { pl.equipment.Unequip(s.slot); AfterEquipmentChange(true, s.slot); }
            else InvOf(s).items[s.index] = null;
            game.Raid.DropItem(inst, pl.x, pl.y);
            game.audioSys.Play("ui_click", null, 0.5f);
            _selected = null;
        }

        // ------------------------------------------------------------------ grids
        private void DrawGrid(Rect area, string title, string kind, Inventory inv, float cell = 72f, string subtitle = null)
        {
            Panel(area);
            Text(new Rect(area.x + 12, area.y + 6, area.width - 24, 28), title, 18, UiColors.Accent, TextAnchor.MiddleLeft, true);
            if (subtitle != null) Text(new Rect(area.x + 12, area.y + 6, area.width - 24, 28), subtitle, 14, UiColors.Muted, TextAnchor.MiddleRight);
            if (inv == null) return;
            cell = FitCell(area.width - 20, area.height - 46, inv.slots, cell);
            int cols = Mathf.Max(1, (int)((area.width - 20) / cell));
            for (int i = 0; i < inv.slots; i++)
            {
                var r = new Rect(area.x + 10 + (i % cols) * cell, area.y + 40 + (i / cols) * cell, cell - 6, cell - 6);
                if (r.yMax > area.yMax) break;
                DrawSlot(r, new SlotRef { kind = kind, index = i });
            }
        }

        /// <summary>Largest cell size (up to the wish) at which all slots fit into the area, so no slot is ever hidden.</summary>
        private static float FitCell(float width, float height, int slots, float wish)
        {
            for (float c = wish; c > 34f; c -= 2f)
            {
                int cols = Mathf.Max(1, (int)(width / c));
                int rows = (slots + cols - 1) / cols;
                if (rows * c <= height) return c;
            }
            return 34f;
        }

        /// <summary>Height the equipment panel needs for the given width.</summary>
        private static float EquipmentHeight(float width)
        {
            int cols = Mathf.Max(1, (int)((width - 20) / 86f));
            int rows = (Equipment.Slots.Length + cols - 1) / cols;
            return 46 + rows * 102;
        }

        private void DrawEquipment(Rect area, string kind, Equipment eq)
        {
            Panel(area);
            Text(new Rect(area.x + 12, area.y + 6, area.width - 24, 28), "Ausrüstung", 18, UiColors.Accent, TextAnchor.MiddleLeft, true);
            if (eq == null) return;
            float cell = 78;
            int cols = Mathf.Max(1, (int)((area.width - 20) / (cell + 8)));
            int i = 0;
            foreach (var s in Equipment.Slots)
            {
                var r = new Rect(area.x + 12 + (i % cols) * (cell + 8), area.y + 42 + (i / cols) * (cell + 24), cell, cell);
                Text(new Rect(r.x - 4, r.yMax + 2, cell + 8, 18), Equipment.SlotName(s), 12, UiColors.Muted, TextAnchor.MiddleCenter);
                DrawSlot(r, new SlotRef { kind = kind, slot = s }, Equipment.SlotName(s));
                i++;
            }
        }

        /// <summary>Action buttons for the selected item; returns the used height.</summary>
        private void DrawSelectionActions(Rect area)
        {
            Panel(area);
            var inst = ItemAt(_selected);
            if (inst == null) { Text(new Rect(area.x + 14, area.y, area.width - 28, area.height), "Gegenstand anklicken für Aktionen · Ziehen zum Verschieben · Rechtsklick = schnell verschieben · Doppelklick = ausrüsten/benutzen", 14, UiColors.Muted, TextAnchor.MiddleLeft, false, true); return; }
            var d = Items.Def(inst);
            Text(new Rect(area.x + 14, area.y + 6, area.width - 28, 26), d.name + (inst.count > 1 ? " ×" + inst.count : ""), 18, Mats.Hex(Items.Rarity(inst).color, Color.white), TextAnchor.MiddleLeft, true);
            float x = area.x + 14, y = area.y + 38, bw = 170, bh = 38;
            var pm = game.core.profileMgr;
            bool raid = game.state == "raid";
            void B(string label, System.Action a, bool enabled = true) { if (x + bw > area.xMax - 10) { x = area.x + 14; y += bh + 6; } if (Btn(new Rect(x, y, bw, bh), label, enabled, 15)) a(); x += bw + 8; }
            var s = _selected;
            string slot = Equipment.SlotFor(inst);
            if (!raid)
            {
                if (s.kind == "stash")
                {
                    B("In den Rucksack", () => { if (!pm.MoveStashToLoadout(inst.uid)) Toast("Rucksack voll", "warning", 1500); _selected = null; });
                    B("Sicherer Behälter", () => { if (!pm.MoveToSecure(inst.uid)) Toast("Sicherer Behälter voll", "warning", 1500); _selected = null; });
                    if (Items.IsUsable(inst)) B("Benutzen", () => { var r = pm.UseFromStash(inst.uid); Toast(r.ok ? d.name + " benutzt" : r.reason, r.ok ? "success" : "warning", 1500); });
                    if (inst.count > 1) B("Teilen", () => Prof.stash.Split(s.index, inst.count / 2));
                    B("Verkaufen (" + M.FormatCredits(pm.SellPrice(inst)) + ")", () => { var r = pm.Sell(inst.uid); if (r.ok) Toast("Verkauft: +" + M.FormatCredits(r.credits), "success", 1500); _selected = null; });
                }
                else if (s.kind == "loadout" || s.kind == "secure")
                {
                    B("Ins Lager", () => { pm.MoveLoadoutToStash(inst.uid); _selected = null; });
                    if (s.kind == "loadout") B("Sicherer Behälter", () => { if (!pm.MoveToSecure(inst.uid, true)) Toast("Sicherer Behälter voll", "warning", 1500); _selected = null; });
                }
                else if (s.kind == "equip") B("Ablegen (ins Lager)", () => { if (!pm.UnequipToStash(s.slot)) Toast("Lager voll", "warning", 1500); else AfterEquipmentChange(false, s.slot); _selected = null; });
                if (slot != null && s.kind != "equip") B("Ausrüsten", () => { MoveItem(s, new SlotRef { kind = "equip", slot = slot }); _selected = null; });
                int cost = pm.RepairCost(inst);
                if (cost > 0) B("Reparieren (" + M.FormatCredits(cost) + ")", () => { var r = pm.Repair(inst.uid); Toast(r.ok ? "Repariert" : r.reason, r.ok ? "success" : "warning", 1500); });
            }
            else
            {
                if (s.kind == "container") B("Nehmen", () => MoveItem(s, new SlotRef { kind = "pinv" }));
                else
                {
                    if (Items.IsUsable(inst)) B("Benutzen", () => RaidUse(s));
                    if (slot != null && s.kind != "pequip") B("Ausrüsten", () => { MoveItem(s, new SlotRef { kind = "pequip", slot = slot }); _selected = null; });
                    if (s.kind == "pinv") B("Sicherer Behälter", () => { var pl = RaidPlayer; var it = pl.inventory.Remove(inst.uid); var add = pl.secure.Add(it); if (add.remaining != null) { pl.inventory.Add(add.remaining); Toast("Sicherer Behälter voll", "warning", 1500); } _selected = null; });
                    if (s.kind == "psecure") B("In den Rucksack", () => QuickMove(s));
                    if (lootContainer != null && s.kind != "pequip") B("In Behälter legen", () => { MoveItem(s, new SlotRef { kind = "container" }); _selected = null; });
                    B("Ablegen [X]", RaidDropSelected);
                }
            }
        }
    }
}
