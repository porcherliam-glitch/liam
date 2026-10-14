using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Draws an Aether beam as a line (GDD 05 3.4: turquoise #2FE6D6, pulse 0.5 Hz) with an optional light that follows its end.
    /// The light puzzle and the arena beam set the points; the line pulses its width.
    /// </summary>
    /// <remarks>GameObject: LineRenderer with an emissive (or unlit) turquoise material; optional child point light.</remarks>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(LineRenderer))]
    public sealed class AetherBeamView : MonoBehaviour
    {
        [Tooltip("Breite des Strahls in Metern.")]
        [Range(0.02f, 0.6f)] [SerializeField] private float width = 0.12f;

        [Tooltip("Puls der Breite in Hz (GDD 05, 3.4: 0,5 Hz).")]
        [Range(0f, 3f)] [SerializeField] private float pulseHertz = 0.5f;

        [Tooltip("Licht am Ende des Strahls (optional).")]
        [SerializeField] private Light endLight = null;

        private LineRenderer _line;
        private Vector3[] _points = new Vector3[0];
        private bool _visible = true;

        /// <summary>Points of the beam in world space.</summary>
        public IReadOnlyList<Vector3> Points => _points;

        /// <summary>Sets the points of the beam (world space).</summary>
        /// <param name="points">At least two points; fewer hide the beam.</param>
        public void SetPath(IReadOnlyList<Vector3> points)
        {
            int count = points != null ? points.Count : 0;
            if (_points.Length != count)
            {
                _points = new Vector3[count];
            }

            for (int i = 0; i < count; i++)
            {
                _points[i] = points[i];
            }

            Apply();
        }

        /// <summary>Shows or hides the beam.</summary>
        /// <param name="visible">True to show.</param>
        public void SetVisible(bool visible)
        {
            _visible = visible;
            Apply();
        }

        private void Awake()
        {
            _line = GetComponent<LineRenderer>();
            _line.useWorldSpace = true;
            _line.widthMultiplier = width;
        }

        private void Update()
        {
            if (_line == null || !_line.enabled || !(pulseHertz > 0f))
            {
                return;
            }

            _line.widthMultiplier = width * (0.85f + 0.15f * Mathf.Sin(Time.time * pulseHertz * 2f * Mathf.PI));
        }

        private void Apply()
        {
            if (_line == null)
            {
                _line = GetComponent<LineRenderer>();
            }

            bool show = _visible && _points.Length >= 2;
            _line.enabled = show;
            if (show)
            {
                _line.positionCount = _points.Length;
                _line.SetPositions(_points);
            }

            if (endLight != null)
            {
                endLight.enabled = show;
                if (show)
                {
                    endLight.transform.position = _points[_points.Length - 1];
                }
            }
        }
    }
}
