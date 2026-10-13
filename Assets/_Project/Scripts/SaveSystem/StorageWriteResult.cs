namespace Aetherfall.SaveSystem
{
    /// <summary>Outcome of <see cref="SaveSlotStorage.WriteSlot"/>.</summary>
    public readonly struct StorageWriteResult
    {
        /// <summary>True if the <c>.sav</c> file was written, verified and put in place.</summary>
        public readonly bool Success;

        /// <summary>Reason key on failure (<see cref="SaveReasonKeys.WriteFailed"/>, <see cref="SaveReasonKeys.VerifyFailed"/>).</summary>
        public readonly string ReasonKey;

        /// <summary>Error detail on failure, or a warning on success (e.g. the header file could not be updated).</summary>
        public readonly string Message;

        /// <summary>Creates a result.</summary>
        /// <param name="success">Success.</param>
        /// <param name="reasonKey">Reason key.</param>
        /// <param name="message">Detail.</param>
        public StorageWriteResult(bool success, string reasonKey, string message)
        {
            Success = success;
            ReasonKey = reasonKey ?? string.Empty;
            Message = message ?? string.Empty;
        }
    }
}
