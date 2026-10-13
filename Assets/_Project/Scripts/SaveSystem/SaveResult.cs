using System;
using Aetherfall.Events;

namespace Aetherfall.SaveSystem
{
    /// <summary>Outcome of a save.</summary>
    public readonly struct SaveResult
    {
        /// <summary>True if the file was written and verified.</summary>
        public readonly bool Success;

        /// <summary>Slot id that was (or would have been) written; empty if refused before choosing a slot.</summary>
        public readonly string SlotId;

        /// <summary>Kind of save.</summary>
        public readonly SaveKind Kind;

        /// <summary>Localization key of the reason (<see cref="SaveReasonKeys"/>) if it failed or was refused.</summary>
        public readonly string ReasonKey;

        /// <summary>Technical detail (English, for the log); may contain a warning on success.</summary>
        public readonly string Message;

        /// <summary>Time of the result (UTC).</summary>
        public readonly DateTime FinishedUtc;

        /// <summary>Creates a result.</summary>
        /// <param name="success">Success.</param>
        /// <param name="slotId">Slot id.</param>
        /// <param name="kind">Kind.</param>
        /// <param name="reasonKey">Reason key.</param>
        /// <param name="message">Detail.</param>
        /// <param name="finishedUtc">Time.</param>
        public SaveResult(bool success, string slotId, SaveKind kind, string reasonKey, string message, DateTime finishedUtc)
        {
            Success = success;
            SlotId = slotId ?? string.Empty;
            Kind = kind;
            ReasonKey = reasonKey ?? string.Empty;
            Message = message ?? string.Empty;
            FinishedUtc = finishedUtc;
        }

        /// <summary>True if this is a real result (default instances mean "nothing saved yet").</summary>
        public bool HasValue => FinishedUtc != default;

        /// <inheritdoc />
        public override string ToString()
        {
            return Success
                ? "Saved '" + SlotId + "' (" + Kind + ")" + (Message.Length > 0 ? " - " + Message : string.Empty)
                : "Save " + Kind + " failed [" + ReasonKey + "] " + Message;
        }
    }
}
