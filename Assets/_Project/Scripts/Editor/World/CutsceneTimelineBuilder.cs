using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Aetherfall.Cinematics;
using Aetherfall.Cinematics.Playback;
using Aetherfall.World;
using Unity.Cinemachine;
using UnityEditor;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Bakes a <see cref="CutsceneScript"/> into the world scene (S58): a cutscene root with <see cref="PlayableDirector"/> and
    /// <see cref="TimelineCutscenePlayer"/>, one static Cinemachine camera per pose under "Kameras" (switched on only while it plays),
    /// the props under "Requisiten", and the Timeline asset with a Cinemachine track (overlapping clips of two cameras form a camera
    /// move) and an activation track per prop.
    /// </summary>
    /// <remarks>
    /// The Timeline asset is rebuilt only when its timing changes (the signature in the name of the camera track); otherwise its
    /// tracks are reused, so a regenerated scene keeps pointing to the same track objects. Camera poses live in the scene: a pose
    /// whose view is blocked is raised in 1 m steps (warning), and every camera stays at least 0.5 m above the ground.
    /// Never edit the Timeline by hand; change the script (EichentalCutscenes) instead.
    /// </remarks>
    public static class CutsceneTimelineBuilder
    {
        /// <summary>Name of the camera track (followed by the signature).</summary>
        public const string CameraTrackName = "Kamera";

        /// <summary>Name of the child with the shot cameras.</summary>
        public const string CameraRootName = "Kameras";

        /// <summary>Name of the child with the props.</summary>
        public const string PropRootName = "Requisiten";

        /// <summary>Priority of the shot cameras: below every game camera, so only the Timeline uses them.</summary>
        public const int ShotPriority = -10;

        private const float MinAboveGround = 0.5f;
        private const int MaxRaiseSteps = 10;

        /// <summary>Builds the cutscene into the open scene.</summary>
        /// <param name="script">Cutscene script.</param>
        /// <param name="parent">Parent in the scene ("Spiel/Zwischensequenzen").</param>
        /// <param name="brain">Brain of the main camera (binding of the camera track).</param>
        /// <param name="playablePath">Path of the Timeline asset (.playable).</param>
        /// <param name="heights">Height field (cameras stay above the ground).</param>
        /// <param name="solidMask">Layers that block the view (environment, terrain).</param>
        /// <param name="props">Prop objects by key (built by the caller, set inactive here).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The player, or null if the script has errors.</returns>
        public static TimelineCutscenePlayer Build(CutsceneScript script, Transform parent, CinemachineBrain brain, string playablePath,
            LayoutHeightField heights, int solidMask, IReadOnlyDictionary<string, GameObject> props, TestGroundReport report)
        {
            List<string> findings = CutsceneScriptRules.Check(script);
            if (findings.Count > 0)
            {
                foreach (string finding in findings)
                {
                    report.Warning("Zwischensequenz: " + finding);
                }

                report.Warning("Zwischensequenz " + (script != null ? script.Id : "?") + " nicht gebaut (" + findings.Count + " Fehler im Drehbuch).");
                return null;
            }

            if (brain == null)
            {
                report.Warning("Zwischensequenz " + script.Id + ": die Hauptkamera hat keinen CinemachineBrain – nicht gebaut.");
                return null;
            }

            int slash = playablePath.LastIndexOf('/');
            if (slash <= 0 || !TestGroundAssets.EnsureFolder(playablePath.Substring(0, slash), report))
            {
                return null;
            }

            List<ClipSpec> clips = ClipsOf(script);
            TimelineAsset timeline = EnsureTimeline(script, clips, playablePath, report, out CinemachineTrack cameraTrack,
                out Dictionary<string, ActivationTrack> activationTracks);
            if (timeline == null)
            {
                return null;
            }

            Physics.SyncTransforms();
            var root = new GameObject(script.Id);
            root.transform.SetParent(parent, false);
            PlayableDirector director = root.AddComponent<PlayableDirector>();
            director.playOnAwake = false;
            director.playableAsset = timeline;
            director.extrapolationMode = DirectorWrapMode.None;
            director.timeUpdateMode = DirectorUpdateMode.GameTime;

            var cameraRoot = new GameObject(CameraRootName);
            cameraRoot.transform.SetParent(root.transform, false);
            var propRoot = new GameObject(PropRootName);
            propRoot.transform.SetParent(root.transform, false);

            director.SetGenericBinding(cameraTrack, brain);
            int raised = 0;
            foreach (ClipSpec clip in clips)
            {
                CinemachineCamera vcam = CreateCamera(clip.CameraName, clip.Pose, cameraRoot.transform, heights, solidMask, report, ref raised);
                director.SetReferenceValue(clip.ExposedName, vcam);
            }

            foreach (CutsceneActivation activation in script.Activations)
            {
                if (props == null || !props.TryGetValue(activation.TargetKey, out GameObject prop) || prop == null)
                {
                    report.Warning("Zwischensequenz " + script.Id + ": Requisite '" + activation.TargetKey + "' fehlt.");
                    continue;
                }

                prop.transform.SetParent(propRoot.transform, true);
                prop.SetActive(false);
                if (activationTracks.TryGetValue(activation.TargetKey, out ActivationTrack track))
                {
                    director.SetGenericBinding(track, prop);
                }
            }

            cameraRoot.SetActive(false);
            TimelineCutscenePlayer player = root.AddComponent<TimelineCutscenePlayer>();
            TestGroundFields.SetReference(player, "director", director, report);
            TestGroundFields.SetString(player, "cutsceneId", script.Id, report);
            TestGroundFields.SetReference(player, "cameraRoot", cameraRoot, report);
            WriteCues(player, script.Cues, report);
            report.Info("Zwischensequenz " + script.Id + ": " + script.Duration.ToString("0.0", CultureInfo.InvariantCulture) + " s, " +
                        script.Shots.Count + " Einstellungen, " + clips.Count + " Kameras, " + script.Cues.Count + " Einträge (" + playablePath + ")" +
                        (raised > 0 ? ", " + raised + " Kameras angehoben" : string.Empty) + ".");
            return player;
        }

        /// <summary>The Timeline signature of a script: changes only when the timing or the names of the clips change.</summary>
        /// <param name="script">Cutscene script.</param>
        public static string Signature(CutsceneScript script)
        {
            var text = new StringBuilder();
            text.Append(script.Id).Append('|').Append(Format(script.Duration));
            foreach (ClipSpec clip in ClipsOf(script))
            {
                text.Append('|').Append(clip.ExposedName).Append('@').Append(Format(clip.Start)).Append('+').Append(Format(clip.Duration));
            }

            foreach (CutsceneActivation activation in script.Activations)
            {
                text.Append("|A:").Append(activation.TargetKey).Append('@').Append(Format(activation.Start)).Append('-').Append(Format(activation.End));
            }

            // FNV-1a, 32 bit: stable across runs and platforms (string.GetHashCode is not).
            uint hash = 2166136261u;
            string value = text.ToString();
            for (int i = 0; i < value.Length; i++)
            {
                hash ^= value[i];
                hash *= 16777619u;
            }

            return hash.ToString("x8", CultureInfo.InvariantCulture);
        }

        private static TimelineAsset EnsureTimeline(CutsceneScript script, List<ClipSpec> clips, string path, TestGroundReport report,
            out CinemachineTrack cameraTrack, out Dictionary<string, ActivationTrack> activationTracks)
        {
            string trackName = CameraTrackName + " " + Signature(script);
            activationTracks = new Dictionary<string, ActivationTrack>(StringComparer.Ordinal);
            cameraTrack = null;
            var timeline = AssetDatabase.LoadAssetAtPath<TimelineAsset>(path);
            if (timeline != null && TryReuse(timeline, script, trackName, out cameraTrack, activationTracks))
            {
                report.Info("Timeline " + path + " unverändert (" + trackName + ").");
                return timeline;
            }

            if (timeline == null)
            {
                timeline = ScriptableObject.CreateInstance<TimelineAsset>();
                AssetDatabase.CreateAsset(timeline, path);
            }
            else
            {
                foreach (TrackAsset track in timeline.GetRootTracks().ToList())
                {
                    timeline.DeleteTrack(track);
                }

                // Leftovers (e.g. with undo off) would stay in the file as orphans.
                foreach (Object sub in AssetDatabase.LoadAllAssetRepresentationsAtPath(path))
                {
                    if (sub != null && sub != timeline)
                    {
                        Object.DestroyImmediate(sub, true);
                    }
                }
            }

            timeline.durationMode = TimelineAsset.DurationMode.FixedLength;
            timeline.fixedDuration = script.Duration;
            cameraTrack = timeline.CreateTrack<CinemachineTrack>(trackName);
            foreach (ClipSpec spec in clips)
            {
                TimelineClip clip = cameraTrack.CreateClip<CinemachineShot>();
                clip.start = spec.Start;
                clip.duration = spec.Duration;
                clip.displayName = spec.CameraName;
                var shot = (CinemachineShot)clip.asset;
                shot.DisplayName = spec.CameraName;
                shot.VirtualCamera.exposedName = new PropertyName(spec.ExposedName);
            }

            foreach (CutsceneActivation activation in script.Activations)
            {
                ActivationTrack track = timeline.CreateTrack<ActivationTrack>(activation.TargetKey);
                track.postPlaybackState = ActivationTrack.PostPlaybackState.Inactive;
                TimelineClip clip = track.CreateDefaultClip();
                clip.start = activation.Start;
                clip.duration = activation.End - activation.Start;
                clip.displayName = activation.TargetKey;
                activationTracks[activation.TargetKey] = track;
            }

            EditorUtility.SetDirty(timeline);
            AssetDatabase.SaveAssets();
            report.Info("Timeline " + path + " neu gebaut (" + trackName + ").");
            return timeline;
        }

        private static bool TryReuse(TimelineAsset timeline, CutsceneScript script, string trackName, out CinemachineTrack cameraTrack,
            Dictionary<string, ActivationTrack> activationTracks)
        {
            cameraTrack = null;
            foreach (TrackAsset track in timeline.GetRootTracks())
            {
                if (track is CinemachineTrack camera && camera.name == trackName)
                {
                    cameraTrack = camera;
                }
                else if (track is ActivationTrack activation)
                {
                    activationTracks[activation.name] = activation;
                }
            }

            if (cameraTrack == null || Math.Abs(timeline.fixedDuration - script.Duration) > 0.0001d)
            {
                activationTracks.Clear();
                return false;
            }

            foreach (CutsceneActivation activation in script.Activations)
            {
                if (!activationTracks.ContainsKey(activation.TargetKey))
                {
                    activationTracks.Clear();
                    cameraTrack = null;
                    return false;
                }
            }

            return true;
        }

        private static CinemachineCamera CreateCamera(string name, CinePose pose, Transform parent, LayoutHeightField heights, int solidMask,
            TestGroundReport report, ref int raised)
        {
            Vector3 position = ToVector(pose.Position);
            Vector3 target = ToVector(pose.LookAt);
            float ground = (float)heights.Height(position.x, position.z) + MinAboveGround;
            if (position.y < ground)
            {
                position.y = ground;
            }

            int steps = 0;
            while (steps < MaxRaiseSteps && Physics.Linecast(position, target, solidMask, QueryTriggerInteraction.Ignore))
            {
                position.y += 1f;
                steps++;
            }

            if (steps > 0)
            {
                raised++;
                bool clear = !Physics.Linecast(position, target, solidMask, QueryTriggerInteraction.Ignore);
                report.Warning("Zwischensequenz-Kamera '" + name + "': Sicht verdeckt – um " + steps + " m angehoben" +
                               (clear ? "." : ", Sicht immer noch verdeckt (Drehbuch in EichentalCutscenes anpassen)."));
            }

            var cameraObject = new GameObject(name);
            cameraObject.transform.SetParent(parent, false);
            Vector3 look = target - position;
            cameraObject.transform.SetPositionAndRotation(position, look.sqrMagnitude > 1e-6f ? Quaternion.LookRotation(look, Vector3.up) : Quaternion.identity);
            CinemachineCamera vcam = cameraObject.AddComponent<CinemachineCamera>();
            vcam.Priority = ShotPriority;
            LensSettings lens = vcam.Lens;
            lens.FieldOfView = (float)pose.FieldOfView;
            lens.Dutch = (float)pose.Dutch;
            lens.NearClipPlane = 0.1f;
            vcam.Lens = lens;
            return vcam;
        }

        private static void WriteCues(TimelineCutscenePlayer player, List<CutsceneCue> cues, TestGroundReport report)
        {
            SerializedProperty list = TestGroundFields.Find(player, "cues", report, out SerializedObject serialized);
            if (list == null)
            {
                return;
            }

            list.arraySize = cues.Count;
            for (int i = 0; i < cues.Count; i++)
            {
                CutsceneCue cue = cues[i];
                SerializedProperty element = list.GetArrayElementAtIndex(i);
                element.FindPropertyRelative("kind").enumValueIndex = (int)cue.Kind;
                element.FindPropertyRelative("start").floatValue = cue.Start;
                element.FindPropertyRelative("end").floatValue = cue.End;
                element.FindPropertyRelative("speaker").stringValue = cue.Speaker;
                element.FindPropertyRelative("text").stringValue = cue.Text;
                element.FindPropertyRelative("fadeIn").floatValue = cue.FadeIn;
                element.FindPropertyRelative("fadeOut").floatValue = cue.FadeOut;
                element.FindPropertyRelative("color").enumValueIndex = (int)cue.Color;
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static List<ClipSpec> ClipsOf(CutsceneScript script)
        {
            var clips = new List<ClipSpec>();
            foreach (CutsceneShot shot in script.Shots)
            {
                string baseName = script.Id + "/" + shot.Name;
                if (!shot.To.HasValue)
                {
                    clips.Add(new ClipSpec(shot.Name, baseName + "/a", shot.Start, shot.End - shot.Start, shot.From));
                    continue;
                }

                // A move: the first camera until the move ends, the second from its start – Timeline blends the overlap.
                clips.Add(new ClipSpec(shot.Name + " (Anfang)", baseName + "/a", shot.Start, shot.MoveEnd - shot.Start, shot.From));
                clips.Add(new ClipSpec(shot.Name + " (Ende)", baseName + "/b", shot.MoveStart, shot.End - shot.MoveStart, shot.To.Value));
            }

            return clips;
        }

        private static Vector3 ToVector(CinePoint point)
        {
            return new Vector3((float)point.X, (float)point.Y, (float)point.Z);
        }

        private static string Format(double value)
        {
            return value.ToString("0.###", CultureInfo.InvariantCulture);
        }

        private readonly struct ClipSpec
        {
            public ClipSpec(string cameraName, string exposedName, double start, double duration, CinePose pose)
            {
                CameraName = cameraName;
                ExposedName = exposedName;
                Start = start;
                Duration = duration;
                Pose = pose;
            }

            public string CameraName { get; }

            public string ExposedName { get; }

            public double Start { get; }

            public double Duration { get; }

            public CinePose Pose { get; }
        }
    }
}
