import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useTexture, useProgress } from "@react-three/drei";
import * as THREE from "three";
import { EffectComposer, N8AO, Bloom, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { FramedPainting, framedSize, Safe, type ArtSizeMm, type FrameSpec3D } from "./three/framed-painting";
import { LivingRoom, ROOM, SOFA_TOP } from "./three/living-room";
import { ArButton } from "./three/ar";

export type { ArtSizeMm, FrameSpec3D } from "./three/framed-painting";
export type ViewMode = "closeup" | "room";

/**
 * 3D view of a painting with its frame, at real size.
 *   closeup: the framed painting on a gallery wall under a picture light; drag to tilt.
 *   room:    the same painting hung above the sofa in a furnished living room.
 * Built with three.js through @react-three/fiber and @react-three/drei.
 */
type OrbitImpl = NonNullable<React.ComponentRef<typeof OrbitControls>>;
const HDRI = "/room/lythwood_room_1k.hdr";

/** Gentle left-right sway until the visitor drags; then the view is theirs. */
function Sway({ controls, target, distance, height = 0 }: { controls: React.RefObject<OrbitImpl | null>; target: THREE.Vector3; distance: number; height?: number }) {
  const touched = useRef(false);
  const t0 = useRef<number | null>(null);
  useEffect(() => {
    const c = controls.current; if (!c) return;
    const stop = () => { touched.current = true; };
    c.addEventListener("start", stop);
    return () => c.removeEventListener("start", stop);
  }, [controls]);
  useFrame(({ camera, clock }) => {
    if (touched.current || !controls.current) return;
    t0.current ??= clock.elapsedTime;
    const a = Math.sin((clock.elapsedTime - t0.current) * 0.25) * 0.2;
    camera.position.set(target.x + Math.sin(a) * distance, target.y + height, target.z + Math.cos(a) * distance);
    controls.current.target.copy(target);
    controls.current.update();
  });
  return null;
}

function Wall({ w, h }: { w: number; h: number }) {
  const t = useTexture({ normalMap: "/room/wall_nor.jpg", roughnessMap: "/room/wall_rough.jpg" });
  useEffect(() => { for (const x of Object.values(t)) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(w / 2, h / 2); x.needsUpdate = true; } }, [t, w, h]);
  return (
    <mesh position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#E3E0DA" normalMap={t.normalMap} normalScale={new THREE.Vector2(0.3, 0.3)} roughnessMap={t.roughnessMap} roughness={0.95} />
    </mesh>
  );
}

/** A warm picture light aimed at the painting, casting the frame's soft shadow on the wall. */
function PictureLight({ centre, top, size, intensity }: { centre: THREE.Vector3; top: number; size: number; intensity: number }) {
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.copy(centre); return o; }, [centre]);
  return (
    <>
      <primitive object={target} />
      <spotLight
        position={[centre.x, top + 0.35 + size * 0.35, 0.55 + size * 0.6]} target={target}
        angle={0.55} penumbra={0.85} intensity={intensity} distance={0} decay={2} color="#FFF8EF"
        castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0002} shadow-normalBias={0.01} shadow-radius={6}
      />
    </>
  );
}

type ModelRef = React.RefObject<THREE.Group | null>;

function CloseUp({ imageUrl, art, spec, modelRef }: { imageUrl: string; art: ArtSizeMm; spec: FrameSpec3D | null; modelRef: ModelRef }) {
  const controls = useRef<OrbitImpl | null>(null);
  const [w, h] = framedSize(art, spec);
  const size = Math.max(w, h);
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera);
  const target = useMemo(() => new THREE.Vector3(0, 0, 0.02), []);
  // Fit the frame in view with some wall around it.
  const distance = (size * 1.25) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) + 0.05;
  useEffect(() => { camera.position.set(0, 0, distance); camera.near = 0.01; camera.far = 50; camera.updateProjectionMatrix(); }, [camera, distance]);
  return (
    <>
      <color attach="background" args={["#E3E0DA"]} />
      <Suspense fallback={null}><Wall w={Math.max(6, size * 6)} h={Math.max(4, size * 4)} /></Suspense>
      <Safe fallback={<hemisphereLight args={["#fff6ea", "#5a4a3a", 0.8]} />}>
        <Suspense fallback={null}><Environment files={HDRI} environmentIntensity={0.4} /></Suspense>
      </Safe>
      <ambientLight intensity={0.06} />
      {/* Key light from the upper left: models the moulding and its bevels. */}
      <directionalLight position={[-2, 2.5, 3]} intensity={0.45} color="#FFFFFF" />
      <PictureLight centre={ORIGIN} top={h / 2} size={size} intensity={8 * Math.max(1, size)} />
      <group ref={modelRef}><FramedPainting imageUrl={imageUrl} art={art} spec={spec} /></group>
      <OrbitControls
        ref={controls as React.RefObject<OrbitImpl>} target={target} enablePan={false} enableDamping dampingFactor={0.08}
        minDistance={distance * 0.35} maxDistance={distance * 1.6}
        minAzimuthAngle={-1} maxAzimuthAngle={1} minPolarAngle={Math.PI / 2 - 0.7} maxPolarAngle={Math.PI / 2 + 0.6}
      />
      <Sway controls={controls} target={target} distance={distance} />
    </>
  );
}

