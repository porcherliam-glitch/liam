using System;
using Aetherfall.Core;
using UnityEngine;
using UnityEngine.Playables;

namespace Aetherfall.Cinematics.Playback
{
    /// <summary>
    /// A recorded cutscene of a scene (S58): plays a Timeline through its <see cref="PlayableDirector"/> (cameras through a
    /// Cinemachine track, props through an activation track) and reports the overlay of the moment (subtitles, caption cards,
    /// veil, from <see cref="CutsceneCue"/> data on this component) and the end to <see cref="ICutsceneService"/>. Registers itself
    /// with the service once the boot is done.
    /// </summary>
    /// <remarks>
    /// GameObject: the cutscene root under "Spiel/Zwischensequenzen" of the world scene, built by the generator
    /// (CutsceneTimelineBuilder) from the cutscene script; the Timeline asset lies in Assets/_Project/Art/Animations/Cinematics.
    /// The child "Kameras" holds the shot cameras; it is switched on only while the cutscene plays.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class TimelineCutscenePlayer : MonoBehaviour, ICutscenePlayer
    {
        [Tooltip("PlayableDirector mit der Timeline der Zwischensequenz (Play On Awake aus).")]
        [SerializeField] private PlayableDirector director = null;

        [Tooltip("Zwischensequenz-ID (cs.…).")]
        [SerializeField] private string cutsceneId = string.Empty;

        [Tooltip("Objekt mit den Kameras der Einstellungen; nur während der Zwischensequenz aktiv.")]
        [SerializeField] private GameObject cameraRoot = null;

        [Tooltip("Untertitel, Texttafeln und Abblenden (vom Generator aus dem Drehbuch geschrieben).")]
        [SerializeField] private CutsceneCue[] cues = Array.Empty<CutsceneCue>();

        private ICutsceneService _service;
        private ICutscenePlaybackHost _host;
        private bool _playing;

        /// <inheritdoc />
        public string CutsceneId => cutsceneId ?? string.Empty;

        /// <inheritdoc />
        public double Time => director != null ? director.time : 0d;

        /// <inheritdoc />
        public double Duration => director != null ? director.duration : 0d;

        /// <summary>True while it plays.</summary>
        public bool IsPlaying => _playing;

        /// <summary>The cues (tests, tours).</summary>
        public CutsceneCue[] Cues => cues;

        private void Awake()
        {
            if (director == null)
            {
                TryGetComponent(out director);
            }

            if (director != null)
            {
                director.playOnAwake = false;
                director.stopped += OnDirectorStopped;
            }

            if (cameraRoot != null)
            {
                cameraRoot.SetActive(false);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                ICutsceneService service = await Services.WaitForAsync<ICutsceneService>(destroyCancellationToken);
                if (director == null)
                {
                    Log.Error(LogCategory.Cinematics, "TimelineCutscenePlayer '" + name + "' has no PlayableDirector - cutscene '" + CutsceneId +
                                                      "' cannot play.");
                    return;
                }

                _service = service;
                _service.Register(this);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Cinematics, exception, "TimelineCutscenePlayer could not resolve ICutsceneService.");
            }
        }

        private void Update()
        {
            if (_playing && _host != null)
            {
                _host.SetOverlay(CutsceneOverlayEvaluator.Evaluate(cues, director.time));
            }
        }

        private void OnDestroy()
        {
            if (director != null)
            {
                director.stopped -= OnDirectorStopped;
            }

            if (_service != null)
            {
                // A scene unloaded during the cutscene: the service ends it as skipped.
                ICutsceneService service = _service;
                _service = null;
                service.Unregister(this);
            }
        }

        /// <inheritdoc />
        public void Play(ICutscenePlaybackHost host)
        {
            if (director == null)
            {
                host?.Finished(this);
                return;
            }

            _host = host;
            if (cameraRoot != null)
            {
                cameraRoot.SetActive(true);
            }

            director.extrapolationMode = DirectorWrapMode.None;
            director.timeUpdateMode = DirectorUpdateMode.GameTime;
            director.time = 0d;
            _playing = true;
            director.Play();
            director.Evaluate();
            _host?.SetOverlay(CutsceneOverlayEvaluator.Evaluate(cues, 0d));
            Log.Info(LogCategory.Cinematics, "Cutscene '" + CutsceneId + "' plays (" + Duration.ToString("0.0") + " s).");
        }

        /// <inheritdoc />
        public void Stop()
        {
            if (!_playing)
            {
                return;
            }

            if (director != null)
            {
                director.Stop();
            }

            // The director reports "stopped" itself; this covers a director that was already stopped.
            Finish();
        }

        private void OnDirectorStopped(PlayableDirector stoppedDirector)
        {
            Finish();
        }

        private void Finish()
        {
            if (!_playing)
            {
                return;
            }

            _playing = false;
            if (cameraRoot != null)
            {
                cameraRoot.SetActive(false);
            }

            ICutscenePlaybackHost host = _host;
            _host = null;
            host?.Finished(this);
        }
    }
}
