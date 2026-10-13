using System;
using System.Collections.Generic;
using Aetherfall.SaveSystem;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>Test saveable with a counter; records Load/OnAfterLoad calls into a shared journal.</summary>
    public sealed class CounterSaveable : Saveable<CounterDto>, IPostLoad
    {
        private readonly List<string> _journal;

        /// <summary>Creates the saveable.</summary>
        /// <param name="key">Save key.</param>
        /// <param name="order">Load order.</param>
        /// <param name="journal">Shared call journal (may be null).</param>
        public CounterSaveable(string key, int order, List<string> journal = null) : base(key, order)
        {
            _journal = journal ?? new List<string>();
        }

        /// <summary>Current value.</summary>
        public int Value { get; set; }

        /// <summary>Current name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Data received by the last Load (null = defaults).</summary>
        public CounterDto LastLoaded { get; private set; }

        /// <summary>Context of the last Load.</summary>
        public LoadContext LastContext { get; private set; }

        /// <summary>Number of Load calls.</summary>
        public int LoadCount { get; private set; }

        /// <summary>When set, Save() throws.</summary>
        public bool ThrowOnSave { get; set; }

        /// <inheritdoc />
        public void OnAfterLoad(in LoadContext ctx)
        {
            _journal.Add("after:" + SaveKey);
        }

        /// <inheritdoc />
        protected override CounterDto Capture()
        {
            if (ThrowOnSave)
            {
                throw new InvalidOperationException("Simulated snapshot failure");
            }

            return new CounterDto { Value = Value, Name = Name, Tags = new List<string> { "a", "b" } };
        }

        /// <inheritdoc />
        protected override void Restore(CounterDto data, in LoadContext ctx)
        {
            LoadCount++;
            LastLoaded = data;
            LastContext = ctx;
            Value = data != null ? data.Value : 0;
            Name = data != null ? data.Name : string.Empty;
            _journal.Add("load:" + SaveKey);
        }
    }
}
