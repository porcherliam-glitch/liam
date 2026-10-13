using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Tests
{
    /// <summary><see cref="ITimeScaleService"/> test double without Unity calls; records every value that was set.</summary>
    public sealed class FakeTimeScaleService : ITimeScaleService
    {
        private readonly List<float> _history = new List<float>();

        /// <summary>Creates the fake with time scale 1.</summary>
        public FakeTimeScaleService()
        {
            TimeScale = 1f;
        }

        /// <inheritdoc />
        public float TimeScale { get; private set; }

        /// <summary>Every value passed to <see cref="SetTimeScale"/>, in call order.</summary>
        public IReadOnlyList<float> History => _history;

        /// <inheritdoc />
        public void SetTimeScale(float timeScale)
        {
            TimeScale = timeScale;
            _history.Add(timeScale);
        }
    }
}
