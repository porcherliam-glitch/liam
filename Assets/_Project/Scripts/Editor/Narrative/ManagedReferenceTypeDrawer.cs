using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Quests;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Type picker for <c>[SerializeReference]</c> fields and lists of conditions, actions and quest objectives (architecture
    /// 7.4): a header line with foldout, the German type name plus the short description (<c>Describe()</c>) on a dropdown
    /// button (searchable menu from <see cref="TypeMenuCatalog"/>), the fields of the chosen type below, and a context menu
    /// with "Kopieren", "Einfuegen" and "Leeren". Works for single fields and every element of a list.
    /// </summary>
    /// <remarks>
    /// <para>Unity can copy the reference of the last element when "+" is pressed on a list of managed references, and a
    /// duplicated list element of a plain class (e.g. a stage) keeps pointing to the objectives and actions of the original.
    /// The drawer compares the managed reference id of every field with all earlier fields of the object
    /// (<see cref="ManagedReferenceIndex"/>) and gives every later field that shares an object its own copy (same type and
    /// values), so editing the copy never changes the original - also when three or more fields share it.</para>
    /// <para>A field whose class no longer exists (renamed without <c>[MovedFrom]</c>, deleted) shows "Fehlender Typ: Klasse"
    /// in red instead of "(keine - Typ waehlen)"; replacing or clearing it asks first, because the stored data would be lost
    /// (GDD 02 rule V14).</para>
    /// Deviation from architecture 7.4: the drawer lives in <c>Aetherfall.EditorTools.Narrative</c> (assembly no. 35, the
    /// step that needs it) instead of <c>EditorTools.Core</c>, and is drawn with IMGUI (also shown inside UI Toolkit
    /// inspectors).
    /// </remarks>
    [CustomPropertyDrawer(typeof(Condition), true)]
    [CustomPropertyDrawer(typeof(GameAction), true)]
    [CustomPropertyDrawer(typeof(QuestObjective), true)]
    [CustomPropertyDrawer(typeof(Aetherfall.Dialogue.DialogueNode), true)]
    public sealed class ManagedReferenceTypeDrawer : PropertyDrawer
    {
        private const string NoneText = "(keine – Typ wählen)";
        private const string MissingText = "Fehlender Typ: ";
        private const float ButtonMinWidth = 120f;

        private static readonly Color MissingColor = new Color(1f, 0.45f, 0.4f);
        private static readonly List<MissingManagedType> MissingScratch = new List<MissingManagedType>();

        /// <inheritdoc />
        public override float GetPropertyHeight(SerializedProperty property, GUIContent label)
        {
            if (property.propertyType != SerializedPropertyType.ManagedReference)
            {
                return EditorGUI.GetPropertyHeight(property, label, true);
            }

            float height = EditorGUIUtility.singleLineHeight;
            if (!property.isExpanded || string.IsNullOrEmpty(property.managedReferenceFullTypename))
            {
                return height;
            }

            SerializedProperty iterator = property.Copy();
            SerializedProperty end = property.GetEndProperty();
            bool enterChildren = true;
            while (iterator.NextVisible(enterChildren) && !SerializedProperty.EqualContents(iterator, end))
            {
                enterChildren = false;
                height += EditorGUI.GetPropertyHeight(iterator, true) + EditorGUIUtility.standardVerticalSpacing;
            }

            return height;
        }

        /// <inheritdoc />
        public override void OnGUI(Rect position, SerializedProperty property, GUIContent label)
        {
            if (property.propertyType != SerializedPropertyType.ManagedReference)
            {
                EditorGUI.PropertyField(position, property, label, true);
                return;
            }

            SeparateSharedReference(property);
            Type baseType = TypeMenuCatalog.ResolveUnityTypeName(property.managedReferenceFieldTypename);
            Type currentType = TypeMenuCatalog.ResolveUnityTypeName(property.managedReferenceFullTypename);
            EditorGUI.BeginProperty(position, label, property);

            var header = new Rect(position.x, position.y, position.width, EditorGUIUtility.singleLineHeight);
            float labelWidth = Mathf.Min(EditorGUIUtility.labelWidth, Mathf.Max(0f, header.width - ButtonMinWidth));
            var labelRect = new Rect(header.x, header.y, labelWidth, header.height);
            var buttonRect = new Rect(header.x + labelWidth, header.y, header.width - labelWidth, header.height);

            if (currentType != null)
            {
                property.isExpanded = EditorGUI.Foldout(labelRect, property.isExpanded, label, true);
            }
            else
            {
                EditorGUI.LabelField(labelRect, label);
            }

            string missingType = currentType == null ? MissingTypeName(property) : string.Empty;
            GUIContent buttonContent = ButtonContent(property, currentType, missingType);
            int indent = EditorGUI.indentLevel;
            EditorGUI.indentLevel = 0;
            Color color = GUI.color;
            if (missingType.Length > 0)
            {
                GUI.color = MissingColor;
            }

            if (EditorGUI.DropdownButton(buttonRect, buttonContent, FocusType.Keyboard))
            {
                ShowTypeMenu(buttonRect, property, baseType, missingType);
            }

            GUI.color = color;
            EditorGUI.indentLevel = indent;
            HandleContextMenu(header, property, baseType, missingType);

            if (currentType != null && property.isExpanded)
            {
                DrawChildren(position, header, property);
            }

            EditorGUI.EndProperty();
        }

        private static GUIContent ButtonContent(SerializedProperty property, Type currentType, string missingType)
        {
            if (currentType != null)
            {
                string description = Describe(property, currentType);
                return new GUIContent(TypeMenuCatalog.DisplayName(currentType) + (description.Length > 0 ? " – " + description : string.Empty),
                                      TypeMenuCatalog.MenuPath(currentType) + "\n" + description);
            }

            if (missingType.Length > 0)
            {
                return new GUIContent(MissingText + missingType,
                                      "Die Klasse " + missingType + " gibt es nicht mehr (umbenannt ohne [MovedFrom] oder gelöscht). Ihre Daten stehen noch im " +
                                      "Asset, im Spiel gilt das Feld aber als leer. Nicht überschreiben – an Claude melden.");
            }

            return new GUIContent(NoneText, "Typ aus dem Menü wählen");
        }

        /// <summary>
        /// Class name of a stored object whose class is missing, or empty. Unity either still reports the stored type name
        /// (which no longer resolves) or only the id, which is then looked up in the missing classes of the asset.
        /// </summary>
        private static string MissingTypeName(SerializedProperty property)
        {
            string stored = property.managedReferenceFullTypename;
            if (!string.IsNullOrEmpty(stored))
            {
                int space = stored.IndexOf(' ');
                return space >= 0 ? stored.Substring(space + 1) : stored;
            }

            if (!ManagedReferenceApi.TryGetReferenceId(property, out long id) || !ManagedReferenceChecks.IsReferenceId(id) ||
                !ManagedReferenceApi.TryGetMissingTypes(property.serializedObject.targetObject, MissingScratch))
            {
                return string.Empty;
            }

            for (int i = 0; i < MissingScratch.Count; i++)
            {
                if (MissingScratch[i].ReferenceId == id)
                {
                    return MissingScratch[i].FullName;
                }
            }

            return string.Empty;
        }

        private static bool ConfirmReplacingMissingType(string missingType)
        {
            return missingType.Length == 0 ||
                   EditorUtility.DisplayDialog("Fehlenden Typ ersetzen?",
                                               "Dieses Feld enthält Daten der Klasse „" + missingType + "“, die es nicht mehr gibt. Beim Ersetzen oder Leeren " +
                                               "gehen diese Daten endgültig verloren.\n\nBesser: Claude die Klasse wiederherstellen lassen (mit [MovedFrom]).",
                                               "Trotzdem ersetzen", "Abbrechen");
        }

        private static void DrawChildren(Rect position, Rect header, SerializedProperty property)
        {
            EditorGUI.indentLevel++;
            float y = header.yMax + EditorGUIUtility.standardVerticalSpacing;
            SerializedProperty iterator = property.Copy();
            SerializedProperty end = property.GetEndProperty();
            bool enterChildren = true;
            while (iterator.NextVisible(enterChildren) && !SerializedProperty.EqualContents(iterator, end))
            {
                enterChildren = false;
                float height = EditorGUI.GetPropertyHeight(iterator, true);
                EditorGUI.PropertyField(new Rect(position.x, y, position.width, height), iterator, true);
                y += height + EditorGUIUtility.standardVerticalSpacing;
            }

            EditorGUI.indentLevel--;
        }

        private static string Describe(SerializedProperty property, Type currentType)
        {
            object value = ReadValue(property);
            try
            {
                switch (value)
                {
                    case Condition condition:
                        return condition.Describe();
                    case GameAction action:
                        return action.Describe();
                    case QuestObjective objective:
                        return objective.Id + (objective.IsOptional ? " (optional)" : string.Empty) + ": " + objective.Describe();
                    default:
                        return string.Empty;
                }
            }
            catch (Exception)
            {
                return currentType.Name;
            }
        }

        private static object ReadValue(SerializedProperty property)
        {
            try
            {
                return property.boxedValue;
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static void ShowTypeMenu(Rect buttonRect, SerializedProperty property, Type baseType, string missingType)
        {
            IReadOnlyList<TypeMenuEntry> entries = TypeMenuCatalog.GetEntries(baseType);
            SerializedObject target = property.serializedObject;
            string path = property.propertyPath;
            string title = baseType == typeof(Condition) ? "Bedingung wählen" : baseType == typeof(GameAction) ? "Aktion wählen" : "Ziel wählen";
            var dropdown = new TypeMenuDropdown(title, entries, type =>
            {
                if (ConfirmReplacingMissingType(missingType))
                {
                    Assign(target, path, type != null ? CreateInstance(type) : null);
                }
            });
            dropdown.Show(buttonRect);
        }

        private static void HandleContextMenu(Rect header, SerializedProperty property, Type baseType, string missingType)
        {
            Event current = Event.current;
            if (current.type != EventType.ContextClick || !header.Contains(current.mousePosition))
            {
                return;
            }

            SerializedObject target = property.serializedObject;
            string path = property.propertyPath;
            object value = ReadValue(property);
            var menu = new GenericMenu();
            if (value != null)
            {
                menu.AddItem(new GUIContent("Kopieren"), false, () => ManagedReferenceClipboard.Copy(value));
            }
            else
            {
                menu.AddDisabledItem(new GUIContent("Kopieren"));
            }

            if (ManagedReferenceClipboard.CanPaste(baseType))
            {
                menu.AddItem(new GUIContent("Einfügen (" + TypeMenuCatalog.DisplayName(ManagedReferenceClipboard.CopiedType) + ")"), false, () =>
                {
                    if (ConfirmReplacingMissingType(missingType))
                    {
                        Assign(target, path, ManagedReferenceClipboard.CreateCopy());
                    }
                });
            }
            else
            {
                menu.AddDisabledItem(new GUIContent("Einfügen"));
            }

            menu.AddItem(new GUIContent("Leeren"), false, () =>
            {
                if (ConfirmReplacingMissingType(missingType))
                {
                    Assign(target, path, null);
                }
            });
            menu.ShowAsContext();
            current.Use();
        }

        private static object CreateInstance(Type type)
        {
            try
            {
                return Activator.CreateInstance(type, true);
            }
            catch (Exception exception)
            {
                Debug.LogError("Typ " + type.Name + " kann nicht angelegt werden: " + exception.Message);
                return null;
            }
        }

        private static void Assign(SerializedObject target, string propertyPath, object value)
        {
            if (target == null || target.targetObject == null)
            {
                return;
            }

            target.Update();
            SerializedProperty property = target.FindProperty(propertyPath);
            if (property == null || property.propertyType != SerializedPropertyType.ManagedReference)
            {
                return;
            }

            property.managedReferenceValue = value;
            property.isExpanded = value != null;
            target.ApplyModifiedProperties();
        }

        private static void SeparateSharedReference(SerializedProperty property)
        {
            SerializedObject serializedObject = property.serializedObject;
            if (serializedObject.isEditingMultipleObjects || !ManagedReferenceApi.TryGetReferenceId(property, out long id) || !ManagedReferenceChecks.IsReferenceId(id))
            {
                return;
            }

            string path = property.propertyPath;
            if (ManagedReferenceIndex.FirstPathOf(serializedObject, id, path) == path)
            {
                return;
            }

            // A later field that shares the object of an earlier one: give it its own copy. An object of a missing class
            // cannot be copied; "Quests pruefen" reports it (V14, R01).
            object current = ReadValue(property);
            if (current == null)
            {
                return;
            }

            property.managedReferenceValue = CopyOf(current);
            serializedObject.ApplyModifiedProperties();
        }

        private static object CopyOf(object value)
        {
            try
            {
                object copy = Activator.CreateInstance(value.GetType(), true);
                EditorJsonUtility.FromJsonOverwrite(EditorJsonUtility.ToJson(value), copy);
                return copy;
            }
            catch (Exception)
            {
                return CreateInstance(value.GetType());
            }
        }
    }
}
