using System;
using Aetherfall.Core;
using Aetherfall.SaveSystem;

namespace Aetherfall.Difficulty
{
    /// <summary>Saves the difficulty (section <c>difficulty</c>, load order 12). A new game keeps the level of the options.</summary>
    public sealed class DifficultySaveable : Saveable<DifficultyDto>
    {
        /// <summary>Section key.</summary>
        public const string Key = "difficulty";

        /// <summary>Load order (early: enemies spawn with it).</summary>
        public const int Order = 12;

        private readonly DifficultyService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">Difficulty service.</param>
        public DifficultySaveable(DifficultyService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        protected override DifficultyDto Capture()
        {
            return new DifficultyDto { Level = (int)_service.Level };
        }

        /// <inheritdoc />
        protected override void Restore(DifficultyDto data, in LoadContext ctx)
        {
            if (data != null)
            {
                _service.SetLevel((DifficultyLevel)data.Level);
            }
        }
    }
}
