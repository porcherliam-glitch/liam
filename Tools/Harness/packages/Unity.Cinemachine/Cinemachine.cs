// HARNESS ONLY - compile-only stub of com.unity.cinemachine 3.1 (assembly "Unity.Cinemachine").
// Only the members the Aetherfall code uses; field names and types follow the release/3.1 sources
// (CinemachineCamera, CinemachineOrbitalFollow, CinemachineRotationComposer, CinemachineDeoccluder,
// CinemachineBrain, InputAxis, LensSettings, CameraTarget, ScreenComposerSettings, CinemachineBlendDefinition,
// PrioritySettings, CinemachineCore.Stage, CinemachineThirdPersonFollow, CinemachineTargetGroup,
// CinemachineImpulseDefinition, CinemachineImpulseSource, CinemachineImpulseListener).
using System;
using Unity.Cinemachine.TargetTracking;
using UnityEngine;

namespace Unity.Cinemachine
{
    internal static class HarnessStub
    {
        internal static Exception NotSupported()
        {
            return new NotSupportedException("Harness stub of com.unity.cinemachine: only for compiling, behaviour needs Unity.");
        }
    }

    [Serializable]
    public struct CameraTarget
    {
        public Transform TrackingTarget;
        public Transform LookAtTarget;
        public bool CustomLookAtTarget;
    }

    [Serializable]
    public struct LensSettings
    {
        public float FieldOfView;
        public float OrthographicSize;
        public float NearClipPlane;
        public float FarClipPlane;
        public float Dutch;
        public static LensSettings Default => throw HarnessStub.NotSupported();
    }

    // release/3.1 Runtime/Core/PrioritySettings.cs: Value is a property, implicit conversions to and from int.
    [Serializable]
    public struct PrioritySettings
    {
        public bool Enabled;
        [SerializeField] int m_Value;

        public int Value
        {
            readonly get => Enabled ? m_Value : 0;
            set { m_Value = value; Enabled = true; }
        }

        public static implicit operator int(PrioritySettings prioritySettings) => prioritySettings.Value;

        public static implicit operator PrioritySettings(int priority) => new PrioritySettings { Value = priority, Enabled = true };
    }

    // release/3.1 Runtime/Core/CinemachineCore.cs (static class): only the pipeline stages.
    public static class CinemachineCore
    {
        public enum Stage
        {
            Body,
            Aim,
            Noise,
            Finalize
        }
    }

    public abstract class CinemachineVirtualCameraBase : MonoBehaviour
    {
        public PrioritySettings Priority = new PrioritySettings();
        public virtual bool PreviousStateIsValid { get; set; }
        public virtual Transform LookAt { get; set; }
        public virtual Transform Follow { get; set; }
        public void CancelDamping(bool updateNow = false) { throw HarnessStub.NotSupported(); }
        public virtual void OnTargetObjectWarped(Transform target, Vector3 positionDelta) { throw HarnessStub.NotSupported(); }
        public virtual void ForceCameraPosition(Vector3 pos, Quaternion rot) { throw HarnessStub.NotSupported(); }
    }

    public class CinemachineCamera : CinemachineVirtualCameraBase
    {
        public CameraTarget Target;
        public LensSettings Lens = LensSettings.Default;
    }

    public abstract class CinemachineComponentBase : MonoBehaviour
    {
    }

    public abstract class CinemachineExtension : MonoBehaviour
    {
    }

    [Serializable]
    public struct InputAxis
    {
        public float Value;
        public float Center;
        public Vector2 Range;
        public bool Wrap;
        public RecenteringSettings Recentering;
        public RestrictionFlags Restrictions;

