namespace Aetherfall.World
{
    /// <summary>When the enemies of a spawner exist (JSON <c>activation</c>).</summary>
    public enum SpawnActivation
    {
        /// <summary><c>always</c>: From the start of the scene (wildlife).</summary>
        Always = 0,

        /// <summary><c>quest</c>: Only after a quest action <c>Gegner+(spawn-id)</c>; built inactive.</summary>
        Quest = 1
    }
}
