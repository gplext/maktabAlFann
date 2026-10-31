/** Museum layout maths shared by the page and the 3D scene (no three.js here, so the page stays light). */
export type Preset = {
  width: number; depth: number; height: number;
  wall: string; floor: string; ceiling: string;
  light: "bright" | "warm" | "neutral" | "night"; columns: boolean;
};
export type MuseumArtwork = {
  id: number; title: string; imageUrl: string; artistName: string; year: number | null;
  medium: string; dimensions: string; widthCm: number | null; heightCm: number | null;
};
export type Slot = { id: string; position: [number, number, number]; rotationY: number };
export type MoveInput = { forward: number; turn: number };

export const EYE = 1.6;

/** Evenly spaced hanging positions on the four walls: N0.., E0.., S0.., W0.. */
export function computeSlots(p: Preset): Slot[] {
  const walls: { key: string; length: number; at: (t: number) => [number, number, number]; rot: number }[] = [
    { key: "N", length: p.width, at: (t) => [t, EYE, -p.depth / 2 + 0.03], rot: 0 },
    { key: "E", length: p.depth, at: (t) => [p.width / 2 - 0.03, EYE, t], rot: -Math.PI / 2 },
    { key: "S", length: p.width, at: (t) => [-t, EYE, p.depth / 2 - 0.03], rot: Math.PI },
    { key: "W", length: p.depth, at: (t) => [-p.width / 2 + 0.03, EYE, -t], rot: Math.PI / 2 },
  ];
  return walls.flatMap((w) => {
    const count = Math.max(1, Math.floor((w.length - 2) / 3.2));
    const spacing = w.length / (count + 1);
    return Array.from({ length: count }, (_, i) => ({
      id: `${w.key}${i}`, position: w.at(-w.length / 2 + spacing * (i + 1)), rotationY: w.rot,
    }));
  });
}

