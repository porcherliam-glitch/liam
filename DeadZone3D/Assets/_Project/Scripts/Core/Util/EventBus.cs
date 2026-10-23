using System;
using System.Collections.Generic;

namespace DeadZone.Core
{
    /// <summary>Event payload shared by simulation, missions, audio and FX.</summary>
    public sealed class SimEvent
    {
        public string name;
        public double x, y, value, angle;
        public string id, text;
        public object source, target, data;
        public SimEvent(string name) { this.name = name; }
    }

    /// <summary>Synchronous event bus; the Unity layer also drains <see cref="Recent"/> once per frame for sounds/FX.</summary>
    public sealed class EventBus
    {
        private readonly Dictionary<string, List<Action<SimEvent>>> _map = new Dictionary<string, List<Action<SimEvent>>>();
        public readonly List<SimEvent> Recent = new List<SimEvent>();
        public bool RecordRecent = true;

        public Action On(string name, Action<SimEvent> fn)
        {
            if (!_map.TryGetValue(name, out var list)) _map[name] = list = new List<Action<SimEvent>>();
            list.Add(fn);
            return () => Off(name, fn);
        }

        public void Off(string name, Action<SimEvent> fn)
        {
            if (_map.TryGetValue(name, out var list)) list.Remove(fn);
        }

        public void Emit(SimEvent e)
        {
            if (RecordRecent) { Recent.Add(e); if (Recent.Count > 512) Recent.RemoveRange(0, 256); }
            if (!_map.TryGetValue(e.name, out var list) || list.Count == 0) return;
            foreach (var fn in list.ToArray())
            {
                try { fn(e); }
                catch (Exception ex) { Log.Error("EventBus listener for \"" + e.name + "\" failed: " + ex.Message); }
            }
        }

        public SimEvent Emit(string name, double x = 0, double y = 0, string id = null, double value = 0, object data = null)
        {
            var e = new SimEvent(name) { x = x, y = y, id = id, value = value, data = data };
            Emit(e);
            return e;
        }

        public void Clear() { _map.Clear(); Recent.Clear(); }
    }
}
