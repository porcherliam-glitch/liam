using System;

namespace DeadZone.Core
{
    /// <summary>
    /// Pure maths of the first-person view, kept here so it is covered by EditMode tests.
    /// Angles are simulation angles (radians, 0 = east, clockwise on screen because y points down).
    /// </summary>
    public static class ViewMath
    {
        /// <summary>Movement input (x = right, y = forward) turned into a simulation direction for a view angle.</summary>
        public static Vec2 RotateMove(double yaw, double right, double forward)
        {
            double fx = Math.Cos(yaw), fy = Math.Sin(yaw);
            // right is forward turned 90° clockwise: (-fy, fx)
            return new Vec2(fx * forward - fy * right, fy * forward + fx * right);
        }

        /// <summary>Angle of a world direction relative to the view (0 = ahead, positive = to the right), -π..π.</summary>
        public static double Relative(double viewYaw, double angle) => M.AngleDiff(viewYaw, angle);

        /// <summary>Screen direction for a relative angle: ahead = up (0, -1), right = (1, 0).</summary>
        public static Vec2 ScreenDirection(double relative) => new Vec2(Math.Sin(relative), -Math.Cos(relative));

        /// <summary>Compass heading in degrees 0..360 (north = 0, east = 90).</summary>
        public static double HeadingDeg(double yaw)
        {
            double h = yaw * 180 / Math.PI + 90;
            h %= 360;
            return h < 0 ? h + 360 : h;
        }
    }
}
