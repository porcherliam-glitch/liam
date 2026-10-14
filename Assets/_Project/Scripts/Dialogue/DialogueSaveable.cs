using System;
using Aetherfall.SaveSystem;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Saves and restores the section <c>dialogue</c> (architecture 9.2, load order 60): chosen options, remembered check
    /// results, known topics and names. A running conversation is not part of it: saving is locked while one runs, and loading
    /// stops it without events (<see cref="DialogueService.ResetForLoad"/>).
    /// </summary>
    public sealed class DialogueSaveable : Saveable<DialogueDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "dialogue";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 60;

        private readonly DialogueService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">Dialogue service.</param>
        public DialogueSaveable(DialogueService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        protected override DialogueDto Capture()
        {
            return _service.Memory.Capture();
        }

        /// <inheritdoc />
        protected override void Restore(DialogueDto data, in LoadContext ctx)
        {
            _service.ResetForLoad();
            _service.Memory.Load(data);
        }
    }
}
