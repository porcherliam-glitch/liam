// HARNESS ONLY - RefPatcher
//
// Merges Unity 6 member declarations (patches/Unity6Patches, compiled) into copies of the
// Unity reference assemblies used by the harness (UnityEngine modules 2021.3, UnityEditor
// 2021.1), and adds [Obsolete] markers that Unity 6.3 has on old APIs.
//
// Only signatures are merged; every merged method body throws NotSupportedException.
// That is enough for compiling user code against "Unity 6"-like references, and a unit
// test that accidentally executes such a member fails with a clear message.
//
// Usage:
//   RefPatcher --patches <Harness.Unity6Patches.dll>
//              --map <inDir>=<outDir> [--map <inDir>=<outDir> ...]
//              [--search <dir> ...] [--manifest <file>]
using System;
using System.Collections.Generic;

namespace Harness.RefPatcher
{
    internal static class Program
    {
        private static int Main(string[] args)
        {
            string patches = null;
            string manifest = null;
            List<KeyValuePair<string, string>> maps = new List<KeyValuePair<string, string>>();
            List<string> search = new List<string>();

            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                string value = i + 1 < args.Length ? args[i + 1] : null;
                switch (arg)
                {
                    case "--patches":
                        patches = value;
                        i++;
                        break;
                    case "--manifest":
                        manifest = value;
                        i++;
                        break;
                    case "--search":
                        search.Add(value);
                        i++;
                        break;
                    case "--map":
                        int eq = value == null ? -1 : value.IndexOf('=');
                        if (eq <= 0)
                        {
                            return Usage("--map expects <inDir>=<outDir>");
                        }

                        maps.Add(new KeyValuePair<string, string>(value.Substring(0, eq), value.Substring(eq + 1)));
                        i++;
                        break;
                    default:
                        return Usage("unknown argument " + arg);
                }
            }

            if (patches == null || maps.Count == 0)
            {
                return Usage("--patches and at least one --map are required");
            }

            try
            {
                Patcher patcher = new Patcher(patches, maps, search);
                IReadOnlyList<string> lines = patcher.Run();
                foreach (string line in lines)
                {
                    Console.WriteLine("  " + line);
                }

                if (manifest != null)
                {
                    System.IO.File.WriteAllLines(manifest, lines);
                }

                return patcher.WarningCount == 0 ? 0 : 3;
            }
            catch (PatchException e)
            {
                Console.Error.WriteLine("RefPatcher: ERROR: " + e.Message);
                return 1;
            }
        }

        private static int Usage(string message)
        {
            Console.Error.WriteLine("RefPatcher: " + message);
            Console.Error.WriteLine("usage: RefPatcher --patches <dll> --map <inDir>=<outDir> [--map ...] [--search <dir>] [--manifest <file>]");
            return 2;
        }
    }
}
