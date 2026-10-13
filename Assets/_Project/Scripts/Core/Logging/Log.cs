using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// Static logging facade with categories and a minimum level per category (architecture 14.4).
    /// </summary>
    /// <remarks>
    /// <para>
    /// Pure logic: this class makes no UnityEngine calls. Output goes to the current <see cref="ILogSink"/>
    /// (in the game: <see cref="UnityLogSink"/>). Without a sink every message is dropped silently,
    /// which keeps the class usable in unit tests outside of Unity.
    /// </para>
    /// <para>
    /// <see cref="Trace"/> and <see cref="Debug"/> are compiled out (including the string building at the
    /// call site) unless <c>AETHERFALL_DEV</c> or <c>UNITY_EDITOR</c> is defined, i.e. they vanish from release builds.
    /// Guard expensive messages with <see cref="IsEnabled"/>.
    /// </para>
    /// <para>
    /// Domain Reload is disabled in this project, so all static state is reset in
    /// <see cref="ResetOnSubsystemRegistration"/> when Play Mode starts.
    /// </para>
    /// </remarks>
    public static class Log
    {
        /// <summary>Global minimum level after <see cref="Reset"/>.</summary>
        public const LogLevel DefaultMinLevel = LogLevel.Info;

        private const string DevSymbol = "AETHERFALL_DEV";
        private const string EditorSymbol = "UNITY_EDITOR";

        // Number of slots for per-category levels. Derived once from the enum (append-only, see LogCategory).
        private static readonly int CategorySlotCount = ComputeCategorySlotCount();

        // Mutable static state: reset in Reset().
        private static readonly LogLevel[] CategoryMinLevels = new LogLevel[CategorySlotCount];
        private static readonly bool[] HasCategoryMinLevels = new bool[CategorySlotCount];
        private static ILogSink _sink;
        private static LogLevel _globalMinLevel = DefaultMinLevel;

        /// <summary>Current output target, or null if messages are dropped.</summary>
        public static ILogSink Sink => _sink;

        /// <summary>Minimum level for all categories without their own minimum level.</summary>
        public static LogLevel GlobalMinLevel => _globalMinLevel;

        /// <summary>Replaces the output target. Pass null to drop all messages.</summary>
        /// <param name="sink">New sink or null.</param>
        public static void SetSink(ILogSink sink)
        {
            _sink = sink;
        }

        /// <summary>Sets the minimum level for all categories that have no own minimum level.</summary>
        /// <param name="level">New global minimum level. <see cref="LogLevel.Off"/> suppresses everything.</param>
        public static void SetGlobalMinLevel(LogLevel level)
        {
            _globalMinLevel = level;
        }

        /// <summary>Sets a minimum level for one category that overrides the global minimum level.</summary>
        /// <param name="category">Category to configure.</param>
        /// <param name="level">Minimum level for this category. <see cref="LogLevel.Off"/> silences it completely.</param>
        public static void SetMinLevel(LogCategory category, LogLevel level)
        {
            int index = (int)category;
            if (!IsValidSlot(index))
            {
                return;
            }

            CategoryMinLevels[index] = level;
            HasCategoryMinLevels[index] = true;
        }

        /// <summary>Removes the category-specific minimum level; the category falls back to the global level.</summary>
        /// <param name="category">Category to reset.</param>
        public static void ClearMinLevel(LogCategory category)
        {
            int index = (int)category;
            if (!IsValidSlot(index))
            {
                return;
            }

            HasCategoryMinLevels[index] = false;
            CategoryMinLevels[index] = DefaultMinLevel;
        }

        /// <summary>Removes all category-specific minimum levels.</summary>
        public static void ClearAllCategoryMinLevels()
        {
            Array.Clear(CategoryMinLevels, 0, CategoryMinLevels.Length);
            Array.Clear(HasCategoryMinLevels, 0, HasCategoryMinLevels.Length);
        }

        /// <summary>Returns true if the category has its own minimum level.</summary>
        /// <param name="category">Category to query.</param>
        public static bool HasMinLevel(LogCategory category)
        {
            int index = (int)category;
            return IsValidSlot(index) && HasCategoryMinLevels[index];
        }

        /// <summary>Returns the effective minimum level of a category (own level or global level).</summary>
        /// <param name="category">Category to query.</param>
        public static LogLevel GetMinLevel(LogCategory category)
        {
            int index = (int)category;
            if (IsValidSlot(index) && HasCategoryMinLevels[index])
            {
                return CategoryMinLevels[index];
            }

            return _globalMinLevel;
        }

        /// <summary>
        /// Returns true if a message with this category and level would reach a sink.
        /// Use it to skip expensive string building.
        /// </summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="level">Level of the message.</param>
        public static bool IsEnabled(LogCategory category, LogLevel level)
        {
            if (_sink == null || level < LogLevel.Trace || level >= LogLevel.Off)
            {
                return false;
            }

            return level >= GetMinLevel(category);
        }

        /// <summary>Very detailed diagnostic message. Compiled out of release builds.</summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text.</param>
        [System.Diagnostics.Conditional(DevSymbol)]
        [System.Diagnostics.Conditional(EditorSymbol)]
        public static void Trace(LogCategory category, string message)
        {
            Write(LogLevel.Trace, category, message, null);
        }

        /// <summary>Diagnostic message for developers. Compiled out of release builds.</summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text.</param>
        [System.Diagnostics.Conditional(DevSymbol)]
        [System.Diagnostics.Conditional(EditorSymbol)]
        public static void Debug(LogCategory category, string message)
        {
            Write(LogLevel.Debug, category, message, null);
        }

        /// <summary>Normal operational message.</summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text.</param>
        public static void Info(LogCategory category, string message)
        {
            Write(LogLevel.Info, category, message, null);
        }

        /// <summary>Unexpected situation, the game continues.</summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text.</param>
        public static void Warning(LogCategory category, string message)
        {
            Write(LogLevel.Warning, category, message, null);
        }

        /// <summary>An operation failed.</summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text.</param>
        public static void Error(LogCategory category, string message)
        {
            Write(LogLevel.Error, category, message, null);
        }

        /// <summary>The game cannot continue safely.</summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text.</param>
        public static void Fatal(LogCategory category, string message)
        {
            Write(LogLevel.Fatal, category, message, null);
        }

        /// <summary>Logs an exception with level <see cref="LogLevel.Error"/>.</summary>
        /// <param name="category">Category of the message.</param>
        /// <param name="exception">The exception (its message is used if <paramref name="context"/> is empty).</param>
        /// <param name="context">Optional description of what was being done, e.g. with the affected ID.</param>
        public static void Exception(LogCategory category, Exception exception, string context = null)
        {
            string message = string.IsNullOrEmpty(context)
                ? (exception != null ? exception.GetType().Name + ": " + exception.Message : "Unknown exception")
                : context;
            Write(LogLevel.Error, category, message, exception);
        }

        /// <summary>Writes a message if it passes the level filter and a sink is set.</summary>
        /// <param name="level">Level of the message. <see cref="LogLevel.Off"/> is ignored.</param>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text; null is written as an empty string.</param>
        /// <param name="exception">Optional exception.</param>
        public static void Write(LogLevel level, LogCategory category, string message, Exception exception = null)
        {
            ILogSink sink = _sink;
            if (sink == null || !IsEnabled(category, level))
            {
                return;
            }

            sink.Write(level, category, message ?? string.Empty, exception);
        }

        /// <summary>
        /// Restores the defaults: no sink, global minimum level <see cref="DefaultMinLevel"/>, no category levels.
        /// Called automatically when Play Mode starts; tests call it to isolate themselves.
        /// </summary>
        public static void Reset()
        {
            _sink = null;
            _globalMinLevel = DefaultMinLevel;
            ClearAllCategoryMinLevels();
        }

        // Domain Reload is off: static state survives between Play Mode sessions unless reset here.
        [UnityEngine.RuntimeInitializeOnLoadMethod(UnityEngine.RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnSubsystemRegistration()
        {
            Reset();
        }

        private static bool IsValidSlot(int index)
        {
            return index >= 0 && index < CategorySlotCount;
        }

        private static int ComputeCategorySlotCount()
        {
            int max = 0;
            foreach (LogCategory category in Enum.GetValues(typeof(LogCategory)))
            {
                max = Math.Max(max, (int)category);
            }

            return max + 1;
        }
    }
}
