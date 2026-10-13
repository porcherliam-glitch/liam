// HARNESS ONLY - RefPatcher
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Mono.Cecil;
using Mono.Cecil.Cil;

namespace Harness.RefPatcher
{
    /// <summary>Applies [PatchTarget] member declarations and [MarkObsolete] markers.</summary>
    internal sealed class Patcher
    {
        private const string PatchTargetAttribute = "Harness.Unity6Patches.PatchTargetAttribute";
        private const string MarkObsoleteAttribute = "Harness.Unity6Patches.MarkObsoleteAttribute";

        private readonly string _patchesPath;
        private readonly TargetSet _targets;
        private readonly DefaultAssemblyResolver _resolver = new DefaultAssemblyResolver();
        private readonly List<string> _lines = new List<string>();

        public Patcher(string patchesPath, IEnumerable<KeyValuePair<string, string>> maps, IEnumerable<string> searchDirs)
        {
            _patchesPath = patchesPath;
            List<KeyValuePair<string, string>> mapList = maps.ToList();
            foreach (KeyValuePair<string, string> map in mapList)
            {
                _resolver.AddSearchDirectory(map.Key);
            }

            foreach (string dir in searchDirs)
            {
                _resolver.AddSearchDirectory(dir);
            }

            _resolver.AddSearchDirectory(RuntimeEnvironment.GetRuntimeDirectory());
            _targets = new TargetSet(mapList, _resolver);
        }

        public int WarningCount { get; private set; }

        public IReadOnlyList<string> Run()
        {
            ReaderParameters parameters = new ReaderParameters { AssemblyResolver = _resolver, ReadingMode = ReadingMode.Immediate, InMemory = true };
            AssemblyDefinition patches = AssemblyDefinition.ReadAssembly(_patchesPath, parameters);
            ModuleDefinition patchModule = patches.MainModule;
            AssemblyNameReference netstandard = patchModule.AssemblyReferences.FirstOrDefault(r => r.Name == "netstandard")
                ?? throw new PatchException("patch assembly must be compiled against netstandard");

            foreach (TypeDefinition type in patchModule.Types)
            {
                CustomAttribute target = type.CustomAttributes.FirstOrDefault(a => a.AttributeType.FullName == PatchTargetAttribute);
                if (target == null)
                {
                    continue;
                }

                string assemblyName = (string)target.ConstructorArguments[0].Value;
                string typeName = (string)target.ConstructorArguments[1].Value;
                TypeDefinition targetType = _targets.GetType(assemblyName, typeName);
                SignatureCloner cloner = new SignatureCloner(targetType.Module, patchModule, netstandard);
                bool changed = type.IsEnum ? MergeEnum(type, targetType) : MergeMembers(type, targetType, cloner);
                if (changed)
                {
                    _targets.MarkModified(assemblyName);
                }
            }

            foreach (CustomAttribute marker in patches.CustomAttributes.Where(a => a.AttributeType.FullName == MarkObsoleteAttribute))
            {
                ApplyObsolete(marker, netstandard, patchModule);
            }

            // Reflection in tests (e.g. Newtonsoft reading all type attributes) instantiates Unity attributes such as
            // [UnityEngine.Scripting.Preserve]; their reference bodies are "throw null". Make them side-effect free.
            foreach (string assemblyName in AttributeAssemblies)
            {
                NeutralizeAttributeConstructors(assemblyName);
            }

            _targets.WriteAll();
            return _lines;
        }

