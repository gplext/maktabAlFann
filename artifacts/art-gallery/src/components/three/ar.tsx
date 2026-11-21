import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import * as THREE from "three";

/**
 * "View on your wall": the framed painting, at its real size, in augmented reality.
 *   Android (Chrome): three.js WebXR — an immersive-ar session with hit testing; point at a wall, tap to hang.
 *   iPhone / iPad:    Apple's AR Quick Look — the model is exported to USDZ in the browser with
 *                     three.js's USDZExporter and anchored to a vertical plane (a wall).
 * The button only appears on devices that can do one of these.
 */
type ArKind = "webxr" | "quicklook";

/** A copy of the framed painting ready for AR: at the origin, no glass sheet (it reads as fog in AR). */
export function prepareModel(src: THREE.Object3D) {
  const m = src.clone(true);
  m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
  const glass: THREE.Object3D[] = [];
  m.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat && !Array.isArray(mat) && mat.transparent && mat.opacity < 0.3) glass.push(o);
  });
  for (const g of glass) g.removeFromParent();
  m.updateMatrixWorld(true);
  return m;
}

async function detect(): Promise<ArKind | null> {
  try {
    if (navigator.xr && (await navigator.xr.isSessionSupported("immersive-ar"))) return "webxr";
  } catch { /* not supported */ }
  const a = document.createElement("a");
  if (a.relList?.supports?.("ar")) return "quicklook";
  return null;
}

// ── iPhone: AR Quick Look ────────────────────────────────────────────────────
export async function buildUsdz(model: THREE.Object3D): Promise<string> {
  const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js");
  const exporter = new USDZExporter();
  const data = await exporter.parseAsync(model, {
    quickLookCompatible: true,
    ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "vertical" } },
  } as any);
  return URL.createObjectURL(new Blob([data], { type: "model/vnd.usdz+zip" }));
}

function openQuickLook(url: string) {
  const a = document.createElement("a");
  a.rel = "ar";
  a.href = `${url}#allowsContentScaling=0`;   // real size: no pinch-to-resize
  a.appendChild(document.createElement("img"));
  a.click();
}

// ── Android: WebXR ───────────────────────────────────────────────────────────
async function startWebXR(model: THREE.Object3D, onEnd: () => void) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:100000;pointer-events:none;font-family:system-ui,sans-serif";
  overlay.innerHTML = `
    <div data-status style="position:absolute;left:50%;bottom:32px;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;white-space:nowrap">Point your phone at a wall</div>
    <button data-close style="pointer-events:auto;position:absolute;top:16px;right:16px;background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:999px;padding:10px 16px;font-size:14px">Done</button>`;
  document.body.appendChild(overlay);
  const status = overlay.querySelector<HTMLElement>("[data-status]")!;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.xr.enabled = true;
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:99999";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(0.5, 1, 1); scene.add(sun);

  const painting = model; painting.visible = false; painting.matrixAutoUpdate = false; scene.add(painting);
  let placed = false;

  const session = await navigator.xr!.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay", "light-estimation"], domOverlay: { root: overlay },
  } as XRSessionInit);

  // Use the room's real light when the phone can estimate it.
  if (session.enabledFeatures?.includes?.("light-estimation")) {
    try {
      const { XREstimatedLight } = await import("three/examples/jsm/webxr/XREstimatedLight.js");
      const est = new XREstimatedLight(renderer);
      est.addEventListener("estimationstart", () => { scene.add(est); if (est.environment) scene.environment = est.environment; });
    } catch { /* keep the fixed lights */ }
  }

  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);
  const ref = renderer.xr.getReferenceSpace()!;
  const viewer = await session.requestReferenceSpace("viewer");
  const hits = await session.requestHitTestSource!({ space: viewer })!;

  overlay.querySelector("[data-close]")!.addEventListener("click", () => void session.end());
  overlay.addEventListener("beforexrselect", (e) => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); });

  const n = new THREE.Vector3(), up = new THREE.Vector3(), x = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  let onWall = false;
  const controller = renderer.xr.getController(0);
  controller.addEventListener("select", () => {
    if (placed) { placed = false; status.textContent = "Point at a wall · tap to hang"; return; }
    if (onWall) { placed = true; status.textContent = "Hung at real size · tap to move it"; }
  });
  scene.add(controller);

  renderer.setAnimationLoop((_t, frame) => {
    if (frame && !placed) {
      const res = frame.getHitTestResults(hits);
      const pose = res[0]?.getPose(ref);
      if (pose) {
        const { position: pos, orientation: o } = pose.transform;
        q.set(o.x, o.y, o.z, o.w);
        n.set(0, 1, 0).applyQuaternion(q);            // the surface's normal
        onWall = Math.abs(n.y) < 0.5;
        if (onWall) {
          // Face out of the wall, keep the painting upright.
          up.set(0, 1, 0).addScaledVector(n, -n.y).normalize();
          x.crossVectors(up, n).normalize();
          p.set(pos.x, pos.y, pos.z);
          painting.matrix.makeBasis(x, up, n).setPosition(p);
          painting.matrixWorldNeedsUpdate = true;
          painting.visible = true;
          status.textContent = "Tap to hang it here";
        } else {
          status.textContent = "That's the floor — point at a wall";
        }
      } else {
        status.textContent = "Move your phone slowly to find the wall";
      }
    }
    renderer.render(scene, camera);
  });

  session.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    hits.cancel();
    renderer.dispose();
    renderer.domElement.remove();
    overlay.remove();
    onEnd();
  });
}

export function ArButton({ getModel, version }: { getModel: () => THREE.Object3D | null; version: string }) {
  const [kind, setKind] = useState<ArKind | null>(null);
  const [busy, setBusy] = useState(false);
  const usdz = useRef<{ version: string; url: string } | null>(null);
  const [usdzVersion, setUsdzVersion] = useState<string | null>(null);
  const { active } = useProgress();

  useEffect(() => { void detect().then(setKind); }, []);

  // Quick Look must open straight from the tap, so the USDZ is prepared as soon as the scene is ready.
  useEffect(() => {
    if (kind !== "quicklook" || active) return;
    const t = setTimeout(async () => {
      const src = getModel(); if (!src) return;
      try {
        const url = await buildUsdz(prepareModel(src));
        if (usdz.current) URL.revokeObjectURL(usdz.current.url);
        usdz.current = { version, url }; setUsdzVersion(version);
      } catch { /* leave the button disabled */ }
    }, 400);
    return () => clearTimeout(t);
  }, [kind, active, version, getModel]);

  if (!kind) return null;
  const ready = !active && (kind === "webxr" || usdzVersion === version);

  const go = async () => {
    const src = getModel(); if (!src) return;
    if (kind === "quicklook") { if (usdz.current) openQuickLook(usdz.current.url); return; }
    setBusy(true);
    try { await startWebXR(prepareModel(src), () => setBusy(false)); } catch { setBusy(false); }
  };

  return (
    <button onClick={go} disabled={!ready || busy}
      className="absolute left-3 top-3 z-10 flex items-center gap-2 bg-white text-black px-4 py-2.5 text-[11px] uppercase tracking-widest shadow-lg disabled:opacity-50">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="8" y="8" width="8" height="8" /></svg>
      {busy ? "Starting AR…" : ready ? "View on your wall" : "Preparing AR…"}
    </button>
  );
}
