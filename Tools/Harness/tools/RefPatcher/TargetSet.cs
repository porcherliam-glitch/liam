// HARNESS ONLY - RefPatcher
using System;
using System.Collections.Generic;
using System.IO;
using Mono.Cecil;

namespace Harness.RefPatcher
{
    /// <summary>The reference assemblies that can be patched, loaded on demand.</summary>
    internal sealed class TargetSet
    {
        private readonly Dictionary<string, string> _inputPath = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly Dictionary<string, string> _outputDir = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly Dictionary<string, AssemblyDefinition> _loaded = new Dictionary<string, AssemblyDefinition>(StringComparer.Ordinal);
        private readonly HashSet<string> _modified = new HashSet<string>(StringComparer.Ordinal);
        private readonly IAssemblyResolver _resolver;

        public TargetSet(IEnumerable<KeyValuePair<string, string>> maps, IAssemblyResolver resolver)
        {
            _resolver = resolver;
            foreach (KeyValuePair<string, string> map in maps)
            {
                if (!Directory.Exists(map.Key))
                {
                    throw new PatchException("input directory not found: " + map.Key);
                }

                foreach (string file in Directory.GetFiles(map.Key, "*.dll"))
                {
                    string name = Path.GetFileNameWithoutExtension(file);
                    _inputPath[name] = file;
                    _outputDir[name] = map.Value;
                }
            }
        }

        public TypeDefinition GetType(string assemblyName, string typeFullName)
        {
            ModuleDefinition module = GetModule(assemblyName);
            TypeDefinition type = module.GetType(typeFullName);
            if (type == null)
            {
                throw new PatchException($"type '{typeFullName}' not found in '{assemblyName}'");
            }

            return type;
        }

        public void MarkModified(string assemblyName)
        {
            _modified.Add(assemblyName);
        }

        public void WriteAll()
        {
            foreach (KeyValuePair<string, string> entry in _inputPath)
            {
                string outDir = _outputDir[entry.Key];
                Directory.CreateDirectory(outDir);
                string outPath = Path.Combine(outDir, Path.GetFileName(entry.Value));
                if (_modified.Contains(entry.Key))
                {
                    _loaded[entry.Key].Write(outPath);
                }
                else
                {
                    File.Copy(entry.Value, outPath, true);
                }
            }
        }

        /// <summary>True if the reference assembly exists in the input directories.</summary>
        public bool Contains(string assemblyName)
        {
            return _inputPath.ContainsKey(assemblyName);
        }

        public ModuleDefinition GetModule(string assemblyName)
        {
            if (_loaded.TryGetValue(assemblyName, out AssemblyDefinition loaded))
            {
                return loaded.MainModule;
            }

            if (!_inputPath.TryGetValue(assemblyName, out string path))
            {
                throw new PatchException($"reference assembly '{assemblyName}' not found in the input directories");
            }

            ReaderParameters parameters = new ReaderParameters
            {
                AssemblyResolver = _resolver,
                ReadingMode = ReadingMode.Immediate,
                InMemory = true,
            };
            AssemblyDefinition assembly = AssemblyDefinition.ReadAssembly(path, parameters);
            _loaded[assemblyName] = assembly;
            return assembly.MainModule;
        }
    }
}