        private bool MergeMembers(TypeDefinition source, TypeDefinition target, SignatureCloner cloner)
        {
            bool changed = false;
            if (source.Events.Count > 0 || source.Fields.Any(f => !f.IsSpecialName && (f.IsPublic || f.IsFamily)))
            {
                throw new PatchException($"{source.FullName}: only methods and properties can be patched");
            }

            foreach (PropertyDefinition property in source.Properties)
            {
                MethodDefinition accessor = property.GetMethod ?? property.SetMethod;
                if (accessor == null || !IsVisible(accessor))
                {
                    continue;
                }

                string description = target.FullName + "." + property.Name;
                if (target.Properties.Any(p => p.Name == property.Name))
                {
                    _lines.Add($"SKIP     {target.Module.Assembly.Name.Name}: {description} (already present)");
                    continue;
                }

                PropertyDefinition clone = new PropertyDefinition(property.Name, property.Attributes, cloner.Map(property.PropertyType, null));
                if (property.GetMethod != null)
                {
                    clone.GetMethod = cloner.CloneMethod(property.GetMethod, target, description);
                }

                if (property.SetMethod != null)
                {
                    clone.SetMethod = cloner.CloneMethod(property.SetMethod, target, description);
                }

                target.Properties.Add(clone);
                _lines.Add($"PATCH    {target.Module.Assembly.Name.Name}: {description} (property{(accessor.IsStatic ? ", static" : string.Empty)})");
                changed = true;
            }

            foreach (MethodDefinition method in source.Methods)
            {
                if (method.IsConstructor || method.IsGetter || method.IsSetter || method.IsAddOn || method.IsRemoveOn || !IsVisible(method))
                {
                    continue;
                }

                string signature = Signature(method);
                string description = target.FullName + "." + signature;
                if (target.Methods.Any(m => Signature(m) == signature))
                {
                    _lines.Add($"SKIP     {target.Module.Assembly.Name.Name}: {description} (already present)");
                    continue;
                }

                cloner.CloneMethod(method, target, target.FullName + "." + method.Name);
                _lines.Add($"PATCH    {target.Module.Assembly.Name.Name}: {description}");
                changed = true;
            }

            return changed;
        }

        private bool MergeEnum(TypeDefinition source, TypeDefinition target)
        {
            if (!target.IsEnum)
            {
                throw new PatchException($"{source.FullName}: target {target.FullName} is not an enum");
            }

            Type underlying = ClrType(target.Fields.First(f => f.Name == "value__").FieldType);
            bool changed = false;
            foreach (FieldDefinition field in source.Fields.Where(f => f.IsLiteral && f.IsStatic))
            {
                if (target.Fields.Any(f => f.Name == field.Name))
                {
                    _lines.Add($"SKIP     {target.Module.Assembly.Name.Name}: {target.FullName}.{field.Name} (already present)");
                    continue;
                }

                FieldDefinition clone = new FieldDefinition(field.Name,
                    FieldAttributes.Public | FieldAttributes.Static | FieldAttributes.Literal | FieldAttributes.HasDefault, target)
                {
                    Constant = Convert.ChangeType(field.Constant, underlying),
                };
                target.Fields.Add(clone);
                _lines.Add($"PATCH    {target.Module.Assembly.Name.Name}: {target.FullName}.{field.Name} = {field.Constant} (enum value)");
                changed = true;
            }

            return changed;
        }

        private void ApplyObsolete(CustomAttribute marker, AssemblyNameReference netstandard, ModuleDefinition patchModule)
        {
            string assemblyName = (string)marker.ConstructorArguments[0].Value;
            string typeName = (string)marker.ConstructorArguments[1].Value;
            string member = (string)marker.ConstructorArguments[2].Value;
            string message = (string)marker.ConstructorArguments[3].Value;
            bool isError = (bool)marker.ConstructorArguments[4].Value;
            string firstParameter = marker.Properties.Where(p => p.Name == "FirstParameterType").Select(p => (string)p.Argument.Value).FirstOrDefault();

            TypeDefinition type = _targets.GetType(assemblyName, typeName);
            ModuleDefinition module = type.Module;
            List<ICustomAttributeProvider> members = new List<ICustomAttributeProvider>();
            members.AddRange(type.Methods.Where(m => m.Name == member && IsVisible(m) && !m.IsGetter && !m.IsSetter
                && (firstParameter == null || (m.Parameters.Count > 0 && m.Parameters[0].ParameterType.FullName == firstParameter))));
            members.AddRange(type.Properties.Where(p => p.Name == member));
            members.AddRange(type.Fields.Where(f => f.Name == member && f.IsPublic));

            if (members.Count == 0)
            {
                WarningCount++;
                _lines.Add($"WARNING  {assemblyName}: {typeName}.{member} not found - obsolete marker not applied");
                return;
            }

            TypeReference obsoleteType = module.ImportReference(new TypeReference("System", "ObsoleteAttribute", patchModule, netstandard));
            MethodReference ctor = new MethodReference(".ctor", module.TypeSystem.Void, obsoleteType) { HasThis = true };
            ctor.Parameters.Add(new ParameterDefinition(module.TypeSystem.String));
            ctor.Parameters.Add(new ParameterDefinition(module.TypeSystem.Boolean));

            int applied = 0;
            foreach (ICustomAttributeProvider provider in members)
            {
                if (provider.CustomAttributes.Any(a => a.AttributeType.FullName == "System.ObsoleteAttribute"))
                {
                    continue;
                }

                CustomAttribute attribute = new CustomAttribute(ctor);
                attribute.ConstructorArguments.Add(new CustomAttributeArgument(module.TypeSystem.String, message));
                attribute.ConstructorArguments.Add(new CustomAttributeArgument(module.TypeSystem.Boolean, isError));
                provider.CustomAttributes.Add(attribute);
                applied++;
            }

            _targets.MarkModified(assemblyName);
            _lines.Add($"OBSOLETE {assemblyName}: {typeName}.{member} ({applied} member(s){(firstParameter != null ? ", first parameter " + firstParameter : string.Empty)})");
        }

