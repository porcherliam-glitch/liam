using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>Per-frame input of a zombie pose (RaidView fills it from the simulation).</summary>
    public struct ZombieFrame
    {
        public Vector3 pos;
        public float yawDeg;
        /// <summary>Speed relative to the zombie's chase speed: 0 standing, about 0.5 wandering, 1 chasing.</summary>
        public float effort;
        /// <summary>Zombie.attackAnim: rises during the wind-up and fades after the strike (door bashing and screams outside attacks).</summary>
        public float attack;
        /// <summary>In the attack state or a boss ability.</summary>
        public bool attacking;
        /// <summary>Winding up (a boss ability counts as one long wind-up).</summary>
        public bool windup;
        /// <summary>Metres the body moves towards the target (negative = leans back during the wind-up).</summary>
        public float lunge;
        public bool staggered, dead;
        /// <summary>Seconds since death (Zombie.deathTimer) and when the corpse is removed.</summary>
        public float deathTime, corpseLife;
        public float flash;
    }

    public sealed partial class CharacterView
    {
        private enum PartKind { Body, Small, Detail }

        private readonly ZombieLook _look;
        private readonly Transform _shinL, _shinR, _foreL, _foreR, _jaw;
        private readonly Transform[] _limbs;
        /// <summary>Big parts cast shadows near the camera; small decorations are hidden far away; the eyes go dark on death.</summary>
        private readonly Renderer[] _casters, _details, _eyes;
        private readonly float _thigh, _shin, _liftBack, _liftFront, _liftSide;
        private bool _shadowsOn = true, _detailsOn = true;
        /// <summary>First person: a hit tints the body red-white for a moment instead of the full white silhouette.</summary>
        public bool softFlash;
        private int _flashMode;
        private Material[][] _whiteMats, _softMats;
        private LookRng _rng;
        private Vector3 _lastPos, _flinchDir, _jerk, _jerkGoal, _corpsePos;
        private bool _placed, _wasWindup, _deathInit, _corpseDone;
        private float _gait, _time, _pendingDt, _effort, _push, _run, _stag, _pound, _lastAttack, _lunge;
        private float _flinchT = 9f, _flinchAmt, _strikeT = 9f, _jerkTimer, _jerkHold, _deathTwist;
        private Quaternion[] _deathFrom, _deathTo;
        private static Mesh _cone, _eyePair;
        private static readonly Dictionary<Material, Material> SoftFlashMats = new Dictionary<Material, Material>();

        /// <summary>Zombie built from a look (proportions, clothes, decorations) with knees, elbows and a jaw.</summary>
        public CharacterView(Transform parent, string name, ZombieLook look)
        {
            _zombie = true;
            _look = look;
            root = new GameObject(name);
            root.transform.SetParent(parent, false);
            // uniform scale: the extra bulk of big types is built into the parts, so limbs keep their length when they turn
            scale = heightScale = look.height;
            var b = new ZombieBuilder(root.transform, look);
            _body = b.body; _torso = b.torso; _head = b.head; _jaw = b.jaw;
            _legL = b.legL; _legR = b.legR; _shinL = b.shinL; _shinR = b.shinR;
            _armL = b.armL; _armR = b.armR; _foreL = b.foreL; _foreR = b.foreR;
            _thigh = b.thigh; _shin = b.shin;
            _liftBack = b.liftBack; _liftFront = b.liftFront; _liftSide = b.liftSide;
            _casters = b.casters.ToArray(); _details = b.details.ToArray(); _eyes = b.eyes.ToArray();
            _limbs = new[] { _legL, _legR, _shinL, _shinR, _armL, _armR, _foreL, _foreR, _torso, _head, _jaw };
            _renderers = root.GetComponentsInChildren<Renderer>();
            _baseMats = new Material[_renderers.Length][];
            for (int i = 0; i < _renderers.Length; i++) _baseMats[i] = _renderers[i].sharedMaterials;
            _flashMat = Mats.Emissive(Color.white, Color.white, 1.5f);
            _rng = new LookRng(look.seed ^ 0x2545F491u);
            _jerkTimer = _rng.Range(0f, look.jerkMax);
            _gait = _rng.Range(0f, Mathf.PI * 2f);
            _time = _rng.Range(0f, 60f);
        }

        // ------------------------------------------------------------------ per frame
        /// <summary>Distance detail: shadows only near the camera, small decorations only within the detail range.</summary>
        public void SetLod(bool shadows, bool details)
        {
            if (_casters == null) return;
            if (shadows != _shadowsOn)
            {
                _shadowsOn = shadows;
                var mode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                foreach (var r in _casters) if (r != null) r.shadowCastingMode = mode;
            }
            if (details != _detailsOn)
            {
                _detailsOn = details;
                foreach (var r in _details) if (r != null) r.enabled = details;
            }
        }

        /// <summary>A hit: the torso snaps away from the shot for a moment.</summary>
        /// <param name="strength">0..1, bigger hits flinch more.</param>
        /// <param name="pushWorld">World direction of the push (from the shooter towards the zombie).</param>
        public void Hit(float strength, Vector3 pushWorld)
        {
            pushWorld.y = 0f;
            if (pushWorld.sqrMagnitude < 1e-6f) pushWorld = -root.transform.forward;
            _flinchDir = Quaternion.Inverse(root.transform.localRotation) * pushWorld.normalized;
            _flinchAmt = Mathf.Clamp01(strength);
            _flinchT = 0f;
        }

        /// <summary>Zombie pose of this frame.</summary>
        /// <param name="dt">Animation time step (0 while the simulation is paused).</param>
        /// <param name="animate">
        /// False: only the position, timers and the hit flash are updated (outside the view, or a far zombie between its
        /// reduced-rate updates); the skipped time is caught up by the next full pose.
        /// </param>
        public void PoseZombie(in ZombieFrame f, float dt, bool animate)
        {
            var t = root.transform;
            if (_placed && !f.dead)
            {
                float dx = f.pos.x - _lastPos.x, dz = f.pos.z - _lastPos.z, step = Mathf.Sqrt(dx * dx + dz * dz);
                // the walk cycle follows the ground covered (no sliding feet); a jump (spawn, teleport) does not spin the legs
                if (step < 1.5f) _gait += step / Mathf.Max(0.3f, _look.stride * heightScale * (1f + 0.25f * _push + 1.3f * _run)) * Mathf.PI * 2f;
            }
            _lastPos = f.pos;
            _placed = true;
            t.localPosition = f.pos;
            t.localRotation = Quaternion.Euler(0f, f.yawDeg, 0f);
            t.localScale = new Vector3(scale, heightScale, scale);
            _time += dt; _flinchT += dt; _strikeT += dt;
            // the strike starts when the wind-up ends
            if (f.windup) _wasWindup = true;
            else if (_wasWindup) { _wasWindup = false; _strikeT = 0f; }
            // attack animation outside an attack (door bashing, a scream): live while it changes, fades by itself otherwise
            if (f.attacking) _pound = 0f;
            else if (Mathf.Abs(f.attack - _lastAttack) > 0.0005f) _pound = f.attack;
            else _pound = Mathf.MoveTowards(_pound, 0f, dt * 2f);
            _lastAttack = f.attack;
            ZombieFlash(f.flash);
            _pendingDt += dt;
            if (!animate) return;
            float adt = Mathf.Min(_pendingDt, 0.25f);
            _pendingDt = 0f;
            if (f.dead) PoseDead(f, adt);
            else PoseAlive(f, adt);
        }

        private void PoseAlive(in ZombieFrame f, float dt)
        {
            var k = _look;
            _effort = Mathf.MoveTowards(_effort, Mathf.Clamp(f.effort, 0f, 1.5f), dt * 4f);
            float mv = Mathf.Clamp01(_effort * 4f), idle = 1f - mv;
            float push = _push = Mathf.Clamp01((_effort - 0.5f) * 2f);
            // sprinters already jog while wandering (they are fast) and sprint when they chase
            _run = Mathf.MoveTowards(_run, k.sprinter ? Mathf.Clamp01((_effort - 0.35f) / 0.45f) : 0f, dt * 3f);
            float run = _run;
            _stag = Mathf.MoveTowards(_stag, f.staggered ? 1f : 0f, dt * (f.staggered ? 12f : 4f));
            _lunge = Mathf.MoveTowards(_lunge, f.lunge, dt * 12f);

            // attack: wind-up pose, then a quick blend into the strike, which fades with the attack animation
            float cock = 0f, strike = 0f;
            if (f.windup) cock = Mathf.Clamp01(f.attack);
            else if (f.attacking || _strikeT < 0.6f)
            {
                float decay = f.attacking ? Mathf.Clamp01(f.attack / 0.8f) : 1f - _strikeT / 0.6f;
                float b = Mathf.Clamp01(_strikeT / 0.09f);
                cock = (1f - b) * decay;
                strike = b * decay;
            }
            float atk = Mathf.Max(cock, strike);
            float pound = atk > 0.01f ? 0f : _pound;

            // head jerks: a quick snap to a random angle, held a moment, then a slow return
            _jerkTimer -= dt;
            if (_jerkTimer <= 0f)
            {
                _jerkTimer = _rng.Range(k.jerkMin, k.jerkMax);
                _jerkGoal = new Vector3(_rng.Range(-14f, 10f), _rng.Range(-32f, 32f), _rng.Range(-26f, 26f)) * k.jerkAmp;
                _jerkHold = _rng.Range(0.12f, 0.5f);
            }
            if (_jerkHold > 0f) { _jerkHold -= dt; _jerk = Vector3.Lerp(_jerk, _jerkGoal, 1f - Mathf.Exp(-30f * dt)); }
            else _jerk = Vector3.Lerp(_jerk, Vector3.zero, 1f - Mathf.Exp(-5f * dt));
            var jerk = _jerk * (1f - atk);

            // hit flinch: snaps away from the shot within 0.03 s and is back after 0.15 s
            float fl = 0f;
            if (_flinchT < 0.15f)
            {
                float back = 1f - (_flinchT - 0.03f) / 0.12f;
                fl = (_flinchT < 0.03f ? _flinchT / 0.03f : back * back) * _flinchAmt;
            }

            float g = _gait, s = Mathf.Sin(g), c = Mathf.Cos(g), tt = _time;

            // legs: a knee bends while its leg swings forward; a limping leg barely swings and stays stiff
            float amp = mv * (Mathf.Lerp(22f, 30f, push) + 24f * run);
            float kneeAmp = mv * (30f + 45f * run);
            float bend = k.kneeBend + 16f * _stag;
            float thL = s * amp - bend * 0.55f, thR = -s * amp - bend * 0.55f;
            float knL = Mathf.Max(0f, -c) * kneeAmp + bend + 4f * mv, knR = Mathf.Max(0f, c) * kneeAmp + bend + 4f * mv;
            float dip = 0f, limpRoll = 0f;
            if (k.limp > 0f)
            {
                float lp = k.limp * mv;
                // the bad leg carries the weight while it moves backwards: the body dips and leans over it
                float load = k.limpSide == 0 ? Mathf.Max(0f, c) : Mathf.Max(0f, -c);
                if (k.limpSide == 0) { thL = thL * (1f - 0.6f * lp) + 8f * lp; knL *= 1f - 0.8f * lp; }
                else { thR = thR * (1f - 0.6f * lp) + 8f * lp; knR *= 1f - 0.8f * lp; }
                dip = load * 0.06f * lp;
                limpRoll = load * 8f * lp * (k.limpSide == 0 ? 1f : -1f);
            }
            _legL.localRotation = Quaternion.Euler(thL, 0f, -k.stance);
            _legR.localRotation = Quaternion.Euler(thR, 0f, k.stance);
            _shinL.localRotation = Quaternion.Euler(knL, 0f, 0f);
            _shinR.localRotation = Quaternion.Euler(knR, 0f, 0f);
            // bent knees lower the hips so the feet stay on the ground
            float crouch = (1f - Mathf.Cos(bend * 0.55f * Mathf.Deg2Rad)) * _thigh + (1f - Mathf.Cos(bend * 0.45f * Mathf.Deg2Rad)) * _shin;
            float bob = Mathf.Abs(c) * k.bob * mv * (1f + 0.8f * run);
            _body.localRotation = Quaternion.identity;
            _body.localPosition = new Vector3(0f, bob - dip - crouch, _lunge / Mathf.Max(0.01f, scale));

            // torso: hunched, sways over the standing leg, twists against the legs, breathes when standing
            float pitch = k.hunch + 4f * push + 16f * run + Mathf.Sin(tt * 1.7f) * 2f * (0.4f + 0.6f * idle);
            float twist = s * (5f + 8f * run) * mv;
            float roll = k.lean + c * k.sway * mv + Mathf.Sin(tt * 0.7f) * 3f * idle + limpRoll;
            float headExtra = 0f, jaw = k.jaw + Mathf.Sin(tt * 2.3f) * 3f;

            // arms: reaching arms bob with the steps, hanging arms swing against the legs, sprinters pump
            float xL = ArmBase(k.reachL, -s, mv, tt, 0f), xR = ArmBase(k.reachR, s, mv, tt, 1.7f);
            float yL = k.reachL <= -50f ? 7f : 0f, yR = k.reachR <= -50f ? -7f : 0f;
            float zL = -k.splay, zR = k.splay, eL = k.elbowL, eR = k.elbowR;
            if (run > 0f)
            {
                xL = Mathf.Lerp(xL, -s * 55f - 12f, run); xR = Mathf.Lerp(xR, s * 55f - 12f, run);
                eL = Mathf.Lerp(eL, 85f, run); eR = Mathf.Lerp(eR, 85f, run);
                zL = Mathf.Lerp(zL, -6f, run); zR = Mathf.Lerp(zR, 6f, run);
                yL *= 1f - run; yR *= 1f - run;
            }

            if (atk > 0.001f)
            {
                switch (k.attack)
                {
                    case ZombieAttack.Grab: // both arms up and open, then grab forward and bite
                        xL = Blend(xL, -125f, -98f, cock, strike); xR = Blend(xR, -125f, -98f, cock, strike);
                        zL = Blend(zL, -k.splay - 22f, 6f, cock, strike); zR = Blend(zR, k.splay + 22f, -6f, cock, strike);
                        eL = Blend(eL, 30f, 5f, cock, strike); eR = Blend(eR, 30f, 5f, cock, strike);
                        pitch += -8f * cock + 18f * strike; headExtra += -10f * cock + 14f * strike; jaw += 18f * cock + 30f * strike;
                        break;
                    case ZombieAttack.Swipe: // a claw raised high and out, then slashed across (stalkers with both hands)
                        xR = Blend(xR, -155f, -60f, cock, strike); zR = Blend(zR, 50f, -35f, cock, strike); eR = Blend(eR, 70f, 15f, cock, strike);
                        if (k.claws) { xL = Blend(xL, -155f, -60f, cock, strike); zL = Blend(zL, -50f, 35f, cock, strike); eL = Blend(eL, 70f, 15f, cock, strike); }
                        else twist += 22f * cock - 26f * strike;
                        pitch += -4f * cock + 14f * strike; jaw += 12f * cock + 22f * strike;
                        break;
                    case ZombieAttack.Smash: // both arms over the head, then down
                        xL = Blend(xL, -172f, -38f, cock, strike); xR = Blend(xR, -172f, -38f, cock, strike);
                        zL = Blend(zL, -k.splay * 0.4f, -k.splay, cock, strike); zR = Blend(zR, k.splay * 0.4f, k.splay, cock, strike);
                        eL = Blend(eL, 55f, 12f, cock, strike); eR = Blend(eR, 55f, 12f, cock, strike);
                        pitch += -14f * cock + 26f * strike; headExtra += -10f * cock + 8f * strike; jaw += 25f * cock + 15f * strike;
                        break;
                    default: // flailing arms
                        float shake = Mathf.Sin(tt * 38f) * 12f * strike;
                        xL = Blend(xL, -128f, -78f + shake, cock, strike); xR = Blend(xR, -128f, -78f - shake, cock, strike);
                        zL = Blend(zL, -k.splay - 28f, -k.splay + 5f, cock, strike); zR = Blend(zR, k.splay + 28f, k.splay - 5f, cock, strike);
                        pitch += -6f * cock + 12f * strike; jaw += 15f * cock + 10f * strike;
                        break;
                }
            }
            else if (pound > 0.001f)
            {
                // a screamer throws its head back and spreads its arms; the others hammer on the door in front of them
                if (k.bigMouth) { headExtra -= 35f * pound; jaw += 25f * pound; zL -= 30f * pound; zR += 30f * pound; pitch -= 10f * pound; }
                else { xL -= 50f * pound; xR -= 50f * pound; pitch += 6f * pound; }
            }

            // hit flinch and stagger: the torso snaps away from the shot, arms drop and open
            pitch += _flinchDir.z * 16f * fl - 14f * _stag;
            roll -= _flinchDir.x * 12f * fl;
            xL += 14f * fl + 30f * _stag; xR += 14f * fl + 30f * _stag;
            zL -= 10f * fl + 26f * _stag; zR += 10f * fl + 26f * _stag;
            jaw += 10f * fl + 8f * _stag;

            _torso.localRotation = Quaternion.Euler(pitch, twist, roll);
            // the head keeps looking ahead when the torso leans more than its usual hunch
            float hp = k.headPitch - (pitch - k.hunch) * 0.55f + headExtra + jerk.x + _flinchDir.z * 12f * fl - 16f * _stag;
            float hy = Mathf.Sin(tt * 0.45f + 2f) * 12f * idle - twist * 0.7f + jerk.y;
            float hr = k.headTilt + Mathf.Sin(tt * 0.33f) * 5f - (roll - k.lean) * 0.5f + jerk.z;
            _head.localRotation = Quaternion.Euler(hp, hy, hr);
            _jaw.localRotation = Quaternion.Euler(Mathf.Clamp(jaw, 0f, 52f), 0f, 0f);
            _armL.localRotation = Quaternion.Euler(xL, yL, zL);
            _armR.localRotation = Quaternion.Euler(xR, yR, zR);
            _foreL.localRotation = Quaternion.Euler(-eL, 0f, 0f);
            _foreR.localRotation = Quaternion.Euler(-eR, 0f, 0f);
        }

        /// <summary>Arm pitch while walking. swing: +1/-1 phase against the legs.</summary>
        private float ArmBase(float reach, float swing, float mv, float tt, float phase)
        {
            if (reach > -50f) return reach + swing * _look.armSwing * mv + Mathf.Sin(tt * 1.1f + phase) * 3f;
            return reach + swing * _look.armSwing * 0.5f * mv + Mathf.Sin(tt * 1.3f + phase) * 4f;
        }

        private static float Blend(float v, float cockV, float strikeV, float cock, float strike) => Mathf.Lerp(Mathf.Lerp(v, cockV, cock), strikeV, strike);

        private static float Smooth(float x) { x = Mathf.Clamp01(x); return x * x * (3f - 2f * x); }

        /// <summary>Death: the knees give way, the body falls (direction from the look) with a small bounce and keeps its pose.</summary>
        private void PoseDead(in ZombieFrame f, float dt)
        {
            float dT = f.deathTime;
            // sinks into the floor only in the last two seconds before the corpse is removed
            float sink = Mathf.Max(0f, dT - (f.corpseLife - 2f)) * 0.3f / Mathf.Max(0.01f, heightScale);
            if (_corpseDone)
            {
                _body.localPosition = _corpsePos - new Vector3(0f, sink, 0f);
                return;
            }
            if (!_deathInit) BeginDeath();
            float kb = Smooth(dT / 0.18f);
            float u = Mathf.Clamp01((dT - 0.06f) / 0.5f), kf = u * u; // falls faster and faster
            float v = Mathf.Clamp01((dT - 0.56f) / 0.3f);
            float fall = 88f * kf - Mathf.Sin(v * Mathf.PI) * 5f * (1f - v);
            float twist = _deathTwist * kf, lz = _lunge / Mathf.Max(0.01f, scale);
            // the hips drop while the knees buckle, until the fall takes over
            float drop = _look.legLen * 0.18f * kb * (1f - kf);
            Vector3 pos;
            Quaternion rot;
            switch (_look.deathDir)
            {
                case 1: rot = Quaternion.Euler(fall, twist, 0f); pos = new Vector3(0f, _liftFront * kf - drop, lz + 0.12f * kf); break;
                case 2: rot = Quaternion.Euler(0f, twist, fall); pos = new Vector3(-0.08f * kf, _liftSide * kf - drop, lz); break;
                case 3: rot = Quaternion.Euler(0f, twist, -fall); pos = new Vector3(0.08f * kf, _liftSide * kf - drop, lz); break;
                default: rot = Quaternion.Euler(-fall, twist, 0f); pos = new Vector3(0f, _liftBack * kf - drop, lz - 0.12f * kf); break;
            }
            _body.localRotation = rot;
            _body.localPosition = pos - new Vector3(0f, sink, 0f);
            float wl = Smooth((dT - 0.05f) / 0.6f);
            for (int i = 0; i < _limbs.Length; i++)
            {
                var from = _deathFrom[i];
                // legs: thighs forward and knees bent while the body sinks
                if (i < 4) from = Quaternion.Slerp(from, Quaternion.Euler(i < 2 ? -35f : 70f, 0f, 0f), kb);
                _limbs[i].localRotation = Quaternion.Slerp(from, _deathTo[i], wl);
            }
            if (dT >= 0.9f) { _corpseDone = true; _corpsePos = pos; }
        }

        private void BeginDeath()
        {
            _deathInit = true;
            var r = new LookRng(_look.seed ^ 0x9E3779B9u);
            _deathTwist = r.Range(-25f, 25f);
            _deathFrom = new Quaternion[_limbs.Length];
            for (int i = 0; i < _limbs.Length; i++) _deathFrom[i] = _limbs[i].localRotation;
            _deathTo = CorpsePose(_look.deathDir, ref r);
            // the eyes go dark
            var darkEyes = Mats.Lit(Mats.Shade(_look.eyes, 0.2f), 0.6f);
            for (int i = 0; i < _renderers.Length; i++)
            {
                if (System.Array.IndexOf(_eyes, _renderers[i]) < 0) continue;
                var arr = new Material[_baseMats[i].Length];
                for (int k = 0; k < arr.Length; k++) arr[k] = darkEyes;
                _baseMats[i] = arr;
            }
            _whiteMats = _softMats = null;
            _flashMode = -1; // apply the changed materials with the next flash update
        }

        /// <summary>
        /// Final limb rotations of a corpse (order of _limbs). Limbs only bend where the ground leaves room: lying on the
        /// back the arms lie beside the body or above the head, face down the head turns to the side, on the side the
        /// lower arm reaches above the head and the upper leg is drawn up.
        /// </summary>
        private static Quaternion[] CorpsePose(int dir, ref LookRng r)
        {
            var q = new Quaternion[11];
            switch (dir)
            {
                case 1: // face down
                    q[0] = Quaternion.Euler(r.Range(0f, 10f), 0f, -r.Range(4f, 16f));
                    q[1] = Quaternion.Euler(r.Range(0f, 10f), 0f, r.Range(4f, 16f));
                    q[2] = Quaternion.Euler(r.Range(5f, 30f), 0f, 0f);
                    q[3] = Quaternion.Euler(r.Range(5f, 30f), 0f, 0f);
                    for (int side = 0; side < 2; side++)
                    {
                        float sideSign = side == 0 ? -1f : 1f;
                        bool overhead = r.Chance(0.5f);
                        q[4 + side] = overhead ? Quaternion.Euler(-r.Range(188f, 200f), 0f, sideSign * r.Range(10f, 40f)) : Quaternion.Euler(r.Range(5f, 18f), 0f, sideSign * r.Range(10f, 50f));
                        q[6 + side] = Quaternion.Euler(overhead ? -r.Range(0f, 20f) : r.Range(0f, 4f), 0f, 0f);
                    }
                    q[8] = Quaternion.Euler(-r.Range(0f, 6f), r.Range(-8f, 8f), r.Range(-5f, 5f));
                    q[9] = Quaternion.Euler(-r.Range(0f, 15f), (r.Chance(0.5f) ? 1f : -1f) * r.Range(65f, 85f), 0f);
                    break;
                case 2: // on the left side
                case 3: // on the right side
                {
                    float m = dir == 2 ? 1f : -1f; // mirror
                    int low = dir == 2 ? 0 : 1, high = 1 - low;
                    q[low] = Quaternion.Euler(-r.Range(0f, 15f), 0f, -m * r.Range(8f, 14f));
                    q[high] = Quaternion.Euler(-r.Range(25f, 50f), 0f, -m * r.Range(14f, 22f));
                    q[2 + low] = Quaternion.Euler(r.Range(5f, 20f), 0f, 0f);
                    q[2 + high] = Quaternion.Euler(r.Range(35f, 70f), 0f, 0f);
                    q[4 + low] = Quaternion.Euler(r.Range(-10f, 10f), 0f, -m * r.Range(180f, 195f));
                    q[4 + high] = Quaternion.Euler(-r.Range(25f, 45f), 0f, -m * r.Range(35f, 55f));
                    q[6 + low] = Quaternion.Euler(-r.Range(0f, 20f), 0f, 0f);
                    q[6 + high] = Quaternion.Euler(-r.Range(10f, 30f), 0f, 0f);
                    q[8] = Quaternion.Euler(r.Range(0f, 15f), r.Range(-8f, 8f), m * r.Range(0f, 8f));
                    q[9] = Quaternion.Euler(r.Range(-10f, 10f), r.Range(-20f, 20f), m * r.Range(20f, 35f));
                    break;
                }
                default: // on the back: one knee may stay up
                    for (int side = 0; side < 2; side++)
                    {
                        float up = r.Chance(0.4f) ? r.Range(10f, 28f) : r.Range(0f, 6f), sideSign = side == 0 ? -1f : 1f;
                        q[side] = Quaternion.Euler(-up, 0f, sideSign * r.Range(4f, 14f));
                        q[2 + side] = Quaternion.Euler(up * r.Range(1.7f, 2f), 0f, 0f);
                        bool overhead = r.Chance(0.4f);
                        q[4 + side] = overhead ? Quaternion.Euler(-r.Range(165f, 177f), 0f, sideSign * r.Range(10f, 30f)) : Quaternion.Euler(-r.Range(5f, 18f), 0f, sideSign * r.Range(35f, 80f));
                        q[6 + side] = Quaternion.Euler(overhead ? r.Range(0f, 12f) : -r.Range(0f, 30f), 0f, 0f);
                    }
                    q[8] = Quaternion.Euler(r.Range(0f, 6f), r.Range(-10f, 10f), r.Range(-8f, 8f));
                    q[9] = Quaternion.Euler(r.Range(-15f, 5f), r.Range(-45f, 45f), r.Range(-10f, 10f));
                    break;
            }
            q[10] = Quaternion.Euler(r.Range(14f, 34f), 0f, 0f);
            return q;
        }

        /// <summary>Hit flash. First person: shorter and a red-white tint instead of the harsh white silhouette.</summary>
        private void ZombieFlash(float flash)
        {
            int mode = softFlash ? (flash > 0.05f ? 2 : 0) : (flash > 0.001f ? 1 : 0);
            if (mode == _flashMode) return;
            _flashMode = mode;
            for (int i = 0; i < _renderers.Length; i++)
            {
                if (_renderers[i] == null) continue;
                _renderers[i].sharedMaterials = mode == 0 ? _baseMats[i] : mode == 1 ? FlashMats(ref _whiteMats, i, false) : FlashMats(ref _softMats, i, true);
            }
        }

        private Material[] FlashMats(ref Material[][] cache, int i, bool soft)
        {
            cache ??= new Material[_renderers.Length][];
            if (cache[i] != null) return cache[i];
            var src = _baseMats[i];
            var arr = new Material[src.Length];
            for (int k = 0; k < arr.Length; k++) arr[k] = soft ? SoftFlashOf(src[k]) : _flashMat;
            return cache[i] = arr;
        }

        /// <summary>Red-white tinted, weakly glowing variant of a material (shared by all zombies); glowing parts stay as they are.</summary>
        private static Material SoftFlashOf(Material m)
        {
            if (m == null) return null;
            if (SoftFlashMats.TryGetValue(m, out var f) && f != null) return f;
            if (m.IsKeywordEnabled("_EMISSION")) f = m;
            else
            {
                var c = m.HasProperty("_BaseColor") ? m.GetColor("_BaseColor") : m.HasProperty("_Color") ? m.GetColor("_Color") : Color.grey;
                f = Mats.Emissive(Color.Lerp(c, new Color(1f, 0.8f, 0.76f), 0.5f), new Color(1f, 0.3f, 0.24f), 0.5f);
            }
            SoftFlashMats[m] = f;
            return f;
        }

        // ------------------------------------------------------------------ meshes
        /// <summary>Six-sided cone from a base of radius 0.5 at y = -0.5 to the tip at y = 0.5 (spikes, claws).</summary>
        private static Mesh ConeMesh()
        {
            if (_cone != null) return _cone;
            const int n = 6;
            var v = new Vector3[n * 3];
            var nr = new Vector3[n * 3];
            var uv = new Vector2[n * 3];
            var tri = new int[n * 3];
            for (int i = 0; i < n; i++)
            {
                float a0 = i * Mathf.PI * 2f / n, a1 = (i + 1) * Mathf.PI * 2f / n, am = (a0 + a1) * 0.5f;
                int k = i * 3;
                // same winding as the sides of MeshBuilder.Cylinder (outwards)
                v[k] = new Vector3(Mathf.Cos(a0) * 0.5f, -0.5f, Mathf.Sin(a0) * 0.5f);
                v[k + 1] = new Vector3(0f, 0.5f, 0f);
                v[k + 2] = new Vector3(Mathf.Cos(a1) * 0.5f, -0.5f, Mathf.Sin(a1) * 0.5f);
                nr[k] = nr[k + 1] = nr[k + 2] = new Vector3(Mathf.Cos(am), 0.5f, Mathf.Sin(am)).normalized;
                uv[k] = new Vector2(0f, 0f); uv[k + 1] = new Vector2(0.5f, 1f); uv[k + 2] = new Vector2(1f, 0f);
                tri[k] = k; tri[k + 1] = k + 1; tri[k + 2] = k + 2;
            }
            var m = new Mesh { name = "unitCone" };
            m.vertices = v;
            m.normals = nr;
            m.uv = uv;
            m.triangles = tri;
            m.RecalculateBounds();
            return _cone = m;
        }

        /// <summary>Both eyes in one mesh (head space, 10 cm apart), one renderer less per zombie.</summary>
        private static Mesh EyePairMesh()
        {
            if (_eyePair != null) return _eyePair;
            var mb = new MeshBuilder();
            mb.Sphere(null, new Vector3(-0.05f, 0f, 0f), Vector3.one * 0.02f, 8, 6);
            mb.Sphere(null, new Vector3(0.05f, 0f, 0f), Vector3.one * 0.02f, 8, 6);
            return _eyePair = mb.Build("eyePair");
        }

        // ------------------------------------------------------------------ building
        /// <summary>Builds the part hierarchy of a zombie from its look: shared unit meshes scaled per part.</summary>
        private sealed class ZombieBuilder
        {
            public Transform body, torso, head, jaw, legL, legR, shinL, shinR, armL, armR, foreL, foreR;
            public float thigh, shin, liftBack, liftFront, liftSide;
            public readonly List<Renderer> casters = new List<Renderer>(), details = new List<Renderer>(), eyes = new List<Renderer>();
            private readonly ZombieLook _k;
            private LookRng _r;
            private float _w = 1f; // horizontal factor of W(); the head uses the look's headWidth
            private float _hs = 1f;
            private readonly Material _skin, _shirt, _pants, _blood, _grime, _dark, _bone, _metal;
            private Vector3 _chestC, _chestS;

            public ZombieBuilder(Transform root, ZombieLook k)
            {
                _k = k;
                _r = new LookRng(k.seed ^ 0x68E31DA4u);
                _skin = Mats.Lit(k.skin, 0.3f);
                _shirt = Mats.Lit(k.shirt, 0.08f, 0f, ProceduralTextures.Fabric);
                _pants = Mats.Lit(k.pants, 0.08f, 0f, ProceduralTextures.Fabric);
                _blood = k.freshBlood ? Mats.Lit(new Color(0.34f, 0.025f, 0.02f), 0.65f) : Mats.Lit(new Color(0.24f, 0.035f, 0.03f), 0.45f);
                _grime = Mats.Lit(new Color(0.075f, 0.065f, 0.055f), 0.05f);
                _dark = Mats.Lit(new Color(0.05f, 0.015f, 0.015f), 0.4f);
                _bone = Mats.Lit(new Color(0.78f, 0.74f, 0.62f), 0.3f);
                _metal = Mats.Lit(new Color(0.24f, 0.27f, 0.21f), 0.35f, 0.5f, ProceduralTextures.Metal);
                float w = k.width;
                _w = w;

                // legs: hip -> knee -> ankle; the soles stand on y = 0
                float L = k.legLen;
                thigh = L * 0.5f;
                shin = L - thigh - 0.075f;
                body = Pivot(root, "Body", Vector3.zero);
                legL = Leg(-1, out shinL);
                legR = Leg(1, out shinR);

                // torso: hips, chest, belly, hump, vest
                float T = k.torsoLen;
                torso = Pivot(body, "Torso", new Vector3(0f, L, 0f));
                var top = k.shirtless ? _skin : _shirt;
                Add(torso, "Hips", CharacterView.SphereMesh(), _pants, W(0f, 0.02f, 0f), W(k.hipX * 2f + k.legThick * 1.05f, 0.26f, k.chestD * 0.95f));
                _chestC = W(0f, T * 0.53f, 0f);
                _chestS = W(k.chestW, T * 0.48f, k.chestD);
                Add(torso, "Chest", CapsuleMesh(), top, _chestC, _chestS);
                float front = _chestS.z * 0.5f, back = front;
                Vector3 bellyC = Vector3.zero, bellyS = Vector3.zero;
                if (k.belly > 0f)
                {
                    bellyC = W(0f, T * 0.28f, k.chestD * 0.2f * (1f + k.belly));
                    bellyS = W(k.chestW * 0.92f, T * 0.62f, k.chestD * (1f + k.belly));
                    Add(torso, "Belly", CharacterView.SphereMesh(), top, bellyC, bellyS);
                    front = Mathf.Max(front, bellyC.z + bellyS.z * 0.5f);
                }
                if (k.hump)
                {
                    var hc = W(0f, T * 0.9f, -0.04f);
                    var hsz = W(k.chestW * 1.25f, T * 0.36f, k.chestD * 1.05f);
                    Add(torso, "Hump", CharacterView.SphereMesh(), top, hc, hsz);
                    back = Mathf.Max(back, -hc.z + hsz.z * 0.5f);
                }
                if (k.vest)
                {
                    var vestM = Mats.Lit(new Color(0.2f, 0.23f, 0.17f), 0.1f, 0f, ProceduralTextures.Fabric);
                    var vs = W(k.chestW * 1.04f, T * 0.56f, k.chestD * 1.12f);
                    Add(torso, "Vest", BoxMesh(), vestM, W(0f, T * 0.6f, 0f), vs);
                    float pz = vs.z * 0.5f + 0.016f;
                    Add(torso, "PlateFront", BoxMesh(), _metal, new Vector3(0f, T * 0.63f, pz), new Vector3(vs.x * 0.7f, T * 0.36f, 0.035f));
                    Add(torso, "PlateBack", BoxMesh(), _metal, new Vector3(0f, T * 0.63f, -pz), new Vector3(vs.x * 0.7f, T * 0.36f, 0.035f));
                    Add(torso, "Pouch", BoxMesh(), vestM, new Vector3(-vs.x * 0.22f, T * 0.36f, pz), new Vector3(0.1f, 0.09f, 0.05f), PartKind.Detail);
                    Add(torso, "Pouch", BoxMesh(), vestM, new Vector3(vs.x * 0.22f, T * 0.36f, pz), new Vector3(0.1f, 0.09f, 0.05f), PartKind.Detail);
                    front = Mathf.Max(front, pz + 0.018f);
                    back = Mathf.Max(back, pz + 0.018f);
                }
                // neck: thinner than the body bulk on big types
                float nw = Mathf.Lerp(k.headWidth, w, 0.5f), hy = T + k.neck, n0 = T - 0.05f, n1 = hy + 0.03f;
                Add(torso, "Neck", CapsuleMesh(), _skin, new Vector3(0f, (n0 + n1) * 0.5f, 0.01f * w), new Vector3(k.neckThick * nw, (n1 - n0) * 0.5f, k.neckThick * nw));

                // head: skull, dark eye sockets, glowing eyes, nose, mouth and a jaw that opens
                head = Pivot(torso, "Head", new Vector3(0f, hy, (0.015f + k.headFwd) * w));
                _w = k.headWidth;
                _hs = k.head;
                Add(head, "Skull", CharacterView.SphereMesh(), _skin, H(0f, 0.085f, 0.01f), H(0.24f, 0.29f, 0.26f));
                Add(head, "Sockets", CharacterView.SphereMesh(), Mats.Lit(Mats.Shade(k.skin, 0.35f), 0.2f), H(0f, 0.112f, 0.115f), H(0.15f, 0.055f, 0.035f), PartKind.Detail);
                Add(head, "Nose", BoxMesh(), _skin, H(0f, 0.072f, 0.135f), H(0.032f, 0.05f, 0.04f), PartKind.Detail);
                var eyeM = Mats.Emissive(k.eyes, k.eyes, 3f);
                eyes.Add(Add(head, "Eyes", EyePairMesh(), eyeM, H(0f, 0.11f, 0.118f), H(1f, 1f, 1f), PartKind.Small));
                // the dark mouth box sticks out of the lower face (front at z 0.13) and the closed chin covers all but a slit
                if (k.bigMouth) Add(head, "Mouth", BoxMesh(), _dark, H(0f, -0.025f, 0.1f), H(0.11f, 0.11f, 0.06f), PartKind.Detail);
                else Add(head, "Mouth", BoxMesh(), _dark, H(0f, -0.005f, 0.105f), H(0.09f, 0.05f, 0.05f), PartKind.Detail);
                if (k.teeth) Add(head, "Teeth", BoxMesh(), _bone, H(0f, k.bigMouth ? 0.022f : 0.014f, 0.128f), H(0.07f, 0.014f, 0.012f), PartKind.Detail);
                jaw = Pivot(head, "Jaw", H(0f, 0.03f, 0.02f));
                Add(jaw, "Chin", BoxMesh(), _skin, H(0f, -0.06f, 0.07f), H(0.14f, 0.06f, 0.1f));
                if (k.chinBlood) Add(jaw, "ChinBlood", CharacterView.SphereMesh(), _blood, H(0f, -0.065f, 0.121f), H(0.08f, 0.035f, 0.015f), PartKind.Detail);
                if (k.helmet)
                {
                    Add(head, "Helmet", CharacterView.SphereMesh(), _metal, H(0f, 0.185f, -0.01f), H(0.3f, 0.2f, 0.32f));
                    Add(head, "Brim", BoxMesh(), _metal, H(0f, 0.125f, 0.14f), H(0.24f, 0.022f, 0.06f), PartKind.Small);
                }
                else if (k.hasHair) Add(head, "Hair", CharacterView.SphereMesh(), Mats.Lit(k.hair, 0.15f), H(0f, 0.135f, -0.03f), H(0.25f, 0.24f, 0.27f));
                if (k.spikes) eyes.Add(Add(head, "Eyes2", EyePairMesh(), eyeM, H(0f, 0.155f, 0.112f), H(0.62f, 0.62f, 0.62f), PartKind.Small)); // a second, smaller pair

                // arms: shoulder -> elbow -> hand
                _w = w;
                float sy = T * 0.93f;
                armL = Arm(-1, sy, out foreL);
                armR = Arm(1, sy, out foreR);

                Decorate(bellyC, bellyS);
                if (k.spikes) Spikes();

                // how far the body must lift off the ground when it lies on its back, front or side
                liftBack = back + 0.01f;
                liftFront = front + 0.01f;
                liftSide = (k.shoulderX + k.armThick * (k.deltoids ? 0.8f : 0.45f)) * w;
            }

            private Vector3 W(float x, float y, float z) => new Vector3(x * _w, y, z * _w);
            private Vector3 H(float x, float y, float z) => new Vector3(x * _hs * _w, y * _hs, z * _hs * _w);

            private static Transform Pivot(Transform parent, string name, Vector3 pos)
            {
                var t = new GameObject(name).transform;
                t.SetParent(parent, false);
                t.localPosition = pos;
                return t;
            }

            /// <param name="kind">Body: casts shadows (near the camera); Small: no shadows; Detail: no shadows, hidden far away.</param>
            private Renderer Add(Transform parent, string name, Mesh mesh, Material mat, Vector3 pos, Vector3 size, PartKind kind = PartKind.Body, Quaternion? rot = null)
            {
                var go = new GameObject(name);
                go.transform.SetParent(parent, false);
                go.transform.localPosition = pos;
                if (rot.HasValue) go.transform.localRotation = rot.Value;
                go.transform.localScale = size;
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = mat;
                mr.shadowCastingMode = kind == PartKind.Body ? ShadowCastingMode.On : ShadowCastingMode.Off;
                if (kind == PartKind.Body) casters.Add(mr);
                else if (kind == PartKind.Detail) details.Add(mr);
                return mr;
            }

            private Transform Leg(int side, out Transform knee)
            {
                var k = _k;
                float lt = k.legThick;
                var leg = Pivot(body, side < 0 ? "LegL" : "LegR", W(side * k.hipX, k.legLen, 0f));
                Add(leg, "Thigh", CapsuleMesh(), _pants, new Vector3(0f, -thigh * 0.5f, 0f), W(lt, thigh * 0.5f, lt * 1.08f));
                knee = Pivot(leg, "Knee", new Vector3(0f, -thigh, 0f));
                Add(knee, "Shin", CapsuleMesh(), _pants, new Vector3(0f, -shin * 0.5f, 0f), W(lt * 0.82f, shin * 0.5f, lt * 0.88f));
                if (k.shoesOn) Add(knee, "Shoe", BoxMesh(), Mats.Lit(k.shoes, 0.25f), W(0f, -shin - 0.03f, 0.05f), W(0.12f, 0.09f, 0.26f));
                else Add(knee, "Foot", BoxMesh(), _skin, W(0f, -shin - 0.04f, 0.045f), W(0.095f, 0.07f, 0.23f));
                if (k.vest) Add(knee, "KneePad", BoxMesh(), _metal, W(0f, -0.03f, lt * 0.5f), W(lt * 0.85f, 0.1f, 0.05f), PartKind.Detail);
                return leg;
            }

            private Transform Arm(int side, float y, out Transform elbow)
            {
                var k = _k;
                float at = k.armThick, ua = k.upperArm, fa = k.foreArm, hs = k.hand;
                var arm = Pivot(torso, side < 0 ? "ArmL" : "ArmR", W(side * k.shoulderX, y, 0f));
                bool bare = k.shirtless || (side < 0 ? k.bareArmL : k.bareArmR);
                Add(arm, "UpperArm", CapsuleMesh(), bare ? _skin : _shirt, new Vector3(0f, -ua * 0.5f, 0f), W(at, ua * 0.5f, at));
                if (k.deltoids) Add(arm, "Shoulder", CharacterView.SphereMesh(), k.vest ? _metal : bare ? _skin : _shirt, W(0f, -0.03f, 0f), W(at * 1.75f, at * 1.3f, at * 1.65f));
                elbow = Pivot(arm, "Elbow", new Vector3(0f, -ua, 0f));
                Add(elbow, "Forearm", CapsuleMesh(), bare || !k.longSleeves ? _skin : _shirt, new Vector3(0f, -fa * 0.5f, 0f), W(at * 0.86f, fa * 0.5f, at * 0.86f));
                Add(elbow, "Hand", CharacterView.SphereMesh(), _skin, W(0f, -fa - 0.045f * hs, 0.01f), W(0.065f * hs, 0.13f * hs, 0.095f * hs));
                if (k.claws)
                    for (int i = -1; i <= 1; i++)
                        Add(elbow, "Claw", ConeMesh(), _bone, W(i * 0.022f * hs, -fa - 0.14f * hs, 0.015f), new Vector3(0.016f, 0.075f, 0.016f), PartKind.Detail, Quaternion.Euler(180f, 0f, 0f));
                return arm;
            }

            /// <summary>Point on the surface of a capsule part (centre c, scale s) at an angle around it (0 = front, +x side positive).</summary>
            private static void Surface(Vector3 c, Vector3 s, float angDeg, float dy, out Vector3 pos, out Vector3 normal)
            {
                float a = s.x * 0.5f, b = s.z * 0.5f, half = s.y * 0.5f, f = 1f, ady = Mathf.Abs(dy);
                // on the rounded ends the cross-section shrinks
                if (ady > half) { float u = Mathf.Min(0.95f, (ady - half) / half); f = Mathf.Sqrt(1f - u * u); }
                float ang = angDeg * Mathf.Deg2Rad, sn = Mathf.Sin(ang), cs = Mathf.Cos(ang);
                normal = new Vector3(sn / a, 0f, cs / b).normalized;
                pos = c + new Vector3(sn * a * f, dy, cs * b * f);
            }

            /// <summary>Flat oval patch lying on a capsule part (rips, blood, ribs).</summary>
            private void Patch(Transform parent, Material m, Vector3 c, Vector3 s, float angDeg, float dy, float pw, float ph, float tilt = 0f)
            {
                Surface(c, s, angDeg, dy, out var p, out var n);
                float g = Mathf.Lerp(1f, _w, 0.6f);
                Add(parent, "Patch", CharacterView.SphereMesh(), m, p + n * 0.002f, new Vector3(pw * g, ph * g, 0.022f), PartKind.Detail, Quaternion.LookRotation(n) * Quaternion.Euler(0f, 0f, tilt));
            }

            /// <summary>Torn clothes, blood, ribs and the toxic zombie's pustules.</summary>
            private void Decorate(Vector3 bellyC, Vector3 bellyS)
            {
                var k = _k;
                float lt = k.legThick, at = k.armThick;
                var thighC = new Vector3(0f, -thigh * 0.5f, 0f);
                var thighS = W(lt, thigh * 0.5f, lt * 1.08f);
                var foreC = new Vector3(0f, -k.foreArm * 0.5f, 0f);
                var foreS = W(at * 0.86f, k.foreArm * 0.5f, at * 0.86f);
                // dark rips in the shirt and the trousers
                for (int i = 0; i < k.torn; i++)
                {
                    if (!k.shirtless && _r.Chance(0.65f))
                        Patch(torso, _grime, _chestC, _chestS, _r.Range(-160f, 160f), _r.Range(-0.45f, 0.4f) * _chestS.y, _r.Range(0.06f, 0.12f), _r.Range(0.05f, 0.1f), _r.Range(-30f, 30f));
                    else
                        Patch(_r.Chance(0.5f) ? legL : legR, _grime, thighC, thighS, _r.Range(-150f, 150f), _r.Range(-0.4f, 0.4f) * thighS.y, _r.Range(0.05f, 0.09f), _r.Range(0.05f, 0.1f), _r.Range(-30f, 30f));
                }
                // blood: mostly on the chest, sometimes on the back, a forearm or a thigh
                for (int i = 0; i < k.blood; i++)
                {
                    float v = _r.Float();
                    float pw = _r.Range(0.06f, 0.15f), ph = _r.Range(0.05f, 0.13f), tilt = _r.Range(-40f, 40f);
                    if (v < 0.55f) Patch(torso, _blood, _chestC, _chestS, _r.Range(-70f, 70f), _r.Range(-0.4f, 0.5f) * _chestS.y, pw, ph, tilt);
                    else if (v < 0.7f) Patch(torso, _blood, _chestC, _chestS, _r.Range(130f, 230f), _r.Range(-0.4f, 0.4f) * _chestS.y, pw, ph, tilt);
                    else if (v < 0.85f) Patch(_r.Chance(0.5f) ? foreL : foreR, _blood, foreC, foreS, _r.Range(-120f, 120f), _r.Range(-0.3f, 0.3f) * foreS.y, pw * 0.5f, ph * 0.6f, tilt);
                    else Patch(_r.Chance(0.5f) ? legL : legR, _blood, thighC, thighS, _r.Range(-90f, 90f), _r.Range(-0.3f, 0.3f) * thighS.y, pw * 0.6f, ph * 0.7f, tilt);
                }
                // blood run down from the mouth onto the chest
                if (k.chinBlood) Patch(torso, _blood, _chestC, _chestS, _r.Range(-15f, 15f), _chestS.y * 0.55f, 0.07f, 0.14f);
                if (k.ribs)
                {
                    var groove = Mats.Lit(Mats.Shade(k.skin, 0.7f), 0.25f);
                    for (int side = -1; side <= 1; side += 2)
                        for (int i = 0; i < 3; i++)
                            Patch(torso, groove, _chestC, _chestS, side * 40f, _chestS.y * (0.32f - i * 0.2f), 0.1f, 0.014f, -side * 18f);
                }
                if (k.pustules)
                {
                    var pm = Mats.Emissive(new Color(0.6f, 1f, 0.3f), new Color(0.45f, 1f, 0.15f), 2.2f);
                    int n = 10 + _r.Int(5);
                    for (int i = 0; i < n; i++)
                    {
                        // a few big ones stay visible from afar
                        var kind = i < 4 ? PartKind.Small : PartKind.Detail;
                        float size = _r.Range(0.035f, 0.08f) * Mathf.Lerp(1f, _w, 0.6f);
                        float v = _r.Float();
                        Vector3 p;
                        Transform parent = torso;
                        if (v < 0.45f) Surface(_chestC, _chestS, _r.Range(-180f, 180f), _r.Range(-0.45f, 0.45f) * _chestS.y, out p, out _);
                        else if (v < 0.65f && k.belly > 0f) p = bellyC + Vector3.Scale(new Vector3(_r.Range(-1f, 1f), _r.Range(-0.5f, 0.5f), _r.Range(0.3f, 1f)).normalized, bellyS * 0.5f);
                        else if (v < 0.88f)
                        {
                            parent = _r.Chance(0.5f) ? foreL : foreR;
                            Surface(new Vector3(0f, -k.foreArm * 0.5f, 0f), W(at * 0.86f, k.foreArm * 0.5f, at * 0.86f), _r.Range(-180f, 180f), _r.Range(-0.4f, 0.4f) * k.foreArm * 0.5f, out p, out _);
                        }
                        else
                        {
                            // on the skull, not in the face
                            parent = head;
                            _w = _k.headWidth;
                            var dir = new Vector3(_r.Range(-1f, 1f), _r.Range(0f, 1f), _r.Range(-1f, 0.2f)).normalized;
                            p = H(0f, 0.085f, 0.01f) + Vector3.Scale(dir, H(0.12f, 0.145f, 0.13f));
                            _w = k.width;
                        }
                        Add(parent, "Pustule", CharacterView.SphereMesh(), pm, p, Vector3.one * size, kind);
                    }
                }
            }

            /// <summary>The boss's bone spikes along the spine, on the shoulders and forearms, and bone plates on the shoulders and back.</summary>
            private void Spikes()
            {
                var k = _k;
                // spine below the hump, two more on top of the hump (they stay below the 2.25 m door lintel)
                for (int i = 0; i < 4; i++)
                {
                    Surface(_chestC, _chestS, 180f, _chestS.y * (0.45f - i * 0.38f), out var p, out var n);
                    var dir = (n + Vector3.up * 0.6f).normalized;
                    float len = 0.3f - i * 0.04f;
                    Add(torso, "Spike", ConeMesh(), _bone, p + dir * len * 0.35f, new Vector3(0.08f, len, 0.08f), PartKind.Body, Quaternion.FromToRotation(Vector3.up, dir));
                }
                if (k.hump)
                    for (int side = -1; side <= 1; side += 2)
                    {
                        var dir = new Vector3(side * 0.3f, 1f, -0.6f).normalized;
                        var p = W(side * k.chestW * 0.22f, k.torsoLen * 0.9f + k.torsoLen * 0.16f, -0.04f - k.chestD * 0.2f);
                        Add(torso, "Spike", ConeMesh(), _bone, p + dir * 0.06f, new Vector3(0.08f, 0.25f, 0.08f), PartKind.Body, Quaternion.FromToRotation(Vector3.up, dir));
                    }
                for (int side = -1; side <= 1; side += 2)
                {
                    var arm = side < 0 ? armL : armR;
                    var fore = side < 0 ? foreL : foreR;
                    float at = k.armThick, top = at * 0.65f - 0.03f; // top of the shoulder ball
                    Add(arm, "Plate", BoxMesh(), _bone, W(side * 0.03f, top + 0.02f, 0f), W(at * 1.5f, 0.05f, at * 1.4f), PartKind.Body, Quaternion.Euler(0f, 0f, -side * 18f));
                    for (int j = 0; j < 2; j++)
                    {
                        var dir = new Vector3(side * 0.5f, 1f, -0.3f - j * 0.5f).normalized;
                        Add(arm, "Spike", ConeMesh(), _bone, W(side * at * 0.3f, top + 0.05f, -j * at * 0.5f) + dir * 0.07f, new Vector3(0.07f, 0.22f - j * 0.05f, 0.07f), PartKind.Body, Quaternion.FromToRotation(Vector3.up, dir));
                    }
                    var fdir = new Vector3(side * 0.25f, 0.3f, -1f).normalized;
                    Add(fore, "Spike", ConeMesh(), _bone, W(0f, -k.foreArm * 0.35f, -at * 0.43f) + fdir * 0.06f, new Vector3(0.055f, 0.18f, 0.055f), PartKind.Body, Quaternion.FromToRotation(Vector3.up, fdir));
                }
                for (int side = -1; side <= 1; side += 2)
                {
                    Surface(_chestC, _chestS, 180f + side * 35f, _chestS.y * 0.3f, out var p, out var n);
                    Add(torso, "BackPlate", BoxMesh(), _bone, p + n * 0.01f, new Vector3(0.2f, 0.15f, 0.045f), PartKind.Body, Quaternion.LookRotation(n) * Quaternion.Euler(0f, 0f, side * 12f));
                }
            }
        }
    }
}
