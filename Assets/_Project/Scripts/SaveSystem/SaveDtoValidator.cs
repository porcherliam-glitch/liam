using System;
using System.Collections.Generic;
using System.Reflection;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Type whitelist rules for save DTOs (architecture 9.1): a DTO is a non-abstract class with a public parameterless
    /// constructor whose public instance fields only hold ids, numbers, strings, booleans, enums, arrays, <c>List&lt;T&gt;</c>,
    /// <c>Dictionary&lt;string, T&gt;</c> or other DTO classes. Forbidden: Unity objects and structs (<c>Vector3</c>),
    /// delegates, <c>object</c>, interfaces, abstract types, read-only fields and public properties.
    /// </summary>
    /// <remarks>Uses reflection: call it on registration, not per save (results are cached by the callers).</remarks>
    public static class SaveDtoValidator
    {
        /// <summary>Checks a DTO type.</summary>
        /// <param name="type">Type to check.</param>
        /// <param name="problem">First rule violation, or empty.</param>
        /// <returns>True if the type is a valid DTO.</returns>
        public static bool Validate(Type type, out string problem)
        {
            var visited = new HashSet<Type>();
            problem = CheckClass(type, type != null ? type.Name : "null", visited);
            return problem.Length == 0;
        }

        private static string CheckClass(Type type, string path, HashSet<Type> visited)
        {
            if (type == null)
            {
                return path + ": no type";
            }

            if (!visited.Add(type))
            {
                return string.Empty; // already checked (or recursive DTO)
            }

            if (!type.IsClass || type == typeof(string))
            {
                return path + ": " + type.Name + " is not a class";
            }

            if (type.IsAbstract || type.IsInterface || type.ContainsGenericParameters)
            {
                return path + ": " + type.Name + " is abstract, an interface or an open generic type";
            }

            if (typeof(Delegate).IsAssignableFrom(type))
            {
                return path + ": delegates are not allowed";
            }

            if (IsUnityType(type))
            {
                return path + ": Unity types (" + type.FullName + ") are not allowed, store ids instead";
            }

            if (type.GetConstructor(Type.EmptyTypes) == null)
            {
                return path + ": " + type.Name + " needs a public parameterless constructor";
            }

            PropertyInfo[] properties = type.GetProperties(BindingFlags.Instance | BindingFlags.Public);
            if (properties.Length > 0)
            {
                return path + "." + properties[0].Name + ": public properties are not allowed in DTOs, use public fields";
            }

            FieldInfo[] fields = type.GetFields(BindingFlags.Instance | BindingFlags.Public);
            for (int i = 0; i < fields.Length; i++)
            {
                FieldInfo field = fields[i];
                string fieldPath = path + "." + field.Name;
                if (field.IsInitOnly)
                {
                    return fieldPath + ": read-only fields cannot be loaded";
                }

                string problem = CheckMember(field.FieldType, fieldPath, visited);
                if (problem.Length > 0)
                {
                    return problem;
                }
            }

            return string.Empty;
        }

        private static string CheckMember(Type type, string path, HashSet<Type> visited)
        {
            if (IsSimple(type))
            {
                return string.Empty;
            }

            Type nullable = Nullable.GetUnderlyingType(type);
            if (nullable != null)
            {
                return IsSimple(nullable) ? string.Empty : path + ": Nullable<" + nullable.Name + "> is not allowed";
            }

            if (type.IsArray)
            {
                return type.GetArrayRank() == 1
                    ? CheckMember(type.GetElementType(), path + "[]", visited)
                    : path + ": multi-dimensional arrays are not allowed";
            }

            if (type.IsGenericType)
            {
                Type definition = type.GetGenericTypeDefinition();
                Type[] arguments = type.GetGenericArguments();
                if (definition == typeof(List<>))
                {
                    return CheckMember(arguments[0], path + "[]", visited);
                }

                if (definition == typeof(Dictionary<,>))
                {
                    return arguments[0] == typeof(string)
                        ? CheckMember(arguments[1], path + "{}", visited)
                        : path + ": dictionary keys must be strings";
                }

                return path + ": " + type.Name + " is not allowed (use arrays, List<T> or Dictionary<string, T>)";
            }

            if (type == typeof(object) || type.IsInterface || type.IsAbstract)
            {
                return path + ": " + type.Name + " is not allowed (no polymorphism without a type discriminator)";
            }

            if (type.IsValueType)
            {
                return path + ": struct " + type.FullName + " is not allowed, use a DTO class or plain numbers";
            }

            return CheckClass(type, path, visited);
        }

        private static bool IsSimple(Type type)
        {
            return type.IsEnum || type == typeof(string) || type == typeof(bool) || type == typeof(int) || type == typeof(long) ||
                   type == typeof(float) || type == typeof(double) || type == typeof(byte) || type == typeof(sbyte) ||
                   type == typeof(short) || type == typeof(ushort) || type == typeof(uint) || type == typeof(ulong) ||
                   type == typeof(decimal);
        }

        private static bool IsUnityType(Type type)
        {
            string name = type.Namespace ?? string.Empty;
            return name == "UnityEngine" || name.StartsWith("UnityEngine.", StringComparison.Ordinal) ||
                   name == "UnityEditor" || name.StartsWith("UnityEditor.", StringComparison.Ordinal) ||
                   typeof(UnityEngine.Object).IsAssignableFrom(type);
        }
    }
}
