using System.IO;
using System.IO.Compression;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Optional GZip compression of save files (architecture 9.3). The loader recognizes GZip by the magic bytes
    /// <c>1F 8B</c>, so compressed and uncompressed saves always load.
    /// </summary>
    public static class SaveCompression
    {
        /// <summary>True if <paramref name="data"/> starts with the GZip magic bytes 1F 8B.</summary>
        /// <param name="data">File content.</param>
        public static bool IsGZip(byte[] data)
        {
            return data != null && data.Length >= 2 && data[0] == 0x1F && data[1] == 0x8B;
        }

        /// <summary>Compresses with GZip.</summary>
        /// <param name="data">Uncompressed bytes.</param>
        public static byte[] Compress(byte[] data)
        {
            using (var output = new MemoryStream())
            {
                using (var gzip = new GZipStream(output, CompressionLevel.Optimal, true))
                {
                    gzip.Write(data, 0, data.Length);
                }

                return output.ToArray();
            }
        }

        /// <summary>Decompresses GZip data.</summary>
        /// <param name="data">GZip bytes.</param>
        /// <exception cref="InvalidDataException">The data is not valid GZip.</exception>
        public static byte[] Decompress(byte[] data)
        {
            using (var input = new MemoryStream(data))
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            using (var output = new MemoryStream())
            {
                gzip.CopyTo(output);
                return output.ToArray();
            }
        }

        /// <summary>Returns the uncompressed bytes: decompresses GZip data, returns other data unchanged.</summary>
        /// <param name="data">File content.</param>
        public static byte[] DecompressIfNeeded(byte[] data)
        {
            return IsGZip(data) ? Decompress(data) : data;
        }
    }
}
