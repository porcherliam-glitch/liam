namespace Aetherfall.Dialogue
{
    /// <summary>The eight node types of a dialogue (GDD 02, 12.2; architecture 11.8).</summary>
    public enum DialogueNodeKind
    {
        /// <summary>NPC line (German "NPC-Zeile"): a speaker says a line, the player continues.</summary>
        Line = 0,

        /// <summary>Player choice (German "Spieler-Auswahl"): 2-6 answers, hubs up to 9.</summary>
        Choice = 1,

        /// <summary>Condition switch (German "Bedingungsweiche"): invisible branch, first true condition wins.</summary>
        Branch = 2,

        /// <summary>Action node (German "Aktion"): runs actions, then continues or ends.</summary>
        Action = 3,

        /// <summary>Skill check (German "Probe"): persuade, intimidate or lie; success and optional failure exit.</summary>
        Check = 4,

        /// <summary>Random node (German "Zufall"): weighted variety, fixed per NPC and game day.</summary>
        Random = 5,

        /// <summary>Jump (German "Sprung"): to a node or another dialogue, optionally with return.</summary>
        Jump = 6,

        /// <summary>End node (German "Ende"): ends the conversation with an exit id and a follow-up.</summary>
        End = 7
    }
}
