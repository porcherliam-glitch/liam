using System;
using System.Collections.Generic;
using Aetherfall.Utilities;

namespace Aetherfall.World
{
    /// <summary>
    /// Derived positions of a layout that the generator and the preview must agree on: enemies of a spawner and the crystal
    /// shards of the rift. Pure logic; Python twins: spawner_positions and rift_crystals in Tools/Preview/eichental_layout.py.
    /// </summary>
    public static class LayoutPlacement
    {
        /// <summary>
        /// Enemy positions of a spawner: one enemy stands in the centre; several stand on a ring of 0.6 × radius, the first at
        /// 0.5 rad (clockwise from north), each facing away from the centre.
        /// </summary>
        /// <param name="spawner">Spawner.</param>
        public static List<PlacedPoint> SpawnerPositions(LayoutSpawner spawner)
        {
            if (spawner == null)
            {
                throw new ArgumentNullException(nameof(spawner));
            }

            int count = Math.Max(0, spawner.Count);
            double ring = count <= 1 ? 0.0 : spawner.Radius * 0.6;
            var points = new List<PlacedPoint>(count);
            for (int i = 0; i < count; i++)
            {
                double a = 2.0 * Math.PI * i / count + 0.5;
                points.Add(new PlacedPoint(spawner.Center.X + ring * Math.Sin(a), spawner.Center.Z + ring * Math.Cos(a), a * 180.0 / Math.PI));
            }

            return points;
        }

        /// <summary>
        /// Crystal shards of the rift: per shard six floats of a <see cref="Pcg32Random"/> seeded with the crystal seed (angle,
        /// distance 0.25–1 × radius, height 0.8–3 m, tilt x and z ±25°, yaw).
        /// </summary>
        /// <param name="rift">Rift.</param>
        public static List<RiftCrystal> RiftCrystals(LayoutRift rift)
        {
            if (rift == null)
            {
                throw new ArgumentNullException(nameof(rift));
            }

            var random = new Pcg32Random(rift.CrystalSeed);
            var crystals = new List<RiftCrystal>(Math.Max(0, rift.Crystals));
            for (int i = 0; i < rift.Crystals; i++)
            {
                double a = random.NextFloat() * 2.0 * Math.PI;
                double d = rift.Radius * (0.25 + 0.75 * random.NextFloat());
                double height = 0.8 + 2.2 * random.NextFloat();
                double tiltX = (random.NextFloat() - 0.5) * 50.0;
                double tiltZ = (random.NextFloat() - 0.5) * 50.0;
                double yaw = random.NextFloat() * 360.0;
                crystals.Add(new RiftCrystal(rift.Center.X + d * Math.Sin(a), rift.Center.Z + d * Math.Cos(a), height, tiltX, tiltZ, yaw));
            }

            return crystals;
        }
    }
}
