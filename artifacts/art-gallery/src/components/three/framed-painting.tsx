import { useMemo, useEffect, Suspense, Component, type ReactNode } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * A painting with its frame, built to real size in metres:
 * the back of the frame sits on the wall (z = 0), the front faces +z.
 *
 * The moulding is four mitred bars with rounded edges; gold and walnut get a raised
 * bead like real carved mouldings; wood finishes get a grain texture; the mount has a
 * bevelled window; glass catches a faint reflection. No downloads: textures are drawn in code.
 */

/** Mirrors the API's FrameSpec (api-server/src/lib/frames.ts). */
export type FrameSpec3D = {
  artwork: { widthMm: number; heightMm: number; depthMm: number } | null;
  matWidthMm: number; matColourHex: string; revealGapMm?: number; revealColourHex?: string; lipMm: number;
  faceWidthMm: number | null; frameDepthMm: number | null; glazing: string;
  opening: { widthMm: number; heightMm: number } | null;
  outer: { widthMm: number; heightMm: number; depthMm: number } | null;
  look: { finish?: string; colourHex: string; metalness: number; roughness: number; profileShape: string; textureUrl: string | null } | null;
};
export type ArtSizeMm = { widthMm: number; heightMm: number; depthMm: number };

const mm = (v: number) => v / 1000;

/** Keeps a failed load (broken image, blocked URL) from blanking the scene. */
export class Safe extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() { /* fallback shown */ }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// ── Procedural textures ──────────────────────────────────────────────────────
function rand(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** Wood grain running along the texture's x axis. */
function woodGrain(base: string, dark: string, seed: number) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 256;
  const g = c.getContext("2d")!; const r = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 140; i++) {
    const y0 = r() * c.height, amp = 2 + r() * 6, freq = 0.002 + r() * 0.006, phase = r() * 6.28;
    g.strokeStyle = dark; g.globalAlpha = 0.08 + r() * 0.22; g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 8) { const y = y0 + Math.sin(x * freq + phase) * amp; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 0.25; g.fillStyle = dark;
  for (let i = 0; i < 900; i++) g.fillRect(r() * c.width, r() * c.height, 2 + r() * 6, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

type Finish = "gold" | "black" | "white" | "walnut" | "natural" | "silver" | "custom";
const WOOD: Partial<Record<Finish, [string, string, number]>> = { walnut: ["#5E3B22", "#2E1A0C", 3], natural: ["#C79C66", "#8A6337", 11] };

/** Material for the moulding. Texture coordinates run along each side (metres), so wood grain follows the bars. */
function useFrameMaterial(look: NonNullable<FrameSpec3D["look"]>, customTexture: THREE.Texture | null) {
  return useMemo(() => {
    const finish = (look.finish ?? "custom") as Finish;
    const mk = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);
    let m: THREE.MeshPhysicalMaterial;
    switch (finish) {
      // Gilding: warm gold, soft (not mirror) reflections so they glide smoothly over the curves.
      case "gold": m = mk({ color: "#C99A45", metalness: 1, roughness: 0.38, envMapIntensity: 0.9 }); break;
      case "silver": m = mk({ color: "#D2D5DA", metalness: 1, roughness: 0.32, envMapIntensity: 0.9 }); break;
      case "black": m = mk({ color: "#161514", metalness: 0, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.45 }); break;
      case "white": m = mk({ color: "#EFEDE7", metalness: 0, roughness: 0.5 }); break;
      case "walnut": case "natural": {
        const [base, dark, seed] = WOOD[finish]!;
        m = mk({ map: woodGrain(base, dark, seed), metalness: 0, roughness: finish === "walnut" ? 0.48 : 0.6, clearcoat: finish === "walnut" ? 0.2 : 0, clearcoatRoughness: 0.5 });
        break;
      }
      default: m = mk({ color: customTexture ? "#ffffff" : look.colourHex, map: customTexture ?? null, metalness: look.metalness, roughness: Math.max(0.3, look.roughness) });
    }
    if (m.map) {
      const wood = finish === "walnut" || finish === "natural";
      const t = m.map.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      // Wood grain: one tile per 60 cm along the bar, 8 cm across; a material photo (e.g. croc leather) every 15 cm.
      t.repeat.set(wood ? 1 / 0.6 : 1 / 0.15, wood ? 1 / 0.08 : 1 / 0.15); t.needsUpdate = true; m.map = t;
    }
    return m;
  }, [look.finish, look.colourHex, look.metalness, look.roughness, customTexture]);
}

// ── Moulding geometry ────────────────────────────────────────────────────────
type P = [number, number];   // a point of the moulding's cross-section: [distance in from the outer edge, height off the wall]

function arc(cu: number, cz: number, r: number, a0: number, a1: number, steps = 10): P[] {
  return Array.from({ length: steps + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / steps; return [cu + r * Math.cos(a), cz + r * Math.sin(a)] as P; });
}

/**
 * The cross-section of the moulding, from the outer edge (u = 0) to the sight edge (u = b), as smooth
 * chains (a new chain = a sharp edge). Real profiles: flat with eased edges, a rounded top, a sloped
 * bevel, or a classic gilt profile (outer bead, hollow cove, raised inner bead).
 */
function profile(shape: string, b: number, D: number): P[][] {
  const H = Math.PI / 2;
  const r = Math.min(0.0025, b * 0.15, D * 0.2);
  const inner = D * 0.35;   // the sight edge runs down to here (the rest is hidden by mount / painting)
  if (shape === "rounded") {
    const top: P[] = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; top.push([b * t, D * 0.55 + D * 0.45 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.55)]); }
    return [[[0, 0], [0, top[0]![1]]], top, [[b, top[24]![1]], [b, inner]]];
  }
  if (shape === "bevel") {
    return [[[0, 0], [0, D - r]], [...arc(r, D - r, r, Math.PI, H, 6), [b * 0.4, D]], [[b * 0.4, D], [b, D * 0.62]], [[b, D * 0.62], [b, inner]]];
  }
  if (shape === "ornate" && b > 0.025) {
    const rb = b * 0.13, ri = b * 0.11;
    const outerBead = arc(rb, D - rb, rb, Math.PI, 0, 14);                 // rounded outer lip
    const cove: P[] = [];                                                      // hollow sweeping down and up again
    const u0 = 2 * rb, u1 = b - 2 * ri, z0 = D - rb, z1 = D - ri * 0.9, dip = Math.min(D * 0.35, b * 0.16);
    for (let i = 0; i <= 20; i++) { const t = i / 20; cove.push([u0 + (u1 - u0) * t, z0 + (z1 - z0) * t - dip * Math.sin(Math.PI * t)]); }
    const innerBead = arc(b - ri, D - ri * 0.9, ri, Math.PI, 0, 12);       // raised bead at the sight edge
    return [[[0, 0], [0, D - rb]], outerBead, cove, innerBead, [[b, D - ri * 0.9], [b, inner]]];
  }
  // flat
  return [[[0, 0], [0, D - r]], [...arc(r, D - r, r, Math.PI, H, 6), ...arc(b - r, D - r, r, H, 0, 6)], [[b, D - r], [b, inner]]];
}

