namespace Aetherfall.World
{
    /// <summary>
    /// Rock shapes of the blockout (<see cref="BlobGeometry"/>), the same as <c>rock_landmark</c> and <c>rock_boulder</c> in
    /// Tools/Preview/eichental_layout.py:
    /// <list type="bullet">
    /// <item><b>Landmark rock</b> (Rabenfels, Wolfskopf; JSON <c>rocks</c>): unit blob (centre y = 0.5, radius 0.5) scaled by the
    /// rock size. Its underside is flat at local y = 0 (= the pivot) and its sides are cut at x = ±0.45 like a cliff. The pivot
    /// sits <see cref="LandmarkSink"/> × height under the terrain at the centre, plus the optional lift.</item>
    /// <item><b>Boulder</b> (scattered vegetation kind <c>rock</c>): a flat blob that reaches below its pivot, so it stays half
    /// buried on slopes.</item>
    /// </list>
    /// </summary>
    public static class RockGeometry
    {
        /// <summary>Subdivisions of the visible landmark rock (162 vertices, 320 triangles).</summary>
        public const int LandmarkRenderSubdivisions = 2;

        /// <summary>
        /// Subdivisions of the convex collider of a landmark rock (42 vertices, 80 triangles). PhysX allows at most 255 polygons
        /// for a convex MeshCollider; the visible mesh has more, Unity would only build a partial hull.
        /// </summary>
        public const int LandmarkColliderSubdivisions = 1;

        /// <summary>Half width of the cut sides of a landmark rock (local x, before scaling).</summary>
        public const double LandmarkSideClamp = 0.45;

        /// <summary>Share of the rock height that lies under the terrain at the rock centre.</summary>
        public const double LandmarkSink = 0.15;

        /// <summary>Bump strength of landmark rocks.</summary>
        public const double LandmarkRoughness = 0.35;

        /// <summary>Subdivisions of a scattered boulder (42 vertices, 80 triangles; also its convex collider).</summary>
        public const int BoulderSubdivisions = 1;

        /// <summary>Bump strength of scattered boulders.</summary>
        public const double BoulderRoughness = 0.5;

        /// <summary>Seed of the bumps of a landmark rock variant (0–2).</summary>
        /// <param name="variant">Variant.</param>
        public static ulong LandmarkSeed(int variant)
        {
            return (ulong)(900 + variant * 7);
        }

        /// <summary>Landmark rock in unit size: x in −0.45 … 0.45, z within ±0.59, y from 0 up to at most 1.09.</summary>
        /// <param name="variant">Variant (0–2).</param>
        /// <param name="subdivisions"><see cref="LandmarkRenderSubdivisions"/> or <see cref="LandmarkColliderSubdivisions"/>.</param>
        public static MeshBuffers Landmark(int variant, int subdivisions)
        {
            return BlobGeometry.Build(new GeometryVector(0.0, 0.5, 0.0), new GeometryVector(0.5, 0.5, 0.5), subdivisions, LandmarkSeed(variant),
                LandmarkRoughness, 0.0, LandmarkSideClamp);
        }

        /// <summary>Height of the pivot (= flat underside) of a landmark rock.</summary>
        /// <param name="groundAtCenter">Terrain height at the rock centre.</param>
        /// <param name="sizeY">Rock height.</param>
        /// <param name="lift">Extra lift from the layout (e.g. a rock bridging a gate).</param>
        public static double LandmarkBaseHeight(double groundAtCenter, double sizeY, double lift)
        {
            return groundAtCenter - LandmarkSink * sizeY + lift;
        }

        /// <summary>Scattered boulder (vegetation kind rock): centre y = 0.35, radii 1.2 × 0.8 × 1.0, no clamping.</summary>
        /// <param name="seed">Seed of the plant mesh (500 + 13 × variant + 4, see the generator).</param>
        public static MeshBuffers Boulder(ulong seed)
        {
            return BlobGeometry.Build(new GeometryVector(0.0, 0.35, 0.0), new GeometryVector(1.2, 0.8, 1.0), BoulderSubdivisions, seed, BoulderRoughness);
        }
    }
}
