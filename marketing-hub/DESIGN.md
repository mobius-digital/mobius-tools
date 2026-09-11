# Lineup design system

One product identity for every brand. The brand supplies one color, its
accent; everything else is Lineup's.

## Color

OKLCH, light only, restrained: tinted neutrals plus one accent used at under
ten percent of the surface (primary button, today, selection, links).

| Token | Role |
| --- | --- |
| `--bg` | page ground, cool off-white |
| `--surface` | cards, calendar, sheets |
| `--surface-2` | toolbars, column backgrounds, sunken fields |
| `--ink` / `--ink-2` / `--ink-3` | text: primary, secondary, tertiary |
| `--line` / `--line-2` | hairline, stronger hairline |
| `--accent` | the brand's color; `--accent-ink` is it darkened for text |
| `--danger` | at risk, clashes, destructive |
| `--stage-<name>` | eight named stage hues, each with a `-bg` and `-ink` |

Status is carried by shape, not hue: confirmed solid, tentative dashed, at
risk red-ringed, completed faded. Stage is carried by hue. That keeps the two
readable at once.

## Type

Geist, 400 / 500 / 600. Base 14px on desktop, 16px in inputs (iOS zoom).
Scale: 12 / 13 / 14 / 16 / 20 / 24. Tabular numerals on dates.
Sentence case. No all-caps kickers except column and weekday labels.

## Layout

- Desktop: 56px top bar (brand switcher, view tabs, actions) plus a view
  toolbar. Content fills the width up to 1520px.
- Phone (< 720px): bottom tab bar, floating add button, agenda calendar by
  default, board columns swipe horizontally.
- Radius 6 / 10 / 14. Shadows tinted with the ink color, never black.

## Motion

150 to 220ms, ease-out-quart. Motion conveys state only: sheet slide, menu
open, toast, drag targets. Reduced motion collapses to crossfades.

## Components

Button (primary, default, quiet, danger), segmented control, chip filter,
event chip, board card, stage dot, status mark, sheet (right side on desktop,
full-screen on phone), dialog, toast with undo, menu.
