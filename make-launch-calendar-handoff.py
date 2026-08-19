"""
Rebuilds marketing-calendar-handoff.zip — the folder we hand to a recipient.

Run from this directory:  python make-launch-calendar-handoff.py

The product is called Marketing Calendar. Our own live instance keeps its
original infrastructure names (worker and database both `launch-calendar`,
folder `launch-calendar/`) because renaming a deployed worker loses its secrets
and changes its URL. The recipient starts fresh, so their copy gets
`marketing-calendar` throughout — folder, worker, database, URL, and every
command in the docs. That rewrite is the RENAMES table below; keep it to exact
identifier tokens so prose is never touched by accident.

The zip has to be regenerated after every feature, and doing it by hand is how a
database id or a client-specific brand file ends up in somebody else's copy. The
exclusions below are the whole point of this script; read them before adding to
them.

Deliberately left out:
  PLAN.md, REVIEW-1.md        our working notes, not the recipient's business
  brand.config.lucky-golf.ts  a client's palette
  db/migrations/              a recipient always starts fresh from schema.sql;
                              migrations only apply to a board already running
  .dev.vars                   local secrets
  build output, node_modules, .git, tsbuildinfo

And the database id is replaced with the placeholder the setup runbook looks
for, so a recipient cannot accidentally point their deploy at our database.

brand.config.ts ships, because it is the file a recipient edits — but our live
copy carries Lucky Golf's home-screen short name, so that one value is reset to
the neutral default on the way into the zip (NEUTRAL_BRAND_VALUES).
"""

import re
import zipfile
from pathlib import Path

SOURCE = Path(__file__).parent / "launch-calendar"
TARGET = Path(__file__).parent / "marketing-calendar-handoff.zip"

# Infrastructure identifiers that differ between our instance and a recipient's.
# Applied to text files only, as whole-token replacements.
RENAMES = [("launch-calendar", "marketing-calendar")]
RENAME_FILES = {
    "wrangler.jsonc",
    "package.json",
    "package-lock.json",
    "CLAUDE.md",
    "SETUP.md",
    "README.md",
    "START-HERE.md",
    ".claude/commands/setup.md",
    "GUIDE.html",
}
ZIP_ROOT = "marketing-calendar"

SKIP_DIRS = {
    "node_modules",
    ".next",
    ".open-next",
    ".wrangler",
    ".git",
    "db/migrations",
}

SKIP_FILES = {
    "PLAN.md",
    "REVIEW-1.md",
    "brand.config.lucky-golf.ts",
    ".dev.vars",
    "tsconfig.tsbuildinfo",
    ".DS_Store",
}

PLACEHOLDER = "PASTE_DATABASE_ID_HERE"

# Values in brand.config.ts that are ours rather than the product's defaults.
# Each is (regex, replacement); every regex must match or the build stops.
NEUTRAL_BRAND_VALUES = [
    (r'(shortName:\s*")[^"]*(")', r'\g<1>Calendar\g<2>'),
]


def included(relative: Path) -> bool:
    parts = relative.parts
    for depth in range(1, len(parts)):
        if "/".join(parts[:depth]) in SKIP_DIRS:
            return False
    if parts[0] in SKIP_DIRS:
        return False
    return relative.name not in SKIP_FILES


def rename_identifiers(text: str) -> str:
    for ours, theirs in RENAMES:
        text = text.replace(ours, theirs)
    return text


def scrub_wrangler(text: str) -> str:
    """Swap our database id for the placeholder the setup runbook expects."""
    scrubbed = re.sub(
        r'("database_id"\s*:\s*")[^"]*(")',
        rf"\g<1>{PLACEHOLDER}\g<2>",
        text,
    )
    if PLACEHOLDER not in scrubbed:
        raise SystemExit("wrangler.jsonc has no database_id to scrub — check the format.")
    return scrubbed


def neutralise_brand(text: str) -> str:
    """Reset our instance's brand values to the product defaults."""
    for pattern, replacement in NEUTRAL_BRAND_VALUES:
        text, count = re.subn(pattern, replacement, text, count=1)
        if count != 1:
            raise SystemExit(f"brand.config.ts: expected to find {pattern!r} once.")
    return text


def main() -> None:
    if not SOURCE.is_dir():
        raise SystemExit(f"No launch-calendar folder beside this script ({SOURCE}).")

    written = []

    with zipfile.ZipFile(TARGET, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(SOURCE.rglob("*")):
            if not path.is_file():
                continue

            relative = path.relative_to(SOURCE)
            if not included(relative):
                continue

            arcname = f"{ZIP_ROOT}/{relative.as_posix()}"
            rel = relative.as_posix()

            if rel == "wrangler.jsonc":
                archive.writestr(
                    arcname,
                    rename_identifiers(scrub_wrangler(path.read_text(encoding="utf-8"))),
                )
            elif rel in RENAME_FILES:
                archive.writestr(arcname, rename_identifiers(path.read_text(encoding="utf-8")))
            elif rel == "brand.config.ts":
                archive.writestr(arcname, neutralise_brand(path.read_text(encoding="utf-8")))
            else:
                archive.write(path, arcname)

            written.append(arcname)

    print(f"{TARGET.name}: {len(written)} files")

    # A recipient who cannot deploy is the failure this catches early.
    for required in (
        f"{ZIP_ROOT}/START-HERE.md",
        f"{ZIP_ROOT}/CLAUDE.md",
        f"{ZIP_ROOT}/.claude/commands/setup.md",
        f"{ZIP_ROOT}/worker-entry.js",
        f"{ZIP_ROOT}/db/schema.sql",
    ):
        if required not in written:
            raise SystemExit(f"Missing from the handoff: {required}")

    leaked = [name for name in written if "lucky-golf" in name or name.endswith("PLAN.md")]
    if leaked:
        raise SystemExit(f"Should not be in the handoff: {leaked}")

    # The recipient's copy must not mention our instance's identifiers anywhere
    # a person or a command would read them.
    with zipfile.ZipFile(TARGET) as archive:
        for rel in RENAME_FILES:
            text = archive.read(f"{ZIP_ROOT}/{rel}").decode("utf-8")
            if "launch-calendar" in text:
                raise SystemExit(f"Old identifier still present in {rel}")
        config = archive.read(f"{ZIP_ROOT}/wrangler.jsonc").decode("utf-8")
        if '"name": "marketing-calendar"' not in config or PLACEHOLDER not in config:
            raise SystemExit("wrangler.jsonc in the zip is not renamed/scrubbed")
        brand = archive.read(f"{ZIP_ROOT}/brand.config.ts").decode("utf-8")
        if 'shortName: "Calendar"' not in brand or 'shortName: "LG' in brand:
            raise SystemExit("brand.config.ts in the zip still carries our values")

    print("checks passed")


if __name__ == "__main__":
    main()
