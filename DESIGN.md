---
version: alpha
name: RIVET Product Interface
description: A quiet operations ledger for gym teams, members, and platform operators.
colors:
  paper: "#F5F4EF"
  surface: "#FFFFFF"
  sunken: "#EDECE5"
  sunken-strong: "#E4E2D8"
  ink: "#1B1A15"
  ink-secondary: "#565449"
  ink-muted: "#8B887B"
  ink-disabled: "#B6B3A6"
  line: "#E3E1D6"
  line-strong: "#D2CFC2"
  line-emphasis: "#BDB9A9"
  night: "#15140F"
  night-raised: "#1E1C15"
  night-selected: "#2A2820"
  night-line: "#2E2C22"
  night-ink: "#F2F0E6"
  night-ink-secondary: "#A6A394"
  night-ink-muted: "#6F6C5D"
  signal: "#D9232B"
  signal-deep: "#AD1B22"
  signal-soft: "#FAE9E9"
  success: "#176E44"
  success-deep: "#0F5232"
  success-soft: "#E6F1EA"
  warning: "#96620A"
  warning-deep: "#6F4804"
  warning-soft: "#F7EDD9"
  danger: "#B3261E"
  danger-soft: "#F9E7E5"
typography:
  page-title:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  panel-title:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  body-compact:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  context-label:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "normal"
  technical-label:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace"
    fontSize: "10.5px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.12em"
  record:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  micro: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
  3xl: "40px"
  4xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.surface}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  status-chip:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  navigation-active-light:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  navigation-active-night:
    backgroundColor: "{colors.night-selected}"
    textColor: "{colors.night-ink}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
---

# Design System: RIVET Product Interface

## Overview

**Creative North Star: “The Quiet Operations Ledger”**

RIVET is an operating system for busy gym teams, not a decorative dashboard. Its product interface should feel calm, exact, accountable, and ready for a distracted employee to use quickly at a reception desk. The visual language comes from durable ledgers and well-kept operational records: warm paper, strong ink, hairline structure, clear states, tabular figures, and a small amount of deliberate signal color.

The product is compact without being cramped. It uses familiar controls, visible labels, restrained geometry, and one obvious next action. Personality comes from the RIVET mark, the warm neutral palette, excellent typography, and precise interaction details—not from ornamental cards, gradients, oversized illustrations, or repetitive label formulas.

This document governs the authenticated gym workspace, member portal, platform console, authentication, onboarding, offers, and public product surfaces. It deliberately excludes the marketing and landing-page visual system. The implemented reference lives in the preview-only [`/dev/design-system`](apps/web/src/app/dev/design-system/design-system-gallery.tsx) gallery.

The product identity set lives in [`docs/brand`](docs/brand):

- [`rivet-product-identity-system.png`](docs/brand/rivet-product-identity-system.png) records the exact palette, typography, geometry, components, and usage rules.
- [`rivet-product-application-system.png`](docs/brand/rivet-product-application-system.png) shows the system across owner, reception, member, tenant, and financial contexts.
- [`rivet-master-brand-kit.png`](docs/brand/rivet-master-brand-kit.png) is the exact, deterministic master overview generated from product assets and representative interface captures.
- [`rivet-imagegen-brand-kit.png`](docs/brand/rivet-imagegen-brand-kit.png) is the art-directed presentation board for founder, partner, and brand communication. This document and the deterministic boards remain authoritative when presentation detail and implementation rules differ.

**Key characteristics:**

- Warm, flat product surfaces with high legibility.
- Manrope for human language; IBM Plex Mono only for machine-like records.
- Compact operational density with 44px coarse-pointer targets.
- One quiet tonal navigation state, never decorative active rails.
- Hairlines and spacing establish hierarchy before cards or shadows.
- Signal red is rare enough to remain meaningful.
- Tenant branding appears on the gym’s primary safe actions without rewriting RIVET’s system.

## Colors

The palette is a warm paper-and-ink system with one RIVET signal and a small, semantic status vocabulary.

### Core neutrals

