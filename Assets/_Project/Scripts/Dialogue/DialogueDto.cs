using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Save section <c>dialogue</c> (architecture 9.2, load order 60): chosen options, remembered check results, known topics
    /// and known names. A running conversation is never saved (GDD 05 5.2: saving is locked during dialogues).
    /// </summary>
    [Preserve]
    public sealed class DialogueDto
    {
        /// <summary>Chosen option keys <c>&lt;dialogue&gt;.&lt;node&gt;.&lt;option&gt;</c>, sorted.</summary>
        public List<string> ChosenOptions = new List<string>();

        /// <summary>Remembered check results, sorted by key.</summary>
        public List<DialogueCheckResultDto> CheckResults = new List<DialogueCheckResultDto>();

        /// <summary>Known topics (<c>thema.*</c>), sorted.</summary>
        public List<string> Topics = new List<string>();

        /// <summary>NPC ids whose name the player knows, sorted.</summary>
        public List<string> KnownNames = new List<string>();
    }
}
