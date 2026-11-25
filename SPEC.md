# Quiltcaster Specification

## Overview
Quiltcaster is a client-side web application (HTML, CSS, JavaScript) designed to run on GitHub Pages.

## Features

### 1. Image Input (Drag-and-Drop Zone) & Non-Destructive Cropping
- Users can supply an image by dragging and dropping an image file onto a dedicated drop zone (with an exposed **Browse for an Image** button and an equal-sized **Open a Saved Pattern (.quilt)** button on the landing screen).
- Supported formats: standard browser-decodable image types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
- **Interactive Crop Tool**: Users can click **Crop** in the preview toolbar at any time to frame a sub-region of their uploaded image using corner/edge drag handles or aspect-ratio presets (`Free`, `1:1 Square`, `3:4`, `4:3`, `Reset Full`). Cropping is non-destructive (can be re-opened or reset later, and is preserved in `.quilt` pattern saves) and optionally re-extracts the color palette from the cropped area.

### 2. Square Decomposition Controls
- Once an image is dropped, a control panel is revealed.
- Includes a **slider** controlling how finely or coarsely the image is decomposed into squares (grid resolution / square size).

### 3. Color Palette Extraction & Editing
- Automatically extracts a palette of dominant colors from the uploaded image.
- Includes a **color count control** (slider) to choose how many colors to extract from the image.
- Displays the palette as interactive swatches so the user can:
  - Click any swatch to change its color with a color picker.
  - Delete individual colors with a small `×` button (remapping affected squares to the nearest remaining colors).
  - Add or reset colors as needed.

### 4. Live Quilt Preview
- Displays a live preview showing how the image looks decomposed into squares at the current slider resolution and mapped to the current (edited) color palette.
- Updates immediately whenever the slider or any palette color changes.

### 5. Finished Square Size & Seam Allowance
- Allows the user to specify:
  - **Finished square size** (the visible size of each square on the completed quilt, e.g., `2.5"`).
  - **Stitching margin / seam allowance** (default `0.25"` / quarter-inch on each side).
  - Unit toggle between inches (`in`) and centimeters (`cm`).
- Automatically calculates and displays:
  - **Cut square size**: `finishedSquareSize + 2 × seamAllowance` (accounting for seam allowance on opposite edges).
  - **Finished quilt dimensions**: `(columns × finishedSquareSize)` × `(rows × finishedSquareSize)`, updated live as the grid slider or square size changes.

### 6. Boutique Printable PDF Quilt Pattern Booklet Export
Generates a multi-page indie-style PDF booklet (US Letter or A4) featuring embedded editorial typography (**DM Serif Display**, **Plus Jakarta Sans**, **JetBrains Mono**):
1. **Cover Page — Editorial Summary, Value Check & Interactive TOC**
   - Editable **Pattern Title**, Quiltcaster emblem, 6-stat specification ribbon, gallery-framed full-color quilt mockup, **Grayscale Value-Check Preview** card, and a clickable **Table of Contents** that jumps to each section.
2. **Section `01` — Materials, WOF Cutting Chart & 1:1 Cut Template**
   - Zebra-striped cutting table with colored `[ A ]` code badges, printed swatches, dashed **Tape Swatch** boxes, human-readable fabric names, square counts, WOF strip counts, **Fat Quarter (`18"×21"`) & Pre-Cut compatibility callouts** (`2½"` Jelly Roll / `5"` Charm Pack / `10"` Layer Cake), Backing & Binding card, **Illustrated WOF Strip-Cutting Diagram**, and **1:1 Cut-Size Test Square**.
