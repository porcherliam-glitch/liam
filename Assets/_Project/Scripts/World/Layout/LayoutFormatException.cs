using System;

namespace Aetherfall.World
{
    /// <summary>The layout text is not valid JSON. The message is German (shown in the editor) and names line and column.</summary>
    public sealed class LayoutFormatException : Exception
    {
        /// <summary>Creates the exception.</summary>
        /// <param name="message">German description.</param>
        /// <param name="line">1-based line.</param>
        /// <param name="column">1-based column.</param>
        public LayoutFormatException(string message, int line, int column)
            : base(message + " (Zeile " + line + ", Spalte " + column + ")")
        {
            Line = line;
            Column = column;
        }

        /// <summary>1-based line of the error.</summary>
        public int Line { get; }

        /// <summary>1-based column of the error.</summary>
        public int Column { get; }
    }
}
