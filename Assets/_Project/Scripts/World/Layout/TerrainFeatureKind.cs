namespace Aetherfall.World
{
    /// <summary>Kind of a terrain feature of the layout (JSON <c>kind</c>).</summary>
    public enum TerrainFeatureKind
    {
        /// <summary><c>slope</c>: Rising slope along a direction, optional lateral falloff (e.g. the Nordhang).</summary>
        Slope = 0,

        /// <summary><c>hill</c>: Round hill (positive height) or hollow (negative height) with a smooth falloff.</summary>
        Hill = 1,

        /// <summary><c>flatten</c>: Area that is blended to one height (village, farm yard, plaza).</summary>
        Flatten = 2
    }
}
