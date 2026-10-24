using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>Wind-up and strike of a zombie view.</summary>
    public enum ZombieAttack { Grab, Swipe, Smash, Flail }

    /// <summary>Small deterministic random generator (xorshift) for looks and animation variety; never touches the simulation RNG.</summary>
    internal struct LookRng
    {
        public uint state;

        public LookRng(uint seed) { state = seed != 0 ? seed : 0x9E3779B9u; }

        public uint Next()
        {
            uint x = state;
            x ^= x << 13; x ^= x >> 17; x ^= x << 5;
            return state = x;
        }

        public float Float() => (Next() >> 8) * (1f / 16777216f);
        public float Range(float a, float b) => a + (b - a) * Float();
        public bool Chance(float p) => Float() < p;
        public int Int(int n) => (int)(Next() % (uint)n);
    }

    /// <summary>
    /// Look and movement style of one zombie view: body proportions, clothes, decorations and how it walks and strikes.
    /// Built from the zombie type and a hash of its uid, so a zombie always looks the same; walkers vary, the other types
    /// stay recognisable. Lengths are model metres before the uniform height scale; body widths are multiplied by width.
    /// </summary>
    public sealed class ZombieLook
    {
        // ------------------------------------------------------------------ proportions (model metres)
        /// <summary>Uniform scale of the whole view, capped at 1.25 so the biggest zombies fit through 2.25 m doors.</summary>
        public float height = 1f;
        /// <summary>Extra horizontal bulk (type size / height), built into the parts so turning limbs do not shear.</summary>
        public float width = 1f;
        /// <summary>Horizontal factor of the head parts (heads grow less than bodies).</summary>
        public float headWidth = 1f;
        public float legLen = 0.92f, legThick = 0.19f, hipX = 0.12f, stance;
        public float torsoLen = 0.62f, chestW = 0.46f, chestD = 0.27f, belly;
        public float shoulderX = 0.28f, upperArm = 0.3f, foreArm = 0.28f, armThick = 0.13f, hand = 1f;
        public float head = 1f, neck = 0.14f, neckThick = 0.11f, headFwd;

        // ------------------------------------------------------------------ clothes and decorations
        public Color skin, shirt, pants, shoes, eyes, hair;
        public bool shirtless, longSleeves = true, bareArmL, bareArmR, shoesOn = true, hasHair;
        /// <summary>Dark rips in the clothes and blood patches.</summary>
        public int torn, blood;
        public bool chinBlood, freshBlood;
        public bool helmet, vest, deltoids, hump, pustules, ribs, claws, spikes, teeth, bigMouth;

        // ------------------------------------------------------------------ movement (degrees, metres)
        /// <summary>Forward bend of the torso, side lean, head pitch (negative looks up) and head tilt.</summary>
        public float hunch = 18f, lean, headPitch = -14f, headTilt;
        /// <summary>Arm angle while walking (about -90 reaches forward, above -50 the arm hangs and swings).</summary>
        public float reachL = -88f, reachR = -88f, armSwing = 10f, elbowL = 14f, elbowR = 14f, splay = 8f;
        /// <summary>Metres per walk cycle (two steps), vertical bob, side sway, permanent knee bend, limp amount, jaw opening.</summary>
        public float stride = 1.6f, bob = 0.05f, sway = 4f, kneeBend, limp, jaw = 8f;
        public int limpSide;
        /// <summary>Seconds between head jerks and their strength.</summary>
        public float jerkMin = 1.5f, jerkMax = 5f, jerkAmp = 1f;
        /// <summary>Sprints with pumping arms when chasing (runner, stalker).</summary>
        public bool sprinter;
        public ZombieAttack attack = ZombieAttack.Grab;
        /// <summary>Direction of the death fall: 0 backwards, 1 forwards, 2 to the left, 3 to the right.</summary>
        public int deathDir;
        public uint seed;

        private static readonly Color[] Shirts =
        {
            new Color(0.38f, 0.19f, 0.17f), new Color(0.21f, 0.26f, 0.35f), new Color(0.5f, 0.48f, 0.42f), new Color(0.25f, 0.3f, 0.22f),
            new Color(0.36f, 0.31f, 0.24f), new Color(0.3f, 0.3f, 0.31f), new Color(0.44f, 0.38f, 0.2f), new Color(0.17f, 0.17f, 0.18f),
            new Color(0.34f, 0.23f, 0.32f), new Color(0.22f, 0.34f, 0.33f),
        };
        private static readonly Color[] Trousers =
        {
            new Color(0.18f, 0.21f, 0.28f), new Color(0.13f, 0.13f, 0.14f), new Color(0.32f, 0.29f, 0.22f),
            new Color(0.25f, 0.25f, 0.26f), new Color(0.22f, 0.17f, 0.13f), new Color(0.2f, 0.23f, 0.18f),
        };
        private static readonly Color[] Hairs =
        {
            new Color(0.08f, 0.065f, 0.05f), new Color(0.2f, 0.13f, 0.08f), new Color(0.35f, 0.33f, 0.3f), new Color(0.38f, 0.29f, 0.15f),
        };
        // few skin shades, so the material cache stays small
        private static readonly float[] SkinShades = { 0.9f, 1f, 1.1f };

        /// <param name="typeId">Zombie type (walker, runner, brute, screamer, toxic, armored, stalker, boss).</param>
        /// <param name="uid">Zombie uid: the seed of the variations.</param>
        /// <param name="size">Type size (brutes a bit more); the height is capped, the rest becomes bulk.</param>
        public static ZombieLook For(string typeId, string uid, float size, Color typeColor, Color eyes)
        {
            uint seed = Hash(uid ?? typeId ?? "");
            var r = new LookRng(seed);
            if (size <= 0f) size = 1f;
            var k = new ZombieLook { seed = seed, eyes = eyes };
            k.height = Mathf.Min(size, 1.25f);
            k.width = size / k.height;
            k.skin = Mats.Shade(typeColor, 1.15f);
            k.shirt = Shirts[r.Int(Shirts.Length)];
            k.pants = Trousers[r.Int(Trousers.Length)];
            k.hair = Hairs[r.Int(Hairs.Length)];
            k.shoes = new Color(0.11f, 0.095f, 0.085f);
            float fall = r.Float();
            k.deathDir = fall < 0.4f ? 0 : fall < 0.65f ? 1 : fall < 0.825f ? 2 : 3;
            k.headTilt = r.Range(-8f, 8f);
            k.jaw = r.Range(4f, 12f);
            switch (typeId)
            {
                case "runner": Runner(k, ref r); break;
                case "brute": Brute(k, ref r); break;
                case "screamer": Screamer(k, ref r); break;
                case "toxic": Toxic(k, ref r); break;
                case "armored": Armored(k, ref r); break;
                case "stalker": Stalker(k, ref r); break;
                case "boss": Boss(k, ref r); break;
                default: Walker(k, ref r); break;
            }
            return k;
        }

        /// <summary>FNV-1a with a final mix: uids are short and sequential ("z1", "z2", ...).</summary>
        private static uint Hash(string s)
        {
            uint h = 2166136261u;
            foreach (char ch in s) { h ^= ch; h *= 16777619u; }
            h ^= h >> 16; h *= 0x85EBCA6Bu; h ^= h >> 13; h *= 0xC2B2AE35u; h ^= h >> 16;
            return h;
        }

        /// <summary>The common dead neighbour: build, height, posture, arms, limp and clothes all vary.</summary>
        private static void Walker(ZombieLook k, ref LookRng r)
        {
            float build = r.Float();
            if (build < 0.3f) { k.chestW = 0.42f; k.chestD = 0.25f; k.armThick = 0.12f; k.legThick = 0.17f; }
            else if (build > 0.8f) { k.chestW = 0.5f; k.chestD = 0.3f; k.belly = r.Range(0.15f, 0.3f); k.armThick = 0.14f; k.legThick = 0.21f; }
            k.height *= r.Range(0.94f, 1.06f);
            k.legLen += r.Range(-0.03f, 0.03f);
            k.skin = Mats.Shade(k.skin, SkinShades[r.Int(SkinShades.Length)]);
            k.hunch = r.Range(12f, 24f);
            k.lean = r.Range(-7f, 7f);
            k.headPitch = -k.hunch * 0.75f + r.Range(-6f, 6f);
            float arms = r.Float();
            if (arms < 0.55f) { k.reachL = r.Range(-98f, -80f); k.reachR = r.Range(-98f, -80f); }
            else if (arms < 0.8f) { if (r.Chance(0.5f)) k.reachL = r.Range(-22f, -6f); else k.reachR = r.Range(-22f, -6f); k.armSwing = 14f; }
            else { k.reachL = r.Range(-18f, -6f); k.reachR = r.Range(-18f, -6f); k.armSwing = 16f; }
            k.elbowL = r.Range(6f, 26f);
            k.elbowR = r.Range(6f, 26f);
            if (r.Chance(0.3f)) { k.limp = r.Range(0.6f, 1f); k.limpSide = r.Int(2); }
            k.stride = r.Range(1.45f, 1.75f);
            k.longSleeves = r.Chance(0.5f);
            if (r.Chance(0.25f)) { if (r.Chance(0.5f)) k.bareArmL = true; else k.bareArmR = true; }
            k.torn = r.Int(4);
            k.blood = 1 + r.Int(3);
            k.chinBlood = r.Chance(0.5f);
            k.hasHair = r.Chance(0.65f);
            k.shoesOn = r.Chance(0.85f);
        }

        /// <summary>Freshly turned: thin and long-limbed, sprints with pumping arms, lots of fresh blood.</summary>
        private static void Runner(ZombieLook k, ref LookRng r)
        {
            k.legLen = 1f; k.legThick = 0.155f; k.hipX = 0.11f;
            k.torsoLen = 0.6f; k.chestW = 0.38f; k.chestD = 0.23f;
            k.shoulderX = 0.235f; k.upperArm = 0.33f; k.foreArm = 0.31f; k.armThick = 0.105f;
            k.head = 0.95f; k.neck = 0.16f; k.neckThick = 0.095f;
            k.hunch = r.Range(16f, 24f); k.headPitch = -k.hunch * 0.8f; k.lean = r.Range(-4f, 4f);
            k.reachL = r.Range(-70f, -52f); k.reachR = r.Range(-70f, -52f); k.armSwing = 18f; k.elbowL = k.elbowR = 28f; k.splay = 10f;
            k.bob = 0.06f; k.sway = 3f; k.jaw = r.Range(10f, 18f);
            k.jerkMin = 0.8f; k.jerkMax = 2.5f; k.jerkAmp = 1.2f;
            k.sprinter = true; k.attack = ZombieAttack.Swipe;
            k.longSleeves = r.Chance(0.25f);
            k.torn = 1 + r.Int(3); k.blood = 2 + r.Int(3); k.chinBlood = true; k.freshBlood = true;
            k.hasHair = r.Chance(0.75f); k.shoesOn = r.Chance(0.9f);
        }

        /// <summary>Bulky: wide shoulders with a hump, big head on a short neck, heavy hanging arms, swaying gait.</summary>
        private static void Brute(ZombieLook k, ref LookRng r)
        {
            k.legLen = 0.78f; k.legThick = 0.26f; k.hipX = 0.15f; k.stance = 4f;
            k.torsoLen = 0.64f; k.chestW = 0.54f; k.chestD = 0.36f; k.belly = 0.3f;
            k.shoulderX = 0.36f; k.upperArm = 0.31f; k.foreArm = 0.31f; k.armThick = 0.19f; k.hand = 1.5f;
            k.head = 1.2f; k.headWidth = 1.05f; k.neck = 0.05f; k.neckThick = 0.2f; k.headFwd = 0.05f;
            k.deltoids = true; k.hump = true;
            k.hunch = 22f; k.headPitch = -20f; k.lean = r.Range(-4f, 4f);
            k.reachL = k.reachR = -18f; k.armSwing = 18f; k.elbowL = k.elbowR = 22f; k.splay = 16f;
            k.stride = 1.8f; k.bob = 0.07f; k.sway = 8f; k.jaw = r.Range(8f, 16f);
            k.jerkMin = 3f; k.jerkMax = 7f; k.jerkAmp = 0.6f;
            k.attack = ZombieAttack.Smash;
            k.shirt = Mats.Shade(k.shirt, 0.8f); k.longSleeves = false; k.bareArmL = k.bareArmR = true;
            k.torn = 3; k.blood = 2 + r.Int(2); k.chinBlood = true; k.hasHair = r.Chance(0.2f);
        }

        /// <summary>Emaciated with visible ribs, long neck and a wide open jaw; flails its arms.</summary>
        private static void Screamer(ZombieLook k, ref LookRng r)
        {
            k.legLen = 0.94f; k.legThick = 0.13f; k.hipX = 0.1f;
            k.torsoLen = 0.6f; k.chestW = 0.36f; k.chestD = 0.21f;
            k.shoulderX = 0.22f; k.upperArm = 0.33f; k.foreArm = 0.31f; k.armThick = 0.095f;
            k.head = 0.95f; k.neck = 0.2f; k.neckThick = 0.085f;
            k.shirtless = true; k.ribs = true; k.teeth = true; k.bigMouth = true;
            k.hunch = 14f; k.headPitch = -6f;
            k.reachL = r.Range(-20f, -8f); k.reachR = r.Range(-20f, -8f); k.armSwing = 22f; k.elbowL = k.elbowR = 18f; k.splay = 12f;
            k.stride = 1.55f; k.jaw = 38f;
            k.jerkMin = 0.5f; k.jerkMax = 1.8f; k.jerkAmp = 1.4f;
            k.attack = ZombieAttack.Flail;
            k.pants = new Color(0.2f, 0.17f, 0.2f);
            k.torn = 2; k.blood = 1 + r.Int(2); k.hasHair = r.Chance(0.5f); k.hair = new Color(0.36f, 0.34f, 0.32f); k.shoesOn = false;
        }

        /// <summary>Bloated belly and glowing green pustules; waddles with half-raised arms.</summary>
        private static void Toxic(ZombieLook k, ref LookRng r)
        {
            k.legLen = 0.86f; k.legThick = 0.21f;
            k.torsoLen = 0.6f; k.chestW = 0.5f; k.chestD = 0.32f; k.belly = 0.55f;
            k.shoulderX = 0.29f; k.armThick = 0.14f;
            k.neck = 0.1f; k.neckThick = 0.13f;
            k.pustules = true;
            k.hunch = 16f; k.headPitch = -12f; k.lean = r.Range(-6f, 6f);
            k.reachL = r.Range(-60f, -50f); k.reachR = r.Range(-60f, -50f); k.elbowL = k.elbowR = 32f; k.armSwing = 12f; k.splay = 14f;
            k.stride = 1.4f; k.sway = 7f; k.jaw = r.Range(12f, 20f);
            k.jerkMin = 1.2f; k.jerkMax = 4f;
            k.shirt = new Color(0.4f, 0.4f, 0.22f); k.pants = new Color(0.22f, 0.22f, 0.16f); k.longSleeves = false;
            k.torn = 4; k.blood = 1;
        }

        /// <summary>A turned soldier: helmet, vest with metal plates and shoulder pads; stiff and upright.</summary>
        private static void Armored(ZombieLook k, ref LookRng r)
        {
            k.legLen = 0.88f; k.legThick = 0.2f;
            k.torsoLen = 0.6f; k.chestW = 0.48f; k.chestD = 0.28f;
            k.shoulderX = 0.29f; k.armThick = 0.14f;
            k.neck = 0.12f;
            k.helmet = true; k.vest = true; k.deltoids = true;
            k.hunch = 10f; k.headPitch = -8f; k.lean = r.Range(-3f, 3f);
            k.reachL = r.Range(-68f, -56f); k.reachR = r.Range(-68f, -56f); k.armSwing = 6f; k.elbowL = k.elbowR = 12f; k.splay = 10f;
            k.stride = 1.5f; k.bob = 0.04f; k.sway = 3f; k.jaw = 6f;
            k.jerkMin = 4f; k.jerkMax = 9f; k.jerkAmp = 0.5f;
            k.shirt = new Color(0.27f, 0.3f, 0.23f); k.pants = new Color(0.25f, 0.27f, 0.21f); k.shoes = new Color(0.07f, 0.07f, 0.07f);
            k.torn = 1; k.blood = 1 + r.Int(2);
        }

        /// <summary>Pale, thin and hunched with bent knees, long arms and claws; sprints when it strikes.</summary>
        private static void Stalker(ZombieLook k, ref LookRng r)
        {
            k.skin = Color.Lerp(k.skin, new Color(0.76f, 0.78f, 0.8f), 0.55f);
            k.legLen = 0.97f; k.legThick = 0.135f; k.hipX = 0.1f;
            k.torsoLen = 0.62f; k.chestW = 0.34f; k.chestD = 0.2f;
            k.shoulderX = 0.21f; k.upperArm = 0.36f; k.foreArm = 0.34f; k.armThick = 0.095f; k.hand = 1.1f;
            k.head = 0.92f; k.neck = 0.16f; k.neckThick = 0.085f; k.headFwd = 0.03f;
            k.shirtless = true; k.ribs = true; k.claws = true; k.teeth = true;
            k.hunch = 36f; k.headPitch = -34f; k.kneeBend = 22f;
            k.reachL = k.reachR = -40f; k.elbowL = k.elbowR = 35f; k.splay = 14f; k.armSwing = 10f;
            k.stride = 1.5f; k.bob = 0.04f; k.sway = 2f; k.jaw = 16f;
            k.jerkMin = 0.7f; k.jerkMax = 2.4f; k.jerkAmp = 0.8f;
            k.sprinter = true; k.attack = ZombieAttack.Swipe;
            k.pants = new Color(0.08f, 0.08f, 0.09f); k.shoesOn = false;
            k.torn = 2; k.blood = 1 + r.Int(2);
        }

        /// <summary>Huge and hunched: massive shoulders and long arms, bone spikes and plates, a small head.</summary>
        private static void Boss(ZombieLook k, ref LookRng r)
        {
            k.legLen = 0.72f; k.legThick = 0.2f; k.hipX = 0.15f; k.stance = 6f;
            k.torsoLen = 0.7f; k.chestW = 0.5f; k.chestD = 0.36f; k.belly = 0.3f;
            k.shoulderX = 0.33f; k.upperArm = 0.4f; k.foreArm = 0.4f; k.armThick = 0.16f; k.hand = 1.6f;
            k.head = 1.05f; k.headWidth = 1.25f; k.neck = 0.04f; k.neckThick = 0.18f; k.headFwd = 0.06f;
            k.shirtless = true; k.deltoids = true; k.hump = true; k.spikes = true; k.teeth = true;
            k.hunch = 28f; k.headPitch = -30f;
            k.reachL = k.reachR = -28f; k.armSwing = 14f; k.elbowL = k.elbowR = 18f; k.splay = 14f;
            k.stride = 2f; k.bob = 0.08f; k.sway = 9f; k.jaw = 20f;
            k.jerkMin = 3f; k.jerkMax = 7f; k.jerkAmp = 0.6f;
            k.attack = ZombieAttack.Smash;
            k.pants = new Color(0.15f, 0.12f, 0.11f); k.shoesOn = false;
            k.torn = 2; k.blood = 4; k.chinBlood = true;
            if (k.deathDir == 0) k.deathDir = 1; // the spikes on the back would stick into the ground
        }
    }
}
