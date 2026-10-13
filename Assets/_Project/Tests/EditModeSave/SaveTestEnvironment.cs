using System;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// Real event bus and game state service, in-memory files and a fixed clock for save manager tests. The manager runs
    /// synchronously (no background thread). Dispose in TearDown.
    /// </summary>
    public sealed class SaveTestEnvironment : IDisposable
    {
        /// <summary>Root folder of the saves in the in-memory store.</summary>
        public const string Root = "/saves";

        /// <summary>Creates the environment in game state Playing.</summary>
        /// <param name="enterPlaying">False keeps the game state at Boot.</param>
        public SaveTestEnvironment(bool enterPlaying = true)
        {
            Log = new LogCapture();
            Bus = new EventBus();
            StateService = new GameStateService(Bus, new FakeTimeScaleService());
            Files = new InMemoryFileStore();
            Now = new DateTime(2026, 10, 13, 18, 30, 0, DateTimeKind.Utc);
            if (enterPlaying)
            {
                StateService.SwitchBase(GameState.MainMenu, "test");
                StateService.SwitchBase(GameState.Loading, "test");
                StateService.SwitchBase(GameState.Playing, "test");
            }
        }

        /// <summary>Captured log.</summary>
        public LogCapture Log { get; }

        /// <summary>Event bus.</summary>
        public EventBus Bus { get; }

        /// <summary>Game state service.</summary>
        public GameStateService StateService { get; }

        /// <summary>In-memory files.</summary>
        public InMemoryFileStore Files { get; }

        /// <summary>Clock of the manager (advance it between saves).</summary>
        public DateTime Now { get; set; }

        /// <summary>Creates a synchronous manager on the in-memory files.</summary>
        /// <param name="configure">Optional changes to the settings.</param>
        public SaveManager CreateManager(Action<SaveManagerSettings> configure = null)
        {
            var settings = new SaveManagerSettings
            {
                UseBackgroundThread = false,
                GameVersion = "0.1.0",
                UtcNow = () => Now
            };
            configure?.Invoke(settings);
            return new SaveManager(Bus, StateService, Files, new FixedSaveLocation(Root), settings);
        }

        /// <summary>Path of a slot file in the in-memory store.</summary>
        /// <param name="slotName">Slot name.</param>
        /// <param name="suffix">Extension, e.g. ".sav".</param>
        public static string SlotFile(string slotName, string suffix)
        {
            return Root + "/" + SaveFormat.DefaultCharacterId + "/" + slotName + suffix;
        }

        /// <summary>Moves the clock forward.</summary>
        /// <param name="seconds">Seconds.</param>
        public void Advance(double seconds)
        {
            Now = Now.AddSeconds(seconds);
        }

        /// <inheritdoc />
        public void Dispose()
        {
            Bus.Dispose();
            Log.Dispose();
        }
    }
}
