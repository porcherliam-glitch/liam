using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// The damage of one hit split by damage type (GDD 03 8.2: "60 Stich + 40 Feuer"). Immutable value type; build it with
    /// <see cref="Single"/> and <see cref="With"/>. Negative amounts are stored as 0.
    /// </summary>
    public readonly struct DamagePacket
    {
        private readonly DamageTypeValues _amounts;

        private DamagePacket(DamageTypeValues amounts)
        {
            _amounts = amounts;
        }

        /// <summary>A packet with damage of only one type.</summary>
        /// <param name="type">Damage type.</param>
        /// <param name="amount">Amount (negative values count as 0).</param>
        public static DamagePacket Single(DamageType type, float amount)
        {
            return default(DamagePacket).With(type, amount);
        }

        /// <summary>Amount of one type.</summary>
        /// <param name="type">Damage type.</param>
        public float Get(DamageType type)
        {
            return _amounts.Get(type);
        }

        /// <summary>Copy with the amount of one type replaced.</summary>
        /// <param name="type">Damage type.</param>
        /// <param name="amount">New amount (negative values count as 0).</param>
        public DamagePacket With(DamageType type, float amount)
        {
            return new DamagePacket(_amounts.With(type, amount > 0f ? amount : 0f));
        }

        /// <summary>Sum of all types.</summary>
        public float Total => _amounts.Sum;

        /// <summary>True if no type carries damage.</summary>
        public bool IsEmpty => !(Total > 0f);

        /// <summary>
        /// The type with the largest share (ties: the lower enum value). Decides rules that apply to the whole hit, e.g. the
        /// +5 percentage points critical chance of stab damage. <see cref="DamageType.Slash"/> for an empty packet.
        /// </summary>
        public DamageType PrimaryType
        {
            get
            {
                DamageType best = DamageType.Slash;
                float bestAmount = 0f;
                for (int i = 0; i < DamageTypes.Count; i++)
                {
                    float amount = Get((DamageType)i);
                    if (amount > bestAmount)
                    {
                        best = (DamageType)i;
                        bestAmount = amount;
                    }
                }

                return best;
            }
        }

        /// <summary>Copy with every type multiplied by <paramref name="factor"/>.</summary>
        /// <param name="factor">Factor (negative values count as 0).</param>
        public DamagePacket Scaled(float factor)
        {
            return new DamagePacket(_amounts.Scaled(Math.Max(0f, factor)));
        }

        /// <inheritdoc />
        public override string ToString()
        {
            string text = string.Empty;
            for (int i = 0; i < DamageTypes.Count; i++)
            {
                float amount = Get((DamageType)i);
                if (amount > 0f)
                {
                    text += (text.Length > 0 ? " + " : string.Empty) + amount + " " + (DamageType)i;
                }
            }

            return "DamagePacket(" + (text.Length > 0 ? text : "empty") + ")";
        }
    }
}
