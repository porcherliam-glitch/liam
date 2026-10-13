using System;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// One editor or player setting checked by step b): how to evaluate it and, if a public Unity API exists, how to
    /// apply it. Settings without a public API have no <see cref="Apply"/> and show manual instructions instead.
    /// </summary>
    internal sealed class SettingRule
    {
        private readonly Func<(SetupStatus Status, string Detail)> _evaluate;
        private readonly Action<SetupLog> _apply;

        /// <summary>Creates a rule.</summary>
        /// <param name="label">German label.</param>
        /// <param name="menuPath">Menu path for manual verification.</param>
        /// <param name="evaluate">Reads the current value; returns status and a German detail text.</param>
        /// <param name="apply">Applies the target value and logs it, or null if the setting has no public API.</param>
        public SettingRule(string label, string menuPath, Func<(SetupStatus Status, string Detail)> evaluate, Action<SetupLog> apply)
        {
            Label = label;
            MenuPath = menuPath;
            _evaluate = evaluate;
            _apply = apply;
        }

        /// <summary>German label.</summary>
        public string Label { get; }

        /// <summary>Menu path for manual verification.</summary>
        public string MenuPath { get; }

        /// <summary>True if the setting can be applied automatically (public API).</summary>
        public bool CanApply => _apply != null;

        /// <summary>Evaluates the rule and returns a checklist line.</summary>
        public SetupCheckItem Evaluate()
        {
            (SetupStatus status, string detail) = _evaluate();
            if (!CanApply && status == SetupStatus.Open)
            {
                detail += " · Manuell erledigen (keine öffentliche Unity-API).";
            }

            return new SetupCheckItem(Label, status, detail, MenuPath);
        }

        /// <summary>Applies the target value. Only valid if <see cref="CanApply"/>.</summary>
        /// <param name="log">Protocol.</param>
        public void Apply(SetupLog log)
        {
            _apply?.Invoke(log);
        }
    }
}
