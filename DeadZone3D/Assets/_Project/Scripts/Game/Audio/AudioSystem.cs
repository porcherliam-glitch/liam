using System.Collections.Generic;
using DeadZone.Core;
using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>Plays the procedurally generated sounds: pooled 3D voices, 2D UI sounds and a looping ambience per map.</summary>
    public sealed class AudioSystem
    {
        private readonly Dictionary<string, AudioClip> _clips = new Dictionary<string, AudioClip>();
        private readonly Dictionary<string, AudioClip> _ambient = new Dictionary<string, AudioClip>();
        private readonly List<AudioSource> _voices = new List<AudioSource>();
        private readonly Dictionary<string, float> _lastPlayed = new Dictionary<string, float>();
        private readonly Dictionary<AudioSource, float> _started = new Dictionary<AudioSource, float>();
        private readonly AudioSource _ambience, _ui;
        public readonly Transform listener;
        public float master = 0.8f, sfx = 1f, music = 0.6f;
        private string _ambientId;
        private float _ambientTarget, _ambientVol;

        public AudioSystem(Transform parent)
        {
            var root = new GameObject("Audio").transform;
            root.SetParent(parent, false);
            listener = new GameObject("Listener").transform;
            listener.SetParent(root, false);
            listener.gameObject.AddComponent<AudioListener>();
            for (int i = 0; i < 28; i++)
            {
                var go = new GameObject("Voice" + i);
                go.transform.SetParent(root, false);
                var s = go.AddComponent<AudioSource>();
                s.playOnAwake = false;
                s.spatialBlend = 1f;
                s.rolloffMode = AudioRolloffMode.Linear;
                s.minDistance = 3f;
                s.maxDistance = 70f;
                s.dopplerLevel = 0f;
                _voices.Add(s);
            }
            _ui = root.gameObject.AddComponent<AudioSource>();
            _ui.playOnAwake = false;
            _ui.spatialBlend = 0f;
            _ambience = new GameObject("Ambience").AddComponent<AudioSource>();
            _ambience.transform.SetParent(root, false);
            _ambience.loop = true;
            _ambience.spatialBlend = 0f;
            _ambience.playOnAwake = false;
        }

        private AudioClip Clip(string name)
        {
            if (_clips.TryGetValue(name, out var c)) return c;
            var data = SoundBank.Make(name);
            c = AudioClip.Create(name, data.Length, 1, SoundBank.Rate, false);
            c.SetData(data, 0);
            _clips[name] = c;
            return c;
        }

        /// <summary>Generates all clips up front so the first shot does not stutter.</summary>
        public void Preload() { foreach (var n in SoundBank.Names) Clip(n); }

        private static int MaxConcurrent(string name) => name.StartsWith("footstep") ? 2 : name.StartsWith("zombie_growl") ? 4 : name.StartsWith("shot_") ? 6 : 3;

        /// <param name="pos">World position, or null for a non-positional sound.</param>
        public void Play(string name, Vector3? pos, float volume = 1f, float pitch = 1f)
        {
            if (string.IsNullOrEmpty(name) || master <= 0 || sfx <= 0) return;
            float now = Time.unscaledTime;
            if (_lastPlayed.TryGetValue(name, out var last) && now - last < 0.025f) return;
            _lastPlayed[name] = now;
            var clip = Clip(name);
            if (pos == null)
            {
                _ui.pitch = 1f;
                _ui.PlayOneShot(clip, Mathf.Clamp01(volume) * master * sfx);
                return;
            }
            int playing = 0;
            AudioSource free = null, oldest = null;
            float oldestStart = float.MaxValue;
            foreach (var v in _voices)
            {
                if (v.isPlaying)
                {
                    if (v.clip == clip) playing++;
                    float st = _started.TryGetValue(v, out var x) ? x : 0f;
                    if (st < oldestStart) { oldestStart = st; oldest = v; }
                }
                else if (free == null) free = v;
            }
            if (playing >= MaxConcurrent(name)) return;
            var s = free ?? oldest;
            if (s == null) return;
            _started[s] = now;
            s.Stop();
            s.transform.position = pos.Value;
            s.clip = clip;
            s.volume = Mathf.Clamp01(volume) * master * sfx;
            s.pitch = pitch * Random.Range(0.94f, 1.06f);
            s.Play();
        }

        public void StartAmbient(string mapId)
        {
            if (_ambientId == mapId && _ambience.isPlaying) return;
            _ambientId = mapId;
            if (!_ambient.TryGetValue(mapId, out var clip))
            {
                var data = SoundBank.Ambient(mapId);
                clip = AudioClip.Create("amb_" + mapId, data.Length, 1, SoundBank.Rate, false);
                clip.SetData(data, 0);
                _ambient[mapId] = clip;
            }
            _ambience.clip = clip;
            _ambientVol = 0;
            _ambience.volume = 0;
            _ambience.Play();
            _ambientTarget = 1f;
        }

        public void StopAmbient() { _ambientTarget = 0f; }

        public void Update(float dt, Vector3 listenerPos) => Update(dt, listenerPos, Quaternion.identity);

        /// <summary>The listener faces where the player looks in first person (sounds pan with the view); top-down it faces north.</summary>
        public void Update(float dt, Vector3 listenerPos, Quaternion listenerRot)
        {
            listener.position = listenerPos;
            listener.rotation = listenerRot;
            _ambientVol = Mathf.MoveTowards(_ambientVol, _ambientTarget, dt * 0.5f);
            _ambience.volume = _ambientVol * master * music * 0.55f;
            if (_ambientVol <= 0 && _ambientTarget <= 0 && _ambience.isPlaying) _ambience.Stop();
        }
    }
}
