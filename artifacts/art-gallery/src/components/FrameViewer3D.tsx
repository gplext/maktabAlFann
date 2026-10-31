import { useRef, useState, useEffect, Suspense, Component, type ReactNode } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

/** Keeps a failed load (offline lighting file, broken image) from blanking the whole page. */
class Safe extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() { /* shown as the fallback instead */ }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// Derive the ref type from the drei OrbitControls component
type OrbitControlsImpl = NonNullable<React.ComponentRef<typeof OrbitControls>>;

// ── Parse aspect ratio from size string (e.g. "24 × 36 in", "60x90 cm") ─────
function parseAspectRatio(size?: string | null): number {
  if (!size) return 1;
  const nums = size.match(/[\d.]+/g);
  if (!nums || nums.length < 2) return 1;
  const w = parseFloat(nums[0]);
  const h = parseFloat(nums[1]);
  if (!w || !h) return 1;
  return w / h;
}

// ── Frame geometry constants ───────────────────────────────────────────────
const BORDER = 0.18;   // frame moulding width
const DEPTH  = 0.14;   // frame extrusion depth
const MAT    = 0.07;   // mat/mount inset

// Gold moulding material
const FRAME_MATERIAL = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#8B6914"),
  metalness: 0.55,
  roughness: 0.35,
});

// Mat board material (cream)
const MAT_MATERIAL = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#F5EDD8"),
  roughness: 0.9,
  metalness: 0,
});

// Back panel material (dark)
const BACK_MATERIAL = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#3A2A10"),
  roughness: 0.8,
});

// ── Artwork canvas plane with texture ─────────────────────────────────────
function ArtworkPlane({
  imageUrl,
  artW,
  artH,
}: {
  imageUrl: string;
  artW: number;
  artH: number;
}) {
  const texture = useLoader(THREE.TextureLoader, imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={[0, 0, DEPTH / 2 + 0.001]}>
      <planeGeometry args={[artW, artH]} />
      <meshStandardMaterial map={texture} roughness={0.6} metalness={0} />
    </mesh>
  );
}

// ── Fallback plane shown while texture loads ───────────────────────────────
function ArtworkPlaceholder({ artW, artH }: { artW: number; artH: number }) {
  return (
    <mesh position={[0, 0, DEPTH / 2 + 0.001]}>
      <planeGeometry args={[artW, artH]} />
      <meshStandardMaterial color="#C8B89A" roughness={0.9} />
    </mesh>
  );
}

// ── One frame bar ─────────────────────────────────────────────────────────
function FrameBar({
  w, h, position, rotation,
}: {
  w: number; h: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={[w, h, DEPTH]} />
      <primitive object={FRAME_MATERIAL} attach="material" />
    </mesh>
  );
}

// ── The complete framed artwork ────────────────────────────────────────────
function FramedArtwork({ imageUrl, size }: { imageUrl: string; size?: string | null }) {
  const aspect = parseAspectRatio(size);

  // Work in units where the longer side = 2.0
  let totalW: number, totalH: number;
  if (aspect >= 1) {
    totalW = 2.0;
    totalH = 2.0 / aspect;
  } else {
    totalH = 2.0;
    totalW = 2.0 * aspect;
  }

  // Artwork (image) dimensions — inside the mat
  const artW = totalW - 2 * (BORDER + MAT);
  const artH = totalH - 2 * (BORDER + MAT);

  // Mat dimensions
  const matW = totalW - 2 * BORDER;
  const matH = totalH - 2 * BORDER;

  return (
    <group>
      {/* Back panel */}
      <mesh position={[0, 0, -DEPTH / 2]}>
        <boxGeometry args={[totalW, totalH, 0.01]} />
        <primitive object={BACK_MATERIAL} attach="material" />
      </mesh>

      {/* Mat board */}
      <mesh position={[0, 0, DEPTH / 2 - 0.001]}>
        <planeGeometry args={[matW, matH]} />
        <primitive object={MAT_MATERIAL} attach="material" />
      </mesh>

      {/* Frame bars: top, bottom, left, right */}
      {/* Top */}
      <FrameBar w={totalW} h={BORDER} position={[0, totalH / 2 - BORDER / 2, 0]} />
      {/* Bottom */}
      <FrameBar w={totalW} h={BORDER} position={[0, -(totalH / 2 - BORDER / 2), 0]} />
      {/* Left */}
      <FrameBar w={BORDER} h={totalH - 2 * BORDER} position={[-(totalW / 2 - BORDER / 2), 0, 0]} />
      {/* Right */}
      <FrameBar w={BORDER} h={totalH - 2 * BORDER} position={[totalW / 2 - BORDER / 2, 0, 0]} />

      {/* Artwork image */}
      <Safe fallback={<ArtworkPlaceholder artW={artW} artH={artH} />}>
        <Suspense fallback={<ArtworkPlaceholder artW={artW} artH={artH} />}>
          <ArtworkPlane imageUrl={imageUrl} artW={artW} artH={artH} />
        </Suspense>
      </Safe>
    </group>
  );
}

