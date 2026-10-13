namespace Aetherfall.Core
{
    /// <summary>Progress of <see cref="GameBootstrapper"/>.</summary>
    internal enum BootPhase
    {
        /// <summary>Awake has not run yet.</summary>
        NotStarted = 0,

        /// <summary>Synchronous part (sink, locator, validation, installers) is running.</summary>
        Installing = 1,

        /// <summary>All installers ran; waiting for Start.</summary>
        Installed = 2,

        /// <summary>Awaiting <see cref="IInitializable.InitializeAsync"/> calls (watched by the timeout).</summary>
        Initializing = 3,

        /// <summary>Calling <see cref="IPostInitializable.PostInitialize"/> and switching to the main menu.</summary>
        PostInitializing = 4,

        /// <summary>Boot completed; services are running.</summary>
        Running = 5,

        /// <summary>Boot failed; services were shut down and the error screen is shown.</summary>
        Failed = 6,

        /// <summary>Services were disposed (boot scene unloaded or Play Mode stopped).</summary>
        ShutDown = 7,

        /// <summary>This bootstrapper is a duplicate and does nothing.</summary>
        Inactive = 8
    }
}