- **Ledger Paper** (`paper`, `#F5F4EF`) is the workspace canvas and the default browser theme color.
- **Record Surface** (`surface`, `#FFFFFF`) holds tables, forms, cards, menus, and focused working areas.
- **Inset Paper** (`sunken`, `#EDECE5`) identifies selected navigation, secondary controls, subtle grouping, and inactive depth.
- **Strong Inset** (`sunken-strong`, `#E4E2D8`) is reserved for stronger neutral separation.
- **Ledger Ink** (`ink`, `#1B1A15`) carries primary text and the neutral tenant-action fallback.
- **Secondary Ink** (`ink-secondary`, `#565449`) carries explanatory copy and secondary controls.
- **Muted Ink** (`ink-muted`, `#8B887B`) carries helper copy, inactive icons, and context labels.
- **Disabled Ink** (`ink-disabled`, `#B6B3A6`) is for unavailable values and placeholders only.
- **Hairline**, **Strong Hairline**, and **Emphasis Hairline** (`line`, `line-strong`, `line-emphasis`) separate content without creating card walls.

### Night workspace

- **Night Ledger** (`night`, `#15140F`) is used only for the primary sidebar, authentication brand panel, and reception console.
- **Night Raised** and **Night Selected** (`night-raised`, `night-selected`) provide hover and selection without shadows.
- **Night Ink** (`night-ink`, `#F2F0E6`) and its secondary/muted steps maintain readable hierarchy on dark surfaces.
- Night is a deliberate operating mode, not a general dark theme.

### Signal and semantic color

- **RIVET Signal** (`signal`, `#D9232B`) is the rare brand-level accent. Use it for exceptional RIVET emphasis, progress, and selected high-salience actions.
- **Success**, **Warning**, and **Danger** colors communicate state only. Each has a soft background and a stronger readable foreground.
- Never use semantic colors to decorate modules or differentiate arbitrary categories.

### Tenant accents

Authenticated gyms may supply a controlled primary accent. It replaces the neutral primary action through `--tenant-brand-primary`, `--tenant-brand-primary-hover`, `--tenant-brand-primary-foreground`, and `--tenant-brand-focus`. It does not recolor routine navigation, semantic statuses, tables, or the RIVET signal.

**The One Signal Rule.** Red must remain rare. A screen should normally have no more than one signal-red action or emphasis region.

## Typography

**Display font:** Manrope, with Segoe UI and system sans-serif fallbacks.  
**Body font:** Manrope, with the same fallbacks.  
**Technical font:** IBM Plex Mono, with SFMono-Regular and Menlo fallbacks.  
**Arabic-ready font:** IBM Plex Sans Arabic for the later Arabic pass.

Manrope carries both headings and body text so the product reads as one coherent instrument. Hierarchy comes from size, weight, spacing, and location—not from changing typefaces. IBM Plex Mono is a precision tool for IDs and record references, not a visual mood.

### Hierarchy

- **Page title:** 26px/1.25, weight 600, subtle negative tracking. One clear title per page.
- **Section title:** 20px/1.35, weight 600. Use for major page subdivisions and gallery sections.
- **Panel title:** 15px/1.4, weight 600. Use inside established panels and dialogs.
- **Body:** 14px/1.45, weight 400. This is the normal product reading size.
- **Compact body:** 13.5px/1.45. Use for controls, dense rows, and short operational descriptions.
- **Context label:** 12px/16px, weight 500, sentence case. It adds human-facing context that is not already obvious from the nearby heading.
- **Technical label:** 10.5px/16px, weight 500, uppercase, `0.12em` tracking. It is allowed only for identifiers, references, codes, and terse system metadata.
- **Record text:** 12px IBM Plex Mono. Use for member numbers, receipt numbers, transaction references, SKUs, and equivalent values.
- Monetary values and counts use Manrope with tabular numeral features unless the value itself is a record identifier.

Normal explanatory and operational copy should stay near 13.5–14px. Helper text must not fall below 12px. A 10.5–11px size is acceptable only for short technical metadata or exceptionally dense table headings.

**The Human Language Rule.** If an employee or member would say it aloud, set it in Manrope and sentence case. Mono uppercase is not an “eyebrow” decoration.

## Layout

