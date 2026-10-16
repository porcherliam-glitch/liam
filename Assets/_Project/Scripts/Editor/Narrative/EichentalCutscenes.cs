using System;
using Aetherfall.Cinematics;
using Aetherfall.World;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// The cutscene scripts of Eichental (S58), the single source of the generated Timelines: camera poses are computed from the
    /// region layout (player start, Dorfplatz, rift, Lina's marker) and its height field, so they follow when the layout moves.
    /// Pure logic; the world builder bakes the result (CutsceneTimelineBuilder). The German texts are drafts for the narrative
    /// review.
    /// </summary>
    /// <remarks>
    /// <c>cs.prolog.erwachen</c> (GDD 02 11.1, stage s10 of "Asche über Eichental"), 26.5 s:
    /// 1 Titelkarte (black, caption) – 2 Riss über dem Dorf (crane over the burning village toward the tear) – 3 Lina im Licht
    /// (dolly toward Lina in front of the rift, a light column, white flash) – 4 Schwarz (caption) – 5 Erwachen (low behind the
    /// player, rising into the exact rest pose of the exploration camera). A new game starts at 10:00, so the texts say "Tag".
    /// </remarks>
    public static class EichentalCutscenes
    {
        /// <summary>Location id of the Dorfplatz.</summary>
        public const string DorfplatzId = "loc.eichental.dorfplatz";

        /// <summary>NPC id of Lina (her prologue marker stands in the light of the rift).</summary>
        public const string LinaId = "npc.eichental.lina";

        /// <summary>Length of the prologue cutscene in seconds.</summary>
        public const double PrologueDuration = 26.5d;

        /// <summary>Key of the light column over Lina (a prop of the cutscene).</summary>
        public const string LightColumnKey = "Lichtsäule";

        /// <summary>Height of the light column above Lina's feet.</summary>
        public const double LightColumnHeight = 12d;

        /// <summary>
        /// Direction of the Lina shot, in degrees from the line "tear → Lina" (0 = straight behind her, 180 = between her and the
        /// tear): a little in front of her profile.
        /// </summary>
        public const double LinaSideDegrees = 110d;

        /// <summary>Height of the player's feet above the ground at the spawn point (the generator lifts it a little).</summary>
        public const double SpawnLift = 0.05d;

        /// <summary>Caption of the title card.</summary>
        public const string TitleText = "Eichental, am Tag des Erntefests.";

        /// <summary>Subtitle over the rift shot (narrator).</summary>
        public const string RiftText = "Mitten im Fest reißt der Himmel über dem Dorf auf.";

        /// <summary>Speaker of the light shot.</summary>
        public const string LinaSpeaker = "Lina";

        /// <summary>Lina's line.</summary>
        public const string LinaText = "Das Licht zieht mich fort! Halt mich fest!";

        /// <summary>Caption of the black shot.</summary>
        public const string BlackText = "Dann nur noch Feuer und Rauch.";

        /// <summary>Speaker of the waking shot.</summary>
        public const string VoiceSpeaker = "Eine Stimme";

        /// <summary>The voice calling for help (leads into the s10 text "Irgendwo ruft jemand um Hilfe.").</summary>
        public const string VoiceText = "Hilfe! Hört mich denn niemand?";

        /// <summary>Builds the prologue script.</summary>
        /// <param name="layout">Eichental layout.</param>
        /// <param name="heights">Its height field.</param>
        /// <param name="rest">Rest pose of the exploration camera.</param>
        /// <exception cref="ArgumentException">A needed anchor is missing in the layout.</exception>
        public static CutsceneScript Prologue(RegionLayout layout, LayoutHeightField heights, ExploreRestPose rest)
        {
            if (layout == null)
            {
                throw new ArgumentNullException(nameof(layout));
            }

            if (heights == null)
            {
                throw new ArgumentNullException(nameof(heights));
            }

            if (layout.PlayerStart == null || layout.Rift == null)
            {
                throw new ArgumentException("Das Layout hat keinen Startpunkt oder keinen Riss – kein Prolog möglich.", nameof(layout));
            }

            LayoutLocation dorfplatz = FindLocation(layout, DorfplatzId);
            LayoutNpcMarker lina = FindNpc(layout, LinaId);
            if (dorfplatz == null || lina == null)
            {
                throw new ArgumentException("Das Layout braucht den Ort '" + DorfplatzId + "' und den Platzhalter '" + LinaId + "' für den Prolog.",
                    nameof(layout));
            }

            var ground = new Ground(heights);
            LayoutPoint start = layout.PlayerStart.Position;
            double yaw = layout.PlayerStart.Yaw * Math.PI / 180d;
            var forward = new CinePoint(Math.Sin(yaw), 0d, Math.Cos(yaw));
            var right = new CinePoint(forward.Z, 0d, -forward.X);
            LayoutPoint square = dorfplatz.Center;
            LayoutPoint rift = layout.Rift.Center;
            LayoutPoint linaFeet = lina.Position;
            CinePoint away = new CinePoint(linaFeet.X - rift.X, 0d, linaFeet.Z - rift.Z).Normalized;
            if (away.Length < 0.5d)
            {
                // Lina stands in the very centre: look at her from the south.
                away = new CinePoint(0d, 0d, -1d);
            }

            // 2: crane down over the burning village toward the glowing tear.
            CinePose riftHigh = new CinePose(ground.At(square.X - 10d, square.Z - 22d, 24d), ground.At(rift.X, rift.Z, 14d), 50d);
            CinePose riftLow = new CinePose(ground.At(square.X - 2d, square.Z - 14d, 19d), ground.At(rift.X, rift.Z, 10d), 44d);

            // 3: dolly toward Lina from her side, a little in front of her: her face and the glowing tear she looks into are both in
            // the picture (she faces the tear, so a camera straight behind or in front would show only her back or block the tear).
            double sideAngle = LinaSideDegrees * Math.PI / 180d;
            CinePoint beside = away * Math.Cos(sideAngle) + new CinePoint(away.Z, 0d, -away.X) * Math.Sin(sideAngle);
            CinePoint linaXz = new CinePoint(linaFeet.X, 0d, linaFeet.Z);
            CinePoint towardTear = CinePoint.Lerp(linaXz, new CinePoint(rift.X, 0d, rift.Z), 0.3d);
            CinePoint linaPoint = ground.At(towardTear.X, towardTear.Z, 1.4d);
            CinePoint farXz = linaXz + beside * 6d;
            CinePoint nearXz = linaXz + beside * 4.5d;
            CinePose linaFar = new CinePose(ground.At(farXz.X, farXz.Z, 1.5d), linaPoint, 38d);
            CinePose linaNear = new CinePose(ground.At(nearXz.X, nearXz.Z, 1.4d), linaPoint, 32d);

            // 5: low behind the player on the right, tilted; then rising into the rest pose of the exploration camera.
            CinePoint feet = ground.At(start.X, start.Z, SpawnLift);
            CinePoint lowXz = new CinePoint(start.X, 0d, start.Z) + right * 2.4d - forward * 1.6d;
            CinePose wakeLow = new CinePose(ground.At(lowXz.X, lowXz.Z, 0.45d), ground.At(start.X, start.Z, 1.2d), 42d, 8d);
            CinePose handOver = rest.PoseFor(feet, forward);

            var script = new CutsceneScript(CutsceneIds.PrologueAwakening, PrologueDuration);
            script.Shots.Add(new CutsceneShot("Titelkarte", 0d, 3.5d, riftHigh, black: true));
            script.Shots.Add(new CutsceneShot("Riss über dem Dorf", 3.5d, 9.5d, riftHigh, riftLow, 3.7d, 9.3d));
            script.Shots.Add(new CutsceneShot("Lina im Licht", 9.5d, 15.0d, linaFar, linaNear, 9.7d, 14.6d));
            script.Shots.Add(new CutsceneShot("Schwarz", 15.0d, 18.5d, wakeLow, black: true));
            script.Shots.Add(new CutsceneShot("Erwachen", 18.5d, PrologueDuration, wakeLow, handOver, 22.0d, 25.5d));

            script.Cues.Add(CutsceneCue.Fade(0f, 4.5f, 0f, 1.0f, CutsceneFadeColor.Black));
            script.Cues.Add(CutsceneCue.Caption(0.3f, 3.4f, TitleText));
            script.Cues.Add(CutsceneCue.Subtitle(4.7f, 9.3f, string.Empty, RiftText));
            script.Cues.Add(CutsceneCue.Subtitle(10.3f, 14.0f, LinaSpeaker, LinaText));
            script.Cues.Add(CutsceneCue.Fade(14.2f, 15.0f, 0.5f, 0f, CutsceneFadeColor.White));
            script.Cues.Add(CutsceneCue.Fade(14.8f, 20.0f, 0.2f, 1.5f, CutsceneFadeColor.Black));
            script.Cues.Add(CutsceneCue.Caption(15.4f, 18.3f, BlackText));
            script.Cues.Add(CutsceneCue.Subtitle(20.3f, 23.4f, VoiceSpeaker, VoiceText));

            script.Activations.Add(new CutsceneActivation(LightColumnKey, 9.5d, 15.0d));
            return script;
        }

        /// <summary>Where the light column stands (world metres): above Lina's feet.</summary>
        /// <param name="layout">Eichental layout.</param>
        /// <param name="heights">Its height field.</param>
        public static CinePoint LightColumnPosition(RegionLayout layout, LayoutHeightField heights)
        {
            LayoutNpcMarker lina = FindNpc(layout, LinaId);
            LayoutPoint at = lina != null ? lina.Position : layout.Rift.Center;
            return new Ground(heights).At(at.X, at.Z, LightColumnHeight);
        }

        private static LayoutLocation FindLocation(RegionLayout layout, string id)
        {
            foreach (LayoutLocation location in layout.Locations)
            {
                if (location != null && string.Equals(location.Id, id, StringComparison.Ordinal))
                {
                    return location;
                }
            }

            return null;
        }

        private static LayoutNpcMarker FindNpc(RegionLayout layout, string npcId)
        {
            foreach (LayoutNpcMarker marker in layout.NpcMarkers)
            {
                if (marker != null && string.Equals(marker.NpcId, npcId, StringComparison.Ordinal))
                {
                    return marker;
                }
            }

            return null;
        }

        private readonly struct Ground
        {
            private readonly LayoutHeightField _heights;

            public Ground(LayoutHeightField heights)
            {
                _heights = heights;
            }

            /// <summary>A point <paramref name="above"/> metres over the ground at (x, z).</summary>
            public CinePoint At(double x, double z, double above)
            {
                return new CinePoint(x, _heights.Height(x, z) + above, z);
            }
        }
    }
}
