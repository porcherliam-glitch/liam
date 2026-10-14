namespace Aetherfall.World
{
    /// <summary>Look of a quest object placeholder (JSON <c>kind</c>).</summary>
    public enum QuestObjectKind
    {
        /// <summary><c>beam</c>: Fallen beam.</summary>
        Beam = 0,

        /// <summary><c>door</c>: Door.</summary>
        Door = 1,

        /// <summary><c>clue</c>: Clue to examine (glitters).</summary>
        Clue = 2,

        /// <summary><c>straw_target</c>: Straw target for the bow.</summary>
        StrawTarget = 3,

        /// <summary><c>corpse</c>: Dead body.</summary>
        Corpse = 4,

        /// <summary><c>aether_shard</c>: Glowing Aether shard.</summary>
        AetherShard = 5,

        /// <summary><c>pup</c>: Wolf pup.</summary>
        Pup = 6
    }
}
