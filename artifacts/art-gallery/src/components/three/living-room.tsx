import { useMemo, useEffect, Suspense } from "react";
import { Safe } from "./framed-painting";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";

/**
 * A furnished living room at real scale (metres). The back wall is z = 0, the floor y = 0,
 * the room opens towards +z where the camera stands.
 *
 * Furniture, floor and wall textures and the light probe (HDRI) are CC0 assets from Poly Haven
 * (polyhaven.com), compressed into public/room/ (about 3.3 MB in total).
 */
export const ROOM = { width: 7, depth: 6, height: 2.8 };
/** Top of the sofa back: the painting hangs at least 22 cm above it. */
export const SOFA_TOP = 0.8;

const ASSETS = "/room";
const MODELS = ["Sofa_01", "side_table_tall_01", "ceramic_vase_01", "potted_plant_02"] as const;

function Model({ name, position, rotation = 0, scale = 1 }: { name: (typeof MODELS)[number]; position: [number, number, number]; rotation?: number; scale?: number }) {
  const { scene } = useGLTF(`${ASSETS}/${name}.glb`, false, true);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    return o;
  }, [scene]);
  return <primitive object={obj} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}

/** A soft wool rug, drawn in code. */
function useRugTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 680;
    const g = c.getContext("2d")!;
    g.fillStyle = "#D9CDB8"; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#9C8462"; g.lineWidth = 18; g.strokeRect(40, 40, c.width - 80, c.height - 80);
    g.strokeStyle = "#B9A684"; g.lineWidth = 6; g.strokeRect(78, 78, c.width - 156, c.height - 156);
    // Wool texture: many tiny fibres.
    for (let i = 0; i < 26000; i++) {
      const v = 150 + Math.random() * 80;
      g.fillStyle = `rgba(${v},${v - 12},${v - 30},0.18)`;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, []);
}

/**
 * Light baked in Blender (tools/room-bake): bounce light, dark corners and the soft shadows of the
 * furniture on the floor and walls. Stored as sRGB JPEGs scaled by LIGHTMAP_SCALE (from lm_scale.json).
 * three.js adds it as indirect light; the live window sun and picture light add the sharp shadows.
 */
const LIGHTMAP_SCALE = 1.902;
const LIGHTMAP_STRENGTH = LIGHTMAP_SCALE * Math.PI * 0.22;
type Lightmaps = Record<"floor" | "back" | "left" | "right" | "ceiling" | "rug", THREE.Texture>;

function useLightmaps(): Lightmaps {
  const t = useTexture({
    floor: `${ASSETS}/lm_floor.jpg`, back: `${ASSETS}/lm_back.jpg`, left: `${ASSETS}/lm_left.jpg`,
    right: `${ASSETS}/lm_right.jpg`, ceiling: `${ASSETS}/lm_ceiling.jpg`,
  });
  return useMemo(() => {
    for (const x of Object.values(t)) { x.colorSpace = THREE.SRGBColorSpace; x.flipY = true; x.needsUpdate = true; }
    // The rug lies on the floor: read the floor's lightmap under it (rug 2.7 × 1.8 m, centred 1.25 m from the wall).
    const rug = t.floor.clone();
    rug.repeat.set(2.7 / ROOM.width, 1.8 / ROOM.depth);
    rug.offset.set((ROOM.width / 2 - 1.35) / ROOM.width, 1 - 2.15 / ROOM.depth);
    rug.needsUpdate = true;
    return { ...t, rug };
  }, [t]);
}

function Surfaces({ lm }: { lm: Lightmaps | null }) {
  const floor = useTexture({ map: `${ASSETS}/floor_diff.jpg`, normalMap: `${ASSETS}/floor_nor.jpg`, roughnessMap: `${ASSETS}/floor_rough.jpg` });
  const wall = useTexture({ normalMap: `${ASSETS}/wall_nor.jpg`, roughnessMap: `${ASSETS}/wall_rough.jpg` });
  const rug = useRugTexture();

  useEffect(() => {
    floor.map.colorSpace = THREE.SRGBColorSpace;
    for (const t of Object.values(floor)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.width / 1.6, ROOM.depth / 1.6); t.anisotropy = 8; t.needsUpdate = true; }
    for (const t of Object.values(wall)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.width / 2, ROOM.height / 2); t.needsUpdate = true; }
  }, [floor, wall]);

  const { width: RW, depth: RD, height: RH } = ROOM;
  // With baked light, the room's surfaces take their soft light from the lightmap instead of the HDRI.
  const baked = (map?: THREE.Texture) => (lm && map ? { lightMap: map, lightMapIntensity: LIGHTMAP_STRENGTH, envMapIntensity: 0 } : {});
  const wallMat = (map?: THREE.Texture) => (
    <meshStandardMaterial color="#E4E1DB" normalMap={wall.normalMap} normalScale={new THREE.Vector2(0.35, 0.35)} roughnessMap={wall.roughnessMap} roughness={0.95} {...baked(map)} />
  );

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, RD / 2]} receiveShadow>
        <planeGeometry args={[RW, RD]} />
        <meshStandardMaterial map={floor.map} normalMap={floor.normalMap} roughnessMap={floor.roughnessMap} color="#d8c7b0" {...baked(lm?.floor)} />
      </mesh>
      {/* Walls and ceiling */}
      <mesh position={[0, RH / 2, 0]} receiveShadow><planeGeometry args={[RW, RH]} />{wallMat(lm?.back)}</mesh>
      <mesh position={[-RW / 2, RH / 2, RD / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow><planeGeometry args={[RD, RH]} />{wallMat(lm?.left)}</mesh>
      <mesh position={[RW / 2, RH / 2, RD / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow><planeGeometry args={[RD, RH]} />{wallMat(lm?.right)}</mesh>
      <mesh position={[0, RH, RD / 2]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[RW, RD]} /><meshStandardMaterial color="#F4F1EA" roughness={1} {...baked(lm?.ceiling)} /></mesh>
      {/* Skirting board */}
      <mesh position={[0, 0.05, 0.008]} castShadow receiveShadow><boxGeometry args={[RW, 0.1, 0.016]} /><meshStandardMaterial color="#F3F0E9" roughness={0.5} /></mesh>
      {/* Rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 1.25]} receiveShadow>
        <planeGeometry args={[2.7, 1.8]} />
        <meshStandardMaterial map={rug} roughness={1} {...baked(lm?.rug)} />
      </mesh>
    </group>
  );
}

function BakedSurfaces() {
  const lm = useLightmaps();
  return <Surfaces lm={lm} />;
}

export function LivingRoom() {
  return (
    <group>
      {/* Baked light when the lightmaps load; plain live lighting otherwise. */}
      <Safe fallback={<Surfaces lm={null} />}>
        <Suspense fallback={<Surfaces lm={null} />}><BakedSurfaces /></Suspense>
      </Safe>
      {/* Furniture (real sizes: sofa 1.57 m wide) */}
      <Model name="Sofa_01" position={[0, 0, 0.42]} />
      <Model name="side_table_tall_01" position={[1.15, 0, 0.32]} />
      <Model name="ceramic_vase_01" position={[1.15, 0.762, 0.32]} scale={0.75} />
      <Model name="potted_plant_02" position={[-1.3, 0, 0.42]} rotation={0.6} scale={1.15} />
    </group>
  );
}

for (const m of MODELS) useGLTF.preload(`${ASSETS}/${m}.glb`, false, true);
