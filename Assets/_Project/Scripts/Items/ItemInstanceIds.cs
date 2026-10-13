using System;
using Aetherfall.Utilities;

namespace Aetherfall.Items
{
    /// <summary>
    /// Item instance ids (architecture 6.1/6.2: 16 hex digits, e.g. <c>9f3a0c7e12b44d01</c>, from an <see cref="IRandom"/>,
    /// never from time stamps). 64 random bits: 100,000 items collide with a probability of about 3 × 10⁻¹⁰.
    /// </summary>
    public static class ItemInstanceIds
    {
        /// <summary>Length of an id.</summary>
        public const int Length = 16;

        /// <summary>Creates a new id.</summary>
        /// <param name="random">Random source.</param>
        public static string Create(IRandom random)
        {
            if (random == null)
            {
                throw new ArgumentNullException(nameof(random));
            }

            ulong value = ((ulong)random.NextUInt() << 32) | random.NextUInt();
            return value.ToString("x16");
        }

        /// <summary>True if <paramref name="id"/> has the format of an instance id (16 lowercase hex digits).</summary>
        /// <param name="id">Id.</param>
        public static bool IsValid(string id)
        {
            if (id == null || id.Length != Length)
            {
                return false;
            }

            for (int i = 0; i < id.Length; i++)
            {
                char c = id[i];
                if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')))
                {
                    return false;
                }
            }

            return true;
        }
    }
}