/**
 * Sweeps the cross-section along the four sides; each side ends in a 45° mitre so the corners meet exactly,
 * like a real cut-and-joined frame. Smooth normals inside each chain keep reflections gliding, not striping.
 */
function mouldingGeometry(w: number, h: number, b: number, D: number, shape: string) {
  const X = w / 2, Y = h / 2;
  const sides: { a: P; bpt: P; n: P }[] = [
    { a: [-X, Y], bpt: [X, Y], n: [0, -1] }, { a: [X, Y], bpt: [X, -Y], n: [-1, 0] },
    { a: [X, -Y], bpt: [-X, -Y], n: [0, 1] }, { a: [-X, -Y], bpt: [-X, Y], n: [1, 0] },
  ];
  const chains = profile(shape, b, D);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const { a, bpt, n } of sides) {
    const len = Math.hypot(bpt[0] - a[0], bpt[1] - a[1]);
    const t: P = [(bpt[0] - a[0]) / len, (bpt[1] - a[1]) / len];
    let arcLen = 0;
    for (const chain of chains) {
      // Normals in the cross-section (pointing out of the moulding), averaged within the chain.
      const segN = chain.slice(1).map((p, i) => { const du = p[0] - chain[i]![0], dz = p[1] - chain[i]![1], l = Math.hypot(du, dz) || 1; return [-dz / l, du / l] as P; });
      const base = pos.length / 3;
      chain.forEach(([u, z], i) => {
        const sn = i === 0 ? segN[0]! : i === chain.length - 1 ? segN[segN.length - 1]! : [segN[i - 1]![0] + segN[i]![0], segN[i - 1]![1] + segN[i]![1]] as P;
        const l = Math.hypot(sn[0], sn[1]) || 1, nu = sn[0] / l, nz = sn[1] / l;
        if (i > 0) arcLen += Math.hypot(u - chain[i - 1]![0], z - chain[i - 1]![1]);
        const nx = n[0] * nu, ny = n[1] * nu;
        // Start and end of this line along the side, cut at 45°.
        const s0: P = [a[0] + n[0] * u + t[0] * u, a[1] + n[1] * u + t[1] * u];
        const s1: P = [bpt[0] + n[0] * u - t[0] * u, bpt[1] + n[1] * u - t[1] * u];
        pos.push(s0[0], s0[1], z, s1[0], s1[1], z);
        nor.push(nx, ny, nz, nx, ny, nz);
        uv.push(u, arcLen, len - u, arcLen);
      });
      for (let i = 0; i < chain.length - 1; i++) {
        const p0 = base + i * 2, p1 = p0 + 1, q0 = p0 + 2, q1 = p0 + 3;
        idx.push(p0, q0, p1, p1, q0, q1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Mount board with a bevelled window. */
function Mount({ w, h, winW, winH, z0, colour }: { w: number; h: number; winW: number; winH: number; z0: number; colour: string }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-winW / 2, -winH / 2); hole.lineTo(-winW / 2, winH / 2); hole.lineTo(winW / 2, winH / 2); hole.lineTo(winW / 2, -winH / 2); hole.closePath();
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.0006, bevelEnabled: true, bevelThickness: 0.0007, bevelSize: 0.0012, bevelOffset: -0.0012, bevelSegments: 2 });
    g.translate(0, 0, z0 + 0.0007);
    return g;
  }, [w, h, winW, winH, z0]);
  return <mesh geometry={geo} castShadow receiveShadow><meshStandardMaterial color={colour} roughness={0.95} /></mesh>;
}

