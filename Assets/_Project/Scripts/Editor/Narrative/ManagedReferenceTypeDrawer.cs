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
    /// Unity copies the reference of the last element when "+" is pressed on a list of managed references; the drawer
    /// detects such shared references and gives the new element its own object of the same type.
    /// Deviation from architecture 7.4: the drawer lives in <c>Aetherfall.EditorTools.Narrative</c> (assembly no. 35, the
    /// step that needs it) instead of <c>EditorTools.Core</c>, and is drawn with IMGUI (also shown inside UI Toolkit
    /// inspectors).
    /// </remarks>
    [CustomPropertyDrawer(typeof(Condition), true)]
    [CustomPropertyDrawer(typeof(GameAction), true)]
    [CustomPropertyDrawer(typeof(QuestObjective), true)]
    public sealed class ManagedReferenceTypeDrawer : PropertyDrawer
    {
        private const string NoneText = "(keine – Typ wählen)";
        private const float ButtonMinWidth = 120f;

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

            string description = currentType != null ? Describe(property, currentType) : string.Empty;
            var buttonContent = new GUIContent(currentType != null ? TypeMenuCatalog.DisplayName(currentType) + (description.Length > 0 ? " – " + description : string.Empty) : NoneText,
                                               currentType != null ? TypeMenuCatalog.MenuPath(currentType) + "\n" + description : "Typ aus dem Menü wählen");
            int indent = EditorGUI.indentLevel;
            EditorGUI.indentLevel = 0;
            if (EditorGUI.DropdownButton(buttonRect, buttonContent, FocusType.Keyboard))
            {
                ShowTypeMenu(buttonRect, property, baseType);
            }

            EditorGUI.indentLevel = indent;
            HandleContextMenu(header, property, baseType);

            if (currentType != null && property.isExpanded)
            {
                DrawChildren(position, header, property);
            }

            EditorGUI.EndProperty();
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

        private static void ShowTypeMenu(Rect buttonRect, SerializedProperty property, Type baseType)
        {
            IReadOnlyList<TypeMenuEntry> entries = TypeMenuCatalog.GetEntries(baseType);
            SerializedObject target = property.serializedObject;
            string path = property.propertyPath;
            string title = baseType == typeof(Condition) ? "Bedingung wählen" : baseType == typeof(GameAction) ? "Aktion wählen" : "Ziel wählen";
            var dropdown = new TypeMenuDropdown(title, entries, type => Assign(target, path, type != null ? CreateInstance(type) : null));
            dropdown.Show(buttonRect);
        }

        private static void HandleContextMenu(Rect header, SerializedProperty property, Type baseType)
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
                menu.AddItem(new GUIContent("Einfügen (" + TypeMenuCatalog.DisplayName(ManagedReferenceClipboard.CopiedType) + ")"), false,
                             () => Assign(target, path, ManagedReferenceClipboard.CreateCopy()));
            }
            else
            {
                menu.AddDisabledItem(new GUIContent("Einfügen"));
            }

            menu.AddItem(new GUIContent("Leeren"), false, () => Assign(target, path, null));
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
            string path = property.propertyPath;
            if (!path.EndsWith("]", StringComparison.Ordinal))
            {
                return;
            }

            int open = path.LastIndexOf("[", StringComparison.Ordinal);
            if (open < 0 || !int.TryParse(path.Substring(open + 1, path.Length - open - 2), out int index) || index == 0)
            {
                return;
            }

            SerializedProperty previous = property.serializedObject.FindProperty(path.Substring(0, open + 1) + (index - 1) + "]");
            if (previous == null || previous.propertyType != SerializedPropertyType.ManagedReference)
            {
                return;
            }

            object current = ReadValue(property);
            if (current == null || !ReferenceEquals(current, ReadValue(previous)))
            {
                return;
            }

            property.managedReferenceValue = CreateInstance(current.GetType());
            property.serializedObject.ApplyModifiedProperties();
        }
    }
}
