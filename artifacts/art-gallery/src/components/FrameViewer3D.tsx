import { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

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
      <Suspense fallback={<ArtworkPlaceholder artW={artW} artH={artH} />}>
        <ArtworkPlane imageUrl={imageUrl} artW={artW} artH={artH} />
      </Suspense>
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
function Scene({ imageUrl, size }: { imageUrl: string; size?: string | null }) {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} castShadow />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} color="#f0e8d0" />
      <pointLight position={[0, 0, 5]} intensity={0.4} color="#fffaf0" />

      {/* Environment for reflections on frame */}
      <Environment preset="studio" />

      {/* Frame */}
      <FramedArtwork imageUrl={imageUrl} size={size} />

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
}

export default function FrameViewer3D({ imageUrl, size }: FrameViewer3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#1a120a" }}
      shadows
    >
      <Scene imageUrl={imageUrl} size={size} />
    </Canvas>
  );
}
