using System;
using System.IO;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Read-only checks of the Git setup by reading files (no Git process is started, because Unity on macOS often
    /// does not see the Homebrew PATH). Uses only System.IO, so it is testable without Unity.
    /// </summary>
    public static class GitRepositoryInspector
    {
        /// <summary>True if the project root is a Git working copy (".git" folder or ".git" file of a worktree).</summary>
        /// <param name="projectRoot">Absolute path of the project root.</param>
        public static bool HasGitRepository(string projectRoot)
        {
            if (string.IsNullOrEmpty(projectRoot))
            {
                return false;
            }

            string gitPath = Path.Combine(projectRoot, ".git");
            return Directory.Exists(gitPath) || File.Exists(gitPath);
        }

        /// <summary>True if the project's .gitattributes routes at least one pattern through Git LFS.</summary>
        /// <param name="projectRoot">Absolute path of the project root.</param>
        public static bool AttributesUseLfs(string projectRoot)
        {
            return FileContains(Path.Combine(projectRoot ?? string.Empty, ".gitattributes"), "filter=lfs");
        }

        /// <summary>
        /// True if Git LFS is set up for this repository: either its hooks are installed in ".git/hooks"
        /// (written by "git lfs install" inside the repository) or the LFS filter is configured globally or locally.
        /// </summary>
        /// <param name="projectRoot">Absolute path of the project root.</param>
        /// <param name="homeDirectory">Absolute path of the user's home folder (for ~/.gitconfig).</param>
        public static bool IsLfsConfigured(string projectRoot, string homeDirectory)
        {
            string root = projectRoot ?? string.Empty;
            if (FileContains(Path.Combine(root, ".git", "hooks", "pre-push"), "git-lfs") ||
                FileContains(Path.Combine(root, ".git", "hooks", "pre-push"), "git lfs") ||
                FileContains(Path.Combine(root, ".git", "config"), "[filter \"lfs\"]"))
            {
                return true;
            }

            if (string.IsNullOrEmpty(homeDirectory))
            {
                return false;
            }

            return FileContains(Path.Combine(homeDirectory, ".gitconfig"), "[filter \"lfs\"]") ||
                   FileContains(Path.Combine(homeDirectory, ".config", "git", "config"), "[filter \"lfs\"]");
        }

        /// <summary>True if the local Git configuration mentions UnityYAMLMerge (merge tool or merge driver).</summary>
        /// <param name="projectRoot">Absolute path of the project root.</param>
        public static bool IsYamlMergeConfigured(string projectRoot)
        {
            return FileContains(Path.Combine(projectRoot ?? string.Empty, ".git", "config"), "unityyamlmerge");
        }

        /// <summary>
        /// Builds the shell commands that register UnityYAMLMerge as merge tool in the local Git configuration
        /// (architecture 2.9 #46; configuration as in the Unity manual, "Smart Merge"). Contains no comment lines,
        /// because the default macOS shell (zsh) rejects pasted lines starting with "#".
        /// </summary>
        /// <param name="yamlMergePath">Absolute path of the UnityYAMLMerge executable of the installed editor.</param>
        public static string BuildYamlMergeToolCommands(string yamlMergePath)
        {
            return BuildPathAssignment(yamlMergePath) +
                   "git config --local merge.tool unityyamlmerge\n" +
                   "git config --local mergetool.unityyamlmerge.trustExitCode false\n" +
                   "git config --local mergetool.unityyamlmerge.cmd \"'$UYM' merge -p \\\"\\$BASE\\\" \\\"\\$REMOTE\\\" \\\"\\$LOCAL\\\" \\\"\\$MERGED\\\"\"\n";
        }

        /// <summary>
        /// Builds the shell commands for the optional merge driver used by the attribute <c>merge=unityyamlmerge</c> in
        /// .gitattributes (architecture 2.9, marked "not verified": test it with a deliberate conflict, see guide 01).
        /// </summary>
        /// <param name="yamlMergePath">Absolute path of the UnityYAMLMerge executable of the installed editor.</param>
        public static string BuildYamlMergeDriverCommands(string yamlMergePath)
        {
            return BuildPathAssignment(yamlMergePath) +
                   "git config --local merge.unityyamlmerge.name \"Unity SmartMerge\"\n" +
                   "git config --local merge.unityyamlmerge.driver \"'$UYM' merge -p %O %B %A %A\"\n" +
                   "git config --local merge.unityyamlmerge.recursive binary\n";
        }

        private static string BuildPathAssignment(string yamlMergePath)
        {
            string path = string.IsNullOrEmpty(yamlMergePath) ? "PFAD_ZU_UNITYYAMLMERGE" : yamlMergePath;
            return "UYM=\"" + path + "\"\n";
        }

        private static bool FileContains(string path, string text)
        {
            try
            {
                if (!File.Exists(path))
                {
                    return false;
                }

                string content = File.ReadAllText(path);
                return content.IndexOf(text, StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch (IOException)
            {
                return false;
            }
            catch (UnauthorizedAccessException)
            {
                return false;
            }
        }
    }
}
