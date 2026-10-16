using System;
using Aetherfall.Cinematics;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Where the exploration camera (CM_Explore) rests right after the player spawned: on its orbit behind the player at the
    /// recentering angle, looking at the pivot with the shoulder offset of the composer. A cutscene that hands over to the game
    /// ends in exactly this pose, so the switch back shows no jump (S58). Pure data; the world builder passes the camera numbers.
    /// </summary>
    public readonly struct ExploreRestPose
    {
        /// <summary>Creates the rest pose description.</summary>
        /// <param name="radius">Orbit radius in metres.</param>
        /// <param name="pivotHeight">Height of the camera pivot above the player's feet.</param>
        /// <param name="verticalDegrees">Elevation of the orbit after recentering, in degrees.</param>
        /// <param name="fieldOfView">Vertical field of view in degrees.</param>
        /// <param name="screenOffsetX">Horizontal screen position of the pivot (composer, -0.5 … 0.5; 0 = centre).</param>
        /// <param name="aspect">Screen aspect the offset is computed for.</param>
        public ExploreRestPose(double radius, double pivotHeight, double verticalDegrees, double fieldOfView, double screenOffsetX = 0d,
            double aspect = 16d / 9d)
        {
            Radius = radius;
            PivotHeight = pivotHeight;
            VerticalDegrees = verticalDegrees;
            FieldOfView = fieldOfView;
            ScreenOffsetX = screenOffsetX;
            Aspect = aspect;
        }

        /// <summary>Orbit radius in metres.</summary>
        public double Radius { get; }

        /// <summary>Height of the pivot above the feet.</summary>
        public double PivotHeight { get; }

        /// <summary>Elevation of the orbit in degrees.</summary>
        public double VerticalDegrees { get; }

        /// <summary>Vertical field of view in degrees.</summary>
        public double FieldOfView { get; }

        /// <summary>Horizontal screen position of the pivot.</summary>
        public double ScreenOffsetX { get; }

        /// <summary>Screen aspect.</summary>
        public double Aspect { get; }

        /// <summary>The camera pose for a player standing at <paramref name="feet"/> and facing along <paramref name="forward"/>.</summary>
        /// <param name="feet">Feet of the player.</param>
        /// <param name="forward">Facing on the ground (normalised inside).</param>
        public CinePose PoseFor(CinePoint feet, CinePoint forward)
        {
            CinePoint f = forward.Flat.Normalized;
            CinePoint right = new CinePoint(f.Z, 0d, -f.X);
            CinePoint pivot = feet + CinePoint.Up * PivotHeight;
            double elevation = VerticalDegrees * Math.PI / 180d;
            CinePoint camera = pivot - f * (Radius * Math.Cos(elevation)) + CinePoint.Up * (Radius * Math.Sin(elevation));

            // The composer keeps the pivot off centre: the camera looks past it by the matching angle.
            double halfHorizontal = Math.Atan(Math.Tan(FieldOfView * Math.PI / 360d) * Aspect);
            double sideways = -2d * ScreenOffsetX * Math.Tan(halfHorizontal) * Radius;
            return new CinePose(camera, pivot + right * sideways, FieldOfView);
        }
    }
}
