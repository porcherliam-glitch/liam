namespace Aetherfall.Data
{
    /// <summary>
    /// Format rules of content ids (architecture 6.1): characters a–z, 0–9, underscore and dot; pattern
    /// <c>^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,6}$</c> (2–7 segments, the first starts with a letter); at most 96 characters.
    /// Pure logic, allocation-free.
    /// </summary>
    public static class ContentIdRules
    {
        /// <summary>Longest allowed id.</summary>
        public const int MaxLength = 96;

        /// <summary>Most segments (prefix plus up to 6 dot-separated parts).</summary>
        public const int MaxSegments = 7;

        /// <summary>True if <paramref name="id"/> follows the id format.</summary>
        /// <param name="id">Id to check.</param>
        public static bool IsValid(string id)
        {
            if (string.IsNullOrEmpty(id) || id.Length > MaxLength)
            {
                return false;
            }

            if (id[0] < 'a' || id[0] > 'z')
            {
                return false;
            }

            int segments = 1;
            int segmentLength = 0;
            for (int i = 0; i < id.Length; i++)
            {
                char c = id[i];
                if (c == '.')
                {
                    if (segmentLength == 0)
                    {
                        return false;
                    }

                    segments++;
                    segmentLength = 0;
                    continue;
                }

                bool allowed = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
                if (!allowed)
                {
                    return false;
                }

                segmentLength++;
            }

            return segmentLength > 0 && segments >= 2 && segments <= MaxSegments;
        }
    }
}
