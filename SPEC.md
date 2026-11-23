# Quiltcaster Specification

## Overview
Quiltcaster is a client-side web application (HTML, CSS, JavaScript) designed to run on GitHub Pages.

## Features

### 1. Image Input (Drag-and-Drop Zone)
- Users can supply an image by dragging and dropping an image file onto a dedicated drop zone (with a click-to-browse file picker fallback for accessibility and mobile support).
- Supported formats: standard browser-decodable image types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).

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

### 6. Printable PDF Quilt Pattern Export
Generates a multi-page, printer-friendly PDF following standard pixel-quilt pattern conventions:
1. **Page 1 — Pattern Cover & Summary**
   - Quilt title (derived from image filename or editable), finished quilt dimensions, grid size (`cols × rows`), total square count, finished square size, cut square size, and seam allowance.
   - Clean mockup image of the finished quilt.
2. **Page 2 — Color Key, Fabric Yardage & WOF Cutting Chart**
   - Letter-coded fabric key (`A`, `B`, `C`, …) with printed color swatch, hex value, and an empty box to tape a physical fabric swatch.
   - Exact square count per color.
   - **Width of Fabric (WOF) Cutting Chart** assuming standard 42" usable WOF (106 cm in metric):
     - Squares yielded per WOF strip (`floor(WOF / cutSize)`).
     - Number of WOF strips to cut (`ceil(squares / squaresPerStrip)`) at `cutSize` width.
     - Estimated yardage rounded up to the nearest `1/8 yd` (or `0.1 m` in metric).
   - **Backing & Binding Estimates**: binding strip count/yardage (`(perimeter + 10") / 40"` WOF at `2.5"` strips) and backing yardage estimate (with `+8"` quilting margin).
3. **Page 3+ — Annotated Quilt Layout Grid Map**
   - Coordinate-labeled grid (numbered columns across top, numbered rows down left) with thicker guide lines every 5 squares for easy counting.
   - Every square is filled with its color **and** labeled with its high-contrast fabric letter (`A`, `B`, …) so the pattern remains legible even when printed in black & white or with similar shades.
   - Alternating row pressing arrows (`←` on odd rows, `→` on even rows) so seams nest neatly during row-by-row assembly.
   - Automatically tiles large grids across multiple pages (e.g., max ~24×30 squares per page) with section headers (`Section 1 of 4`, row/col ranges) so every cell stays large enough to read.
4. **Final Page — Row-by-Row Assembly & Pressing Guide**
   - Brief, standard pixel-quilt assembly notes (layout, chain piecing, nesting seams, pressing alternating rows).
   - Compact **row-by-row run-length checklist** (e.g., `Row 1 (→): 4A, 2B, 3A, …`) with checkboxes so quilters can cross off rows as they sew.

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
