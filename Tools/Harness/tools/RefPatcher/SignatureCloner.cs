// HARNESS ONLY - RefPatcher
using System;
using System.Collections.Generic;
using Mono.Cecil;
using Mono.Cecil.Cil;

namespace Harness.RefPatcher
{
    /// <summary>
    /// Copies member signatures from the patch declaration module into a target module.
    /// Type references are re-scoped: types of the target assembly itself become local
    /// definitions, all others are imported (adding assembly references as needed).
    /// </summary>
    internal sealed class SignatureCloner
    {
        private readonly ModuleDefinition _target;
        private readonly ModuleDefinition _patchModule;
        private readonly AssemblyNameReference _netstandard;
        private MethodReference _notSupportedCtor;

        public SignatureCloner(ModuleDefinition target, ModuleDefinition patchModule, AssemblyNameReference netstandard)
        {
            _target = target;
            _patchModule = patchModule;
            _netstandard = netstandard;
        }

        /// <summary>Creates a method with the same signature and a throwing body, and adds it to <paramref name="declaringType"/>.</summary>
        public MethodDefinition CloneMethod(MethodDefinition source, TypeDefinition declaringType, string description)
        {
            const MethodAttributes Removed = MethodAttributes.Virtual | MethodAttributes.Abstract | MethodAttributes.NewSlot
                | MethodAttributes.Final | MethodAttributes.CheckAccessOnOverride;
            MethodDefinition method = new MethodDefinition(source.Name, source.Attributes & ~Removed, _target.TypeSystem.Void)
            {
                ImplAttributes = MethodImplAttributes.IL | MethodImplAttributes.Managed,
            };

            foreach (GenericParameter gp in source.GenericParameters)
            {
                method.GenericParameters.Add(new GenericParameter(gp.Name, method) { Attributes = gp.Attributes });
            }

            for (int i = 0; i < source.GenericParameters.Count; i++)
            {
                foreach (GenericParameterConstraint constraint in source.GenericParameters[i].Constraints)
                {
                    method.GenericParameters[i].Constraints.Add(new GenericParameterConstraint(Map(constraint.ConstraintType, method)));
                }
            }

            method.ReturnType = Map(source.ReturnType, method);
            foreach (ParameterDefinition parameter in source.Parameters)
            {
                ParameterDefinition clone = new ParameterDefinition(parameter.Name, parameter.Attributes, Map(parameter.ParameterType, method));
                if (parameter.HasConstant)
                {
                    clone.Constant = parameter.Constant;
                }

                CopyAttributes(parameter.CustomAttributes, clone.CustomAttributes, method);
                method.Parameters.Add(clone);
            }

            CopyAttributes(source.CustomAttributes, method.CustomAttributes, method);

            ILProcessor il = method.Body.GetILProcessor();
            il.Emit(OpCodes.Ldstr, "[Harness] " + description
                + " is a Unity 6 API that only exists as a compile-time patch of the harness reference assemblies; it cannot run outside Unity.");
            il.Emit(OpCodes.Newobj, NotSupportedCtor());
            il.Emit(OpCodes.Throw);

            declaringType.Methods.Add(method);
            return method;
        }

        /// <summary>Maps a type reference of the patch module into the target module.</summary>
        public TypeReference Map(TypeReference type, MethodDefinition owner)
        {
            switch (type)
            {
                case GenericParameter gp:
                    if (gp.Type == GenericParameterType.Method && owner != null)
                    {
                        return owner.GenericParameters[gp.Position];
                    }

                    throw new PatchException($"generic type parameters of patch declaration types are not supported ('{gp.Name}')");
                case ByReferenceType byRef:
                    return new ByReferenceType(Map(byRef.ElementType, owner));
                case PointerType pointer:
                    return new PointerType(Map(pointer.ElementType, owner));
                case ArrayType array:
                    return array.IsVector ? new ArrayType(Map(array.ElementType, owner)) : new ArrayType(Map(array.ElementType, owner), array.Rank);
                case RequiredModifierType modReq:
                    return new RequiredModifierType(Map(modReq.ModifierType, owner), Map(modReq.ElementType, owner));
                case OptionalModifierType modOpt:
                    return new OptionalModifierType(Map(modOpt.ModifierType, owner), Map(modOpt.ElementType, owner));
                case GenericInstanceType generic:
                    GenericInstanceType instance = new GenericInstanceType(Map(generic.ElementType, owner));
                    foreach (TypeReference argument in generic.GenericArguments)
                    {
                        instance.GenericArguments.Add(Map(argument, owner));
                    }

                    return instance;
            }

            if (type is TypeDefinition definition && definition.Module == _patchModule)
            {
                throw new PatchException($"patch declarations must not use their own helper types in signatures ('{type.FullName}')");
            }

            string scope = ScopeAssemblyName(type);
            if (scope == _target.Assembly.Name.Name)
            {
                TypeDefinition local = _target.GetType(type.FullName);
                if (local == null)
                {
                    throw new PatchException($"type '{type.FullName}' not found in '{scope}'");
                }

                return local;
            }

            return _target.ImportReference(type);
        }

        private void CopyAttributes(IEnumerable<CustomAttribute> source, ICollection<CustomAttribute> destination, MethodDefinition owner)
        {
            foreach (CustomAttribute attribute in source)
            {
                if (attribute.AttributeType.Scope is ModuleDefinition || ScopeAssemblyName(attribute.AttributeType) == _patchModule.Assembly.Name.Name)
                {
                    continue;
                }

                MethodReference ctor = new MethodReference(".ctor", _target.TypeSystem.Void, Map(attribute.AttributeType, owner))
                {
                    HasThis = true,
                };
                foreach (ParameterDefinition parameter in attribute.Constructor.Parameters)
                {
                    ctor.Parameters.Add(new ParameterDefinition(Map(parameter.ParameterType, owner)));
                }

                CustomAttribute clone = new CustomAttribute(ctor);
                foreach (CustomAttributeArgument argument in attribute.ConstructorArguments)
                {
                    clone.ConstructorArguments.Add(new CustomAttributeArgument(Map(argument.Type, owner), argument.Value));
                }

                destination.Add(clone);
            }
        }

        private MethodReference NotSupportedCtor()
        {
            if (_notSupportedCtor == null)
            {
                TypeReference exception = _target.ImportReference(new TypeReference("System", "NotSupportedException", _patchModule, _netstandard));
                MethodReference ctor = new MethodReference(".ctor", _target.TypeSystem.Void, exception) { HasThis = true };
                ctor.Parameters.Add(new ParameterDefinition(_target.TypeSystem.String));
                _notSupportedCtor = ctor;
            }

            return _notSupportedCtor;
        }

        public static string ScopeAssemblyName(TypeReference type)
        {
            while (type.DeclaringType != null)
            {
                type = type.DeclaringType;
            }

            switch (type.Scope)
            {
                case AssemblyNameReference reference:
                    return reference.Name;
                case ModuleDefinition module:
                    return module.Assembly.Name.Name;
                default:
                    return type.Scope == null ? string.Empty : type.Scope.Name;
            }
        }
    }
}
