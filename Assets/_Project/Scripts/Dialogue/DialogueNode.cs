using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Base class of the dialogue nodes (GDD 02, 12.2; architecture 11.8): held as <c>[SerializeReference]</c> list by
    /// <see cref="DialogueDefinition"/>. A node has an id (<c>n010</c> …, unique in its dialogue) and an editor position for the
    /// later graph view.
    /// </summary>
    /// <remarks>
    /// Rules like conditions and actions (architecture 7.6): <c>[Serializable]</c>, sealed concrete types, a parameterless
    /// constructor, no run-time state (nodes are part of shared assets; the run-time state lives in
    /// <see cref="DialogueRunner"/> and <see cref="DialogueMemory"/>). Class, namespace and assembly names are frozen from the
    /// first content asset on. The chainable methods (<c>To</c>, <c>Do</c> …) build test data and generator output in code.
    /// </remarks>
    [Serializable]
    public abstract class DialogueNode
    {
        [Tooltip("Knoten-ID, eindeutig im Dialog: n010, n020 … in 10er-Schritten (GDD 02, 12.2).")]
        [SerializeField] private string id = string.Empty;

        [Tooltip("Position in der späteren Graph-Ansicht (wird vom Editor gesetzt).")]
        [HideInInspector] [SerializeField] private Vector2 editorPosition;

        /// <summary>Creates an empty node (inspector).</summary>
        protected DialogueNode()
        {
        }

        /// <summary>Creates a node with an id.</summary>
        /// <param name="id">Node id, e.g. <c>n010</c>.</param>
        protected DialogueNode(string id)
        {
            this.id = id ?? string.Empty;
        }

        /// <summary>Node id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>Node type.</summary>
        public abstract DialogueNodeKind Kind { get; }

        /// <summary>Position in the graph view (editor only).</summary>
        public Vector2 EditorPosition => editorPosition;

        /// <summary>True if the conversation can end directly at this node (end node, or a line/action with an exit id).</summary>
        public virtual bool CanEndHere => false;

        /// <summary>Adds the ids of all nodes of the same dialogue this node can continue to (validator, analysis).</summary>
        /// <param name="targets">List that receives the node ids (empty ids are skipped by the caller).</param>
        public abstract void CollectTargets(List<string> targets);

        /// <summary>Checks the own data (texts, parameters, conditions and actions); node references are checked by the validator.</summary>
        /// <param name="report">Report.</param>
        public virtual void Validate(IValidationReport report)
        {
        }

        /// <summary>Short German text for lists and the editor header.</summary>
        public virtual string Describe()
        {
            return Id + " " + Kind;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Describe();
        }

        /// <summary>Adds a node id to a target list if it is not empty.</summary>
        /// <param name="targets">Target list.</param>
        /// <param name="nodeId">Node id or empty.</param>
        protected static void AddTarget(List<string> targets, string nodeId)
        {
            if (targets != null && !string.IsNullOrEmpty(nodeId))
            {
                targets.Add(nodeId);
            }
        }
    }
}
