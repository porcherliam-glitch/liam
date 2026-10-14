// Global events sent by Core itself (architecture 4.3, events #1–#3).
//
// Why these structs live in Aetherfall.Core and not in Aetherfall.Events:
// Core (assembly no. 2) sends them, but may only reference assemblies with a lower number. Aetherfall.Events (no. 3)
// references Core, so Core cannot see types defined there. The three structs are therefore defined here, with
// unchanged names (consistency check K1 in docs/Technik/02_Systeme_und_Abhaengigkeiten.md). All other global events
// live in Aetherfall.Events. Several event structs of one area may share a file (architecture 15.2, rule 18).

namespace Aetherfall.Core
{
    /// <summary>
    /// The current game state changed (<see cref="IGameStateService.Current"/>). Sent by <see cref="GameStateService"/>
    /// after the state, the modal stack and the time scale were updated.
    /// </summary>
    public readonly struct GameStateChanged : IGameEvent
    {
        /// <summary>State before the change (top of the modal stack or base state).</summary>
        public readonly GameState Previous;

        /// <summary>State after the change (top of the modal stack or base state).</summary>
        public readonly GameState Current;

        /// <summary>Creates the event.</summary>
        /// <param name="previous">State before the change.</param>
        /// <param name="current">State after the change.</param>
        public GameStateChanged(GameState previous, GameState current)
        {
            Previous = previous;
            Current = current;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "GameStateChanged(" + Previous + " -> " + Current + ")";
        }
    }

    /// <summary>A scene started loading (sent by <see cref="SceneLoader"/>, architecture 4.5).</summary>
    public readonly struct SceneLoadStarted : IGameEvent
    {
        /// <summary>Scene key (scene path or <c>#n</c> build index until the Addressables step, see <see cref="SceneKeys"/>).</summary>
        public readonly string SceneKey;

        /// <summary>True if the loading screen is shown for this load.</summary>
        public readonly bool ShowLoadingScreen;

        /// <summary>Creates the event.</summary>
        /// <param name="sceneKey">Scene key.</param>
        /// <param name="showLoadingScreen">True if the loading screen is shown.</param>
        public SceneLoadStarted(string sceneKey, bool showLoadingScreen)
        {
            SceneKey = sceneKey;
            ShowLoadingScreen = showLoadingScreen;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "SceneLoadStarted(" + SceneKey + ", loadingScreen=" + ShowLoadingScreen + ")";
        }
    }

    /// <summary>A scene finished loading and is active (sent by <see cref="SceneLoader"/>, architecture 4.5).</summary>
    public readonly struct SceneLoadCompleted : IGameEvent
    {
        /// <summary>Scene key (scene path or <c>#n</c> build index until the Addressables step, see <see cref="SceneKeys"/>).</summary>
        public readonly string SceneKey;

        /// <summary>Real time the load took, in seconds.</summary>
        public readonly float DurationSeconds;

        /// <summary>Creates the event.</summary>
        /// <param name="sceneKey">Scene key.</param>
        /// <param name="durationSeconds">Real time the load took, in seconds.</param>
        public SceneLoadCompleted(string sceneKey, float durationSeconds)
        {
            SceneKey = sceneKey;
            DurationSeconds = durationSeconds;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "SceneLoadCompleted(" + SceneKey + ", " + DurationSeconds + " s)";
        }
    }
}