/** The painted canvas: picture cropped to the real proportions, gallery-wrapped sides. */
function Canvas3D({ url, w, h, d, zFront }: { url: string; w: number; h: number; d: number; zFront: number }) {
  const tex = useLoader(THREE.TextureLoader, url);
  const gl = useThree((s) => s.gl);
  const mats = useMemo(() => {
    const img = tex.image as HTMLImageElement;
    const ia = img.width / img.height, aa = w / h;
    // Cover-crop to the painting's real proportions — never stretch the picture. Drawn into its own
    // image so exports (AR) see exactly what's on screen; texture offsets are the fallback.
    let t: THREE.Texture;
    try {
      const sw = ia > aa ? img.height * aa : img.width, sh = ia > aa ? img.height : img.width / aa;
      const k = Math.min(1, 2048 / Math.max(sw, sh));
      const c = document.createElement("canvas"); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext("2d")!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      c.toDataURL("image/png", 0);   // throws for a cross-origin picture
      t = new THREE.CanvasTexture(c);
    } catch {
      t = tex.clone();
      if (ia > aa) { t.repeat.set(aa / ia, 1); t.offset.set((1 - aa / ia) / 2, 0); } else { t.repeat.set(1, ia / aa); t.offset.set(0, (1 - ia / aa) / 2); }
    }
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = gl.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    // Sides: the picture's average colour, like a painted gallery wrap.
    let side = "#d9d2c4";
    try {
      const c = document.createElement("canvas"); c.width = c.height = 4;
      const g = c.getContext("2d")!; g.drawImage(img, 0, 0, 4, 4);
      const p = g.getImageData(0, 0, 4, 4).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < p.length; i += 4) { r += p[i]!; gg += p[i + 1]!; b += p[i + 2]!; }
      side = `rgb(${Math.round(r / 16)},${Math.round(gg / 16)},${Math.round(b / 16)})`;
    } catch { /* cross-origin picture: keep linen colour */ }
    // Matte paint: little glare, so dark passages stay dark (the previous canvas-weave bump shimmered when moving).
    const front = new THREE.MeshStandardMaterial({ map: t, roughness: 0.88, metalness: 0, envMapIntensity: 0.25 });
    const sideMat = new THREE.MeshStandardMaterial({ color: side, roughness: 0.8 });
    return [sideMat, sideMat, sideMat, sideMat, front, sideMat];
  }, [tex, w, h, gl]);
  return (
    <mesh position={[0, 0, zFront - d / 2]} material={mats} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
}

function CustomTexture({ url, children }: { url: string; children: (t: THREE.Texture) => ReactNode }) {
  const t = useLoader(THREE.TextureLoader, url);
  return <>{children(t)}</>;
}

