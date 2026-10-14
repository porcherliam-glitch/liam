namespace Aetherfall.World
{
    /// <summary>Roof shape (JSON <c>roof</c>).</summary>
    public enum RoofKind
    {
        /// <summary><c>gable</c>: Gable roof (Satteldach), ridge along the depth of the building.</summary>
        Gable = 0,

        /// <summary><c>lean_to</c>: Lean-to roof (Pultdach), high on the left, low on the right side.</summary>
        LeanTo = 1,

        /// <summary><c>none</c>: No roof.</summary>
        None = 2
    }
}
