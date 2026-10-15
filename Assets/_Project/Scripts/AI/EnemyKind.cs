namespace Aetherfall.AI
{
    /// <summary>Family of an enemy type for status effects and reactions (GDD 03 7.2: animals flee from fire, undead and constructs are immune to poison and bleeding).</summary>
    public enum EnemyKind
    {
        /// <summary>Beast (wolves, boars): burning makes it flee 2 s.</summary>
        Beast = 0,

        /// <summary>Humanoid (bandits, cultists).</summary>
        Humanoid = 1,

        /// <summary>Undead (skeletons, the knight): immune to poison and bleeding.</summary>
        Undead = 2,

        /// <summary>Construct, golem, elemental: immune to poison and bleeding.</summary>
        Construct = 3,

        /// <summary>Swarm (rift brood): burning makes it flee 2 s.</summary>
        Swarm = 4,

        /// <summary>Spirit: immune to bleeding.</summary>
        Spirit = 5
    }
}
