namespace Aetherfall.Skills
{
    /// <summary>Node types of a skill tree (GDD 03 11.3).</summary>
    public enum SkillNodeKind
    {
        /// <summary>Core (K): root of the tree, free for the start class.</summary>
        Core = 0,

        /// <summary>Passive (P): a small bonus that is always active, 1–3 ranks.</summary>
        Passive = 1,

        /// <summary>Active (A): a new ability for the ability bar.</summary>
        Active = 2,

        /// <summary>Upgrade (U): changes an active ability; often a fork (one of two).</summary>
        Upgrade = 3,

        /// <summary>Key node (S): a large change with a drawback, from level 20.</summary>
        Key = 4
    }
}
