using System;
using System.Globalization;

namespace DeadZone.Core
{
    /// <summary>Math and formatting helpers with JavaScript semantics where the port depends on them.</summary>
    public static class M
    {
        public const double PI = Math.PI;
        public const double TAU = Math.PI * 2;

        public static double Clamp(double v, double a, double b) => v < a ? a : (v > b ? b : v);
        public static int Clamp(int v, int a, int b) => v < a ? a : (v > b ? b : v);
        public static double Lerp(double a, double b, double t) => a + (b - a) * t;
        public static double Dist(double ax, double ay, double bx, double by) { double dx = bx - ax, dy = by - ay; return Math.Sqrt(dx * dx + dy * dy); }
        public static double Dist2(double ax, double ay, double bx, double by) { double dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
        public static double Hypot(double x, double y) => Math.Sqrt(x * x + y * y);
        public static double AngleTo(double ax, double ay, double bx, double by) => Math.Atan2(by - ay, bx - ax);

        public static double NormAngle(double a)
        {
            a %= TAU;
            if (a <= -Math.PI) a += TAU;
            else if (a > Math.PI) a -= TAU;
            return a;
        }

        public static double AngleDiff(double a, double b) => NormAngle(b - a);
        public static double LerpAngle(double a, double b, double t) => a + AngleDiff(a, b) * t;

        /// <summary>JavaScript Math.round (halves round up).</summary>
        public static int Round(double v) => (int)Math.Floor(v + 0.5);
        public static int Floor(double v) => (int)Math.Floor(v);
        public static int Ceil(double v) => (int)Math.Ceiling(v);
        public static int Sign(int v) => v > 0 ? 1 : (v < 0 ? -1 : 0);

        public static bool CircleRectOverlap(double cx, double cy, double r, double rx, double ry, double rw, double rh)
        {
            double nx = Clamp(cx, rx, rx + rw), ny = Clamp(cy, ry, ry + rh);
            double dx = cx - nx, dy = cy - ny;
            return dx * dx + dy * dy < r * r;
        }

        public static string FormatTime(double sec)
        {
            int s = Math.Max(0, (int)Math.Floor(double.IsNaN(sec) ? 0 : sec));
            int m = s / 60; s %= 60;
            return m.ToString("00", CultureInfo.InvariantCulture) + ":" + s.ToString("00", CultureInfo.InvariantCulture);
        }

        public static string FormatCredits(double n)
        {
            long v = (long)Math.Floor(n + 0.5);
            string s = Math.Abs(v).ToString(CultureInfo.InvariantCulture);
            string outp = "";
            while (s.Length > 3) { outp = "." + s.Substring(s.Length - 3) + outp; s = s.Substring(0, s.Length - 3); }
            return (v < 0 ? "-" : "") + s + outp + " CR";
        }

        public static string FormatWeight(double kg)
        {
            double v = Math.Floor(kg * 10 + 0.5) / 10;
            return v.ToString("0.0", CultureInfo.InvariantCulture).Replace('.', ',') + " kg";
        }

        /// <summary>German number with at most one decimal ("1,5").</summary>
        public static string Num1(double v) => (Math.Floor(v * 10 + 0.5) / 10).ToString("0.#", CultureInfo.InvariantCulture).Replace('.', ',');
        public static string Pct(double v) => Round(v * 100) + " %";
        public static string Inv(double v) => v.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Unique instance ids for items.</summary>
    public static class Uid
    {
        private static long _counter;
        private static readonly string Prefix = "u" + DateTime.UtcNow.Ticks.ToString("x");
        public static string Next() { _counter++; return Prefix + "_" + _counter.ToString("x"); }
    }

    /// <summary>Log with a pluggable sink (Unity forwards to Debug.Log; tests record errors).</summary>
    public static class Log
    {
        public static Action<string> InfoSink, WarnSink, ErrorSink;
        public static int ErrorCount;
        public static void Info(string m) => InfoSink?.Invoke("[DZ] " + m);
        public static void Warn(string m) => WarnSink?.Invoke("[DZ] " + m);
        public static void Error(string m) { ErrorCount++; ErrorSink?.Invoke("[DZ] " + m); }
    }
}
