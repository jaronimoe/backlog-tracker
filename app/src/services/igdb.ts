import { getSetting, setSetting, SETTINGS } from "../db/database";

export interface IgdbGame {
  id: number;
  name: string;
  coverUrl: string | null;
  releaseYear: number | null;
  platforms: string[];
  genres: string[];
}

let token: { value: string; expires: number } | null = null;

function creds() {
  return {
    id: getSetting(SETTINGS.igdbClientId, ""),
    secret: getSetting(SETTINGS.igdbClientSecret, ""),
  };
}

export function igdbConfigured(): boolean {
  const c = creds();
  return c.id.length > 0 && c.secret.length > 0;
}

async function getToken(): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  const c = creds();
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${c.id}&client_secret=${c.secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("IGDB auth failed");
  const j = await res.json();
  token = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
  return token.value;
}

/** Simplify IGDB genre names into short tag values, e.g. "Role-playing (RPG)" -> "rpg" */
function genreToTag(name: string): string {
  const m = name.match(/\(([^)]+)\)/);
  const base = m ? m[1] : name;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function searchIgdb(query: string): Promise<IgdbGame[]> {
  if (!igdbConfigured()) return [];
  const t = await getToken();
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": creds().id,
      Authorization: `Bearer ${t}`,
      "Content-Type": "text/plain",
    },
    body: `search "${query.replace(/"/g, "")}"; fields name, first_release_date, cover.image_id, platforms.abbreviation, platforms.name, genres.name; limit 8;`,
  });
  if (!res.ok) throw new Error(`IGDB search failed (${res.status})`);
  const rows = await res.json();
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    coverUrl: r.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${r.cover.image_id}.jpg`
      : null,
    releaseYear: r.first_release_date
      ? new Date(r.first_release_date * 1000).getFullYear()
      : null,
    platforms: (r.platforms ?? []).map(
      (p: any) => (p.abbreviation || p.name || "").toLowerCase()
    ),
    genres: (r.genres ?? []).map((g: any) => genreToTag(g.name)),
  }));
}

export function saveIgdbCreds(id: string, secret: string) {
  setSetting(SETTINGS.igdbClientId, id.trim());
  setSetting(SETTINGS.igdbClientSecret, secret.trim());
  token = null;
}

/** Verify Twitch/IGDB credentials by requesting a token. Throws on failure. */
export async function verifyIgdbCreds(id: string, secret: string): Promise<void> {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id.trim()}&client_secret=${secret.trim()}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }
  const j = await res.json();
  token = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
}
