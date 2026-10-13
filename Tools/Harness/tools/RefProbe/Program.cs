// RefProbe - harness helper (not part of the game).
// Usage:
//   RefProbe refs <assembly.dll>                       -> list assembly references
//   RefProbe has <dir1;dir2;...> <query> [<query> ...] -> check types/members
// Query syntax: "Namespace.Type" or "Namespace.Type::Member" (member = any member name).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Runtime.InteropServices;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length >= 2 && args[0] == "refs")
        {
            using var fs = File.OpenRead(args[1]);
            using var pe = new PEReader(fs);
            var md = pe.GetMetadataReader();
            foreach (var h in md.AssemblyReferences)
            {
                var r = md.GetAssemblyReference(h);
                Console.WriteLine($"{md.GetString(r.Name)} {r.Version}");
            }
            return 0;
        }
        if (args.Length >= 3 && args[0] == "has")
        {
            var paths = new List<string>(Directory.GetFiles(RuntimeEnvironment.GetRuntimeDirectory(), "*.dll"));
            var seen = new HashSet<string>(paths.Select(Path.GetFileName), StringComparer.OrdinalIgnoreCase);
            var primary = new List<string>();
            foreach (var dir in args[1].Split(';', StringSplitOptions.RemoveEmptyEntries))
            {
                foreach (var f in Directory.GetFiles(dir, "*.dll"))
                {
                    primary.Add(f);
                    if (seen.Add(Path.GetFileName(f))) paths.Add(f);
                }
            }
            using var mlc = new MetadataLoadContext(new PathAssemblyResolver(paths), "netstandard");
            var asms = new List<Assembly>();
            foreach (var f in primary)
            {
                try { asms.Add(mlc.LoadFromAssemblyPath(f)); } catch { }
            }
            int missing = 0;
            for (int i = 2; i < args.Length; i++)
            {
                var q = args[i];
                var parts = q.Split("::");
                Type found = null;
                foreach (var a in asms)
                {
                    try { found = a.GetType(parts[0], false); } catch { found = null; }
                    if (found != null) break;
                }
                if (found == null) { Console.WriteLine($"MISSING type   {q}"); missing++; continue; }
                if (parts.Length == 1) { Console.WriteLine($"OK      type   {q} ({found.Assembly.GetName().Name})"); continue; }
                var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.FlattenHierarchy;
                MemberInfo[] mem;
                try { mem = found.GetMember(parts[1], flags); } catch (Exception e) { Console.WriteLine($"ERROR   {q}: {e.Message}"); missing++; continue; }
                var pub = mem.Where(IsPublicOrProtected).ToArray();
                if (pub.Length == 0) { Console.WriteLine($"MISSING member {q}" + (mem.Length > 0 ? " (only non-public)" : "")); missing++; }
                else Console.WriteLine($"OK      member {q} [{string.Join(" | ", pub.Select(m => m.ToString()))}]");
            }
            return missing == 0 ? 0 : 1;
        }
        Console.Error.WriteLine("usage: RefProbe refs <dll> | RefProbe has <dirs> <query>...");
        return 2;
    }

    private static bool IsPublicOrProtected(MemberInfo m)
    {
        switch (m)
        {
            case MethodBase mb: return mb.IsPublic || mb.IsFamily || mb.IsFamilyOrAssembly;
            case FieldInfo fi: return fi.IsPublic || fi.IsFamily || fi.IsFamilyOrAssembly;
            case PropertyInfo pi:
                var g = pi.GetMethod ?? pi.SetMethod;
                return g != null && (g.IsPublic || g.IsFamily || g.IsFamilyOrAssembly);
            case EventInfo ei:
                var a = ei.AddMethod;
                return a != null && (a.IsPublic || a.IsFamily);
            case Type t: return t.IsNestedPublic || t.IsNestedFamily;
            default: return true;
        }
    }
}
