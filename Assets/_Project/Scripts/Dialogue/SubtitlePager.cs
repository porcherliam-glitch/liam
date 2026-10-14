using System.Collections.Generic;
using System.Text;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Splits a line into subtitle pages (GDD 02, 12.7 and GDD 05 4.2): at most 2 lines of 45 characters per page, wrapped at
    /// spaces; a word longer than a line is cut. A line of up to 180 characters gives at most 2 pages (longer lines are a
    /// validator warning). Pure logic.
    /// </summary>
    public static class SubtitlePager
    {
        /// <summary>Characters per subtitle line.</summary>
        public const int CharactersPerLine = 45;

        /// <summary>Lines per page.</summary>
        public const int LinesPerPage = 2;

        /// <summary>Splits a text into pages; an empty text gives one empty page.</summary>
        /// <param name="text">Text.</param>
        /// <param name="charactersPerLine">Characters per line (at least 8).</param>
        /// <param name="linesPerPage">Lines per page (at least 1).</param>
        public static List<string> Paginate(string text, int charactersPerLine = CharactersPerLine, int linesPerPage = LinesPerPage)
        {
            var pages = new List<string>();
            List<string> lines = Wrap(text ?? string.Empty, charactersPerLine < 8 ? 8 : charactersPerLine);
            int perPage = linesPerPage < 1 ? 1 : linesPerPage;
            var page = new StringBuilder();
            for (int i = 0; i < lines.Count; i++)
            {
                if (i > 0 && i % perPage == 0)
                {
                    pages.Add(page.ToString());
                    page.Clear();
                }

                if (page.Length > 0)
                {
                    page.Append('\n');
                }

                page.Append(lines[i]);
            }

            pages.Add(page.ToString());
            return pages;
        }

        /// <summary>Wraps a text into lines of at most <paramref name="width"/> characters (word wrap at spaces).</summary>
        /// <param name="text">Text.</param>
        /// <param name="width">Characters per line.</param>
        public static List<string> Wrap(string text, int width)
        {
            var lines = new List<string>();
            string[] words = (text ?? string.Empty).Replace('\n', ' ').Split(' ');
            var line = new StringBuilder();
            for (int i = 0; i < words.Length; i++)
            {
                string word = words[i];
                if (word.Length == 0)
                {
                    continue;
                }

                while (word.Length > width)
                {
                    if (line.Length > 0)
                    {
                        lines.Add(line.ToString());
                        line.Clear();
                    }

                    lines.Add(word.Substring(0, width));
                    word = word.Substring(width);
                }

                if (line.Length > 0 && line.Length + 1 + word.Length > width)
                {
                    lines.Add(line.ToString());
                    line.Clear();
                }

                if (line.Length > 0)
                {
                    line.Append(' ');
                }

                line.Append(word);
            }

            if (line.Length > 0 || lines.Count == 0)
            {
                lines.Add(line.ToString());
            }

            return lines;
        }
    }
}