RIVET uses a responsive operating shell rather than a single marketing container. The desktop gym workspace has a fixed night sidebar, a sticky 64px top bar, and content padding of 32px. The sidebar is 228px expanded and 60px collapsed. Below the large breakpoint, navigation moves into the top bar and content padding reduces to 16–24px.

The member portal is mobile-first and reserves space for its safe-area-aware bottom navigation. Platform and public-product surfaces use the same paper, surface, type, and state primitives even when their navigation differs.

The spacing rhythm is based on 4px with useful steps at 8, 12, 16, 20, 24, 32, 40, and 48px. Use the smaller steps inside controls and rows, 16–24px inside meaningful panels, and 24–48px between page-level regions. A representative content ceiling is 1480px; narrower reading or form surfaces should choose a smaller intentional maximum rather than stretching.

Breakpoints follow Tailwind’s established product defaults: 640px (`sm`), 768px (`md`), 1024px (`lg`), 1280px (`xl`), and 1536px (`2xl`). The tested acceptance widths are 360, 390, 768, 820, 1280, and 1440px.

At coarse-pointer sizes, interactive targets must be at least 44×44px even when visual control height stays compact. Tables may scroll inside an intentional bounded region; normal pages should maintain one primary scrollbar. Sticky bars must respect safe areas and never cover the last actionable row.

Use logical properties (`start`, `end`, `ps`, `pe`, `text-start`, `text-end`) so the later Arabic/RTL pass can extend the system without undoing layouts.

## Elevation & Depth

RIVET is flat at rest. Depth comes from paper/surface contrast, sunken selections, hairline borders, dividers, and proximity. Normal cards, tables, navigation, and form panels do not cast shadows.

Two shadows exist only for floating layers:

- **Popover:** `0 1px 2px rgb(27 26 21 / 0.06), 0 12px 32px -8px rgb(27 26 21 / 0.18)` for menus, selects, and popovers.
- **Dialog:** `0 2px 4px rgb(27 26 21 / 0.08), 0 24px 64px -12px rgb(27 26 21 / 0.28)` for modal dialogs and high-priority temporary layers.

Translucent backdrops may use a very small blur to establish focus, but content surfaces must not adopt glass styling.

**The Flat-at-Rest Rule.** If an element is not temporarily floating above the workflow, it does not receive a shadow.

## Shapes

The product uses restrained geometry: 3px for focus and micro details, 4px for compact controls and chips, 6px for inputs and buttons, and 8px for panels and whole-page state containers. Fully rounded shapes are reserved for dots, avatars, toggles, and controls whose circular form communicates behavior.

Borders are normally one pixel. Use `line` for divisions, `line-strong` for interactive outlines, and `line-emphasis` only where a stronger affordance is necessary. Dashed borders belong to empty, permission, or unavailable states—not ordinary content cards.

Do not mix exaggerated rounded containers with compact operational controls. Do not add a rounded rectangle merely to make a section look “designed.”

## Components

### Buttons

- **Tenant primary:** The main safe action. It uses the active gym’s controlled accent, 6px radius, medium text, and clear hover/pressed tones.
- **Secondary:** White surface, strong hairline, ledger ink. It is the standard alternative action.
- **Ghost:** No resting frame. Use for low-emphasis row or toolbar actions.
- **Signal:** RIVET red. Use rarely and never as the default color for every primary action.
- **Danger:** White surface with danger border/text, moving to a soft danger fill on hover. Destructive actions must also be explicit in copy and confirmation behavior.
- Sizes are 28, 32, 36, and 44px. Coarse-pointer environments expand the usable target to at least 44px.
- Every button needs visible keyboard focus. Loading preserves the button’s meaning, disables repeat submission, and exposes `aria-busy`.

### Inputs and fields

Fields use a white surface, 1px strong hairline, 6px radius, 13.5px text, and visible labels. Hover strengthens the border; focus uses the tenant accent plus the global focus outline. Error uses danger border and a subtle danger surface. Disabled fields remain legible but visibly unavailable.

Placeholders are examples, never labels. Units such as days, hours, and JOD should be aligned beside fields or clearly embedded in field structure—not repeatedly wrapped inside long labels.

### Status chips

Status chips are compact 4px-radius labels with a semantic soft background and readable foreground. Optional dots inherit the status color. Pills are not decorative tags and should not become a second navigation system.

