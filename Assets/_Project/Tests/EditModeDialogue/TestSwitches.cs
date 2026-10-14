using System.Collections.Generic;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Named switches for stand-in conditions (<see cref="SwitchOn"/>), e.g. "Quest 6 abgeschlossen".</summary>
    public sealed class TestSwitches
    {
        private readonly HashSet<string> _on = new HashSet<string>();

        /// <summary>True if the switch is on.</summary>
        /// <param name="name">Switch name.</param>
        public bool Get(string name)
        {
            return _on.Contains(name);
        }

        /// <summary>Sets a switch.</summary>
        /// <param name="name">Switch name.</param>
        /// <param name="on">True = on.</param>
        public void Set(string name, bool on)
        {
            if (on)
            {
                _on.Add(name);
            }
            else
            {
                _on.Remove(name);
            }
        }
    }
}
