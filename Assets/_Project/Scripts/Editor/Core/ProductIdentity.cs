namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Rules and suggestions for the company and product name in the Player settings. Both names are part of
    /// <c>Application.persistentDataPath</c> and therefore of every save path; they must be fixed before the first
    /// external build and never change afterwards (architecture 2.1 #1, open question 2 (c)). Pure logic.
    /// </summary>
    public static class ProductIdentity
    {
        /// <summary>Company name Unity uses for new projects.</summary>
        public const string UnityDefaultCompanyName = "DefaultCompany";

        /// <summary>Suggested company name until the client decides (placeholder, no special characters).</summary>
        public const string SuggestedCompanyName = "AetherfallStudio";

        /// <summary>Suggested product name: short and independent of the later sales title (open question 2 (c)).</summary>
        public const string SuggestedProductName = "Aetherfall";

        /// <summary>Maximum length accepted by the setup window.</summary>
        public const int MaxLength = 64;

        private const string ForbiddenCharacters = "/\\:*?\"<>|";

        /// <summary>Checks whether a name is usable as part of a file path on macOS and Windows.</summary>
        /// <param name="name">Company or product name.</param>
        /// <param name="problem">German description of the problem, or empty if valid.</param>
        /// <returns>True if the name is valid.</returns>
        public static bool IsValidName(string name, out string problem)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                problem = "Der Name ist leer.";
                return false;
            }

            if (name.Length > MaxLength)
            {
                problem = "Der Name ist länger als " + MaxLength + " Zeichen.";
                return false;
            }

            if (name.Trim().Length != name.Length)
            {
                problem = "Der Name beginnt oder endet mit einem Leerzeichen.";
                return false;
            }

            if (name.EndsWith(".", System.StringComparison.Ordinal))
            {
                problem = "Der Name endet mit einem Punkt (unter Windows als Ordnername ungültig).";
                return false;
            }

            for (int i = 0; i < name.Length; i++)
            {
                char c = name[i];
                if (c < ' ' || ForbiddenCharacters.IndexOf(c) >= 0)
                {
                    problem = "Das Zeichen '" + (c < ' ' ? "?" : c.ToString()) + "' ist in Ordnernamen nicht erlaubt.";
                    return false;
                }
            }

            problem = string.Empty;
            return true;
        }

        /// <summary>True if the company name is still Unity's default (or empty), i.e. no decision has been entered yet.</summary>
        /// <param name="companyName">Current company name.</param>
        public static bool IsUndecidedCompany(string companyName)
        {
            return string.IsNullOrWhiteSpace(companyName) || companyName == UnityDefaultCompanyName;
        }

        /// <summary>German description of where save data will be stored with these names.</summary>
        /// <param name="companyName">Company name.</param>
        /// <param name="productName">Product name.</param>
        public static string DescribeSavePaths(string companyName, string productName)
        {
            return "Windows: %USERPROFILE%\\AppData\\LocalLow\\" + companyName + "\\" + productName +
                   " · macOS: unter ~/Library/Application Support/ in einem Ordner mit Firmen- und Produktnamen";
        }
    }
}
