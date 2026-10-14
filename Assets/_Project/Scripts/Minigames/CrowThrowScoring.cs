using System;
using System.Collections.Generic;

namespace Aetherfall.Minigames
{
    /// <summary>
    /// Scoring of the dice game "Krähenwurf" (GDD 04 10.3): a 1 is worth 100, a 5 is worth 50, three of a kind the face × 100
    /// (three ones 1,000), the straight 1–5 is worth 500. A selection only counts if every die in it scores.
    /// </summary>
    public static class CrowThrowScoring
    {
        /// <summary>Points of the straight 1–5.</summary>
        public const int Straight = 500;

        /// <summary>Points of a selection of dice, or −1 if a die in it scores nothing (or the selection is empty).</summary>
        /// <param name="faces">Faces of the selected dice (1–6).</param>
        public static int Score(IReadOnlyList<int> faces)
        {
            if (faces == null || faces.Count == 0)
            {
                return -1;
            }

            int[] counts = Count(faces);
            if (faces.Count == 5 && counts[1] == 1 && counts[2] == 1 && counts[3] == 1 && counts[4] == 1 && counts[5] == 1)
            {
                return Straight;
            }

            int total = 0;
            for (int face = 1; face <= 6; face++)
            {
                int left = counts[face];
                if (left >= 3)
                {
                    total += face == 1 ? 1000 : face * 100;
                    left -= 3;
                }

                if (face == 1)
                {
                    total += left * 100;
                }
                else if (face == 5)
                {
                    total += left * 50;
                }
                else if (left > 0)
                {
                    return -1;
                }
            }

            return total;
        }

        /// <summary>
        /// The selection with the most points among the given dice: the straight, or all triples, ones and fives. Returns the
        /// indices into <paramref name="faces"/> and the points (0 and an empty list if nothing scores: the roll is lost).
        /// </summary>
        /// <param name="faces">Faces of the dice just rolled.</param>
        /// <param name="indices">Receives the indices of the best selection.</param>
        public static int Best(IReadOnlyList<int> faces, List<int> indices)
        {
            indices.Clear();
            if (faces == null || faces.Count == 0)
            {
                return 0;
            }

            int[] counts = Count(faces);
            if (faces.Count == 5 && Score(faces) == Straight)
            {
                for (int i = 0; i < faces.Count; i++)
                {
                    indices.Add(i);
                }

                return Straight;
            }

            var take = new int[7];
            for (int face = 1; face <= 6; face++)
            {
                if (counts[face] >= 3)
                {
                    take[face] = 3;
                }

                if (face == 1 || face == 5)
                {
                    take[face] = counts[face];
                }
            }

            var used = new int[7];
            var selected = new List<int>(faces.Count);
            for (int i = 0; i < faces.Count; i++)
            {
                int face = faces[i];
                if (face >= 1 && face <= 6 && used[face] < take[face])
                {
                    used[face]++;
                    indices.Add(i);
                    selected.Add(face);
                }
            }

            int points = Score(selected);
            if (points <= 0)
            {
                indices.Clear();
                return 0;
            }

            return points;
        }

        /// <summary>True if some selection of these dice scores.</summary>
        /// <param name="faces">Faces of the dice just rolled.</param>
        public static bool HasScore(IReadOnlyList<int> faces)
        {
            return Best(faces, new List<int>(5)) > 0;
        }

        private static int[] Count(IReadOnlyList<int> faces)
        {
            var counts = new int[7];
            for (int i = 0; i < faces.Count; i++)
            {
                int face = faces[i];
                if (face < 1 || face > 6)
                {
                    throw new ArgumentOutOfRangeException(nameof(faces), "Dice show 1 to 6, not " + face + ".");
                }

                counts[face]++;
            }

            return counts;
        }
    }
}
