using System;
using System.Collections.Generic;
using DeadZone.Core;
using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>
    /// Plays the procedurally generated sounds: pooled 3D voices, 2D UI sounds and a looping ambience per map.
    /// In a raid it also shapes them like the place you stand in: a room reverb indoors (longer in big halls), a faint delayed
    /// echo of shots outdoors, and sounds behind walls come through quieter and muffled. The player's own sounds play centred.
    /// </summary>
    public sealed class AudioSystem
    {
        /// <summary>One pooled 3D voice with its low-pass filter (walls and distance) and the state of that muffling.</summary>
        private sealed class Voice
        {
            public AudioSource src;
            public AudioLowPassFilter lp;
            public float started, baseVolume, occ, occTarget, air = 1f, nextCheck;
            public Vector2 sim;
            public bool own, recheck;
        }

        private const float FreeCutoff = 22000f, BlockedCutoff = 1700f, BlockedGain = 0.5f;
        /// <summary>The player's own sounds are almost 2D: centred, whatever the view does.</summary>
        private const float OwnBlend = 0.12f;
        /// <summary>Sounds longer than this check the walls again while they play (the listener may walk around a corner).</summary>
        private const float RecheckLength = 0.45f, RecheckInterval = 0.2f;

        private readonly Dictionary<string, AudioClip> _clips = new Dictionary<string, AudioClip>();
        private readonly Dictionary<string, AudioClip> _ambient = new Dictionary<string, AudioClip>();
        private readonly List<Voice> _voices = new List<Voice>();
        private readonly AudioSource[] _echo = new AudioSource[4];
        private readonly Dictionary<string, float> _lastPlayed = new Dictionary<string, float>();
        private readonly AudioSource _ambience, _ui;
        private readonly AudioLowPassFilter _ambienceLp;
        private readonly AudioReverbZone _reverb;
        public readonly Transform listener;
        public float master = 0.8f, sfx = 1f, music = 0.6f;
        private string _ambientId;
        private float _ambientTarget, _ambientVol;
        private int _echoNext;
        // raid world for reverb, occlusion and echo (null in the menu and the base)
        private World _world;
        private Vector2 _listenerSim;
        // room reverb: current values fade toward the room the listener stands in
        private int _roomTile = int.MinValue;
        private RoomAcoustics _room;
        private float _wet, _decay = 1f, _size, _hard = 0.5f;
        private int _appliedRoom = int.MinValue;
        private float _appliedDecay = -1f;

        public AudioSystem(Transform parent)
        {
            var root = new GameObject("Audio").transform;
            root.SetParent(parent, false);
            listener = new GameObject("Listener").transform;
            listener.SetParent(root, false);
            listener.gameObject.AddComponent<AudioListener>();
            // one reverb zone that moves with the listener, so it is always fully inside; silent outdoors (room -10000)
            _reverb = listener.gameObject.AddComponent<AudioReverbZone>();
            _reverb.reverbPreset = AudioReverbPreset.User;
            _reverb.minDistance = 40f;
            _reverb.maxDistance = 50f;
            _reverb.room = -10000;
            _reverb.diffusion = 100f;
            _reverb.density = 100f;
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
                var lp = go.AddComponent<AudioLowPassFilter>();
                lp.cutoffFrequency = FreeCutoff;
                lp.lowpassResonanceQ = 1f;
                _voices.Add(new Voice { src = s, lp = lp });
            }
            // outdoor echoes: quiet, dull copies of a shot a moment later, from somewhere to the side
            for (int i = 0; i < _echo.Length; i++)
            {
                var go = new GameObject("Echo" + i);
                go.transform.SetParent(root, false);
                var s = go.AddComponent<AudioSource>();
                s.playOnAwake = false;
                s.spatialBlend = 0f;
                s.bypassReverbZones = true;
                s.dopplerLevel = 0f;
                // only 32 real voices: in a crowded moment an echo is the first thing to go silent
                s.priority = 200;
                var lp = go.AddComponent<AudioLowPassFilter>();
                lp.cutoffFrequency = 1100f;
                lp.lowpassResonanceQ = 1f;
                _echo[i] = s;
            }
            _ui = root.gameObject.AddComponent<AudioSource>();
            _ui.playOnAwake = false;
            _ui.spatialBlend = 0f;
            // interface sounds stay dry, also in a big hall
            _ui.bypassReverbZones = true;
            // with many voices at once the ambience and interface sounds must never be the ones that get cut
            _ui.priority = 16;
            _ambience = new GameObject("Ambience").AddComponent<AudioSource>();
            _ambience.transform.SetParent(root, false);
            _ambience.loop = true;
            _ambience.spatialBlend = 0f;
            _ambience.playOnAwake = false;
            _ambience.priority = 0;
            _ambience.bypassReverbZones = true;
            // indoors the wind outside is heard through the walls: duller and a little quieter
            _ambienceLp = _ambience.gameObject.AddComponent<AudioLowPassFilter>();
            _ambienceLp.cutoffFrequency = FreeCutoff;
            _ambienceLp.lowpassResonanceQ = 1f;
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

        private static bool Starts(string name, string prefix) => name.StartsWith(prefix, StringComparison.Ordinal);

        private static int MaxConcurrent(string name) => Starts(name, "footstep") ? 2 : Starts(name, "zombie_growl") ? 4 : Starts(name, "shot_") ? 6 : 3;

        /// <param name="pos">World position, or null for a non-positional sound.</param>
        /// <param name="own">The player's own sound (shot, step, reload): plays nearly 2D at the listener and is never muffled.</param>
        public void Play(string name, Vector3? pos, float volume = 1f, float pitch = 1f, bool own = false)
        {
            if (string.IsNullOrEmpty(name) || master <= 0 || sfx <= 0) return;
            float now = Time.unscaledTime;
            if (_lastPlayed.TryGetValue(name, out var last) && now - last < 0.025f) return;
            _lastPlayed[name] = now;
            var clip = Clip(name);
            float vol = Mathf.Clamp01(volume) * master * sfx;
            if (pos == null)
            {
                _ui.pitch = 1f;
                _ui.PlayOneShot(clip, vol);
                return;
            }
            int playing = 0;
            Voice free = null, oldest = null, oldestOwn = null;
            foreach (var v in _voices)
            {
                if (v.src.isPlaying)
                {
                    if (v.src.clip == clip) playing++;
                    // the player's own sounds are taken over last
                    if (!v.own) { if (oldest == null || v.started < oldest.started) oldest = v; }
                    else if (oldestOwn == null || v.started < oldestOwn.started) oldestOwn = v;
                }
                else if (free == null) free = v;
            }
            if (playing >= MaxConcurrent(name)) return;
            var s = free ?? oldest ?? oldestOwn;
            if (s == null) return;
            var src = s.src;
            src.Stop();
            s.started = now;
            s.own = own;
            s.baseVolume = vol;
            s.sim = Coords.ToSim(pos.Value);
            float dist = Vector3.Distance(pos.Value, listener.position);
            src.spatialBlend = own ? OwnBlend : 1f;
            src.priority = own ? 64 : 128;
            src.transform.position = own ? listener.position : pos.Value;
            src.clip = clip;
            src.pitch = pitch * UnityEngine.Random.Range(0.94f, 1.06f);
            s.recheck = !own && clip.length > RecheckLength;
            s.nextCheck = now + RecheckInterval;
            if (own || _world == null) { s.occ = s.occTarget = 0f; s.air = 1f; }
            else
            {
                // beyond the hearing range (70 m) the walls do not matter
                s.occ = s.occTarget = dist < 72f ? (float)Acoustics.Occlusion(_world, s.sim.x, s.sim.y, _listenerSim.x, _listenerSim.y) : 0f;
                s.air = AirAbsorption(dist);
            }
            ApplyMuffle(s);
            src.Play();
            if (Starts(name, "shot_") || name == "explosion") PlayEcho(clip, vol, src.pitch, own ? 0f : dist);
        }

        /// <summary>Far sounds lose their highs in the air: full brightness up to 15 m, about 40 % of the cutoff at 70 m.</summary>
        private static float AirAbsorption(float dist) => Mathf.Lerp(1f, 0.4f, Mathf.Clamp01((dist - 15f) / 55f));

        /// <summary>Walls and distance: low-pass cutoff (logarithmic between free and blocked) and volume of a voice.</summary>
        private static void ApplyMuffle(Voice v)
        {
            float cutoff = FreeCutoff * Mathf.Pow(BlockedCutoff / FreeCutoff, v.occ) * v.air;
            v.lp.cutoffFrequency = Mathf.Clamp(cutoff, 600f, FreeCutoff);
            v.src.volume = v.baseVolume * Mathf.Lerp(1f, BlockedGain, v.occ);
        }

        /// <summary>Outdoors a shot answers back from the buildings and hills: one quiet, dull copy after a delay that depends on the map.</summary>
        private void PlayEcho(AudioClip clip, float vol, float pitch, float dist)
        {
            if (_world == null || _wet > 0.35f) return; // indoors the room reverb takes over
            Acoustics.Echo(_ambientId, out double delay, out double gain);
            float v = vol * (float)gain * (1f - Mathf.Clamp01(dist / 130f));
            if (v < 0.01f) return;
            var e = _echo[_echoNext];
            _echoNext = (_echoNext + 1) % _echo.Length;
            e.Stop();
            e.clip = clip;
            e.volume = v;
            e.pitch = pitch * 0.97f;
            e.panStereo = UnityEngine.Random.Range(-0.5f, 0.5f);
            e.PlayDelayed((float)delay + dist * 0.002f + UnityEngine.Random.Range(-0.03f, 0.05f));
        }

        /// <param name="world">The raid world (room reverb, muffling behind walls, outdoor echo); null in the menu and the base.</param>
        public void StartAmbient(string mapId, World world = null)
        {
            _world = world;
            _roomTile = int.MinValue;
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
            _listenerSim = Coords.ToSim(listenerPos);
            UpdateRoom(dt);
            UpdateVoices(dt);
            _ambientVol = Mathf.MoveTowards(_ambientVol, _ambientTarget, dt * 0.5f);
            _ambience.volume = _ambientVol * master * music * 0.55f * (1f - 0.3f * _wet);
            float ambCut = Mathf.Lerp(FreeCutoff, 2500f, _wet);
            if (Mathf.Abs(_ambienceLp.cutoffFrequency - ambCut) > 1f) _ambienceLp.cutoffFrequency = ambCut;
            if (_ambientVol <= 0 && _ambientTarget <= 0 && _ambience.isPlaying) _ambience.Stop();
        }

        /// <summary>Own sounds stay at the listener; long world sounds check the walls again and fade their muffling smoothly.</summary>
        private void UpdateVoices(float dt)
        {
            float now = Time.unscaledTime;
            foreach (var v in _voices)
            {
                if (!v.src.isPlaying) continue;
                if (v.own) { v.src.transform.position = listener.position; continue; }
                if (v.recheck && now >= v.nextCheck)
                {
                    v.nextCheck = now + RecheckInterval;
                    float dist = Vector3.Distance(v.src.transform.position, listener.position);
                    if (_world != null && dist < 72f)
                    {
                        v.occTarget = (float)Acoustics.Occlusion(_world, v.sim.x, v.sim.y, _listenerSim.x, _listenerSim.y);
                        v.air = AirAbsorption(dist);
                    }
                    else v.occTarget = 0f;
                }
                if (v.occ != v.occTarget)
                {
                    v.occ = Mathf.MoveTowards(v.occ, v.occTarget, dt * 4f);
                    ApplyMuffle(v);
                }
            }
        }

        /// <summary>Fades the reverb toward the room the listener stands in (out again outdoors); writes the zone only when it changes.</summary>
        private void UpdateRoom(float dt)
        {
            int tile = int.MinValue + 1;
            if (_world != null)
            {
                int tx = Mathf.FloorToInt(_listenerSim.x / World.TILE), ty = Mathf.FloorToInt(_listenerSim.y / World.TILE);
                tile = ty * _world.w + tx;
            }
            if (tile != _roomTile)
            {
                _roomTile = tile;
                _room = _world != null ? Acoustics.RoomAt(_world, _listenerSim.x, _listenerSim.y) : default;
            }
            float target = (float)_room.wet;
            bool fromOutside = _wet <= 0.01f;
            _wet = Mathf.MoveTowards(_wet, target, dt * (target > _wet ? 2.5f : 1.5f));
            if (_room.wet > 0)
            {
                // the character of the room follows within about half a second (walking from a hallway into a hall);
                // coming in from outside it starts right away with the new room while the reverb fades in
                float k = fromOutside ? 1f : 1f - Mathf.Exp(-dt * 4f);
                _decay = Mathf.Lerp(_decay, (float)_room.decay, k);
                _size = Mathf.Lerp(_size, (float)_room.size, k);
                _hard = Mathf.Lerp(_hard, (float)_room.hardness, k);
            }
            // room level in millibel: a linear fade of the reverb gain, about -10 dB in a small room and -5 dB in a hall
            float gain = _wet * Mathf.Lerp(0.32f, 0.55f, _size);
            int room = gain <= 0.0001f ? -10000 : Mathf.Clamp(Mathf.RoundToInt(2000f * Mathf.Log10(gain)), -10000, 0);
            if (room == _appliedRoom && Mathf.Abs(_decay - _appliedDecay) < 0.02f) return;
            _appliedRoom = room;
            _appliedDecay = _decay;
            _reverb.room = room;
            if (room <= -10000) return;
            _reverb.roomHF = Mathf.RoundToInt(Mathf.Lerp(-1600f, -250f, _hard));
            _reverb.decayTime = Mathf.Clamp(_decay, 0.1f, 20f);
            _reverb.decayHFRatio = Mathf.Lerp(0.45f, 0.85f, _hard);
            _reverb.reflections = Mathf.RoundToInt(Mathf.Lerp(-1500f, -900f, _hard));
            _reverb.reflectionsDelay = Mathf.Lerp(0.003f, 0.025f, _size);
            _reverb.reverb = Mathf.RoundToInt(Mathf.Lerp(-500f, 250f, _size));
            _reverb.reverbDelay = Mathf.Lerp(0.005f, 0.035f, _size);
        }
    }
}
