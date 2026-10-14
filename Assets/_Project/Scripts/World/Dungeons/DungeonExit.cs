namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// An exit of the dungeon (architecture 10.8 "Beim Verlassen"): the portal object, the target scene with its loading screen
    /// title and the arrival anchor in the target scene.
    /// </summary>
    public sealed class DungeonExit
    {
        /// <summary>Id of the portal object (kind <c>portal</c>).</summary>
        public string ObjectId { get; set; } = string.Empty;

        /// <summary>Scene key of the target (scene path until the Addressables step).</summary>
        public string TargetSceneKey { get; set; } = string.Empty;

        /// <summary>Loading screen title.</summary>
        public string TargetTitle { get; set; } = string.Empty;

        /// <summary>Arrival anchor in the target scene, e.g. <c>anchor.eichental.gruft_eingang</c>.</summary>
        public string TargetAnchorId { get; set; } = string.Empty;
    }
}
