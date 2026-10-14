using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Confirmation dialogs of the setup steps. In batch mode no dialog can be shown, so the confirmation is written to
    /// the log and accepted (the batch run stands for a user who clicked "run all" and confirmed every question).
    /// </summary>
    internal static class SetupDialogs
    {
        /// <summary>Asks the user (or accepts automatically in batch mode).</summary>
        /// <param name="title">German dialog title.</param>
        /// <param name="message">German dialog text.</param>
        /// <param name="ok">Label of the confirming button.</param>
        /// <param name="cancel">Label of the cancelling button.</param>
        /// <returns>True if the action may proceed.</returns>
        public static bool Confirm(string title, string message, string ok, string cancel)
        {
            if (Application.isBatchMode)
            {
                Debug.Log("[Aetherfall-Setup] Batchmode: Rückfrage „" + title + "“ automatisch mit „" + ok + "“ beantwortet.");
                return true;
            }

            return EditorUtility.DisplayDialog(title, message, ok, cancel);
        }
    }
}
