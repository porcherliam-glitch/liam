using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// The ability bar of the player (GDD 03 11.8): 2 bars × 4 slots = 8 active abilities, keys 1–4 use the slots of the active
    /// bar, X (RB + LB) switches the bar at most every 0.5 s. One ability sits in one slot at most. Newly learned abilities are
    /// placed in the first free slot (bar 1 slots 1–3, then bar 2, then slot 4 of bar 1, which the Aether-Stoß wants).
    /// </summary>
    /// <remarks>Slots are numbered 0–7: 0–3 bar 1, 4–7 bar 2. An empty slot holds an empty string. Pure C#.</remarks>
    public sealed class AbilityBar
    {
        /// <summary>Number of bars.</summary>
        public const int BarCount = 2;

        /// <summary>Slots per bar.</summary>
        public const int SlotsPerBar = 4;

        /// <summary>All slots.</summary>
        public const int SlotCount = BarCount * SlotsPerBar;

        /// <summary>Shortest time between two bar switches in seconds (GDD 03 11.8).</summary>
        public const float SwitchCooldownSeconds = 0.5f;

        /// <summary>Order in which free slots are filled: bar 1 slots 1–3, then bar 2 (slot 4 of bar 1 only on request).</summary>
        private static readonly int[] PlacementOrder = { 0, 1, 2, 4, 5, 6, 7 };

        private readonly string[] _slots = new string[SlotCount];
        private float _switchLock;

        /// <summary>Creates an empty bar (bar 1 active).</summary>
        public AbilityBar()
        {
            Clear();
        }

        /// <summary>Active bar, 0 or 1.</summary>
        public int ActiveBar { get; private set; }

        /// <summary>Raised when something changes (a slot or the active bar).</summary>
        public event Action Changed;

        /// <summary>Ability id in a slot 0–7, or an empty string.</summary>
        /// <param name="slot">Slot 0–7.</param>
        public string Get(int slot)
        {
            return slot >= 0 && slot < SlotCount ? _slots[slot] : string.Empty;
        }

        /// <summary>Ability id in slot 0–3 of the active bar (keys 1–4), or an empty string.</summary>
        /// <param name="slot">Slot 0–3 of the active bar.</param>
        public string GetActive(int slot)
        {
            return slot >= 0 && slot < SlotsPerBar ? _slots[ActiveBar * SlotsPerBar + slot] : string.Empty;
        }

        /// <summary>Slot 0–7 of an ability, or −1.</summary>
        /// <param name="abilityId">Ability id.</param>
        public int IndexOf(string abilityId)
        {
            if (string.IsNullOrEmpty(abilityId))
            {
                return -1;
            }

            for (int i = 0; i < SlotCount; i++)
            {
                if (_slots[i] == abilityId)
                {
                    return i;
                }
            }

            return -1;
        }

        /// <summary>
        /// Puts an ability into a slot (or empties it with an empty id). The ability leaves its old slot (one slot per ability,
        /// GDD 03 11.8); the ability that was in the slot before moves to that old slot, so two slots can be swapped.
        /// </summary>
        /// <param name="slot">Slot 0–7.</param>
        /// <param name="abilityId">Ability id, or empty to clear the slot.</param>
        /// <returns>False for a slot out of range.</returns>
        public bool Assign(int slot, string abilityId)
        {
            if (slot < 0 || slot >= SlotCount)
            {
                return false;
            }

            string id = abilityId ?? string.Empty;
            int old = IndexOf(id);
            string previous = _slots[slot];
            if (old >= 0)
            {
                _slots[old] = previous;
            }

            _slots[slot] = id;
            Changed?.Invoke();
            return true;
        }

        /// <summary>Removes an ability from the bar.</summary>
        /// <param name="abilityId">Ability id.</param>
        /// <returns>True if it was on the bar.</returns>
        public bool Remove(string abilityId)
        {
            int index = IndexOf(abilityId);
            if (index < 0)
            {
                return false;
            }

            _slots[index] = string.Empty;
            Changed?.Invoke();
            return true;
        }

        /// <summary>
        /// Places a newly learned ability: in its preferred slot if that is free, else in the first free slot (bar 1 slots 1–3,
        /// then bar 2; slot 4 of bar 1 only as preferred slot). Abilities already on the bar stay where they are.
        /// </summary>
        /// <param name="abilityId">Ability id.</param>
        /// <param name="preferredSlot">Wanted slot 0–7 (Aether-Stoß: 3), or −1.</param>
        /// <returns>The slot, or −1 if the bar is full (or the id is empty).</returns>
        public int Place(string abilityId, int preferredSlot = -1)
        {
            if (string.IsNullOrEmpty(abilityId))
            {
                return -1;
            }

            int existing = IndexOf(abilityId);
            if (existing >= 0)
            {
                return existing;
            }

            if (preferredSlot >= 0 && preferredSlot < SlotCount && _slots[preferredSlot].Length == 0)
            {
                _slots[preferredSlot] = abilityId;
                Changed?.Invoke();
                return preferredSlot;
            }

            for (int i = 0; i < PlacementOrder.Length; i++)
            {
                int slot = PlacementOrder[i];
                if (_slots[slot].Length == 0)
                {
                    _slots[slot] = abilityId;
                    Changed?.Invoke();
                    return slot;
                }
            }

            return -1;
        }

        /// <summary>Switches to the other bar unless the last switch was less than 0.5 s ago.</summary>
        /// <returns>True if the bar changed.</returns>
        public bool TrySwitch()
        {
            if (_switchLock > 0f)
            {
                return false;
            }

            ActiveBar = (ActiveBar + 1) % BarCount;
            _switchLock = SwitchCooldownSeconds;
            Changed?.Invoke();
            return true;
        }

        /// <summary>Sets the active bar directly (load, tools); no lock.</summary>
        /// <param name="bar">0 or 1 (other values are clamped).</param>
        public void SetActiveBar(int bar)
        {
            int clamped = Math.Max(0, Math.Min(BarCount - 1, bar));
            if (clamped != ActiveBar)
            {
                ActiveBar = clamped;
                Changed?.Invoke();
            }
        }

        /// <summary>Lets the switch lock run out.</summary>
        /// <param name="deltaTime">Seconds.</param>
        public void Tick(float deltaTime)
        {
            if (_switchLock > 0f)
            {
                _switchLock = Math.Max(0f, _switchLock - Math.Max(0f, deltaTime));
            }
        }

        /// <summary>Empties every slot and activates bar 1.</summary>
        public void Clear()
        {
            for (int i = 0; i < SlotCount; i++)
            {
                _slots[i] = string.Empty;
            }

            ActiveBar = 0;
            _switchLock = 0f;
            Changed?.Invoke();
        }

        /// <summary>Copy of all slots 0–7 (saving).</summary>
        public string[] ToArray()
        {
            var copy = new string[SlotCount];
            Array.Copy(_slots, copy, SlotCount);
            return copy;
        }

        /// <summary>Fills the slots from a saved array (missing entries are empty; duplicates keep their first slot).</summary>
        /// <param name="slots">Saved slots (may be null or shorter).</param>
        /// <param name="activeBar">Saved active bar.</param>
        public void Load(string[] slots, int activeBar)
        {
            for (int i = 0; i < SlotCount; i++)
            {
                string id = slots != null && i < slots.Length && slots[i] != null ? slots[i] : string.Empty;
                _slots[i] = id.Length > 0 && Array.IndexOf(_slots, id, 0, i) >= 0 ? string.Empty : id;
            }

            ActiveBar = Math.Max(0, Math.Min(BarCount - 1, activeBar));
            _switchLock = 0f;
            Changed?.Invoke();
        }
    }
}
