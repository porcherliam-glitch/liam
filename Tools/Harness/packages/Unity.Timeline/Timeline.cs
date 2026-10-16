// HARNESS ONLY - compile-only stub of com.unity.timeline 1.8 (assembly "Unity.Timeline").
// Only the members the Aetherfall code uses (the cutscene baker CutsceneTimelineBuilder): TimelineAsset, TrackAsset,
// TimelineClip, ActivationTrack. PlayableAsset, PlayableDirector and ExposedReference come from UnityEngine itself.
// The Cinemachine Timeline types (CinemachineTrack, CinemachineShot; compiled with CINEMACHINE_TIMELINE in the real package)
// live here as well, so the Cinemachine stub needs no reference to this one.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Playables;

namespace UnityEngine.Timeline
{
    internal static class HarnessStub
    {
        internal static Exception NotSupported()
        {
            return new NotSupportedException("Harness stub of com.unity.timeline: only for compiling, behaviour needs Unity.");
        }
    }

    public class TimelineAsset : PlayableAsset
    {
        public enum DurationMode
        {
            BasedOnClips,
            FixedLength
        }

        public DurationMode durationMode { get => throw HarnessStub.NotSupported(); set => throw HarnessStub.NotSupported(); }

        public double fixedDuration { get => throw HarnessStub.NotSupported(); set => throw HarnessStub.NotSupported(); }

        public IEnumerable<TrackAsset> GetRootTracks() { throw HarnessStub.NotSupported(); }

        public T CreateTrack<T>(string trackName) where T : TrackAsset, new() { throw HarnessStub.NotSupported(); }

        public bool DeleteTrack(TrackAsset track) { throw HarnessStub.NotSupported(); }

        public override Playable CreatePlayable(PlayableGraph graph, GameObject owner) { throw HarnessStub.NotSupported(); }
    }

    public abstract class TrackAsset : PlayableAsset
    {
        public IEnumerable<TimelineClip> GetClips() { throw HarnessStub.NotSupported(); }

        public TimelineClip CreateDefaultClip() { throw HarnessStub.NotSupported(); }

        public TimelineClip CreateClip<T>() where T : ScriptableObject, IPlayableAsset { throw HarnessStub.NotSupported(); }

        public override Playable CreatePlayable(PlayableGraph graph, GameObject owner) { throw HarnessStub.NotSupported(); }
    }

    public sealed class TimelineClip
    {
        public double start { get => throw HarnessStub.NotSupported(); set => throw HarnessStub.NotSupported(); }

        public double duration { get => throw HarnessStub.NotSupported(); set => throw HarnessStub.NotSupported(); }

        public string displayName { get => throw HarnessStub.NotSupported(); set => throw HarnessStub.NotSupported(); }

        public Object asset { get => throw HarnessStub.NotSupported(); set => throw HarnessStub.NotSupported(); }
    }

    public class ActivationTrack : TrackAsset
    {
        public enum PostPlaybackState
        {
            Active,
            Inactive,
            Revert,
            LeaveAsIs
        }

        public PostPlaybackState postPlaybackState { get => throw HarnessStub.NotSupported(); set => throw HarnessStub.NotSupported(); }
    }
}

namespace Unity.Cinemachine
{
    // com.unity.cinemachine 3.1 Runtime/Timeline (CINEMACHINE_TIMELINE): the track bound to the brain and its shot clips.
    public class CinemachineTrack : UnityEngine.Timeline.TrackAsset
    {
        public int TrackPriority;
    }

    public sealed class CinemachineShot : PlayableAsset
    {
        public string DisplayName;
        public ExposedReference<CinemachineVirtualCameraBase> VirtualCamera;

        public override Playable CreatePlayable(PlayableGraph graph, GameObject owner) { throw new NotSupportedException("Harness stub."); }
    }
}
