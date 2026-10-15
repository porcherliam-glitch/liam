using System;
using Aetherfall.SaveSystem;

namespace Aetherfall.Skills
{
    /// <summary>
    /// Saves the learned nodes (section <c>skills</c>, load order 47: after the class, 45, and the progression with the free
    /// points, 40). A new game empties the tree; the core of the class is learned again at once.
    /// </summary>
    public sealed class SkillSaveable : Saveable<SkillsDto>
    {
        /// <summary>Section key.</summary>
        public const string Key = "skills";

        /// <summary>Load order.</summary>
        public const int Order = 47;

        private readonly SkillService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">Skill service.</param>
        public SkillSaveable(SkillService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        protected override SkillsDto Capture()
        {
            _service.Capture(out string[] nodes, out int[] ranks);
            return new SkillsDto { Nodes = nodes, Ranks = ranks };
        }

        /// <inheritdoc />
        protected override void Restore(SkillsDto data, in LoadContext ctx)
        {
            _service.Restore(data != null ? data.Nodes : null, data != null ? data.Ranks : null);
        }
    }
}
