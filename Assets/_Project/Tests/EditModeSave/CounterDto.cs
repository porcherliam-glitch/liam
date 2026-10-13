using System.Collections.Generic;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>Test DTO: a number, a name and a list.</summary>
    public sealed class CounterDto
    {
        /// <summary>Counter value.</summary>
        public int Value;

        /// <summary>Name.</summary>
        public string Name = string.Empty;

        /// <summary>Tags.</summary>
        public List<string> Tags = new List<string>();
    }
}