function Moulding({ spec, outerW, outerH, face, D, customTexture }: { spec: FrameSpec3D; outerW: number; outerH: number; face: number; D: number; customTexture: THREE.Texture | null }) {
  const look = spec.look!;
  const material = useFrameMaterial(look, customTexture);
  const geometry = useMemo(() => mouldingGeometry(outerW, outerH, face, D, look.profileShape), [outerW, outerH, face, D, look.profileShape]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Casts the frame's shadow on the wall; doesn't receive shadows (that caused flickering stripes on the bars).
  return <mesh geometry={geometry} material={material} castShadow />;
}

/**
 * The framed (or unframed) painting. Returns its outer size via the `size` helper below,
 * so scenes can place and light it.
 */
export function FramedPainting({ imageUrl, art, spec }: { imageUrl: string; art: ArtSizeMm; spec: FrameSpec3D | null }) {
  const framed = Boolean(spec?.look && spec.faceWidthMm && spec.frameDepthMm && spec.opening);
  const W = mm(art.widthMm), H = mm(art.heightMm), artD = mm(Math.max(4, art.depthMm));
  if (!framed) {
    const placeholder = <mesh position={[0, 0, artD / 2]}><boxGeometry args={[W, H, artD]} /><meshStandardMaterial color="#cfc6b6" /></mesh>;
    return (
      <Safe fallback={placeholder}>
        <Suspense fallback={placeholder}><Canvas3D url={imageUrl} w={W} h={H} d={artD} zFront={artD} /></Suspense>
      </Safe>
    );
  }
  const s = spec!;
  const face = mm(s.faceWidthMm!), D = mm(Math.max(s.frameDepthMm!, art.depthMm + 6));
  const openW = mm(s.opening!.widthMm), openH = mm(s.opening!.heightMm);
  const outerW = openW + 2 * face, outerH = openH + 2 * face;
  const glass = s.glazing !== "none";
  const mat = mm(s.matWidthMm || 0), lip = mm(s.lipMm || 5);
  // Front of the artwork: just behind the glass and the mount.
  const matFront = D - (glass ? 0.004 : 0.002);
  const artFront = mat > 0 ? matFront - 0.0022 : matFront;
  const paintD = Math.min(artD, artFront - 0.002);
  const look = s.look!;
  const moulding = (t: THREE.Texture | null) => <Moulding spec={s} outerW={outerW} outerH={outerH} face={face} D={D} customTexture={t} />;

  return (
    <group>
      {look.textureUrl && look.finish === "custom" ? (
        <Safe fallback={moulding(null)}>
          <Suspense fallback={moulding(null)}><CustomTexture url={look.textureUrl}>{(t) => moulding(t)}</CustomTexture></Suspense>
        </Safe>
      ) : moulding(null)}
      {/* Backing board inside the frame */}
      <mesh position={[0, 0, 0.0015]} receiveShadow><boxGeometry args={[openW, openH, 0.003]} /><meshStandardMaterial color="#3a2c1c" roughness={0.9} /></mesh>
      {mat > 0 && <Mount w={openW + 2 * lip} h={openH + 2 * lip} winW={W - 2 * lip} winH={H - 2 * lip} z0={matFront - 0.0022} colour={s.matColourHex} />}
      <Safe fallback={<mesh position={[0, 0, artFront - paintD / 2]}><boxGeometry args={[W, H, paintD]} /><meshStandardMaterial color="#cfc6b6" /></mesh>}>
        <Suspense fallback={null}><Canvas3D url={imageUrl} w={W} h={H} d={paintD} zFront={artFront} /></Suspense>
      </Safe>
      {glass && (
        <mesh position={[0, 0, D - 0.0025]}>
          <planeGeometry args={[openW, openH]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.045} roughness={0.02} metalness={0} clearcoat={1} clearcoatRoughness={0.02} envMapIntensity={2} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Outer size of the framed painting in metres (width, height, depth). */
export function framedSize(art: ArtSizeMm, spec: FrameSpec3D | null): [number, number, number] {
  if (spec?.look && spec.faceWidthMm && spec.opening && spec.frameDepthMm) {
    return [mm(spec.opening.widthMm + 2 * spec.faceWidthMm), mm(spec.opening.heightMm + 2 * spec.faceWidthMm), mm(Math.max(spec.frameDepthMm, art.depthMm + 6))];
  }
  return [mm(art.widthMm), mm(art.heightMm), mm(Math.max(4, art.depthMm))];
}
