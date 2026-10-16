namespace Aetherfall.World
{
    /// <summary>What a scene offers the day-and-night service (the rig of the scene).</summary>
    public interface IDayNightEnvironment
    {
        /// <summary>Day cycle of the region.</summary>
        DayNightProfile Profile { get; }

        /// <summary>Outdoors or indoors.</summary>
        DayNightMode Mode { get; }

        /// <summary>Stealth light factor indoors.</summary>
        float IndoorLightFactor { get; }

        /// <summary>True while the scene is the active scene (only then it may write the render settings).</summary>
        bool IsInActiveScene { get; }

        /// <summary>Shows a moment of the day.</summary>
        /// <param name="sample">The evaluated moment.</param>
        void Apply(in DayNightSample sample);
    }
}
