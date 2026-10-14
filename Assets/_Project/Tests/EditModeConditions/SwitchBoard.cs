using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Service of named switches plus counters of evaluations and executed actions.</summary>
    public sealed class SwitchBoard
    {
        private readonly Dictionary<string, bool> _switches = new Dictionary<string, bool>();

        public int Evaluations { get; set; }

        public List<string> Log { get; } = new List<string>();

        public List<string> Sources { get; } = new List<string>();

        public List<string> Subjects { get; } = new List<string>();

        public bool Get(string key)
        {
            return _switches.TryGetValue(key, out bool value) && value;
        }

        public void Set(string key, bool value)
        {
            _switches[key] = value;
        }
    }
}
