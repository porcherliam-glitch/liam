namespace Aetherfall.World
{
    /// <summary>Kind of a harvest node (look of the plant; S30). Values are stored in generated scenes: never renumber.</summary>
    public enum HarvestNodeKind
    {
        /// <summary>Blutwurz: a common meadow herb with a red root.</summary>
        Bloodroot = 0,

        /// <summary>Rissmoos: glowing moss, only at the rim of the rift.</summary>
        RiftMoss = 1,

        /// <summary>Nachtschattenblüte: a violet flower that opens only at night.</summary>
        Nightshade = 2
    }
}
