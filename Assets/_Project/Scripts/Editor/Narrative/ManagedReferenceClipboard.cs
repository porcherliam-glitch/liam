using System;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Copy and paste of one condition, action or objective between fields (context menu of the type picker, architecture
    /// 7.4): the type and its JSON (<see cref="EditorJsonUtility"/>). Pasting creates a new object of the same type.
    /// </summary>
    public static class ManagedReferenceClipboard
    {
        private static Type _type;
        private static string _json = string.Empty;

        /// <summary>Type of the copied object, or null.</summary>
        public static Type CopiedType => _type;

        /// <summary>Copies an object.</summary>
        /// <param name="value">Object (null clears the clipboard).</param>
        public static void Copy(object value)
        {
            if (value == null)
            {
                _type = null;
                _json = string.Empty;
                return;
            }

            _type = value.GetType();
            _json = EditorJsonUtility.ToJson(value);
        }

        /// <summary>True if the clipboard holds an object that fits the base type.</summary>
        /// <param name="baseType">Field type.</param>
        public static bool CanPaste(Type baseType)
        {
            return _type != null && baseType != null && baseType.IsAssignableFrom(_type);
        }

        /// <summary>Creates a new object from the clipboard (null if empty or not creatable).</summary>
        public static object CreateCopy()
        {
            if (_type == null)
            {
                return null;
            }

            try
            {
                object copy = Activator.CreateInstance(_type, true);
                if (_json.Length > 0)
                {
                    EditorJsonUtility.FromJsonOverwrite(_json, copy);
                }

                return copy;
            }
            catch (Exception exception)
            {
                Debug.LogWarning("Einfügen fehlgeschlagen (" + _type.Name + "): " + exception.Message);
                return null;
            }
        }
    }
}
