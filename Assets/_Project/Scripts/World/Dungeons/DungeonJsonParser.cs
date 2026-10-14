using System;
using System.Globalization;
using System.Text;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Strict JSON parser (RFC 8259) for the layout files: objects with unique keys, arrays, strings with all escapes, numbers,
    /// <c>true</c>, <c>false</c>, <c>null</c>. Errors name line and column. No comments, no trailing commas (the same file is
    /// read by Python in the Blender preview, whose <c>json</c> module is strict as well). Pure C#.
    /// </summary>
    public static class DungeonJsonParser
    {
        private const int MaxDepth = 64;

        /// <summary>Parses a complete document.</summary>
        /// <param name="text">JSON text (a leading UTF-8 byte order mark is ignored).</param>
        /// <returns>The root value.</returns>
        /// <exception cref="DungeonLayoutException">The text is not valid JSON.</exception>
        public static DungeonJsonValue Parse(string text)
        {
            if (text == null)
            {
                throw new DungeonLayoutException("Die Layout-Datei ist leer.");
            }

            var reader = new Reader(text);
            reader.SkipWhitespace();
            if (reader.AtEnd)
            {
                throw new DungeonLayoutException("Die Layout-Datei ist leer.");
            }

            DungeonJsonValue root = reader.ReadValue(string.Empty, 0);
            reader.SkipWhitespace();
            if (!reader.AtEnd)
            {
                throw reader.Error("Nach dem Ende des JSON-Dokuments folgt noch Text");
            }

            return root;
        }

        private sealed class Reader
        {
            private readonly string _text;
            private int _position;

            public Reader(string text)
            {
                _text = text;
                if (_text.Length > 0 && _text[0] == '﻿')
                {
                    _position = 1;
                }
            }

            public bool AtEnd => _position >= _text.Length;

            public void SkipWhitespace()
            {
                while (_position < _text.Length)
                {
                    char c = _text[_position];
                    if (c != ' ' && c != '\t' && c != '\n' && c != '\r')
                    {
                        return;
                    }

                    _position++;
                }
            }

            public DungeonJsonValue ReadValue(string path, int depth)
            {
                if (depth > MaxDepth)
                {
                    throw Error("Zu tief verschachtelt");
                }

                SkipWhitespace();
                if (AtEnd)
                {
                    throw Error("Unerwartetes Dateiende");
                }

                char c = _text[_position];
                switch (c)
                {
                    case '{':
                        return ReadObject(path, depth);
                    case '[':
                        return ReadArray(path, depth);
                    case '"':
                        return DungeonJsonValue.CreateString(ReadString(), path);
                    case 't':
                        ExpectWord("true");
                        return DungeonJsonValue.CreateBoolean(true, path);
                    case 'f':
                        ExpectWord("false");
                        return DungeonJsonValue.CreateBoolean(false, path);
                    case 'n':
                        ExpectWord("null");
                        return DungeonJsonValue.CreateNull(path);
                    default:
                        if (c == '-' || (c >= '0' && c <= '9'))
                        {
                            return DungeonJsonValue.CreateNumber(ReadNumber(), path);
                        }

                        throw Error("Unerwartetes Zeichen '" + c + "'");
                }
            }

            public DungeonLayoutException Error(string message)
            {
                int line = 1;
                int column = 1;
                int end = Math.Min(_position, _text.Length);
                for (int i = 0; i < end; i++)
                {
                    if (_text[i] == '\n')
                    {
                        line++;
                        column = 1;
                    }
                    else
                    {
                        column++;
                    }
                }

                return new DungeonLayoutException("JSON-Fehler in Zeile " + line + ", Spalte " + column + ": " + message + ".");
            }

            private DungeonJsonValue ReadObject(string path, int depth)
            {
                DungeonJsonValue result = DungeonJsonValue.CreateObject(path);
                _position++;
                SkipWhitespace();
                if (Peek() == '}')
                {
                    _position++;
                    return result;
                }

                while (true)
                {
                    SkipWhitespace();
                    if (Peek() != '"')
                    {
                        throw Error("Feldname in Anführungszeichen erwartet");
                    }

                    string key = ReadString();
                    SkipWhitespace();
                    if (Peek() != ':')
                    {
                        throw Error("':' nach dem Feldnamen '" + key + "' erwartet");
                    }

                    _position++;
                    string childPath = path.Length == 0 ? key : path + "." + key;
                    DungeonJsonValue value = ReadValue(childPath, depth + 1);
                    if (!result.TryAddMember(key, value))
                    {
                        throw Error("Feld '" + childPath + "' kommt doppelt vor");
                    }

                    SkipWhitespace();
                    char next = Peek();
                    _position++;
                    if (next == '}')
                    {
                        return result;
                    }

                    if (next != ',')
                    {
                        _position--;
                        throw Error("',' oder '}' erwartet");
                    }
                }
            }

            private DungeonJsonValue ReadArray(string path, int depth)
            {
                DungeonJsonValue result = DungeonJsonValue.CreateArray(path);
                _position++;
                SkipWhitespace();
                if (Peek() == ']')
                {
                    _position++;
                    return result;
                }

                while (true)
                {
                    result.AddItem(ReadValue(path + "[" + result.Count + "]", depth + 1));
                    SkipWhitespace();
                    char next = Peek();
                    _position++;
                    if (next == ']')
                    {
                        return result;
                    }

                    if (next != ',')
                    {
                        _position--;
                        throw Error("',' oder ']' erwartet");
                    }
                }
            }

            private string ReadString()
            {
                _position++;
                var builder = new StringBuilder();
                while (true)
                {
                    if (AtEnd)
                    {
                        throw Error("Text ohne schließendes Anführungszeichen");
                    }

                    char c = _text[_position++];
                    if (c == '"')
                    {
                        return builder.ToString();
                    }

                    if (c < ' ')
                    {
                        _position--;
                        throw Error("Steuerzeichen im Text (Zeilenumbruch bitte als \\n schreiben)");
                    }

                    if (c != '\\')
                    {
                        builder.Append(c);
                        continue;
                    }

                    if (AtEnd)
                    {
                        throw Error("Unvollständige Escape-Sequenz");
                    }

                    char escape = _text[_position++];
                    switch (escape)
                    {
                        case '"':
                        case '\\':
                        case '/':
                            builder.Append(escape);
                            break;
                        case 'b':
                            builder.Append('\b');
                            break;
                        case 'f':
                            builder.Append('\f');
                            break;
                        case 'n':
                            builder.Append('\n');
                            break;
                        case 'r':
                            builder.Append('\r');
                            break;
                        case 't':
                            builder.Append('\t');
                            break;
                        case 'u':
                            builder.Append(ReadUnicodeEscape());
                            break;
                        default:
                            _position--;
                            throw Error("Unbekannte Escape-Sequenz '\\" + escape + "'");
                    }
                }
            }

            private char ReadUnicodeEscape()
            {
                if (_position + 4 > _text.Length)
                {
                    throw Error("Unvollständige \\u-Sequenz");
                }

                int value = 0;
                for (int i = 0; i < 4; i++)
                {
                    char h = _text[_position++];
                    int digit = h >= '0' && h <= '9' ? h - '0' : h >= 'a' && h <= 'f' ? h - 'a' + 10 : h >= 'A' && h <= 'F' ? h - 'A' + 10 : -1;
                    if (digit < 0)
                    {
                        _position--;
                        throw Error("Ungültige \\u-Sequenz");
                    }

                    value = value * 16 + digit;
                }

                return (char)value;
            }

            private double ReadNumber()
            {
                int start = _position;
                if (Peek() == '-')
                {
                    _position++;
                }

                if (Peek() == '0')
                {
                    _position++;
                }
                else if (IsDigit(Peek()))
                {
                    SkipDigits();
                }
                else
                {
                    throw Error("Ziffer erwartet");
                }

                if (Peek() == '.')
                {
                    _position++;
                    if (!IsDigit(Peek()))
                    {
                        throw Error("Ziffer nach dem Dezimalpunkt erwartet");
                    }

                    SkipDigits();
                }

                if (Peek() == 'e' || Peek() == 'E')
                {
                    _position++;
                    if (Peek() == '+' || Peek() == '-')
                    {
                        _position++;
                    }

                    if (!IsDigit(Peek()))
                    {
                        throw Error("Ziffer im Exponenten erwartet");
                    }

                    SkipDigits();
                }

                string literal = _text.Substring(start, _position - start);
                return double.Parse(literal, NumberStyles.Float, CultureInfo.InvariantCulture);
            }

            private void SkipDigits()
            {
                while (IsDigit(Peek()))
                {
                    _position++;
                }
            }

            private void ExpectWord(string word)
            {
                if (_position + word.Length > _text.Length || string.CompareOrdinal(_text, _position, word, 0, word.Length) != 0)
                {
                    throw Error("'" + word + "' erwartet");
                }

                _position += word.Length;
            }

            private char Peek()
            {
                return _position < _text.Length ? _text[_position] : '\0';
            }

            private static bool IsDigit(char c)
            {
                return c >= '0' && c <= '9';
            }
        }
    }
}
