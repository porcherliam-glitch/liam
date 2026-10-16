using System;
using System.Collections.Generic;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Where the dialogue cameras stand (GDD 03 "Dialogkamera", GDD 02 12.6). The axis runs from the player to the partner; all
    /// setups of one conversation stay on the same side of it (180° rule), <c>side</c> is +1 (right of the axis seen from the
    /// player) or −1. Shot: over the player's shoulder onto the partner's head, 1.4 m. Reverse shot: over the partner's shoulder
    /// onto the player. Close-up: 0.9 m in front of the partner's face, 30° off the axis. Two-shot: from the side of the middle,
    /// at least 3.5 m. If the two stand more than 4 m apart, only the two-shot fits. Pure geometry.
    /// </summary>
    public static class DialogueFraming
    {
        private const double RaiseMetres = 0.4d;

        /// <summary>The over-the-shoulder cameras stand a little above head height, so the near head sits low in the corner.</summary>
        private const double ShoulderLift = 0.2d;

        /// <summary>Room beside each person in the two-shot (metres).</summary>
        private const double WideBodyMargin = 0.8d;

        /// <summary>
        /// Usable tangent of the half horizontal view of the two-shot: 40° vertical at 4:3 gives 0.485; a little less keeps the
        /// people off the edges.
        /// </summary>
        private const double WideFrameTangent = 0.45d;

        /// <summary>The pose of a setup.</summary>
        /// <param name="setup">Setup.</param>
        /// <param name="playerFeet">Feet of the player.</param>
        /// <param name="partnerFeet">Feet of the partner.</param>
        /// <param name="side">+1 or −1.</param>
        public static CinePose Pose(DialogueSetup setup, CinePoint playerFeet, CinePoint partnerFeet, int side)
        {
            double s = side < 0 ? -1d : 1d;
            CinePoint axis = Axis(playerFeet, partnerFeet, out double distance);
            CinePoint right = new CinePoint(axis.Z, 0d, -axis.X);
            CinePoint playerHead = playerFeet + CinePoint.Up * DialogueCameraRules.HeadHeight;
            CinePoint partnerHead = partnerFeet + CinePoint.Up * DialogueCameraRules.HeadHeight;
            if (distance > DialogueCameraRules.FarPartnerMeters)
            {
                setup = DialogueSetup.Wide;
            }

            switch (setup)
            {
                case DialogueSetup.Shot:
                    return new CinePose(playerHead - axis * DialogueCameraRules.OverShoulderDistance + right * (DialogueCameraRules.ShoulderOffset * s) +
                                        CinePoint.Up * ShoulderLift, partnerHead, DialogueCameraRules.ShotFieldOfView);
                case DialogueSetup.ReverseShot:
                    return new CinePose(partnerHead + axis * DialogueCameraRules.OverShoulderDistance + right * (DialogueCameraRules.ShoulderOffset * s) +
                                        CinePoint.Up * ShoulderLift, playerHead, DialogueCameraRules.ShotFieldOfView);
                case DialogueSetup.Close:
                    double angle = DialogueCameraRules.CloseAngleDegrees * Math.PI / 180d;
                    CinePoint towardPlayer = axis * -Math.Cos(angle) + right * (Math.Sin(angle) * s);
                    return new CinePose(partnerHead + towardPlayer * DialogueCameraRules.CloseDistance, partnerHead, DialogueCameraRules.CloseFieldOfView);
                default:
                    CinePoint middle = CinePoint.Lerp(playerHead, partnerHead, 0.5d);
                    // Far enough back that both bodies (half the distance plus a margin each side) fit the frame, also at 4:3.
                    double away = Math.Max(DialogueCameraRules.WideDistance, (0.5d * distance + WideBodyMargin) / WideFrameTangent);
                    return new CinePose(middle + right * (away * s) + CinePoint.Up * 0.2d, middle, DialogueCameraRules.WideFieldOfView);
            }
        }

        /// <summary>
        /// The poses to try for a setup, best first (ClearShot principle): shot → shot raised → two-shot → close-up; reverse shot →
        /// reverse shot raised → close-up → two-shot; close-up → shot → two-shot; two-shot → two-shot raised → shot.
        /// </summary>
        /// <param name="setup">Wanted setup.</param>
        /// <param name="playerFeet">Feet of the player.</param>
        /// <param name="partnerFeet">Feet of the partner.</param>
        /// <param name="side">+1 or −1.</param>
        /// <param name="result">Filled with the poses and their setups.</param>
        public static void Candidates(DialogueSetup setup, CinePoint playerFeet, CinePoint partnerFeet, int side,
            List<KeyValuePair<DialogueSetup, CinePose>> result)
        {
            result.Clear();
            switch (setup)
            {
                case DialogueSetup.Shot:
                    Add(result, DialogueSetup.Shot, playerFeet, partnerFeet, side, 0d);
                    Add(result, DialogueSetup.Shot, playerFeet, partnerFeet, side, RaiseMetres);
                    Add(result, DialogueSetup.Wide, playerFeet, partnerFeet, side, 0d);
                    Add(result, DialogueSetup.Close, playerFeet, partnerFeet, side, 0d);
                    break;
                case DialogueSetup.ReverseShot:
                    Add(result, DialogueSetup.ReverseShot, playerFeet, partnerFeet, side, 0d);
                    Add(result, DialogueSetup.ReverseShot, playerFeet, partnerFeet, side, RaiseMetres);
                    Add(result, DialogueSetup.Close, playerFeet, partnerFeet, side, 0d);
                    Add(result, DialogueSetup.Wide, playerFeet, partnerFeet, side, 0d);
                    break;
                case DialogueSetup.Close:
                    Add(result, DialogueSetup.Close, playerFeet, partnerFeet, side, 0d);
                    Add(result, DialogueSetup.Shot, playerFeet, partnerFeet, side, 0d);
                    Add(result, DialogueSetup.Wide, playerFeet, partnerFeet, side, 0d);
                    break;
                default:
                    Add(result, DialogueSetup.Wide, playerFeet, partnerFeet, side, 0d);
                    Add(result, DialogueSetup.Wide, playerFeet, partnerFeet, side, RaiseMetres);
                    Add(result, DialogueSetup.Shot, playerFeet, partnerFeet, side, 0d);
                    break;
            }
        }

        /// <summary>
        /// The side of a conversation: the side the game camera is on now (the shortest blend into the dialogue); the other side
        /// only if the shot, the reverse shot or the two-shot is blocked here and all three are free there.
        /// </summary>
        /// <param name="gameCamera">Position of the game camera.</param>
        /// <param name="playerFeet">Feet of the player.</param>
        /// <param name="partnerFeet">Feet of the partner.</param>
        /// <param name="isBlocked">True if a pose has no free view (line of sight, room for the camera).</param>
        public static int ChooseSide(CinePoint gameCamera, CinePoint playerFeet, CinePoint partnerFeet, Func<CinePose, bool> isBlocked)
        {
            CinePoint axis = Axis(playerFeet, partnerFeet, out _);
            CinePoint right = new CinePoint(axis.Z, 0d, -axis.X);
            CinePoint middle = CinePoint.Lerp(playerFeet, partnerFeet, 0.5d);
            int side = CinePoint.Dot((gameCamera - middle).Flat, right) >= 0d ? 1 : -1;
            if (isBlocked == null || !AnyBlocked(playerFeet, partnerFeet, side, isBlocked) || AnyBlocked(playerFeet, partnerFeet, -side, isBlocked))
            {
                return side;
            }

            return -side;
        }

        /// <summary>Which side of the axis a point lies on (+1, −1; 0 on the axis).</summary>
        /// <param name="point">Point.</param>
        /// <param name="playerFeet">Feet of the player.</param>
        /// <param name="partnerFeet">Feet of the partner.</param>
        public static int SideOf(CinePoint point, CinePoint playerFeet, CinePoint partnerFeet)
        {
            CinePoint axis = Axis(playerFeet, partnerFeet, out _);
            CinePoint right = new CinePoint(axis.Z, 0d, -axis.X);
            double dot = CinePoint.Dot((point - CinePoint.Lerp(playerFeet, partnerFeet, 0.5d)).Flat, right);
            return dot > 1e-6 ? 1 : dot < -1e-6 ? -1 : 0;
        }

        private static bool AnyBlocked(CinePoint playerFeet, CinePoint partnerFeet, int side, Func<CinePose, bool> isBlocked)
        {
            return isBlocked(Pose(DialogueSetup.Shot, playerFeet, partnerFeet, side)) ||
                   isBlocked(Pose(DialogueSetup.ReverseShot, playerFeet, partnerFeet, side)) ||
                   isBlocked(Pose(DialogueSetup.Wide, playerFeet, partnerFeet, side));
        }

        private static void Add(List<KeyValuePair<DialogueSetup, CinePose>> result, DialogueSetup setup, CinePoint playerFeet, CinePoint partnerFeet,
            int side, double raise)
        {
            CinePose pose = Pose(setup, playerFeet, partnerFeet, side);
            result.Add(new KeyValuePair<DialogueSetup, CinePose>(setup, raise > 0d ? pose.Raised(raise) : pose));
        }

        private static CinePoint Axis(CinePoint playerFeet, CinePoint partnerFeet, out double distance)
        {
            CinePoint flat = (partnerFeet - playerFeet).Flat;
            distance = flat.Length;
            return distance > 0.01d ? flat * (1d / distance) : new CinePoint(0d, 0d, 1d);
        }
    }
}