// ── Accurate frame built from real measurements (mm) ───────────────────────
/** Mirrors the API's FrameSpec (lib/frames.ts). */
export type FrameSpec3D = {
  artwork: { widthMm: number; heightMm: number; depthMm: number } | null;
  matWidthMm: number; matColourHex: string; revealGapMm: number; revealColourHex: string; lipMm: number;
  faceWidthMm: number | null; frameDepthMm: number | null; glazing: string;
  opening: { widthMm: number; heightMm: number } | null;
  outer: { widthMm: number; heightMm: number; depthMm: number } | null;
  look: { colourHex: string; metalness: number; roughness: number; profileShape: string; textureUrl: string | null } | null;
};
export type ArtSizeMm = { widthMm: number; heightMm: number; depthMm: number };

function Box({ size, position, material }: { size: [number, number, number]; position: [number, number, number]; material: THREE.Material }) {
  if (size[0] <= 0 || size[1] <= 0 || size[2] <= 0) return null;
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/** Four bars forming a rectangular ring: outer w×h, bar width b, depth d, front face at zFront. */
function Ring({ w, h, b, d, zFront, material }: { w: number; h: number; b: number; d: number; zFront: number; material: THREE.Material }) {
  const z = zFront - d / 2;
  return (
    <group>
      <Box size={[w, b, d]} position={[0, h / 2 - b / 2, z]} material={material} />
      <Box size={[w, b, d]} position={[0, -(h / 2 - b / 2), z]} material={material} />
      <Box size={[b, h - 2 * b, d]} position={[-(w / 2 - b / 2), 0, z]} material={material} />
      <Box size={[b, h - 2 * b, d]} position={[w / 2 - b / 2, 0, z]} material={material} />
    </group>
  );
}

/** Ring whose bars carry a material photo (leather, wood grain), tiled along each bar. */
function TexturedRing({ url, w, h, b, d, zFront, base }: { url: string; w: number; h: number; b: number; d: number; zFront: number; base: THREE.MeshStandardMaterial }) {
  const tex = useLoader(THREE.TextureLoader, url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = tex.image ? (tex.image as { width: number; height: number }).width / (tex.image as { width: number; height: number }).height : 4;
  const barMat = (len: number, vertical: boolean) => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.center.set(0.5, 0.5);
    t.rotation = vertical ? Math.PI / 2 : 0;
    t.repeat.set(Math.max(1, len / (b * aspect)), 1);
    t.needsUpdate = true;
    const m = base.clone(); m.map = t; m.color.set("#ffffff");
    return m;
  };
  const z = zFront - d / 2;
  const horiz = barMat(w, false), vert = barMat(h - 2 * b, true);
  return (
    <group>
      <Box size={[w, b, d]} position={[0, h / 2 - b / 2, z]} material={horiz} />
      <Box size={[w, b, d]} position={[0, -(h / 2 - b / 2), z]} material={horiz} />
      <Box size={[b, h - 2 * b, d]} position={[-(w / 2 - b / 2), 0, z]} material={vert} />
      <Box size={[b, h - 2 * b, d]} position={[w / 2 - b / 2, 0, z]} material={vert} />
    </group>
  );
}

/** Canvas as a box: painted front, plain sides (visible in floaters). */
function CanvasBox({ imageUrl, w, h, d, zFront, gloss }: { imageUrl: string; w: number; h: number; d: number; zFront: number; gloss: number }) {
  const texture = useLoader(THREE.TextureLoader, imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshStandardMaterial({ color: "#E9E1D2", roughness: 0.9 });
  const front = new THREE.MeshStandardMaterial({ map: texture, roughness: Math.max(0.05, 1 - gloss), metalness: 0 });
  return (
    <mesh position={[0, 0, zFront - d / 2]} castShadow>
      <boxGeometry args={[w, h, Math.max(d, 0.0005)]} />
      {[side, side, side, side, front, side].map((m, i) => <primitive key={i} object={m} attach={`material-${i}`} />)}
    </mesh>
  );
}

function AccurateFrame({ imageUrl, art, spec, gloss = 0.3 }: { imageUrl: string; art: ArtSizeMm; spec: FrameSpec3D | null; gloss?: number }) {
  const hasFrame = Boolean(spec?.faceWidthMm && spec?.frameDepthMm && spec.opening);
  const face = hasFrame ? spec!.faceWidthMm! : 0;
  const frameDepth = hasFrame ? spec!.frameDepthMm! : 0;
  const opening = hasFrame ? spec!.opening! : { widthMm: art.widthMm, heightMm: art.heightMm };
  const outerW = hasFrame ? opening.widthMm + 2 * face : art.widthMm;
  const outerH = hasFrame ? opening.heightMm + 2 * face : art.heightMm;
  // Scene units: the longest outer edge = 2.0
  const k = 2 / Math.max(outerW, outerH);
  const u = (mm: number) => mm * k;

  const look = spec?.look;
  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look?.colourHex ?? "#8B6914"),
    metalness: look?.metalness ?? 0.4, roughness: look?.roughness ?? 0.4,
  });
  const lipMat = frameMat.clone(); lipMat.color.multiplyScalar(0.8);
  const revealMat = new THREE.MeshStandardMaterial({ color: spec?.revealColourHex ?? "#111111", roughness: 0.95 });
  const matMat = new THREE.MeshStandardMaterial({ color: spec?.matColourHex ?? "#F5EDD8", roughness: 0.95 });
  const backMat = new THREE.MeshStandardMaterial({ color: "#2B1F10", roughness: 0.9 });

  const D = u(frameDepth);
  const gap = spec?.revealGapMm ?? 0;
  const mat = spec?.matWidthMm ?? 0;
  const artD = u(Math.max(1, art.depthMm));
  // Where the artwork's front sits: a little behind the frame front (behind glass/mat when present).
  const artFront = hasFrame ? D - u(gap > 0 ? 3 : 2 + (spec!.glazing !== "none" ? 2 : 0) + (mat > 0 ? 2 : 0)) : artD;

  return (
    <group>
      {hasFrame && (
        <>
          {/* Moulding */}
          {look?.textureUrl ? (
            <Safe fallback={<Ring w={u(outerW)} h={u(outerH)} b={u(face)} d={D} zFront={D} material={frameMat} />}>
              <Suspense fallback={<Ring w={u(outerW)} h={u(outerH)} b={u(face)} d={D} zFront={D} material={frameMat} />}>
                <TexturedRing url={look.textureUrl} w={u(outerW)} h={u(outerH)} b={u(face)} d={D} zFront={D} base={frameMat} />
              </Suspense>
            </Safe>
          ) : (
            <Ring w={u(outerW)} h={u(outerH)} b={u(face)} d={D} zFront={D} material={frameMat} />
          )}
          {/* Bevel / rounded / ornate: an inner raised step on the face */}
          {look && look.profileShape !== "flat" && face > 10 && (
            <Ring w={u(outerW - face * 0.6)} h={u(outerH - face * 0.6)} b={u(face * 0.35)} d={u(look.profileShape === "ornate" ? 6 : 3)} zFront={D + u(look.profileShape === "ornate" ? 6 : 3)} material={lipMat} />
          )}
          {/* Back of the opening: dark shadow-gap recess, or backing board */}
          <Box size={[u(opening.widthMm), u(opening.heightMm), u(1)]} position={[0, 0, u(0.5)]} material={gap > 0 ? revealMat : backMat} />
          {/* Mat board with a window for the artwork */}
          {mat > 0 && (
            <Ring w={u(opening.widthMm)} h={u(opening.heightMm)} b={u(mat)} d={u(2)} zFront={artFront + u(2)} material={matMat} />
          )}
        </>
      )}
      <Safe fallback={<Box size={[u(art.widthMm), u(art.heightMm), artD]} position={[0, 0, artFront - artD / 2]} material={new THREE.MeshStandardMaterial({ color: "#C8B89A" })} />}>
        <Suspense fallback={<Box size={[u(art.widthMm), u(art.heightMm), artD]} position={[0, 0, artFront - artD / 2]} material={new THREE.MeshStandardMaterial({ color: "#C8B89A" })} />}>
          <CanvasBox imageUrl={imageUrl} w={u(art.widthMm)} h={u(art.heightMm)} d={artD} zFront={artFront} gloss={gloss} />
        </Suspense>
      </Safe>
      {/* Glass / acrylic */}
      {hasFrame && spec!.glazing !== "none" && (
        <mesh position={[0, 0, D - u(1)]}>
          <planeGeometry args={[u(opening.widthMm), u(opening.heightMm)]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={spec!.glazing === "anti_reflective" ? 0.03 : 0.1} metalness={0.9} roughness={0.05} />
        </mesh>
      )}
    </group>
  );
}

