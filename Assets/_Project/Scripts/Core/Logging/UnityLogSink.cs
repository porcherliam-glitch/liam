using System;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Adapter from <see cref="Log"/> to the Unity console and the player log (<c>Player.log</c>).
    /// Output format: <c>[Category] message</c>, with a level tag for Trace, Debug and Fatal.
    /// </summary>
    /// <remarks>
    /// <see cref="UnityEngine.Debug"/> is thread-safe, so this sink can be used from background threads.
    /// The sink is installed automatically at the start of Play Mode (before any scene loads) and in the
    /// editor after every domain reload, so early messages are not lost. <see cref="GameBootstrapper"/>
    /// sets it again explicitly as boot step 1.
    /// </remarks>
    public sealed class UnityLogSink : ILogSink
    {
        /// <inheritdoc />
        public void Write(LogLevel level, LogCategory category, string message, Exception exception)
        {
            string text = Format(level, category, message);
            switch (level)
            {
                case LogLevel.Warning:
                    UnityEngine.Debug.LogWarning(text);
                    break;
                case LogLevel.Error:
                case LogLevel.Fatal:
                    UnityEngine.Debug.LogError(text);
                    break;
                default:
                    UnityEngine.Debug.Log(text);
                    break;
            }

            if (exception != null)
            {
                // Logged separately so the console shows the full, clickable stack trace.
                UnityEngine.Debug.LogException(exception);
            }
        }

        private static string Format(LogLevel level, LogCategory category, string message)
        {
            switch (level)
            {
                case LogLevel.Trace:
                case LogLevel.Debug:
                case LogLevel.Fatal:
                    return "[" + category + "][" + level + "] " + message;
                default:
                    return "[" + category + "] " + message;
            }
        }

        // Runs after the static reset of Log (SubsystemRegistration) and before the first scene loads.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterAssembliesLoaded)]
        private static void InstallForPlayMode()
        {
            if (Log.Sink == null)
            {
                Log.SetSink(new UnityLogSink());
            }
        }

#if UNITY_EDITOR
        // Edit Mode (editor tools) after a domain reload. EditMode tests replace the sink temporarily.
        [UnityEditor.InitializeOnLoadMethod]
        private static void InstallForEditMode()
        {
            if (Log.Sink == null)
            {
                Log.SetSink(new UnityLogSink());
            }
        }
#endif
    }
}
