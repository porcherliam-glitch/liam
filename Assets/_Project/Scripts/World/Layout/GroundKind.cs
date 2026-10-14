namespace Aetherfall.World
{
    /// <summary>Ground layer of the terrain (JSON <c>ground</c>); the order is the terrain layer order.</summary>
    public enum GroundKind
    {
        /// <summary><c>grass</c>: Meadow grass.</summary>
        Grass = 0,

        /// <summary><c>dirt</c>: Earth, paths, fields, yards.</summary>
        Dirt = 1,

        /// <summary><c>rock</c>: Rock on steep slopes.</summary>
        Rock = 2,

        /// <summary><c>ash</c>: Ash and burned ground.</summary>
        Ash = 3
    }
}
