import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Walkable 3D museum, generated from a preset (no model files).
 * Drag to look, WASD/arrows to walk, click a painting to walk up to it.
 */
import { EYE, computeSlots, type MoveInput, type MuseumArtwork, type Preset, type Slot } from "./layout";

/** Real size in metres from cm, else from the image's aspect ratio; kept hangable. */
function paintingSize(art: MuseumArtwork, aspect: number): [number, number] {
  let w = art.widthCm ? art.widthCm / 100 : 0;
  let h = art.heightCm ? art.heightCm / 100 : 0;
  if (!w || !h) { h = 0.9; w = h * aspect; }
  const scale = Math.min(1, 2.4 / Math.max(w, h));
  w *= scale; h *= scale;
  const grow = Math.max(1, 0.35 / Math.min(w, h));
  return [w * grow, h * grow];
}

/** Where to stand to look at a slot. */
export function viewpoint(slot: Slot, size = 1): { pos: THREE.Vector3; yaw: number } {
  const [x, , z] = slot.position;
  const d = Math.max(2.2, size * 1.7);
  const pos = new THREE.Vector3(x + Math.sin(slot.rotationY) * d, EYE, z + Math.cos(slot.rotationY) * d);
  return { pos, yaw: Math.atan2(-(x - pos.x), -(z - pos.z)) };
}

function Painting({ art, slot, light, selected, onSelect }: {
  art: MuseumArtwork; slot: Slot; light: Preset["light"]; selected: boolean; onSelect: (size: number) => void;
}) {
  const gl = useThree((s) => s.gl);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(art.imageUrl, (t) => {
      if (!alive) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = gl.capabilities.getMaxAnisotropy();
      const img = t.image as { width: number; height: number };
      if (img?.width && img?.height) setAspect(img.width / img.height);
      setTex(t);
    }, undefined, () => undefined);
    return () => { alive = false; };
  }, [art.imageUrl, gl]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  const [w, h] = paintingSize(art, aspect);
  const frameColor = light === "night" || light === "warm" ? "#8a6a35" : "#2f2219";
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // was a drag, not a click
    e.stopPropagation();
    onSelect(Math.max(w, h));
  };

  return (
    <group position={slot.position} rotation-y={slot.rotationY}>
      <mesh position={[0, 0, -0.012]} onClick={click}>
        <boxGeometry args={[w + 0.14, h + 0.14, 0.05]} />
        <meshStandardMaterial color={selected ? "#b5532d" : frameColor} roughness={0.55} metalness={light === "night" ? 0.4 : 0.1} />
      </mesh>
      <mesh position={[0, 0, 0.015]} onClick={click}>
        <planeGeometry args={[w, h]} />
        {/* key forces a new material once the image arrives — three.js only adds the
            texture to the shader when a material is compiled, so re-using the
            placeholder material rendered the painting black. */}
        {tex
          ? <meshStandardMaterial key="art" map={tex} roughness={0.85} />
          : <meshStandardMaterial key="placeholder" color="#d8d2c6" />}
      </mesh>
      {/* small wall label */}
      <mesh position={[w / 2 + 0.25, -h / 2 + 0.06, 0.01]}>
        <planeGeometry args={[0.22, 0.1]} />
        <meshStandardMaterial color={light === "night" ? "#3a3842" : "#ffffff"} />
      </mesh>
      <primitive object={target} position={[0, 0, 0]} />
      <spotLight position={[0, h / 2 + 1.3, 1.5]} target={target} angle={0.55} penumbra={0.7}
        intensity={light === "night" ? 45 : light === "warm" ? 28 : 18} distance={7} decay={1.6} color={light === "warm" || light === "night" ? "#ffd9a8" : "#ffffff"} />
    </group>
  );
}

