using System;
using System.Globalization;
using System.Text;

namespace Aetherfall.World
{
    /// <summary>
    /// Small strict JSON reader (RFC 8259) for layout files: objects, arrays, strings with all escapes, numbers, true, false,
    /// null. Duplicate member names and trailing text are errors. Errors throw <see cref="LayoutFormatException"/> with line
    /// and column. Pure C#, allocation only for the result.
    /// </summary>
    public static class LayoutJsonParser
    {
        private const int MaxDepth = 64;

        /// <summary>Parses a complete JSON document.</summary>
        /// <param name="text">JSON text (a leading byte order mark is skipped).</param>
        /// <returns>The root value.</returns>
        /// <exception cref="LayoutFormatException">The text is not valid JSON.</exception>
        public static JsonNode Parse(string text)
        {
            if (text == null)
            {
                throw new LayoutFormatException("Kein Text", 1, 1);
            }

            var reader = new Reader(text);
            if (reader.Peek() == '﻿')
            {
                reader.Advance();
            }

            reader.SkipWhitespace();
            JsonNode root = reader.ReadValue(0);
            reader.SkipWhitespace();
            if (!reader.AtEnd)
            {
                throw reader.Error("Unerwarteter Text nach dem Ende des Dokuments");
            }

            return root;
        }

        private sealed class Reader
        {
            private readonly string _text;
            private int _index;
            private int _line = 1;
            private int _column = 1;

            public Reader(string text)
            {
                _text = text;
            }

            public bool AtEnd => _index >= _text.Length;

            public char Peek()
            {
                return _index < _text.Length ? _text[_index] : '\0';
            }

            public void Advance()
            {
                if (_index >= _text.Length)
                {
                    return;
                }

                if (_text[_index] == '\n')
                {
                    _line++;
                    _column = 1;
                }
                else
                {
                    _column++;
                }

                _index++;
            }

            public LayoutFormatException Error(string message)
            {
                return new LayoutFormatException(message, _line, _column);
            }

            public void SkipWhitespace()
            {
                while (!AtEnd)
                {
                    char c = Peek();
                    if (c != ' ' && c != '\t' && c != '\n' && c != '\r')
                    {
                        return;
                    }

                    Advance();
                }
            }

            public JsonNode ReadValue(int depth)
            {
                if (depth > MaxDepth)
                {
                    throw Error("Zu tief verschachtelt");
                }

                if (AtEnd)
                {
                    throw Error("Unerwartetes Ende des Textes");
                }

                char c = Peek();
                switch (c)
                {
                    case '{':
                        return ReadObject(depth);
                    case '[':
                        return ReadArray(depth);
                    case '"':
                    {
                        int line = _line;
                        return JsonNode.CreateString(ReadString(), line);
                    }
                    case 't':
                        ExpectWord("true");
                        return JsonNode.CreateBoolean(true, _line);
                    case 'f':
                        ExpectWord("false");
                        return JsonNode.CreateBoolean(false, _line);
                    case 'n':
                        ExpectWord("null");
                        return JsonNode.CreateNull(_line);
                    default:
                        if (c == '-' || (c >= '0' && c <= '9'))
                        {
                            return ReadNumber();
                        }

                        throw Error("Unerwartetes Zeichen '" + c + "'");
                }
            }

            private JsonNode ReadObject(int depth)
            {
                JsonNode node = JsonNode.CreateObject(_line);
                Advance(); // {
                SkipWhitespace();
                if (Peek() == '}')
                {
                    Advance();
                    return node;
                }

                while (true)
                {
                    SkipWhitespace();
                    if (Peek() != '"')
                    {
                        throw Error("Name in Anführungszeichen erwartet");
                    }

                    int nameLine = _line;
                    int nameColumn = _column;
                    string name = ReadString();
                    SkipWhitespace();
                    if (Peek() != ':')
                    {
                        throw Error("':' erwartet");
                    }

                    Advance();
                    SkipWhitespace();
                    JsonNode value = ReadValue(depth + 1);
                    if (!node.TryAddMember(name, value))
                    {
                        throw new LayoutFormatException("Name \"" + name + "\" kommt doppelt vor", nameLine, nameColumn);
                    }

                    SkipWhitespace();
                    char c = Peek();
                    if (c == ',')
                    {
                        Advance();
                        continue;
                    }

                    if (c == '}')
                    {
                        Advance();
                        return node;
                    }

                    throw Error("',' oder '}' erwartet");
                }
            }

