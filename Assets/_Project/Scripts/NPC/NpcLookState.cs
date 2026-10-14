namespace Aetherfall.NPC
{
    /// <summary>What an NPC looks at (<see cref="NpcLookModel"/>).</summary>
    public enum NpcLookState
    {
        /// <summary>Idle: looks ahead and glances around now and then.</summary>
        Idle = 0,

        /// <summary>The player is near: the NPC turns towards him.</summary>
        Watching = 1,

        /// <summary>In a conversation: faces the partner.</summary>
        Talking = 2
    }
}