function Room({ p, wallColor }: { p: Preset; wallColor: string }) {
  const { width: w, depth: d, height: h } = p;
  const wallMat = <meshStandardMaterial color={wallColor} roughness={0.95} />;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={p.floor} roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, h, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={p.ceiling} roughness={1} />
      </mesh>
      <mesh position={[0, h / 2, -d / 2]}><planeGeometry args={[w, h]} />{wallMat}</mesh>
      <mesh position={[0, h / 2, d / 2]} rotation-y={Math.PI}><planeGeometry args={[w, h]} />{wallMat}</mesh>
      <mesh position={[w / 2, h / 2, 0]} rotation-y={-Math.PI / 2}><planeGeometry args={[d, h]} />{wallMat}</mesh>
      <mesh position={[-w / 2, h / 2, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[d, h]} />{wallMat}</mesh>
      {p.columns && [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx! * (w / 2 - 1.1), h / 2, sz! * (d / 2 - 1.1)]}>
          <cylinderGeometry args={[0.35, 0.42, h, 24]} />
          <meshStandardMaterial color={p.wall} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Player({ p, focus, reducedMotion, move, columns }: {
  p: Preset; focus: { pos: THREE.Vector3; yaw: number } | null; reducedMotion: boolean;
  move: MutableRefObject<MoveInput>; columns: boolean;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const goal = useRef<{ pos: THREE.Vector3; yaw: number } | null>(null);

  useEffect(() => { camera.position.set(0, EYE, p.depth / 2 - 2); yaw.current = 0; pitch.current = 0; }, [camera, p]);
  useEffect(() => { goal.current = focus; }, [focus]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.("input, textarea, select");
    const down = (e: KeyboardEvent) => { if (!typing(e)) keys.current[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; };
    const pm = (e: PointerEvent) => {
      if (!drag) return;
      yaw.current -= (e.clientX - drag.x) * 0.004;
      pitch.current = Math.max(-0.6, Math.min(0.6, pitch.current - (e.clientY - drag.y) * 0.003));
      drag = { x: e.clientX, y: e.clientY };
      goal.current = null;
    };
    const pu = () => { drag = null; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const k = keys.current;
    const fwd = (k["w"] || k["arrowup"] ? 1 : 0) - (k["s"] || k["arrowdown"] ? 1 : 0) + move.current.forward;
    const strafe = (k["d"] ? 1 : 0) - (k["a"] ? 1 : 0);
    const turn = (k["arrowleft"] || k["q"] ? 1 : 0) - (k["arrowright"] || k["e"] ? 1 : 0) + move.current.turn;
    if (fwd || strafe || turn) goal.current = null;

    yaw.current += turn * 1.6 * dt;
    const step = 3.2 * Math.min(dt, 0.05);
    const pos = camera.position;
    pos.x += (-Math.sin(yaw.current) * fwd + Math.cos(yaw.current) * strafe) * step;
    pos.z += (-Math.cos(yaw.current) * fwd - Math.sin(yaw.current) * strafe) * step;

    if (goal.current) {
      const g = goal.current;
      const t = reducedMotion ? 1 : 1 - Math.pow(0.02, dt);
      pos.lerp(g.pos, t);
      let dy = g.yaw - yaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * t;
      pitch.current *= 1 - t;
      if (pos.distanceTo(g.pos) < 0.01 && Math.abs(dy) < 0.002) goal.current = null;
    }

    // Stay inside the room and out of the columns.
    const m = 0.6;
    pos.x = Math.max(-p.width / 2 + m, Math.min(p.width / 2 - m, pos.x));
    pos.z = Math.max(-p.depth / 2 + m, Math.min(p.depth / 2 - m, pos.z));
    if (columns) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = sx * (p.width / 2 - 1.1), cz = sz * (p.depth / 2 - 1.1);
        const dx = pos.x - cx, dz = pos.z - cz, dist = Math.hypot(dx, dz);
        if (dist < 0.9 && dist > 0) { pos.x = cx + (dx / dist) * 0.9; pos.z = cz + (dz / dist) * 0.9; }
      }
    }
    pos.y = EYE;
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
  });
  return null;
}

export default function MuseumScene({ preset, wallColor, artworks, slots, selectedId, onSelect, move, reducedMotion }: {
  preset: Preset; wallColor: string; artworks: MuseumArtwork[]; slots: Record<string, number>;
  selectedId: number | null; onSelect: (id: number | null) => void; move: MutableRefObject<MoveInput>; reducedMotion: boolean;
}) {
  const slotList = useMemo(() => computeSlots(preset), [preset]);
  const byId = useMemo(() => new Map(artworks.map((a) => [a.id, a])), [artworks]);
  const [focus, setFocus] = useState<{ pos: THREE.Vector3; yaw: number } | null>(null);
  const ambient = { bright: 1.6, neutral: 1.2, warm: 1.0, night: 1.0 }[preset.light];

  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 62, near: 0.05, far: 80 }} gl={{ antialias: true }}
      onPointerMissed={() => onSelect(null)} style={{ touchAction: "none" }}>
      <color attach="background" args={[preset.ceiling]} />
      <ambientLight intensity={ambient} color={preset.light === "warm" ? "#ffe6c4" : "#ffffff"} />
      <hemisphereLight args={["#ffffff", preset.floor, preset.light === "night" ? 0.4 : 0.6]} />
      <Room p={preset} wallColor={wallColor} />
      {slotList.map((slot) => {
        const art = byId.get(slots[slot.id] ?? -1);
        return art ? (
          <Painting key={`${slot.id}-${art.id}`} art={art} slot={slot} light={preset.light} selected={selectedId === art.id}
            onSelect={(size) => { onSelect(art.id); setFocus(viewpoint(slot, size)); }} />
        ) : null;
      })}
      <Player p={preset} focus={focus} reducedMotion={reducedMotion} move={move} columns={preset.columns} />
    </Canvas>
  );
}
