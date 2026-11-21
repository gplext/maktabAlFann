/** An artist's level, chosen when they register; filters the Artists page. */
export type ArtistLevel = "master" | "emerging" | "student";
export const ARTIST_LEVEL_OPTIONS: { value: ArtistLevel; label: string; hint: string }[] = [
  { value: "master", label: "Master", hint: "Established artist with a long career and recognised body of work" },
  { value: "emerging", label: "Emerging", hint: "Practising artist building a career, with some exhibitions" },
  { value: "student", label: "Student", hint: "Art student (e.g. undergraduate) or just starting out" },
];
