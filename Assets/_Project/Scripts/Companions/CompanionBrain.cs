using System;
using Aetherfall.AI;
using Aetherfall.Combat;

namespace Aetherfall.Companions
{
    /// <summary>How the companion moves this frame.</summary>
    public enum CompanionMove
    {
        /// <summary>Stand still (at the post, waiting, in reach of the target, downed).</summary>
        Stand = 0,

        /// <summary>Walk or run to <see cref="CompanionDecision.Destination"/>.</summary>
        Move = 1,

        /// <summary>Too far away: appear at <see cref="CompanionDecision.Destination"/> at once.</summary>
        Teleport = 2
    }

    /// <summary>What the scene adapter tells the brain each frame (ground plane, no UnityEngine types).</summary>
    public struct CompanionSenses
    {
        /// <summary>Own position.</summary>
        public FlatPoint Self { get; set; }

        /// <summary>Player position.</summary>
        public FlatPoint Player { get; set; }

        /// <summary>Facing of the player in degrees.</summary>
        public float PlayerYaw { get; set; }

        /// <summary>True if the companion is with the player (recruited).</summary>
        public bool Joined { get; set; }

        /// <summary>True after the command "Warte hier".</summary>
        public bool Waiting { get; set; }

        /// <summary>True while knocked down.</summary>
        public bool Downed { get; set; }

        /// <summary>True if an enemy to fight was chosen.</summary>
        public bool HasTarget { get; set; }

        /// <summary>Position of the target.</summary>
        public FlatPoint Target { get; set; }

        /// <summary>True while an own attack runs.</summary>
        public bool Attacking { get; set; }

        /// <summary>True if the attack pause is over.</summary>
        public bool AttackReady { get; set; }
    }

    /// <summary>The brain's answer for one frame.</summary>
    public struct CompanionDecision
    {
        /// <summary>Movement.</summary>
        public CompanionMove Move { get; set; }

        /// <summary>Where to go (or where to appear).</summary>
        public FlatPoint Destination { get; set; }

        /// <summary>Speed in m/s.</summary>
        public float Speed { get; set; }

        /// <summary>Turn towards the target instead of the walking direction.</summary>
        public bool FaceTarget { get; set; }

        /// <summary>Start an attack now.</summary>
        public bool StartAttack { get; set; }
    }

    /// <summary>
    /// The defensive companion of GDD 03 13.1 ("Defensiv", Maren): follows the player a little behind and to the side, so she
    /// is never in the line of sight or in the way; fights only enemies that attack the player or her (the adapter picks them)
    /// and stays close to the player while doing so; appears next to the player when she falls far behind (scene change,
    /// teleport, fast travel). Pure C#, tested without Unity.
    /// </summary>
    public sealed class CompanionBrain
    {
        /// <summary>Distance behind the player in metres.</summary>
        public const float BehindDistance = 2.2f;

        /// <summary>Distance to the side of the player in metres.</summary>
        public const float SideDistance = 1.5f;

        /// <summary>Close enough to the follow spot to stand still.</summary>
        public const float ArriveDistance = 0.9f;

        /// <summary>Melee reach of the companion.</summary>
        public const float AttackRange = 1.9f;

        /// <summary>Farther than this from the player: the companion appears next to the player.</summary>
        public const float TeleportDistance = 30f;

        /// <summary>A target farther than this from the player is not chased (defensive: GDD 03 13.1 "≤ 6 m", plus reach).</summary>
        public const float LeashFromPlayer = 9f;

        private const float WalkSpeed = 2.4f;
        private const float RunSpeed = 5.2f;
        private const float CatchUpSpeed = 7.5f;
        private const float CatchUpDistance = 9f;
        private const float SideSwitchDistance = 0.6f;

        private int _side = 1;

        /// <summary>Side of the follow spot: +1 right of the player, −1 left (kept until she is clearly on the other side).</summary>
        public int Side => _side;

        /// <summary>The follow spot: behind the player and to the side she is on.</summary>
        /// <param name="player">Player position.</param>
        /// <param name="playerYaw">Facing of the player in degrees.</param>
        /// <param name="side">+1 right, −1 left.</param>
        public static FlatPoint FollowSpot(FlatPoint player, float playerYaw, int side)
        {
            double yaw = playerYaw * Math.PI / 180.0;
            float forwardX = (float)Math.Sin(yaw);
            float forwardZ = (float)Math.Cos(yaw);
            float rightX = forwardZ;
            float rightZ = -forwardX;
            return new FlatPoint(player.X - forwardX * BehindDistance + rightX * SideDistance * side,
                player.Z - forwardZ * BehindDistance + rightZ * SideDistance * side);
        }

        /// <summary>Decides for one frame.</summary>
        /// <param name="senses">What the companion knows.</param>
        public CompanionDecision Decide(in CompanionSenses senses)
        {
            var decision = new CompanionDecision { Move = CompanionMove.Stand, Destination = senses.Self };
            if (!senses.Joined || senses.Downed)
            {
                return decision;
            }

            float toPlayer = senses.Self.DistanceTo(senses.Player);
            if (!senses.Waiting && toPlayer > TeleportDistance)
            {
                decision.Move = CompanionMove.Teleport;
                decision.Destination = FollowSpot(senses.Player, senses.PlayerYaw, _side);
                return decision;
            }

            if (senses.HasTarget && (senses.Waiting || senses.Target.DistanceTo(senses.Player) <= LeashFromPlayer))
            {
                return Fight(senses, decision);
            }

            if (senses.Waiting || senses.Attacking)
            {
                return decision;
            }

            // Keep the side she is on; switch only when she is clearly on the other side (no zig-zag behind the player).
            float bearing = CombatMath.BearingTo(senses.Player.X, senses.Player.Z, senses.PlayerYaw, senses.Self.X, senses.Self.Z);
            if (toPlayer > SideSwitchDistance && Math.Abs(bearing) > 10f && Math.Abs(bearing) < 170f)
            {
                _side = bearing > 0f ? 1 : -1;
            }

            FlatPoint spot = FollowSpot(senses.Player, senses.PlayerYaw, _side);
            float toSpot = senses.Self.DistanceTo(spot);
            if (toSpot <= ArriveDistance)
            {
                return decision;
            }

            decision.Move = CompanionMove.Move;
            decision.Destination = spot;
            decision.Speed = toPlayer > CatchUpDistance ? CatchUpSpeed : toSpot > 3f ? RunSpeed : WalkSpeed;
            return decision;
        }

        private static CompanionDecision Fight(in CompanionSenses senses, CompanionDecision decision)
        {
            decision.FaceTarget = true;
            decision.Destination = senses.Target;
            float toTarget = senses.Self.DistanceTo(senses.Target);
            if (senses.Attacking)
            {
                return decision;
            }

            if (toTarget > AttackRange)
            {
                decision.Move = CompanionMove.Move;
                decision.Speed = RunSpeed;
                return decision;
            }

            decision.StartAttack = senses.AttackReady;
            return decision;
        }
    }
}
