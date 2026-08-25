import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PLATFORM, isValidSlug, type BrandRow } from "@/lib/brandContext";
import { HEX, derivePalette } from "@/lib/palette";
import { setPassword } from "@/lib/auth";
import { normaliseEmail } from "@/lib/identity";

export const dynamic = "force-dynamic";

/**
 * The Clients screen's API. The middleware only lets agency admins this far.
 *
 * Creating a client is an insert, not a deployment: the brand is rows, and
 * the board exists at /b/<slug>/ the moment this returns. The generated team
 * password comes back in the response — shown once, then it is theirs to
 * change from the board's own Settings.
 */

const FONTS = ["Inter", "DM Sans", "Manrope", "Space Grotesk", "Barlow", "Sora", "Outfit", "Work Sans"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** A password the client's team can read out loud on a call. */
function generatePassword(): string {
  const words = [
    "green", "fairway", "launch", "summer", "harbor", "maple", "copper",
    "signal", "meadow", "anchor", "ember", "prairie", "cedar", "atlas",
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 90) + 10}`;
}

async function overview() {
  const db = getDb();
  const [{ results: brands }, { results: members }, { results: hashes }] = await Promise.all([
    db.prepare(`SELECT * FROM brands ORDER BY created_at ASC`).all<BrandRow>(),
    db
      .prepare(`SELECT brand_id, email FROM memberships WHERE brand_id != ? ORDER BY email ASC`)
      .bind(PLATFORM)
      .all<{ brand_id: string; email: string }>(),
    db
      .prepare(`SELECT brand_id FROM settings WHERE key = 'password_hash'`)
      .all<{ brand_id: string }>(),
  ]);

  const withPassword = new Set((hashes ?? []).map((row) => row.brand_id));

  return (brands ?? []).map((row) => {
    let accent = "#2563EB";
    try {
      accent = (JSON.parse(row.colors) as { primary?: string }).primary ?? accent;
    } catch { /* default */ }
    return {
      slug: row.id,
      name: row.name,
      accent,
      members: (members ?? [])
        .filter((member) => member.brand_id === row.id)
        .map((member) => member.email),
      passwordSet: withPassword.has(row.id),
    };
  });
}

export async function GET() {
  return NextResponse.json({ clients: await overview() });
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    name?: unknown;
    slug?: unknown;
    shortName?: unknown;
    font?: unknown;
    colors?: { accent?: unknown; background?: unknown; text?: unknown };
    logoSvg?: unknown;
    icons?: unknown;
    email?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  try {
    // ---- member management ---------------------------------------------
    if (body.action === "add-member" || body.action === "remove-member") {
      const slug = typeof body.slug === "string" ? body.slug : "";
      const email = normaliseEmail(body.email);
      if (!isValidSlug(slug) || !email) {
        return NextResponse.json({ error: "Bad brand or email." }, { status: 422 });
      }
      if (body.action === "add-member") {
        await db
          .prepare(
            `INSERT INTO memberships (brand_id, email, created_at) VALUES (?, ?, ?)
             ON CONFLICT(brand_id, email) DO NOTHING`,
          )
          .bind(slug, email, now)
          .run();
      } else {
        await db
          .prepare(`DELETE FROM memberships WHERE brand_id = ? AND email = ?`)
          .bind(slug, email)
          .run();
      }
      return NextResponse.json({ clients: await overview() });
    }

    // ---- password reset -------------------------------------------------
    if (body.action === "reset-password") {
      const slug = typeof body.slug === "string" ? body.slug : "";
      if (!isValidSlug(slug)) return NextResponse.json({ error: "Bad brand." }, { status: 422 });
      const password = generatePassword();
      await setPassword(slug, password);
      return NextResponse.json({ clients: await overview(), password, slug });
    }

    // ---- create ---------------------------------------------------------
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 40) {
      return NextResponse.json({ error: "Name the client in 2 to 40 characters." }, { status: 422 });
    }

    const slug = typeof body.slug === "string" && isValidSlug(body.slug) ? body.slug : slugify(name);
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "That name needs letters or numbers." }, { status: 422 });
    }

    const exists = await db.prepare(`SELECT 1 AS ok FROM brands WHERE id = ?`).bind(slug).first();
    if (exists) return NextResponse.json({ error: `"${slug}" is already a client.` }, { status: 422 });

    const colors = body.colors ?? {};
    for (const key of ["accent", "background", "text"] as const) {
      if (!HEX.test(String(colors[key] ?? ""))) {
        return NextResponse.json({ error: "Pick all three colours." }, { status: 422 });
      }
    }
    const palette = derivePalette({
      accent: String(colors.accent),
      background: String(colors.background),
      text: String(colors.text),
    });

    const font = FONTS.includes(String(body.font)) ? String(body.font) : "Inter";
    const shortName = String(body.shortName ?? "Calendar").trim().slice(0, 14) || "Calendar";

    let logoSvg: string | null = null;
    if (typeof body.logoSvg === "string" && body.logoSvg.trim()) {
      const trimmed = body.logoSvg.trim();
      if (!/^<svg[\s>]/i.test(trimmed) || trimmed.length > 50_000) {
        return NextResponse.json({ error: "The logo must be an SVG under 50 KB." }, { status: 422 });
      }
      if (/<script|onload|onerror|javascript:/i.test(trimmed)) {
        return NextResponse.json({ error: "That SVG contains scripting." }, { status: 422 });
      }
      logoSvg = trimmed;
    }

    // Icons come pre-rendered from the browser (a canvas can rasterise the
    // mark; the Worker cannot). Sanity-cap the payload.
    let icons: string | null = null;
    if (body.icons && typeof body.icons === "object") {
      const entries = Object.entries(body.icons as Record<string, unknown>).filter(
        ([key, value]) =>
          ["180", "192", "512", "maskable"].includes(key) &&
          typeof value === "string" &&
          value.length < 300_000,
      );
      if (entries.length > 0) icons = JSON.stringify(Object.fromEntries(entries));
    }

    await db
      .prepare(
        `INSERT INTO brands (id, name, product_name, short_name, colors, font, logo_svg, logo_tint, icons, created_at, updated_at)
         VALUES (?, ?, 'Marketing Calendar', ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(slug, name, shortName, JSON.stringify(palette),
        JSON.stringify({ family: font, headingWeight: 700, bodyWeight: 400 }),
        logoSvg, icons, now, now)
      .run();

    const password = generatePassword();
    await setPassword(slug, password);

    return NextResponse.json({ clients: await overview(), created: slug, password });
  } catch (error) {
    console.error("Clients API failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
