using System;
using System.Collections.Generic;
using Aetherfall.Events;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// UI Toolkit helpers shared by all screens (Unity adapter): texts from <see cref="UiTexts"/>, glyph labels, open/close
    /// transitions (USS classes, ≤ 0.15 s open and ≤ 0.10 s close, GDD 05 1.4), focus frame, bar fills and the pointer wiring
    /// of menu items.
    /// </summary>
    /// <remarks>
    /// Menu items are not focusable for UI Toolkit (<c>focusable = false</c>): the own focus layer
    /// (<see cref="UiNavigationController"/>) owns the focus and marks the item with <see cref="FocusedClass"/>. So UI Toolkit's
    /// built-in navigation (arrow keys, D-pad) has nothing to move to and cannot fight the own layer (architecture 12).
    /// </remarks>
    public static class UiElementUtility
    {
        /// <summary>Class of the focused item (focus frame: 3 px ui.focus, 104 %, lighter background).</summary>
        public const string FocusedClass = "is-focused";

        /// <summary>Class of a disabled item.</summary>
        public const string DisabledClass = "is-disabled";

        /// <summary>Class of a screen in its hidden state (opacity 0, slightly smaller); removing it plays the open transition.</summary>
        public const string HiddenClass = "is-hidden";

        /// <summary>Class while a screen closes (shorter transition).</summary>
        public const string ClosingClass = "is-closing";

        /// <summary>Close transition duration in milliseconds (GDD 05 1.4: 0.10 s).</summary>
        public const long CloseMilliseconds = 100;

        /// <summary>Fills all text elements whose name has an entry in <see cref="UiTexts"/>.</summary>
        /// <param name="root">Root element.</param>
        public static void ApplyTexts(VisualElement root)
        {
            if (root == null)
            {
                return;
            }

            root.Query<TextElement>().ForEach(element =>
            {
                if (UiTexts.ForElement(element.name, out string text))
                {
                    element.text = text;
                }
            });
        }

        /// <summary>Collects all glyph labels (name <c>…-glyph-&lt;id&gt;</c>) below a root.</summary>
        /// <param name="root">Root element.</param>
        /// <param name="result">List that receives the labels and their glyphs.</param>
        public static void CollectGlyphLabels(VisualElement root, List<KeyValuePair<Label, UiGlyph>> result)
        {
            if (root == null || result == null)
            {
                return;
            }

            root.Query<Label>().ForEach(label =>
            {
                if (GlyphNames.TryParseElementName(label.name, out UiGlyph glyph))
                {
                    result.Add(new KeyValuePair<Label, UiGlyph>(label, glyph));
                }
            });
        }

        /// <summary>Sets the glyph texts and the family class (<c>glyphs-xbox</c> …) on a root.</summary>
        /// <param name="root">Root element (gets the family class).</param>
        /// <param name="labels">Glyph labels of the root.</param>
        /// <param name="glyphs">Glyph service.</param>
        public static void RefreshGlyphs(VisualElement root, List<KeyValuePair<Label, UiGlyph>> labels, IGlyphService glyphs)
        {
            if (glyphs == null)
            {
                return;
            }

            if (root != null)
            {
                foreach (GlyphFamily family in AllFamilies)
                {
                    root.EnableInClassList(GlyphCatalog.StyleClass(family), family == glyphs.Family);
                }
            }

            for (int i = 0; i < labels.Count; i++)
            {
                SetText(labels[i].Key, glyphs.Get(labels[i].Value));
            }
        }

        /// <summary>Sets a text only if it changed (no layout work for equal texts).</summary>
        /// <param name="element">Text element (may be null).</param>
        /// <param name="text">New text.</param>
        public static void SetText(TextElement element, string text)
        {
            if (element != null && !string.Equals(element.text, text, StringComparison.Ordinal))
            {
                element.text = text ?? string.Empty;
            }
        }

        /// <summary>Shows or hides an element without transition (display flex / none).</summary>
        /// <param name="element">Element (may be null).</param>
        /// <param name="displayed">True = shown.</param>
        public static void SetDisplayed(VisualElement element, bool displayed)
        {
            if (element == null)
            {
                return;
            }

            DisplayStyle wanted = displayed ? DisplayStyle.Flex : DisplayStyle.None;
            if (element.style.display.value != wanted || element.style.display.keyword != StyleKeyword.Undefined)
            {
                element.style.display = wanted;
            }
        }

        /// <summary>Sets the width of a fill element in percent of its parent (bars).</summary>
        /// <param name="fill">Fill element (may be null).</param>
        /// <param name="normalized">Value 0..1.</param>
        public static void SetFill(VisualElement fill, float normalized)
        {
            if (fill == null)
            {
                return;
            }

            float percent = (float.IsNaN(normalized) ? 0f : Math.Max(0f, Math.Min(1f, normalized))) * 100f;
            StyleLength current = fill.style.width;
            if (current.keyword == StyleKeyword.Undefined && current.value.unit == LengthUnit.Percent &&
                Math.Abs(current.value.value - percent) < 0.05f)
            {
                return;
            }

            fill.style.width = Length.Percent(percent);
        }

        /// <summary>Shows a screen with the open transition (opacity and scale, 0.15 s in USS).</summary>
        /// <param name="root">Screen root with the class <c>af-screen</c>.</param>
        public static void ShowAnimated(VisualElement root)
        {
            if (root == null)
            {
                return;
            }

            root.RemoveFromClassList(ClosingClass);
            root.AddToClassList(HiddenClass);
            root.style.display = DisplayStyle.Flex;
            root.BringToFront();
            // Next frame: the element was laid out in its hidden state, so removing the class plays the transition.
            root.schedule.Execute(() =>
            {
                if (!root.ClassListContains(ClosingClass))
                {
                    root.RemoveFromClassList(HiddenClass);
                }
            });
        }

        /// <summary>Hides a screen with the close transition (0.10 s), then removes it from the layout.</summary>
        /// <param name="root">Screen root with the class <c>af-screen</c>.</param>
        public static void HideAnimated(VisualElement root)
        {
            if (root == null)
            {
                return;
            }

            root.AddToClassList(ClosingClass);
            root.AddToClassList(HiddenClass);
            root.schedule.Execute(() =>
            {
                if (root.ClassListContains(ClosingClass))
                {
                    root.style.display = DisplayStyle.None;
                }
            }).StartingIn(CloseMilliseconds);
        }

        /// <summary>Hides a screen at once (initial state).</summary>
        /// <param name="root">Screen root.</param>
        public static void HideImmediately(VisualElement root)
        {
            if (root == null)
            {
                return;
            }

            root.AddToClassList(HiddenClass);
            root.AddToClassList(ClosingClass);
            root.style.display = DisplayStyle.None;
        }

        /// <summary>Marks an item as focused or not (focus frame in USS).</summary>
        /// <param name="element">Item (may be null).</param>
        /// <param name="focused">True = focused.</param>
        public static void SetFocused(VisualElement element, bool focused)
        {
            if (element != null)
            {
                element.EnableInClassList(FocusedClass, focused);
            }
        }

        /// <summary>Marks an item as disabled or not.</summary>
        /// <param name="element">Item (may be null).</param>
        /// <param name="disabled">True = disabled.</param>
        public static void SetDisabled(VisualElement element, bool disabled)
        {
            if (element != null)
            {
                element.EnableInClassList(DisabledClass, disabled);
            }
        }

        /// <summary>
        /// Wires a menu item: not focusable for UI Toolkit, hover → <paramref name="onEnter"/>, left mouse button down/up →
        /// <paramref name="onHold"/>, click → <paramref name="onClick"/>. Buttons use <c>clicked</c>, other elements
        /// <see cref="ClickEvent"/>.
        /// </summary>
        /// <remarks>
        /// Buttons lose the class <c>unity-button</c> of the default theme: its state rules (<c>.unity-button:enabled:hover</c>,
        /// <c>:active</c>, specificity 3) would beat the own classes and paint a light background under the mouse, also on
        /// disabled items (<see cref="DisabledClass"/> is not <c>:disabled</c>). The look of an item depends only on the own
        /// classes (<c>af-button</c>, <see cref="FocusedClass"/>, <see cref="DisabledClass"/>); hovering sets the focus.
        /// </remarks>
        /// <param name="element">Item element.</param>
        /// <param name="onEnter">Hover.</param>
        /// <param name="onHold">Mouse button held (true) or released (false).</param>
        /// <param name="onClick">Click.</param>
        public static void BindItem(VisualElement element, Action onEnter, Action<bool> onHold, Action onClick)
        {
            if (element == null)
            {
                return;
            }

            element.focusable = false;
            if (element is Button)
            {
                element.RemoveFromClassList(Button.ussClassName);
            }

            element.RegisterCallback<PointerEnterEvent>(evt => onEnter());
            // Trickle-down: the Button's own clickable stops the propagation of pointer down.
            element.RegisterCallback<PointerDownEvent>(evt =>
            {
                if (evt.button == 0)
                {
                    onHold(true);
                }
            }, TrickleDown.TrickleDown);
            element.RegisterCallback<PointerUpEvent>(evt => onHold(false), TrickleDown.TrickleDown);
            element.RegisterCallback<PointerLeaveEvent>(evt => onHold(false));
            if (element is Button button)
            {
                button.clicked += onClick;
            }
            else
            {
                element.RegisterCallback<ClickEvent>(evt => onClick());
            }
        }

        private static readonly GlyphFamily[] AllFamilies =
        {
            GlyphFamily.KeyboardMouse, GlyphFamily.Xbox, GlyphFamily.PlayStation, GlyphFamily.Nintendo, GlyphFamily.Generic
        };
    }
}
