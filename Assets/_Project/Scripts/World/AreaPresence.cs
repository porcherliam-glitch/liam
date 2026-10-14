using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

namespace Aetherfall.World
{
    /// <summary>
    /// Remembers which colliders of the player are inside an area (pure logic of <see cref="AreaTrigger"/>): the area is entered
    /// when the first collider comes in and left when the last one goes out, so a player with several colliders or a collider
    /// that touches the border twice sends <c>AreaEntered</c> only once per visit.
    /// </summary>
    /// <remarks>
    /// <para>The colliders are kept as a set (by reference), not as a counter: the same collider entering twice counts once.
    /// That matters when the player is teleported (load, respawn): Unity sends no <c>OnTriggerExit</c> for a collider that is
    /// disabled or destroyed inside a trigger (Unity manual "OnTrigger events", Collider.OnTriggerExit), and the
    /// CharacterController is disabled for a teleport. Re-enabled at the same place it sends <c>OnTriggerEnter</c> again – the
    /// set ignores it. Moved away, its exit never comes – <see cref="Prune"/> removes it, so the next visit counts again.</para>
    /// <para>Keys are compared by reference (never with an overloaded <c>Equals</c>, which Unity objects have).</para>
    /// </remarks>
    /// <typeparam name="TKey">Key of a collider (in the game <c>UnityEngine.Collider</c>).</typeparam>
    public sealed class AreaPresence<TKey> where TKey : class
    {
        private readonly HashSet<TKey> _inside = new HashSet<TKey>(ReferenceComparer.Instance);
        private readonly List<TKey> _stale = new List<TKey>();

        /// <summary>True while at least one collider of the player is inside.</summary>
        public bool IsInside => _inside.Count > 0;

        /// <summary>Number of colliders inside.</summary>
        public int Count => _inside.Count;

        /// <summary>A collider of the player came in.</summary>
        /// <param name="key">The collider (null is ignored).</param>
        /// <returns>True if this is the start of a visit (send <c>AreaEntered</c>).</returns>
        public bool Enter(TKey key)
        {
            if (key == null)
            {
                return false;
            }

            bool wasEmpty = _inside.Count == 0;
            return _inside.Add(key) && wasEmpty;
        }

        /// <summary>A collider of the player went out.</summary>
        /// <param name="key">The collider.</param>
        /// <returns>True if the visit ended.</returns>
        public bool Exit(TKey key)
        {
            if (key == null || !_inside.Remove(key))
            {
                return false;
            }

            return _inside.Count == 0;
        }

        /// <summary>
        /// Removes every collider that is no longer inside although its exit never came (disabled, destroyed or teleported
        /// away). Call it regularly while <see cref="IsInside"/> is true. Allocation-free.
        /// </summary>
        /// <param name="stillInside">True if the collider still counts as inside.</param>
        /// <returns>True if the visit ended by this call.</returns>
        public bool Prune(Func<TKey, bool> stillInside)
        {
            if (stillInside == null || _inside.Count == 0)
            {
                return false;
            }

            _stale.Clear();
            foreach (TKey key in _inside)
            {
                if (!stillInside(key))
                {
                    _stale.Add(key);
                }
            }

            if (_stale.Count == 0)
            {
                return false;
            }

            for (int i = 0; i < _stale.Count; i++)
            {
                _inside.Remove(_stale[i]);
            }

            _stale.Clear();
            return _inside.Count == 0;
        }

        /// <summary>Forgets every collider (the trigger was disabled).</summary>
        public void Reset()
        {
            _inside.Clear();
            _stale.Clear();
        }

        private sealed class ReferenceComparer : IEqualityComparer<TKey>
        {
            public static readonly ReferenceComparer Instance = new ReferenceComparer();

            public bool Equals(TKey x, TKey y)
            {
                return ReferenceEquals(x, y);
            }

            public int GetHashCode(TKey obj)
            {
                return RuntimeHelpers.GetHashCode(obj);
            }
        }
    }
}
