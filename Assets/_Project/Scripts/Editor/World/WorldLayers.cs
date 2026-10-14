namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Layer indices of a generated world scene (architecture 2.8), as set up by <see cref="WorldSetup.Prepare"/>; −1 means the
    /// layer could not be created (slot taken by another name).
    /// </summary>
    public sealed class WorldLayers
    {
        /// <summary>Layer 6 "Player".</summary>
        public int Player { get; internal set; } = -1;

        /// <summary>Layer 7 "Enemy".</summary>
        public int Enemy { get; internal set; } = -1;

        /// <summary>Layer 9 "Hurtbox".</summary>
        public int Hurtbox { get; internal set; } = -1;

        /// <summary>Layer 10 "Interactable".</summary>
        public int Interactable { get; internal set; } = -1;

        /// <summary>Layer 11 "Environment".</summary>
        public int Environment { get; internal set; } = -1;

        /// <summary>Layer 12 "Terrain".</summary>
        public int Terrain { get; internal set; } = -1;

        /// <summary>Layer 14 "TriggerVolume".</summary>
        public int TriggerVolume { get; internal set; } = -1;

        /// <summary>Layer 16 "Pickup".</summary>
        public int Pickup { get; internal set; } = -1;

        /// <summary>Unity's built-in layer 4 "Water".</summary>
        public int Water { get; internal set; } = EichentalPaths.WaterLayerIndex;
    }
}
