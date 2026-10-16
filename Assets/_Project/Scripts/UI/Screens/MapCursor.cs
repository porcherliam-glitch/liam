using System;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The cursor of the map page for own markers (S63, GDD 05 1.8): starts where the player stands (or in the middle of the
    /// shown area), moves in steps of <see cref="StepShare"/> of the shown area per direction step and never leaves it.
    /// Pure logic.
    /// </summary>
    public sealed class MapCursor
    {
        /// <summary>Share of the shown area per step (the navigation repeats about 10 steps per second while held).</summary>
        public const float StepShare = 0.015f;

        private float _minX;
        private float _minZ;
        private float _maxX;
        private float _maxZ;

        /// <summary>True while the cursor is shown.</summary>
        public bool Active { get; private set; }

        /// <summary>World x of the cursor.</summary>
        public float X { get; private set; }

        /// <summary>World z of the cursor.</summary>
        public float Z { get; private set; }

        /// <summary>Shows the cursor.</summary>
        /// <param name="x">Start x (the player), clamped into the area.</param>
        /// <param name="z">Start z.</param>
        /// <param name="minX">West edge of the shown area.</param>
        /// <param name="minZ">South edge.</param>
        /// <param name="maxX">East edge.</param>
        /// <param name="maxZ">North edge.</param>
        public void Begin(float x, float z, float minX, float minZ, float maxX, float maxZ)
        {
            _minX = Math.Min(minX, maxX);
            _maxX = Math.Max(minX, maxX);
            _minZ = Math.Min(minZ, maxZ);
            _maxZ = Math.Max(minZ, maxZ);
            if (float.IsNaN(x) || float.IsNaN(z))
            {
                x = (_minX + _maxX) * 0.5f;
                z = (_minZ + _maxZ) * 0.5f;
            }

            X = Clamp(x, _minX, _maxX);
            Z = Clamp(z, _minZ, _maxZ);
            Active = true;
        }

        /// <summary>Hides the cursor.</summary>
        public void End()
        {
            Active = false;
        }

        /// <summary>Moves the cursor one step.</summary>
        /// <param name="dx">−1 west, +1 east, 0 none.</param>
        /// <param name="dz">−1 south, +1 north, 0 none.</param>
        public void Move(int dx, int dz)
        {
            if (!Active)
            {
                return;
            }

            float step = Math.Max(_maxX - _minX, _maxZ - _minZ) * StepShare;
            X = Clamp(X + Math.Sign(dx) * step, _minX, _maxX);
            Z = Clamp(Z + Math.Sign(dz) * step, _minZ, _maxZ);
        }

        private static float Clamp(float value, float min, float max)
        {
            return value < min ? min : value > max ? max : value;
        }
    }
}