            private JsonNode ReadArray(int depth)
            {
                JsonNode node = JsonNode.CreateArray(_line);
                Advance(); // [
                SkipWhitespace();
                if (Peek() == ']')
                {
                    Advance();
                    return node;
                }

                while (true)
                {
                    SkipWhitespace();
                    node.AddItem(ReadValue(depth + 1));
                    SkipWhitespace();
                    char c = Peek();
                    if (c == ',')
                    {
                        Advance();
                        continue;
                    }

                    if (c == ']')
                    {
                        Advance();
                        return node;
                    }

                    throw Error("',' oder ']' erwartet");
                }
            }

            private string ReadString()
            {
                Advance(); // opening quote
                var builder = new StringBuilder();
                while (true)
                {
                    if (AtEnd)
                    {
                        throw Error("Text ohne schließendes Anführungszeichen");
                    }

                    char c = Peek();
                    if (c == '"')
                    {
                        Advance();
                        return builder.ToString();
                    }

                    if (c < ' ')
                    {
                        throw Error("Steuerzeichen im Text (Zeilenumbruch als \\n schreiben)");
                    }

                    if (c != '\\')
                    {
                        builder.Append(c);
                        Advance();
                        continue;
                    }

                    Advance();
                    char escape = Peek();
                    switch (escape)
                    {
                        case '"':
                            builder.Append('"');
                            break;
                        case '\\':
                            builder.Append('\\');
                            break;
                        case '/':
                            builder.Append('/');
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
                            Advance();
                            builder.Append(ReadHex4());
                            continue;
                        default:
                            throw Error("Unbekannte Escape-Folge \\" + escape);
                    }

                    Advance();
                }
            }

            private char ReadHex4()
            {
                int value = 0;
                for (int i = 0; i < 4; i++)
                {
                    char c = Peek();
                    int digit;
                    if (c >= '0' && c <= '9')
                    {
                        digit = c - '0';
                    }
                    else if (c >= 'a' && c <= 'f')
                    {
                        digit = c - 'a' + 10;
                    }
                    else if (c >= 'A' && c <= 'F')
                    {
                        digit = c - 'A' + 10;
                    }
                    else
                    {
                        throw Error("\\u braucht vier Hex-Ziffern");
                    }

                    value = (value << 4) | digit;
                    Advance();
                }

                return (char)value;
            }

            private JsonNode ReadNumber()
            {
                int line = _line;
                int start = _index;
                if (Peek() == '-')
                {
                    Advance();
                }

                if (Peek() == '0')
                {
                    Advance();
                }
                else if (Peek() >= '1' && Peek() <= '9')
                {
                    SkipDigits();
                }
                else
                {
                    throw Error("Ziffer erwartet");
                }

                if (Peek() == '.')
                {
                    Advance();
                    if (Peek() < '0' || Peek() > '9')
                    {
                        throw Error("Ziffer nach dem Punkt erwartet");
                    }

                    SkipDigits();
                }

                if (Peek() == 'e' || Peek() == 'E')
                {
                    Advance();
                    if (Peek() == '+' || Peek() == '-')
                    {
                        Advance();
                    }

                    if (Peek() < '0' || Peek() > '9')
                    {
                        throw Error("Ziffer im Exponenten erwartet");
                    }

                    SkipDigits();
                }

                string token = _text.Substring(start, _index - start);
                if (!double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out double value) ||
                    double.IsInfinity(value) || double.IsNaN(value))
                {
                    throw Error("Zahl außerhalb des gültigen Bereichs: " + token);
                }

                return JsonNode.CreateNumber(value, line);
            }

            private void SkipDigits()
            {
                while (Peek() >= '0' && Peek() <= '9')
                {
                    Advance();
                }
            }

            private void ExpectWord(string word)
            {
                for (int i = 0; i < word.Length; i++)
                {
                    if (Peek() != word[i])
                    {
                        throw Error("'" + word + "' erwartet");
                    }

                    Advance();
                }
            }
        }
    }
}