### Panels, cards, and records

A panel is one meaningful surface: white, 1px hairline, 8px radius, and no resting shadow. Inside it, prefer stable headers, spacing, rows, and dividers. Do not place framed cards inside framed cards unless the inner element has a separate interactive or semantic boundary.

Tables use 13px rows, 11.5px readable headings, hairline separation, tabular numeric alignment, and horizontal overflow only when the data genuinely requires it. Primary row actions stay visible; secondary actions may move into an overflow menu.

### Navigation and tabs

Primary and Settings navigation use a single active cue: a quiet tonal background plus stronger label/icon contrast and weight. Do not use colored vertical rails, simultaneous parent/child highlights, or tenant accent as routine navigation decoration.

In-page section navigation shares one open, full-width tab strip: 13.5px semibold labels, secondary ink for inactive sections, and an ink underline for the selected section. Use the shared Tabs components or their exported visual classes for route links and existing section controls. Keep one horizontally scrollable row on narrow screens; do not wrap tabs into multiple rows. The selected shared tab scrolls into view without moving the page vertically. Place section tabs immediately after the page heading and before branch/action toolbars where possible. Stock & purchasing uses matching 44px controls, with a full-width branch selector above two equal-width actions on phones. Status filters, billing choices, Board/List switches, guided steps and Settings’ vertical navigation retain their distinct roles. Tab state must be keyboard accessible and URL-backed when it represents a shareable product view.

### Feedback states

`StatePanel` has three layouts:

- **Inline:** A compact horizontal interruption within existing content.
- **Section:** A restrained dashed block inside a panel, table, or form region.
- **Page:** A centered whole-workspace block for genuine route-level absence, permission, or setup requirements.

Errors preserve last-loaded data when possible and offer a concrete recovery action. Permission, unavailable, empty, loading, saving, stale, and success states must not be conflated. Announcements use appropriate live regions without making static prose noisy to assistive technology.

### Motion

Product motion is short and interruptible: color changes around 100–150ms, overlays around 180–250ms, and the route entrance at 240ms using `cubic-bezier(0.22, 1, 0.36, 1)`. Animate opacity and transform; do not animate layout. `transition-all`, routine hover lifting, floating decoration, and delayed snap-back are prohibited. Reduced-motion users receive an immediate equivalent.

## Do's and Don'ts

### Do

- **Do** make the likely next safe action immediately visible.
- **Do** use Manrope sentence case for human-facing labels and navigation groups.
- **Do** reserve IBM Plex Mono for IDs, receipts, references, SKUs, and technical sequence markers.
- **Do** use one panel boundary, then rely on spacing and dividers inside it.
- **Do** align money, counts, dates, fields, units, and row actions consistently.
- **Do** use the quiet tonal active state in primary, Settings, and segmented navigation.
- **Do** keep data-heavy screens compact while preserving 12px helper text and 44px coarse-pointer targets.
- **Do** provide keyboard alternatives, visible focus, semantic controls, useful errors, and safe-area spacing.
- **Do** preserve tenant accent for the gym’s main safe action while keeping semantic colors truthful.
- **Do** test representative interfaces at 360, 390, 768, 820, 1280, and 1440px.

### Don't

- **Don't** repeat uppercase monospaced “eyebrows” above every page, card, dialog, and metric.
- **Don't** show colored vertical active rails or multiple active signals at once.
- **Don't** create nested card walls, framed-icon formulas, or background changes without semantic purpose.
- **Don't** use gradients, glass effects, neon, decorative color washes, heavy shadows, or a new shadow family.
- **Don't** use signal red as routine decoration or as every gym’s primary action color.
- **Don't** shrink normal human copy below 12px to force a layout to fit.
- **Don't** hide a primary action in an overflow menu or make hover the only discovery mechanism.
- **Don't** use placeholders as labels, vague permission copy for setup problems, or empty states for failed queries.
- **Don't** animate layout, use `transition-all`, add delayed snap-back, or retain transformed ancestors after motion finishes.
- **Don't** treat the night surfaces as permission to add a general dark mode.
- **Don't** import marketing typography or motion rules into the product interface.