/** Hanging height: as designers do, the bottom of the frame 25 cm above the sofa back (never into the ceiling). */
export function hangCentre(h: number) {
  return Math.min(SOFA_TOP + 0.25 + h / 2, ROOM.height - 0.08 - h / 2);
}
const ORIGIN = new THREE.Vector3(0, 0, 0);

function Room({ imageUrl, art, spec, modelRef }: { imageUrl: string; art: ArtSizeMm; spec: FrameSpec3D | null; modelRef: ModelRef }) {
  const controls = useRef<OrbitImpl | null>(null);
  const [, h] = framedSize(art, spec);
  const cy = hangCentre(h);
  // Frame the sofa and the painting together, from standing eye height.
  const target = useMemo(() => new THREE.Vector3(0, Math.max(0.9, cy - 0.4), 0.3), [cy]);
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera);
  const distance = 3.1;
  const eye = 1.35;
  const picture = useMemo(() => new THREE.Vector3(0, cy, 0), [cy]);
  useEffect(() => { camera.position.set(0, eye, target.z + distance); camera.near = 0.05; camera.far = 40; camera.updateProjectionMatrix(); }, [camera, target]);
  return (
    <>
      <color attach="background" args={["#E4E1DB"]} />
      <Safe fallback={<hemisphereLight args={["#fff6ea", "#5a4a3a", 0.9]} />}>
        <Suspense fallback={null}><Environment files={HDRI} environmentIntensity={0.55} /></Suspense>
      </Safe>
      <ambientLight intensity={0.03} />
      {/* Daylight from a window on the left. */}
      <directionalLight
        position={[-3.2, 2.6, 3.4]} intensity={1.2} color="#FFFBF5" castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0003} shadow-normalBias={0.02}
        shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={3.5} shadow-camera-bottom={-1} shadow-camera-far={12} shadow-radius={5}
      />
      <PictureLight centre={picture} top={cy + h / 2} size={1} intensity={12} />
      <Suspense fallback={null}><LivingRoom /></Suspense>
      <group position={[0, cy, 0.002]}><group ref={modelRef}><FramedPainting imageUrl={imageUrl} art={art} spec={spec} /></group></group>
      <OrbitControls
        ref={controls as React.RefObject<OrbitImpl>} target={target} enablePan={false} enableDamping dampingFactor={0.08}
        minDistance={1.2} maxDistance={4.8}
        minAzimuthAngle={-0.6} maxAzimuthAngle={0.6} minPolarAngle={1.15} maxPolarAngle={1.75}
      />
      <Sway controls={controls} target={target} distance={distance} height={eye - target.y} />
    </>
  );
}

export interface FrameViewer3DProps {
  imageUrl: string;
  /** Real artwork size. Without it the painting is shown 60 cm on its long side. */
  artMm?: ArtSizeMm | null;
  /** The chosen frame; null = unframed canvas. */
  spec?: FrameSpec3D | null;
  mode?: ViewMode;
  /** Old prop, ignored. */
  size?: string | null;
  gloss?: number;
}

/** Phones and small laptops get the lighter effect settings. */
const LOW_POWER = typeof navigator !== "undefined"
  && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency ?? 8) <= 4);

/**
 * Post-processing (@react-three/postprocessing):
 *   N8AO       ambient occlusion: soft shadow where frame meets wall, in corners, under the sofa
 *   Bloom      a soft glow only on the brightest highlights (gilding, glass glints)
 *   ToneMapping colour-faithful "Neutral" tone mapping
 *   SMAA       smooth edges
 */
function Effects({ room }: { room: boolean }) {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={room ? 0.55 : 0.12} distanceFalloff={room ? 1 : 0.35} intensity={room ? 2.4 : 1.8}
        quality={LOW_POWER ? "performance" : "medium"} halfRes={LOW_POWER} />
      <Bloom mipmapBlur luminanceThreshold={1.6} luminanceSmoothing={0.2} intensity={0.25} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
    </EffectComposer>
  );
}

/** "Loading 40%" while textures and room models download. */
function Progress() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <p className="bg-black/45 px-5 py-3 text-white/85 text-xs uppercase tracking-widest">Loading {Math.round(progress)}%</p>
    </div>
  );
}

export default function FrameViewer3D({ imageUrl, artMm, spec, mode = "closeup" }: FrameViewer3DProps) {
  const art = artMm ?? spec?.artwork ?? { widthMm: 600, heightMm: 450, depthMm: 20 };
  const modelRef = useRef<THREE.Group | null>(null);
  const getModel = useCallback(() => modelRef.current, []);
  return (
    <div className="absolute inset-0">
    <Canvas
      key={mode}
      shadows="percentage"
      dpr={[1, 1.5]}
      camera={{ fov: 40, position: [0, 0, 3] }}
      // Tone mapping is done in the effects pass below (Khronos "Neutral": keeps the painting's colours true).
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }}
    >
      {mode === "room"
        ? <Room imageUrl={imageUrl} art={art} spec={spec ?? null} modelRef={modelRef} />
        : <CloseUp imageUrl={imageUrl} art={art} spec={spec ?? null} modelRef={modelRef} />}
      <Effects room={mode === "room"} />
    </Canvas>
    <Progress />
    {/* Phones: hang this framed painting on your own wall, at real size (AR). */}
    <ArButton getModel={getModel} version={`${imageUrl}|${JSON.stringify(spec ?? null)}|${art.widthMm}x${art.heightMm}`} />
    </div>
  );
}
