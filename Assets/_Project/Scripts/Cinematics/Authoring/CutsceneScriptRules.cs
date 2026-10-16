using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Dialogue;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Checks a <see cref="CutsceneScript"/> before the generator bakes it (S58): shots follow each other without gaps from 0 to
    /// the end and last long enough to read, moves stay inside their shot, a black shot is followed by a picture, the field of
    /// view stays sensible, and every text stays on screen long enough to read (<see cref="SubtitleTiming"/>) and fits one
    /// subtitle page (<see cref="SubtitlePager"/>). Pure logic; the findings are German, the generator stops on any of them.
    /// </summary>
    public static class CutsceneScriptRules
    {
        /// <summary>Longest cutscene in seconds.</summary>
        public const double MaxDurationSeconds = 60d;

        /// <summary>Shortest shot in seconds (GDD 02 12.6: no cut before 1.5 s).</summary>
        public const double MinShotSeconds = 1.5d;

        /// <summary>Smallest field of view in degrees.</summary>
        public const double MinFieldOfView = 20d;

        /// <summary>Largest field of view in degrees.</summary>
        public const double MaxFieldOfView = 70d;

        /// <summary>Tolerance for comparing times.</summary>
        public const double TimeTolerance = 0.01d;

        /// <summary>Checks a script; an empty list means it is fine.</summary>
        /// <param name="script">Script.</param>
        public static List<string> Check(CutsceneScript script)
        {
            var findings = new List<string>();
            if (script == null)
            {
                findings.Add("Zwischensequenz fehlt.");
                return findings;
            }

            string id = script.Id;
            if (id.Length <= CutsceneIds.Prefix.Length || !id.StartsWith(CutsceneIds.Prefix, StringComparison.Ordinal))
            {
                findings.Add("Zwischensequenz-ID '" + id + "' muss mit '" + CutsceneIds.Prefix + "' beginnen.");
            }

            if (!(script.Duration > 0d) || script.Duration > MaxDurationSeconds)
            {
                findings.Add(id + ": Länge " + Seconds(script.Duration) + " liegt nicht zwischen 0 und " + Seconds(MaxDurationSeconds) + ".");
            }

            CheckShots(script, findings);
            CheckCues(script, findings);
            CheckActivations(script, findings);
            return findings;
        }

        private static void CheckShots(CutsceneScript script, List<string> findings)
        {
            string id = script.Id;
            List<CutsceneShot> shots = script.Shots;
            if (shots.Count == 0)
            {
                findings.Add(id + ": keine Einstellung.");
                return;
            }

            double expectedStart = 0d;
            for (int i = 0; i < shots.Count; i++)
            {
                CutsceneShot shot = shots[i];
                if (shot == null)
                {
                    findings.Add(id + ": Einstellung " + (i + 1) + " fehlt.");
                    continue;
                }

                string name = id + "/" + shot.Name;
                if (Math.Abs(shot.Start - expectedStart) > TimeTolerance)
                {
                    findings.Add(name + ": beginnt bei " + Seconds(shot.Start) + ", erwartet " + Seconds(expectedStart) +
                                 (shot.Start > expectedStart ? " (Lücke)." : " (Überschneidung)."));
                }

                if (shot.End - shot.Start < MinShotSeconds - TimeTolerance)
                {
                    findings.Add(name + ": dauert nur " + Seconds(shot.End - shot.Start) + " (mindestens " + Seconds(MinShotSeconds) + ").");
                }

                if (shot.To.HasValue && (shot.MoveStart < shot.Start - TimeTolerance || shot.MoveEnd > shot.End + TimeTolerance ||
                                         shot.MoveEnd <= shot.MoveStart))
                {
                    findings.Add(name + ": Kamerafahrt " + Seconds(shot.MoveStart) + "–" + Seconds(shot.MoveEnd) + " liegt nicht in der Einstellung.");
                }

                if (shot.Black && (i == shots.Count - 1 || shots[i + 1] == null || shots[i + 1].Black))
                {
                    findings.Add(name + ": auf eine schwarze Einstellung muss ein Bild folgen.");
                }

                CheckFieldOfView(name, shot.From, findings);
                if (shot.To.HasValue)
                {
                    CheckFieldOfView(name, shot.To.Value, findings);
                }

                expectedStart = shot.End;
            }

            if (Math.Abs(expectedStart - script.Duration) > TimeTolerance)
            {
                findings.Add(id + ": die letzte Einstellung endet bei " + Seconds(expectedStart) + ", die Zwischensequenz bei " +
                             Seconds(script.Duration) + ".");
            }
        }

        private static void CheckFieldOfView(string name, in CinePose pose, List<string> findings)
        {
            if (pose.FieldOfView < MinFieldOfView || pose.FieldOfView > MaxFieldOfView || double.IsNaN(pose.FieldOfView))
            {
                findings.Add(name + ": Sichtfeld " + pose.FieldOfView.ToString("0", CultureInfo.InvariantCulture) + "° liegt nicht zwischen " +
                             MinFieldOfView.ToString("0", CultureInfo.InvariantCulture) + "° und " +
                             MaxFieldOfView.ToString("0", CultureInfo.InvariantCulture) + "°.");
            }
        }

        private static void CheckCues(CutsceneScript script, List<string> findings)
        {
            string id = script.Id;
            for (int i = 0; i < script.Cues.Count; i++)
            {
                CutsceneCue cue = script.Cues[i];
                if (cue == null)
                {
                    findings.Add(id + ": Eintrag " + (i + 1) + " fehlt.");
                    continue;
                }

                string name = id + "/" + KindName(cue.Kind) + " " + Seconds(cue.Start);
                if (cue.End <= cue.Start)
                {
                    findings.Add(name + ": endet nicht nach seinem Beginn.");
                    continue;
                }

                if (cue.Start < -TimeTolerance || cue.End > script.Duration + TimeTolerance)
                {
                    findings.Add(name + ": liegt nicht in der Zwischensequenz (0–" + Seconds(script.Duration) + ").");
                }

                if (cue.Kind == CutsceneCueKind.Fade)
                {
                    if (cue.FadeIn + cue.FadeOut > cue.End - cue.Start + TimeTolerance)
                    {
                        findings.Add(name + ": Auf- und Abblende (" + Seconds(cue.FadeIn) + " + " + Seconds(cue.FadeOut) +
                                     ") sind länger als der Eintrag.");
                    }

                    continue;
                }

                string text = cue.Text.Trim();
                if (text.Length == 0)
                {
                    findings.Add(name + ": Text fehlt.");
                    continue;
                }

                double needed = SubtitleTiming.DisplaySeconds(text.Length);
                if (cue.End - cue.Start < needed - TimeTolerance)
                {
                    findings.Add(name + ": „" + text + "“ steht " + Seconds(cue.End - cue.Start) + ", zum Lesen braucht er " + Seconds(needed) + ".");
                }

                int pages = SubtitlePager.Paginate(text).Count;
                if (pages > 1)
                {
                    findings.Add(name + ": „" + text + "“ braucht " + pages + " Seiten (höchstens 2 Zeilen zu " + SubtitlePager.CharactersPerLine +
                                 " Zeichen).");
                }
            }
        }

        private static void CheckActivations(CutsceneScript script, List<string> findings)
        {
            string id = script.Id;
            foreach (CutsceneActivation activation in script.Activations)
            {
                if (activation == null)
                {
                    continue;
                }

                if (activation.TargetKey.Length == 0)
                {
                    findings.Add(id + ": Requisite ohne Namen.");
                }

                if (activation.End <= activation.Start || activation.Start < -TimeTolerance || activation.End > script.Duration + TimeTolerance)
                {
                    findings.Add(id + "/" + activation.TargetKey + ": sichtbar " + Seconds(activation.Start) + "–" + Seconds(activation.End) +
                                 " liegt nicht in der Zwischensequenz.");
                }
            }
        }

        private static string KindName(CutsceneCueKind kind)
        {
            switch (kind)
            {
                case CutsceneCueKind.Caption:
                    return "Texttafel";
                case CutsceneCueKind.Fade:
                    return "Abblende";
                default:
                    return "Untertitel";
            }
        }

        private static string Seconds(double value)
        {
            return value.ToString("0.0#", CultureInfo.InvariantCulture) + " s";
        }
    }
}