        public float ClampValue(float v) { throw HarnessStub.NotSupported(); }
        public float GetNormalizedValue() { throw HarnessStub.NotSupported(); }
        public float GetClampedValue() { throw HarnessStub.NotSupported(); }
        public void Validate() { throw HarnessStub.NotSupported(); }
        public void Reset() { throw HarnessStub.NotSupported(); }
        public bool TrackValueChange() { throw HarnessStub.NotSupported(); }
        public void UpdateRecentering(float deltaTime, bool forceCancel) { throw HarnessStub.NotSupported(); }
        public void UpdateRecentering(float deltaTime, bool forceCancel, float center) { throw HarnessStub.NotSupported(); }
        public void TriggerRecentering() { throw HarnessStub.NotSupported(); }
        public void CancelRecentering() { throw HarnessStub.NotSupported(); }
        public static InputAxis DefaultMomentary => throw HarnessStub.NotSupported();

        [Serializable]
        public struct RecenteringSettings
        {
            public bool Enabled;
            public float Wait;
            public float Time;
            public static RecenteringSettings Default => throw HarnessStub.NotSupported();
            public void Validate() { throw HarnessStub.NotSupported(); }
        }

        [Flags]
        public enum RestrictionFlags
        {
            None = 0,
            RangeIsDriven = 1,
            NoRecentering = 2,
            Momentary = 4
        }
    }

    public static class Cinemachine3OrbitRig
    {
        [Serializable]
        public struct Orbit
        {
            public float Radius;
            public float Height;
        }

        [Serializable]
        public struct Settings
        {
            public Orbit Top;
            public Orbit Center;
            public Orbit Bottom;
            public float SplineCurvature;
            public static Settings Default => throw HarnessStub.NotSupported();
        }
    }

    public class CinemachineOrbitalFollow : CinemachineComponentBase
    {
        public Vector3 TargetOffset;
        public TrackerSettings TrackerSettings = TrackerSettings.Default;
        public OrbitStyles OrbitStyle = OrbitStyles.Sphere;
        public float Radius = 10;
        public Cinemachine3OrbitRig.Settings Orbits = Cinemachine3OrbitRig.Settings.Default;
        public ReferenceFrames RecenteringTarget = ReferenceFrames.TrackingTarget;
        public InputAxis HorizontalAxis;
        public InputAxis VerticalAxis;
        public InputAxis RadialAxis;

        public enum OrbitStyles
        {
            Sphere,
            ThreeRing
        }

        public enum ReferenceFrames
        {
            AxisCenter,
            ParentObject,
            TrackingTarget,
            LookAtTarget
        }
    }

    [Serializable]
    public struct ScreenComposerSettings
    {
        public Vector2 ScreenPosition;
        public DeadZoneSettings DeadZone;
        public HardLimitSettings HardLimits;
        public static ScreenComposerSettings Default => throw HarnessStub.NotSupported();

        [Serializable]
        public struct DeadZoneSettings
        {
            public bool Enabled;
            public Vector2 Size;
        }

        [Serializable]
        public struct HardLimitSettings
        {
            public bool Enabled;
            public Vector2 Size;
            public Vector2 Offset;
        }
    }

    [Serializable]
    public struct LookaheadSettings
    {
        public bool Enabled;
        public float Time;
        public float Smoothing;
        public bool IgnoreY;
    }

    public class CinemachineRotationComposer : CinemachineComponentBase
    {
        public ScreenComposerSettings Composition = ScreenComposerSettings.Default;
        public bool CenterOnActivate = true;
        public Vector3 TargetOffset;
        public Vector2 Damping;
        public LookaheadSettings Lookahead;
    }

    public class CinemachineDeoccluder : CinemachineExtension
    {
        public LayerMask CollideAgainst = 1;
        public string IgnoreTag = string.Empty;
        public LayerMask TransparentLayers = 0;
        public float MinimumDistanceFromTarget = 0.3f;
        public ObstacleAvoidance AvoidObstacles;
        public QualityEvaluation ShotQualityEvaluation = QualityEvaluation.Default;

