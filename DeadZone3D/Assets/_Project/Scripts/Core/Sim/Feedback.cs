using System;
using System.Collections.Generic;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public enum Fx { MuzzleFlash, Casing, Blood, Impact, HitMarker, FloatingText, Explosion, ToxicCloud, Fire, FootDust, DamageFlash, HitDirection, Flash, LightFlash }

    /// <summary>Audio/visual feedback the simulation asks for; the Unity layer implements it (tests use <see cref="NullFeedback"/>).</summary>
    public interface IFeedback
    {
        /// <summary>Plays a sound; x/y = NaN means non-positional.</summary>
        void Sfx(string name, double x = double.NaN, double y = double.NaN, double volume = 1, double pitch = 1);
        void Toast(string text, string kind = "info", double ms = 2500);
        void Shake(double strength);
        void Effect(Fx kind, double x, double y, double a = 0, double b = 0, string text = null, string color = null);
    }

    public sealed class NullFeedback : IFeedback
    {
        public readonly List<string> Toasts = new List<string>();
        public readonly List<string> Sounds = new List<string>();
        public void Sfx(string name, double x = double.NaN, double y = double.NaN, double volume = 1, double pitch = 1) { if (Sounds.Count < 2000) Sounds.Add(name); }
        public void Toast(string text, string kind = "info", double ms = 2500) { if (Toasts.Count < 500) Toasts.Add(text); }
        public void Shake(double strength) { }
        public void Effect(Fx kind, double x, double y, double a = 0, double b = 0, string text = null, string color = null) { }
    }

    /// <summary>Input the player reads each step (Unity: keyboard/mouse/gamepad; tests: scripted).</summary>
    public interface IPlayerInput
    {
        Vec2 MoveAxis();
        bool Pressed(string action);
        bool IsDown(string action);
        /// <summary>World-space aim angle from the player position, or NaN for "keep the current angle".</summary>
        double AimAngle(double px, double py);
        bool WantsFire();
    }

    public sealed class WeaponRt { public double cooldown, reloadTimer, bloom; public bool reloading; }

    public sealed class Projectile
    {
        public double x, y, vx, vy, dirX, dirY, dmg, range, traveled, ttl, trail, prevX, prevY;
        public int pen;
        public bool ownerIsPlayer;
        public string cls;
        public Player shooter;
        /// <summary>Trigger pull the projectile belongs to (shotgun pellets share it).</summary>
        public int shot;
        /// <summary>Aimed first-person shot: where it left the eye (sim px), its vertical angle (radians, positive = down) and the eye height (px).
        /// pitch = NaN is a flat 2D shot that hits whatever it crosses.</summary>
        public double originX, originY, pitch = double.NaN, eyePx;

        public bool Aimed => !double.IsNaN(pitch);

        /// <summary>Height of an aimed shot above the floor (sim px) when it is over (x, y); NaN for flat shots.</summary>
        public double HeightAt(double px, double py) => eyePx - Math.Tan(pitch) * M.Dist(originX, originY, px, py);
    }

    public sealed class Grenade
    {
        public double x, y, vx, vy, z, vz, fuse, rot;
        public GrenadeStats g;
        public ItemDef def;
        public string kind;
    }

    public sealed class Hazard { public string kind; public double x, y, r, duration, timer; }
    public sealed class NoiseMarker { public double x, y, radius, ttl; public string kind; }

    public sealed class Effect
    {
        public string id, label;
        public double timer, speedMul, hps, spreadMul;
    }

    public sealed class PlayerStats
    {
        public int shotsFired, shotsHit, kills, containersOpened;
        /// <summary>Trigger pulls that hit a zombie in the head (only aimed first-person shots can).</summary>
        public int headShots;
        public double damageDealt, damageTaken, lootValue, distance;
        public readonly Dictionary<string, int> killsByType = new Dictionary<string, int>();
    }

    public sealed class Interactable
    {
        public string kind, prompt;
        public object reference;
        public double x, y, dist;
        public int tx, ty;
        public bool hold;
    }
}
