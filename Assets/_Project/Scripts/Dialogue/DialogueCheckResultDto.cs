using UnityEngine.Scripting;

namespace Aetherfall.Dialogue
{
    /// <summary>A remembered check result in the save section <c>dialogue</c>.</summary>
    [Preserve]
    public sealed class DialogueCheckResultDto
    {
        /// <summary>Node key <c>&lt;dialogue&gt;.&lt;node&gt;</c> of the check.</summary>
        public string Key = string.Empty;

        /// <summary>True if the check succeeded.</summary>
        public bool Success;
    }
}