        [Serializable]
        public struct ObstacleAvoidance
        {
            public bool Enabled;
            public float DistanceLimit;
            public float MinimumOcclusionTime;
            public float CameraRadius;
            public FollowTargetSettings UseFollowTarget;
            public ResolutionStrategy Strategy;
            public int MaximumEffort;
            public float SmoothingTime;
            public float Damping;
            public float DampingWhenOccluded;
            // internal in Cinemachine 3.1 (CinemachineDeoccluder.cs:146): not usable from project code.
            internal static ObstacleAvoidance Default => throw HarnessStub.NotSupported();

            public enum ResolutionStrategy
            {
                PullCameraForward,
                PreserveCameraHeight,
                PreserveCameraDistance
            }

            [Serializable]
            public struct FollowTargetSettings
            {
                public bool Enabled;
                public float YOffset;
            }
        }

        [Serializable]
        public struct QualityEvaluation
        {
            public bool Enabled;
            public float OptimalDistance;
            public float NearLimit;
            public float FarLimit;
            public float MaxQualityBoost;
            // internal in Cinemachine 3.1 (CinemachineDeoccluder.cs:189): not usable from project code.
            internal static QualityEvaluation Default => throw HarnessStub.NotSupported();
        }
    }

    // release/3.1 Runtime/Components/CinemachineThirdPersonFollow.cs (public fields used by the lock-on camera).
    public class CinemachineThirdPersonFollow : CinemachineComponentBase
    {
        public Vector3 Damping;
        public Vector3 ShoulderOffset;
        public float VerticalArmLength;
        public float CameraSide;
        public float CameraDistance;
        public ObstacleSettings AvoidObstacles = ObstacleSettings.Default;

        [Serializable]
        public struct ObstacleSettings
        {
            public bool Enabled;
            public LayerMask CollisionFilter;
            public string IgnoreTag;
            public float CameraRadius;
            public float DampingIntoCollision;
            public float DampingFromCollision;
            // internal in Cinemachine 3.1 (CinemachineThirdPersonFollow.cs): not usable from project code.
            internal static ObstacleSettings Default => throw HarnessStub.NotSupported();
        }
    }

    // release/3.1 Runtime/Behaviours/CinemachineTargetGroup.cs.
    public class CinemachineTargetGroup : MonoBehaviour
    {
        [Serializable]
        public class Target
        {
            public Transform Object;
            public float Weight = 1;
            public float Radius = 0.5f;
        }

        public enum PositionModes
        {
            GroupCenter,
            GroupAverage
        }

        public enum RotationModes
        {
            Manual,
            GroupAverage
        }

        public enum UpdateMethods
        {
            Update,
            FixedUpdate,
            LateUpdate
        }

        public PositionModes PositionMode = PositionModes.GroupCenter;
        public RotationModes RotationMode = RotationModes.Manual;
        public UpdateMethods UpdateMethod = UpdateMethods.LateUpdate;
        public System.Collections.Generic.List<Target> Targets = new System.Collections.Generic.List<Target>();

        public bool IsEmpty => throw HarnessStub.NotSupported();
        public void AddMember(Transform t, float weight, float radius) { throw HarnessStub.NotSupported(); }
        public void RemoveMember(Transform t) { throw HarnessStub.NotSupported(); }
        public int FindMember(Transform t) { throw HarnessStub.NotSupported(); }
    }

    // release/3.1 Runtime/Impulse/CinemachineImpulseDefinition.cs (fields used by the camera shake).
    [Serializable]
    public class CinemachineImpulseDefinition
    {
        public int ImpulseChannel = 1;
        public ImpulseShapes ImpulseShape;
        public AnimationCurve CustomImpulseShape = new AnimationCurve();
        public float ImpulseDuration = 0.2f;
        public ImpulseTypes ImpulseType = ImpulseTypes.Legacy;
        public float DissipationRate;
        public float AmplitudeGain = 1f;
        public float FrequencyGain = 1f;
        public bool Randomize = true;
        public float ImpactRadius = 100;
        public float DissipationDistance = 100;
        public float PropagationSpeed = 343;

        public enum ImpulseShapes
        {
            Custom,
            Recoil,
            Bump,
            Explosion,
            Rumble
        }

