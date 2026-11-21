"""
Bakes the living room's light into lightmaps for the 3D "See it in a room" view.

  blender -b -P tools/room-bake/bake_room.py -- <assets-dir> <out-dir> [samples]

<assets-dir> holds the Poly Haven originals (uncompressed .gltf folders + lythwood_room_1k.hdr).
Writes <out-dir>/lm_floor.png, lm_back.png, lm_left.png, lm_right.png, lm_ceiling.png and lm_scale.json.

What is baked: soft light from the room (the HDRI coming in through the open side where the
camera stands, plus a large soft ceiling light) - its bounces between floor, walls and furniture,
the dark corners and the soft shadows under and behind the sofa, table and plant. The window
sun and the picture light stay live in three.js (they cast the sharp shadows and follow the painting).

The room matches artifacts/art-gallery/src/components/three/living-room.tsx exactly:
three.js (x, y, z) = Blender (x, z, -y); room 7 m wide, 6 m deep, 2.8 m high, back wall at z = 0.
Each surface's UVs match three.js's PlaneGeometry on that surface, so a lightmap lines up 1:1.
"""
import bpy, sys, os, json, math

argv = sys.argv[sys.argv.index("--") + 1:]
ASSETS, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 512
os.makedirs(OUT, exist_ok=True)
RW, RD, RH = 7.0, 6.0, 2.8

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.render.bake.margin = 8

# ── World: the same interior HDRI three.js uses ────────────────────────────────
world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
env = nt.nodes.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(os.path.join(ASSETS, "lythwood_room_1k.hdr"))
bg = nt.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = 1.0
out = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(env.outputs["Color"], bg.inputs["Color"]); nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

def flat_material(name, rgb, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    return m

def srgb(h):  # "#E4E1DB" -> linear rgb
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

WALL = flat_material("wall", srgb("#E4E1DB"))
FLOOR = flat_material("floor", srgb("#8A5A34"), 0.6)   # average colour of the parquet
CEIL = flat_material("ceiling", srgb("#F4F1EA"))

def plane(name, size, loc, rot_deg, mat, res):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=[math.radians(r) for r in rot_deg])
    o = bpy.context.active_object; o.name = name
    o.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Enough geometry for smooth light (Cycles bakes per pixel, but subdivided planes avoid long thin triangles).
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.subdivide(number_cuts=8); bpy.ops.object.mode_set(mode="OBJECT")
    o.data.materials.append(mat)
    return o, res

# Default plane UVs: u along local +X, v along local +Y - rotated to match three.js on each surface.
surfaces = [
    plane("floor",   (RW, RD), (0, -RD / 2, 0),        (0, 0, 0),     FLOOR, (1024, 1024)),
    plane("back",    (RW, RH), (0, 0, RH / 2),         (90, 0, 0),    WALL,  (1024, 512)),
    plane("left",    (RD, RH), (-RW / 2, -RD / 2, RH / 2), (90, 0, 90),  WALL,  (1024, 512)),
    plane("right",   (RD, RH), (RW / 2, -RD / 2, RH / 2),  (90, 0, -90), WALL,  (1024, 512)),
    plane("ceiling", (RW, RD), (0, -RD / 2, RH),       (180, 0, 0),   CEIL,  (512, 512)),
]
# Skirting board (casts a little shadow on the floor).
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.008, 0.05)); sk = bpy.context.active_object
sk.scale = (RW, 0.016, 0.1); sk.data.materials.append(flat_material("skirting", srgb("#F3F0E9"), 0.5))

# ── Furniture (Poly Haven originals, real size) at the same places as in three.js ──
def furniture(folder, loc3, rot_y=0.0, scale=1.0):
    path = [os.path.join(ASSETS, folder, f) for f in os.listdir(os.path.join(ASSETS, folder)) if f.endswith(".gltf")][0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None or o.parent not in new]
    x, y, z = loc3
    for r in roots:
        r.location = (r.location[0] + x, r.location[1] - z, r.location[2] + y)
        r.rotation_mode = "XYZ"; r.rotation_euler[2] += rot_y
        r.scale = tuple(s * scale for s in r.scale)

furniture("Sofa_01", (0, 0, 0.42))
furniture("side_table_tall_01", (1.15, 0, 0.32))
furniture("ceramic_vase_01", (1.15, 0.762, 0.32), 0, 0.75)
furniture("potted_plant_02", (-1.3, 0, 0.42), 0.6, 1.15)

# A soft ceiling light above the seating, like a large diffuser.
bpy.ops.object.light_add(type="AREA", location=(0, -1.6, RH - 0.02))
lamp = bpy.context.active_object; lamp.data.shape = "RECTANGLE"; lamp.data.size = 2.2; lamp.data.size_y = 1.4
lamp.data.energy = 260; lamp.data.color = (1.0, 0.95, 0.88)

# ── Bake: diffuse light only (direct + bounced), without the surface colour ─────
scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = True
scene.render.bake.use_pass_color = False

results = {}
for obj, (w, h) in surfaces:
    img = bpy.data.images.new(f"lm_{obj.name}", width=w, height=h, float_buffer=True)
    mat = obj.data.materials[0].copy(); obj.data.materials[0] = mat
    node = mat.node_tree.nodes.new("ShaderNodeTexImage"); node.image = img
    mat.node_tree.nodes.active = node
    for o in bpy.context.view_layer.objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    print(f"baking {obj.name} {w}x{h} @ {SAMPLES} samples", flush=True)
    bpy.ops.object.bake(type="DIFFUSE")
    img.filepath_raw = os.path.join(OUT, f"lm_{obj.name}.exr"); img.file_format = "OPEN_EXR"; img.save()
    px = img.pixels[:]
    results[obj.name] = max(px[i] for i in range(0, len(px), 4))
json.dump(results, open(os.path.join(OUT, "lm_max.json"), "w"), indent=2)
print("done", results, flush=True)
