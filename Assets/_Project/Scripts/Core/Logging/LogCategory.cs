namespace Aetherfall.Core
{
    /// <summary>
    /// Category of a log message (architecture 14.4). Each category can have its own minimum level.
    /// Values are serialized by Unity (e.g. in <c>LogSettings</c>): append new categories at the end,
    /// never renumber or remove existing ones.
    /// </summary>
    public enum LogCategory
    {
        /// <summary>Core infrastructure (service locator, logging itself, tick runner).</summary>
        Core = 0,

        /// <summary>Boot sequence (GameBootstrapper, installers, EditorBootstrap).</summary>
        Boot = 1,

        /// <summary>Event bus (delivery errors, tracer output).</summary>
        Events = 2,

        /// <summary>Game state machine (state changes, rejected transitions).</summary>
        GameState = 3,

        /// <summary>Definitions, IDs and the content database.</summary>
        Data = 4,

        /// <summary>Saving and loading.</summary>
        Save = 5,

        /// <summary>Scene loading and world streaming.</summary>
        Streaming = 6,

        /// <summary>Input devices, action maps and rebinding.</summary>
        Input = 7,

        /// <summary>User interface.</summary>
        UI = 8,

        /// <summary>Music, sound effects and mixing.</summary>
        Audio = 9,

        /// <summary>Combat and damage.</summary>
        Combat = 10,

        /// <summary>Enemy AI.</summary>
        AI = 11,

        /// <summary>Quests.</summary>
        Quests = 12,

        /// <summary>Dialogues.</summary>
        Dialogue = 13,

        /// <summary>World state, regions and world objects.</summary>
        World = 14,

        /// <summary>NPC schedules and behaviour.</summary>
        NPC = 15,

        /// <summary>Traders, prices and currencies.</summary>
        Economy = 16,

        /// <summary>Development telemetry.</summary>
        Telemetry = 17,

        /// <summary>Debug console, overlays and other developer tools.</summary>
        DevTools = 18,

        /// <summary>Player character: movement, spawning, player components.</summary>
        Player = 19,

        /// <summary>Cameras (Cinemachine rigs, look input, camera modes).</summary>
        Camera = 20,

        /// <summary>Cutscenes and the dialogue camera (S58).</summary>
        Cinematics = 21
    }
}
