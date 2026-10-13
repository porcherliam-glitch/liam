using System.Collections.Generic;

namespace Aetherfall.Items
{
    /// <summary>Stable save ids of <see cref="ItemFlags"/> (GDD 04 4.9: <c>"flags": [ "neu" ]</c>). Never change a value.</summary>
    public static class ItemFlagIds
    {
        /// <summary>Id of <see cref="ItemFlags.New"/>.</summary>
        public const string New = "neu";

        /// <summary>Id of <see cref="ItemFlags.Favorite"/>.</summary>
        public const string Favorite = "favorit";

        /// <summary>Id of <see cref="ItemFlags.Locked"/>.</summary>
        public const string Locked = "gesperrt";

        /// <summary>Id of <see cref="ItemFlags.Stolen"/>.</summary>
        public const string Stolen = "gestohlen";

        /// <summary>Writes the ids of all set flags into a new list.</summary>
        /// <param name="flags">Flags.</param>
        public static List<string> ToIds(ItemFlags flags)
        {
            var ids = new List<string>(4);
            if ((flags & ItemFlags.New) != 0)
            {
                ids.Add(New);
            }

            if ((flags & ItemFlags.Favorite) != 0)
            {
                ids.Add(Favorite);
            }

            if ((flags & ItemFlags.Locked) != 0)
            {
                ids.Add(Locked);
            }

            if ((flags & ItemFlags.Stolen) != 0)
            {
                ids.Add(Stolen);
            }

            return ids;
        }

        /// <summary>Parses flag ids; unknown ids are ignored.</summary>
        /// <param name="ids">Ids or null.</param>
        public static ItemFlags FromIds(IEnumerable<string> ids)
        {
            var flags = ItemFlags.None;
            if (ids == null)
            {
                return flags;
            }

            foreach (string id in ids)
            {
                switch (id)
                {
                    case New:
                        flags |= ItemFlags.New;
                        break;
                    case Favorite:
                        flags |= ItemFlags.Favorite;
                        break;
                    case Locked:
                        flags |= ItemFlags.Locked;
                        break;
                    case Stolen:
                        flags |= ItemFlags.Stolen;
                        break;
                }
            }

            return flags;
        }
    }
}