// ── Auto-rotate controller ─────────────────────────────────────────────────
function AutoRotate({
  orbitRef,
}: {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const [userInteracting, setUserInteracting] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const onStart = () => {
      setUserInteracting(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    const onEnd = () => {
      idleTimer.current = setTimeout(() => setUserInteracting(false), 2500);
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
    };
  }, [orbitRef]);

  useFrame((_, delta) => {
    if (!userInteracting && orbitRef.current) {
      orbitRef.current.autoRotate = true;
      orbitRef.current.autoRotateSpeed = 0.6;
      orbitRef.current.update();
    } else if (orbitRef.current) {
      orbitRef.current.autoRotate = false;
    }
  });

  return null;
}

// ── Scene content ─────────────────────────────────────────────────────────
function Scene({ imageUrl, size, artMm, spec, gloss }: { imageUrl: string; size?: string | null; artMm?: ArtSizeMm | null; spec?: FrameSpec3D | null; gloss?: number }) {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} castShadow />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} color="#f0e8d0" />
      <pointLight position={[0, 0, 5]} intensity={0.4} color="#fffaf0" />

      {/* Environment for reflections on frame */}
      {/* Studio reflections (downloaded); without internet the lights above are enough. */}
      <Safe fallback={<hemisphereLight args={["#fff8ee", "#2a1d10", 0.6]} />}>
        <Suspense fallback={null}><Environment preset="studio" /></Suspense>
      </Safe>

      {/* Frame */}
      {artMm ? <AccurateFrame imageUrl={imageUrl} art={artMm} spec={spec ?? null} gloss={gloss} /> : <FramedArtwork imageUrl={imageUrl} size={size} />}

      {/* Controls */}
      <OrbitControls
        ref={orbitRef as React.RefObject<OrbitControlsImpl>}
        enablePan={false}
        minDistance={1.5}
        maxDistance={5}
        enableDamping
        dampingFactor={0.08}
      />
      <AutoRotate orbitRef={orbitRef as React.RefObject<OrbitControlsImpl | null>} />
    </>
  );
}

// ── Public component ───────────────────────────────────────────────────────
export interface FrameViewer3DProps {
  imageUrl: string;
  size?: string | null;
  /** Real artwork size. With it the viewer draws to scale; without it, the old generic gold frame. */
  artMm?: ArtSizeMm | null;
  /** The chosen frame (from /cart addons or /artworks/:id/compatible-frames). Null = unframed. */
  spec?: FrameSpec3D | null;
  gloss?: number;
}

export default function FrameViewer3D({ imageUrl, size, artMm, spec, gloss }: FrameViewer3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#1a120a" }}
      shadows
    >
      <Scene imageUrl={imageUrl} size={size} artMm={artMm} spec={spec} gloss={gloss} />
    </Canvas>
  );
}
