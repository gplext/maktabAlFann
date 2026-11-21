# Room light bake (Blender)

Bakes the soft light of the 3D living room ("See it in a room" on the artwork page) into lightmaps:
bounce light between floor, walls and furniture, darker corners, and the soft shadows under and behind
the sofa, side table and plant. The window sun and the picture light stay live in three.js.

Output used by the site: `artifacts/art-gallery/public/room/lm_floor.jpg`, `lm_back.jpg`, `lm_left.jpg`, `lm_right.jpg`, `lm_ceiling.jpg`
(about 60 KB together), and `LIGHTMAP_SCALE` in `artifacts/art-gallery/src/components/three/living-room.tsx`.

Only re-bake if you change the room (size, furniture or where it stands, colours, lights).

1. Install Blender 4.2 LTS (free, blender.org).
2. Download the original Poly Haven assets (CC0) into one folder, as glTF at 1k: `Sofa_01`, `side_table_tall_01`,
   `ceramic_vase_01`, `potted_plant_02` (each in its own subfolder), plus `lythwood_room_1k.hdr`.
3. Bake (about 15 minutes on 2 CPU cores at 128 samples):

   ```bash
   blender -b -P tools/room-bake/bake_room.py -- <assets-folder> <bake-folder> 128
   blender -b -P tools/room-bake/export_lightmaps.py -- <bake-folder> <png-folder>
   ```

4. Convert the PNGs to JPEG (quality ~88) as `public/room/lm_*.jpg`, and copy `scale` from
   `<png-folder>/lm_scale.json` into `LIGHTMAP_SCALE`.

The room in `bake_room.py` must match `living-room.tsx` (7 × 6 × 2.8 m, furniture positions). Coordinates:
three.js (x, y, z) = Blender (x, −z, y).