3. **Section `02` — Fabric Shopping List & Smart Budget**
   - Closest commercial solid matches in **Robert Kaufman Kona Cotton Solids** (`K001-XXXX` SKUs) and **Moda Bella Solids**, clickable online shop links (**Fat Quarter Shop**, **Hancock's of Paducah**, **Missouri Star Quilt Co.**), automatic **Fat Quarter vs. Yardage** optimization, and total project budget.
4. **Section `03` — Annotated Quilt Layout Map**
   - Coordinate-labeled grid with high-contrast letters in every cell, alternating row pressing arrows, **Mini Key-Map Locator Thumbnail** + tape-join edge hints when tiled across pages, and either `5×5` counting guides (`Rows` mode) or `8×8` terracotta block boundaries (`8×8 Blocks` mode).
5. **Section `04` — Step-by-Step Assembly & Visual Color-Chip Checklist**
   - **Illustrated Nesting-Seams Diagram** beside tailored instructions for either **Row-by-Row** or **`8×8` Sub-Block** assembly, followed by checkable sequences of **colored run-length chips** (`[ 4×A ] [ 2×B ]`).
6. **Section `05` — Cut-Apart Fabric & Row/Block Pin Tags**
   - Scissor-cut dashed grid of **Fabric Stack Tags** and **Row / Sub-Block Pin Tags** to clip and pin onto cut fabric stacks and pieced rows.

### 7. Paper Size
- PDF export offers **US Letter** or **A4**, defaulting to Letter for US/Canada locales and A4 elsewhere.

### 8. Save & Load Patterns
- **Save Pattern** (or `Cmd/Ctrl + S`) downloads a `.quilt` file (JSON) containing the source image (downscaled to max 1600px), grid columns, units, finished square size, seam allowance, seam-line toggle, paper size, and the exact edited palette.
- **Open Pattern** (top bar or drop-zone button), or dropping a `.quilt` file onto the drop zone/preview, restores the design exactly — no palette re-extraction.

### 9. Quilter-Friendly Conventions (from pattern research)
- Inch measurements shown as **fractions to the nearest 1/8"** (e.g., `2 1/2"`), matching quilting rulers, instead of decimals.
- Fabric estimates include **+10% extra** for squaring up, shrinkage, and cutting mistakes (running short is a top quilter complaint).
- PDF cover includes a **1" and 2 cm print-scale test square** with "print at 100% / Actual size" guidance.
- Assembly guide covers labeled fabric stacks, row-by-row layout, the **row-stack labeling** method, chain piecing, alternating pressing for nested seams, and strip-piecing tips for long same-fabric runs.

## Implementation Plan (Draft)

### Image Upload Handling
1. **Drop Zone UI (`index.html`, `styles.css`)**
   - Add a prominent drop zone container with visual hover/drag-over states and a hidden `<input type="file" accept="image/*">` triggered on click/keyboard activation.
2. **File Ingestion (`app.js`)**
   - Prevent default browser behavior on `dragenter`, `dragover`, `dragleave`, and `drop` events.
   - Validate that the dropped/selected file is an image (`file.type.startsWith("image/")`) and surface a clear inline error if not.
   - Load the image client-side using `URL.createObjectURL(file)` (or `FileReader` / `createImageBitmap`) into an `HTMLImageElement` or `<canvas>` for downstream processing, revoking object URLs on cleanup.

### Square Decomposition & Live Preview
1. **Controls UI (`index.html`, `styles.css`)**
   - Reveal the controls panel after a valid image loads.
   - Render a range slider (`<input type="range">`) with a live readout showing the current grid/square density (e.g., columns × rows).
2. **Canvas Grid Decomposition (`app.js`)**
   - Draw the source image onto an offscreen canvas, partition it into equal-sized squares based on the slider value, sample each square's average color, map each square to its nearest color in the active palette (e.g., perceptual RGB / Lab distance), and render the resulting quilt grid onto the live preview `<canvas>`.

### Color Palette Extraction & Customization
1. **Extraction (`app.js`)**
   - Run a lightweight client-side color quantization pass (e.g., k-means or median-cut on downsampled pixel data) to extract a default palette from the image.
2. **Interactive Swatches (`index.html`, `styles.css`, `app.js`)**
   - Render each extracted color as a clickable swatch paired with `<input type="color">` (and optional enable/disable selection state).
   - Store original extracted color alongside the user's current override so edits immediately re-render the live preview without re-running extraction.

### Printable PDF Pattern Export
1. **Quilt Math Module (`app.js`)**
   - Assign letter codes (`A`, `B`, `C`, …) to active palette colors (skipping any unused colors with 0 squares) and compute the full 2D grid of fabric indices.
   - Compute per-color WOF cutting stats (squares per 42" strip, strips needed, yardage rounded up to nearest `1/8 yd` / `0.1 m`), plus binding and backing estimates.
   - Generate row-by-row run-length encoded sequences (`4A, 2B, …`) with alternating pressing directions.
2. **Client-Side PDF Generation (`jsPDF` via CDN + `app.js`)**
   - Add an **Export PDF Pattern** button in the preview toolbar.
   - Render vector pages (US Letter portrait, 0.5" margins) with cover mockup, color key & WOF cutting table, tiled coordinate grid map with letter-stamped squares and pressing arrows, and row-by-row assembly checklist.
   - Trigger an immediate browser download (`<quilt-name>-pattern.pdf`) with zero backend required.
