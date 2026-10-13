using System.Security.Cryptography;
using System.Text;

namespace Aetherfall.SaveSystem
{
    /// <summary>SHA-256 of a save file as lowercase hex text (architecture 9.3: stored in the header file).</summary>
    public static class SaveChecksum
    {
        /// <summary>Computes the checksum.</summary>
        /// <param name="data">File content.</param>
        public static string Sha256Hex(byte[] data)
        {
            byte[] hash;
            using (SHA256 sha = SHA256.Create())
            {
                hash = sha.ComputeHash(data);
            }

            var text = new StringBuilder(hash.Length * 2);
            for (int i = 0; i < hash.Length; i++)
            {
                text.Append(hash[i].ToString("x2"));
            }

            return text.ToString();
        }
    }
}
