using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode
{
    /// <summary><see cref="ILoadingScreen"/> test double that records calls and progress values.</summary>
    public sealed class FakeLoadingScreen : ILoadingScreen
    {
        /// <summary>Progress values in call order.</summary>
        public List<float> Progress { get; } = new List<float>();

        /// <summary>Titles passed to <see cref="Show"/>.</summary>
        public List<string> Titles { get; } = new List<string>();

        /// <summary>Number of <see cref="Hide"/> calls.</summary>
        public int HideCount { get; private set; }

        /// <inheritdoc />
        public bool IsVisible { get; private set; }

        /// <inheritdoc />
        public void Show(string title)
        {
            IsVisible = true;
            Titles.Add(title);
        }

        /// <inheritdoc />
        public void SetProgress(float progress01)
        {
            Progress.Add(progress01);
        }

        /// <inheritdoc />
        public void Hide()
        {
            IsVisible = false;
            HideCount++;
        }
    }
}