        public enum ImpulseTypes
        {
            Uniform,
            Dissipating,
            Propagating,
            Legacy
        }

        public void OnValidate() { throw HarnessStub.NotSupported(); }
        public void CreateEvent(Vector3 position, Vector3 velocity) { throw HarnessStub.NotSupported(); }
    }

    // release/3.1 Runtime/Impulse/CinemachineImpulseSource.cs.
    public class CinemachineImpulseSource : MonoBehaviour
    {
        public CinemachineImpulseDefinition ImpulseDefinition = new CinemachineImpulseDefinition();
        public Vector3 DefaultVelocity = Vector3.down;

        public void GenerateImpulseAtPositionWithVelocity(Vector3 position, Vector3 velocity) { throw HarnessStub.NotSupported(); }
        public void GenerateImpulseWithVelocity(Vector3 velocity) { throw HarnessStub.NotSupported(); }
        public void GenerateImpulseWithForce(float force) { throw HarnessStub.NotSupported(); }
        public void GenerateImpulse() { throw HarnessStub.NotSupported(); }
    }

    // release/3.1 Runtime/Impulse/CinemachineImpulseListener.cs (CinemachineExtension).
    public class CinemachineImpulseListener : CinemachineExtension
    {
        public CinemachineCore.Stage ApplyAfter = CinemachineCore.Stage.Aim;
        public int ChannelMask;
        public float Gain;
        public bool Use2DDistance;
        public bool UseCameraSpace;
        public SignalCombinationModes SignalCombinationMode = SignalCombinationModes.Additive;
        public ImpulseReaction ReactionSettings;

        public enum SignalCombinationModes
        {
            Additive,
            UseLargest
        }

        [Serializable]
        public struct ImpulseReaction
        {
            public float AmplitudeGain;
            public float FrequencyGain;
            public float Duration;
        }
    }

    [Serializable]
    public struct CinemachineBlendDefinition
    {
        public Styles Style;
        public float Time;
        public AnimationCurve CustomCurve;

        public CinemachineBlendDefinition(Styles style, float time)
        {
            Style = style;
            Time = time;
            CustomCurve = null;
        }

        public enum Styles
        {
            Cut,
            EaseInOut,
            EaseIn,
            EaseOut,
            HardIn,
            HardOut,
            Linear,
            Custom
        }
    }

    public class CinemachineBrain : MonoBehaviour
    {
        public bool IgnoreTimeScale;
        public Transform WorldUpOverride;
        public UpdateMethods UpdateMethod = UpdateMethods.SmartUpdate;
        public BrainUpdateMethods BlendUpdateMethod = BrainUpdateMethods.LateUpdate;
        public CinemachineBlendDefinition DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.EaseInOut, 2f);
        public bool ShowDebugText;
        public bool ShowCameraFrustum = true;

        public enum UpdateMethods
        {
            FixedUpdate,
            LateUpdate,
            SmartUpdate,
            ManualUpdate
        }

        public enum BrainUpdateMethods
        {
            FixedUpdate,
            LateUpdate
        }
    }
}

namespace Unity.Cinemachine.TargetTracking
{
    public enum BindingMode
    {
        LockToTargetOnAssign = 0,
        LockToTargetWithWorldUp = 1,
        LockToTargetNoRoll = 2,
        LockToTarget = 3,
        WorldSpace = 4,
        LazyFollow = 5
    }

    public enum AngularDampingMode
    {
        Euler,
        Quaternion
    }

    [Serializable]
    public struct TrackerSettings
    {
        public BindingMode BindingMode;
        public Vector3 PositionDamping;
        public AngularDampingMode AngularDampingMode;
        public Vector3 RotationDamping;
        public float QuaternionDamping;
        public static TrackerSettings Default => throw Unity.Cinemachine.HarnessStub.NotSupported();
        public void Validate() { throw Unity.Cinemachine.HarnessStub.NotSupported(); }
    }
}