        /// <summary>Reference assemblies whose attribute constructors are made side-effect free.</summary>
        private static readonly string[] AttributeAssemblies = { "UnityEngine.CoreModule" };

        private void NeutralizeAttributeConstructors(string assemblyName)
        {
            if (!_targets.Contains(assemblyName))
            {
                return;
            }

            ModuleDefinition module = _targets.GetModule(assemblyName);
            int count = 0;
            foreach (TypeDefinition type in module.GetTypes())
            {
                if (!IsAttribute(type))
                {
                    continue;
                }

                foreach (MethodDefinition ctor in type.Methods.Where(m => m.IsConstructor && !m.IsStatic && m.HasBody))
                {
                    Mono.Collections.Generic.Collection<Instruction> code = ctor.Body.Instructions;
                    bool throwsOnly = code.Count <= 4 && code.Any(i => i.OpCode == OpCodes.Throw) && code.All(i => i.OpCode != OpCodes.Call && i.OpCode != OpCodes.Stfld);
                    if (!throwsOnly)
                    {
                        continue;
                    }

                    code.Clear();
                    ctor.Body.ExceptionHandlers.Clear();
                    ctor.Body.Variables.Clear();
                    ctor.Body.GetILProcessor().Append(Instruction.Create(OpCodes.Ret));
                    count++;
                }
            }

            if (count > 0)
            {
                _targets.MarkModified(assemblyName);
                _lines.Add($"ATTRCTOR {assemblyName}: {count} attribute constructor(s) without body (reflection in tests must not throw)");
            }
        }

        private static bool IsAttribute(TypeDefinition type)
        {
            TypeReference current = type.BaseType;
            for (int depth = 0; current != null && depth < 10; depth++)
            {
                if (current.FullName == "System.Attribute")
                {
                    return true;
                }

                TypeDefinition resolved;
                try
                {
                    resolved = current.Resolve();
                }
                catch (AssemblyResolutionException)
                {
                    return false;
                }

                current = resolved?.BaseType;
            }

            return false;
        }

        private static bool IsVisible(MethodDefinition method)
        {
            return method.IsPublic || method.IsFamily || method.IsFamilyOrAssembly;
        }

        private static string Signature(MethodDefinition method)
        {
            string generics = method.HasGenericParameters ? "`" + method.GenericParameters.Count : string.Empty;
            return method.Name + generics + "(" + string.Join(", ", method.Parameters.Select(p => p.ParameterType.FullName)) + ")";
        }

        private static Type ClrType(TypeReference type)
        {
            switch (type.MetadataType)
            {
                case MetadataType.Byte: return typeof(byte);
                case MetadataType.SByte: return typeof(sbyte);
                case MetadataType.Int16: return typeof(short);
                case MetadataType.UInt16: return typeof(ushort);
                case MetadataType.Int32: return typeof(int);
                case MetadataType.UInt32: return typeof(uint);
                case MetadataType.Int64: return typeof(long);
                case MetadataType.UInt64: return typeof(ulong);
                default: throw new PatchException("unsupported enum underlying type " + type.FullName);
            }
        }
    }
}
