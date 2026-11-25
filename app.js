/**
 * Miriam's Quiltcaster — Client-side pixel-quilt designer & PDF booklet generator.
 *
 * Data pipeline:
 *   Uploaded Image (or .quilt JSON)
 *     -> Non-destructive normalized crop box (state.crop, 0..1)
 *     -> Cached 400px downsampled pixel buffer (rebuildSampleBuffer)
 *     -> Deterministic k-means++ palette extraction (extractPalette)
 *     -> Exact box-averaged square grid (computeSquareAverages)
 *     -> Real-time <canvas> preview (renderQuilt) + boutique jsPDF booklet (exportPdfPattern)
 *
 * Sections in this file:
 *   1. DOM References & Application State
 *   2. Color Math, Kona/Bella Fabric Catalog & K-Means++ Extraction
 *   3. Square Decomposition, Quilting Dimensions & Yardage Math
 *   4. Live Canvas Rendering & Interactive Palette Swatches
 *   5. Image Ingestion, Non-Destructive Cropping Buffer & .quilt Save/Load
 *   6. UI Event Wiring (Drag/Drop, Sliders, Units, Palette)
 *   7. Boutique PDF Pattern Booklet Generator (jsPDF + Embedded Fonts)
 *   8. Interactive Crop Canvas Controller (Touch + Mouse)
 */
(() => {
  "use strict";

  // DOM elements
  const dropStage = document.getElementById("drop-stage");
  const dropZone = document.getElementById("drop-zone");
  const errorBanner = document.getElementById("error-banner");
  const fileInput = document.getElementById("file-input");
  const workspace = document.getElementById("workspace");
  const topbarActions = document.getElementById("topbar-actions");
  const newImageBtn = document.getElementById("new-image-btn");
  const fileNameLabel = document.getElementById("file-name");

  const squaresSlider = document.getElementById("squares-slider");
  const squaresValue = document.getElementById("squares-value");
  const totalSquaresLabel = document.getElementById("total-squares-label");
  const seamLinesToggle = document.getElementById("seam-lines-toggle");

  const unitBtns = document.querySelectorAll(".unit-btn");
  const unitLabels = document.querySelectorAll("[data-unit-label]");
  const finishedSizeInput = document.getElementById("finished-size-input");
  const seamAllowanceInput = document.getElementById("seam-allowance-input");
  const quiltPresetSelect = document.getElementById("quilt-preset-select");
  const quiltWidthInput = document.getElementById("quilt-width-input");
  const quiltHeightInput = document.getElementById("quilt-height-input");
  const cutSquareValue = document.getElementById("cut-square-value");
  const wofNote = document.getElementById("wof-note");
  const previewDimensions = document.getElementById("preview-dimensions");
  const previewRulerWidth = document.getElementById("preview-ruler-width");
  const previewRulerHeight = document.getElementById("preview-ruler-height");

  const paletteSizeSlider = document.getElementById("palette-size-slider");
  const paletteSizeValue = document.getElementById("palette-size-value");
  const paletteGrid = document.getElementById("palette-grid");
  const addColorBtn = document.getElementById("add-color-btn");
  const resetPaletteBtn = document.getElementById("reset-palette-btn");

  const compareBtn = document.getElementById("compare-btn");
  const exportPdfBtn = document.getElementById("export-pdf-btn");
  const patternTitleInput = document.getElementById("pattern-title-input");
  const assemblyModeSelect = document.getElementById("assembly-mode-select");
  const assemblyModeBtns = document.querySelectorAll(".segmented-btn[data-assembly]");
  const pageSizeSelect = document.getElementById("page-size-select");
  const pageSizeBtns = document.querySelectorAll(".segmented-btn[data-page-size]");
  const savePatternBtn = document.getElementById("save-pattern-btn");
  const browseImageBtn = document.getElementById("browse-image-btn");
  const openPatternBtn = document.getElementById("open-pattern-btn");
  const openPatternBtnTop = document.getElementById("open-pattern-btn-top");
  const patternInput = document.getElementById("pattern-input");

  function setPageSize(size) {
    const valid = size === "a4" ? "a4" : "letter";
    pageSizeSelect.value = valid;
    pageSizeBtns.forEach((btn) => {
      const active = btn.dataset.pageSize === valid;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  function setAssemblyMode(mode) {
    const valid = mode === "blocks" ? "blocks" : "rows";
    assemblyModeSelect.value = valid;
    assemblyModeBtns.forEach((btn) => {
      const active = btn.dataset.assembly === valid;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  function syncProjectTitle(title, sourceEl = null) {
    const val = title || "";
    if (fileNameLabel && sourceEl !== fileNameLabel) {
      fileNameLabel.value = val;
    }
    if (patternTitleInput && sourceEl !== patternTitleInput) {
      patternTitleInput.value = val;
    }
    const clean = val.trim();
    document.title = clean ? `${clean} · Miriam's Quiltcaster` : "Miriam's Quiltcaster";
  }

  if (fileNameLabel) {
    fileNameLabel.addEventListener("input", () => syncProjectTitle(fileNameLabel.value, fileNameLabel));
  }
  if (patternTitleInput) {
    patternTitleInput.addEventListener("input", () => syncProjectTitle(patternTitleInput.value, patternTitleInput));
  }

  function derivePatternTitle(filename) {
    const base = (filename || "Custom Quilt")
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();
    if (!base) return "Custom Pixel Quilt";
    return base.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  const previewToolbar = document.getElementById("preview-toolbar");
  const exportBar = document.getElementById("export-bar");
  const cropBtn = document.getElementById("crop-btn");
  const cropBtnLabel = document.getElementById("crop-btn-label");
  const cropStage = document.getElementById("crop-stage");
  const cropCanvas = document.getElementById("crop-canvas");
  const cropCtx = cropCanvas.getContext("2d");
  const cropAspectBtns = document.querySelectorAll(".crop-aspect-btn");
  const cropResetBtn = document.getElementById("crop-reset-btn");
  const cropReextractToggle = document.getElementById("crop-reextract-toggle");
  const cropCancelBtn = document.getElementById("crop-cancel-btn");
  const cropApplyBtn = document.getElementById("crop-apply-btn");

  const canvasFrame = document.getElementById("canvas-frame");
  const dropOverlay = document.getElementById("drop-overlay");
  const quiltCanvas = document.getElementById("quilt-canvas");
  const quiltCtx = quiltCanvas.getContext("2d");

  // Application state
  const state = {
    image: null,
    objectUrl: null,
    fileName: "",
    // Normalized non-destructive crop box (0..1 relative to naturalWidth / naturalHeight)
    crop: { x: 0, y: 0, w: 1, h: 1 },
    // Cached downsampled pixel buffer for fast square averaging & palette extraction
    sampleWidth: 0,
    sampleHeight: 0,
    samplePixels: null,
    // Grid
    cols: Number(squaresSlider.value),
    rows: 1,
    squareAverages: [], // Array of [r, g, b] for each cell (length = cols * rows)
    gridAssignments: new Int32Array(0), // Palette index per cell
    usageCounts: new Int32Array(0), // Square count per palette color
    // Palette: array of { id, r, g, b }
    palette: [],
    nextColorId: 1,
    showSeamLines: seamLinesToggle.checked,
    showingOriginal: false,
    // Physical quilt sizing
    unit: "in",
    finishedSquareSize: Number(finishedSizeInput.value) || 2.5,
    seamAllowance: Number(seamAllowanceInput.value) || 0.25,
  };

  // --- Color Utilities ---

  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  // Perceptually weighted squared RGB distance (redmean approximation)
  function colorDistanceSq(r1, g1, b1, r2, g2, b2) {
    const rMean = (r1 + r2) * 0.5;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return (
      (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db
    );
  }

  function luminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Curated quilting fabric color catalog with closest Robert Kaufman Kona Cotton Solids
  // SKU & shade name, plus Moda Bella Solids alternative for the PDF Shopping List.
  // Format: [DisplayName, R, G, B, KonaShade, KonaSKU, BellaShade]
  const NAMED_FABRIC_COLORS = [
    ["White", 250, 250, 248, "Kona White", "K001-1387", "Bella White (9900-98)"],
    ["Ivory", 245, 240, 226, "Kona Snow", "K001-1339", "Bella Snow (9900-11)"],
    ["Cream", 240, 232, 212, "Kona Bone", "K001-1037", "Bella Ivory (9900-60)"],
    ["Linen", 228, 217, 197, "Kona Canvas", "K001-1317", "Bella Muslin (9900-97)"],
    ["Sand", 212, 196, 168, "Kona Sand", "K001-1323", "Bella Sand (9900-122)"],
    ["Tan", 194, 168, 134, "Kona Tan", "K001-1386", "Bella Tan (9900-32)"],
    ["Camel", 176, 139, 98, "Kona Suede", "K001-1855", "Bella Camel (9900-69)"],
    ["Warm Brown", 135, 94, 62, "Kona Chestnut", "K001-1073", "Bella Brown (9900-35)"],
    ["Cocoa", 105, 72, 52, "Kona Coffee", "K001-1081", "Bella Earth (9900-34)"],
    ["Espresso", 66, 46, 36, "Kona Espresso", "K001-1136", "Bella Espresso (9900-173)"],
    ["Silver Gray", 210, 212, 214, "Kona Silver", "K001-1333", "Bella Silver (9900-183)"],
    ["Light Gray", 180, 182, 184, "Kona Ash", "K001-1007", "Bella Dove (9900-83)"],
    ["Warm Gray", 150, 145, 138, "Kona Stone", "K001-1347", "Bella Etchings Stone (9900-169)"],
    ["Slate Gray", 112, 120, 128, "Kona Slate", "K001-1854", "Bella Graphite (9900-202)"],
    ["Charcoal", 64, 66, 70, "Kona Charcoal", "K001-1071", "Bella Charcoal (9900-284)"],
    ["Black", 28, 28, 30, "Kona Black", "K001-1019", "Bella Jet Black (9900-99)"],
    ["Pale Yellow", 248, 238, 178, "Kona Buttercup", "K001-1054", "Bella Buttercup (9900-23)"],
    ["Lemon", 244, 218, 92, "Kona Lemon", "K001-23", "Bella Canary (9900-24)"],
    ["Gold", 224, 176, 54, "Kona Gold", "K001-1161", "Bella Goldenrod (9900-112)"],
    ["Mustard", 198, 146, 38, "Kona Mustard", "K001-1240", "Bella Mustard (9900-217)"],
    ["Ochre", 176, 120, 36, "Kona Curry", "K001-1096", "Bella Amber (9900-247)"],
    ["Peach", 244, 194, 164, "Kona Peach", "K001-1269", "Bella Peach (9900-108)"],
    ["Apricot", 236, 162, 114, "Kona Apricot", "K001-1005", "Bella Cantaloupe (9900-141)"],
    ["Coral", 232, 118, 96, "Kona Coral", "K001-1084", "Bella Coral (9900-110)"],
    ["Tangerine", 228, 122, 48, "Kona Tangerine", "K001-1363", "Bella Orange (9900-77)"],
    ["Burnt Orange", 194, 88, 38, "Kona Spice", "K001-1343", "Bella Autumn (9900-248)"],
    ["Terracotta", 184, 88, 56, "Kona Terracotta", "K001-1367", "Bella Terracotta (9900-137)"],
    ["Rust", 154, 64, 38, "Kona Rust", "K001-1315", "Bella Rust (9900-56)"],
    ["Blush Pink", 242, 204, 206, "Kona Bellini", "K001-1144", "Bella Soft Pink (9900-20)"],
    ["Light Pink", 236, 172, 184, "Kona Peony", "K001-443", "Bella Baby Pink (9900-22)"],
    ["Dusty Rose", 196, 128, 138, "Kona Foxglove", "K001-432", "Bella Dusty Rose (9900-133)"],
    ["Rose", 204, 92, 116, "Kona Bubblegum", "K001-1058", "Bella Rose (9900-114)"],
    ["Berry", 168, 56, 92, "Kona Berry", "K001-1355", "Bella Berry (9900-115)"],
    ["Magenta", 186, 44, 114, "Kona Honeysuckle", "K001-1174", "Bella Magenta (9900-251)"],
    ["Bright Red", 208, 46, 46, "Kona Red", "K001-138", "Bella Scarlet (9900-48)"],
    ["Crimson", 168, 34, 42, "Kona Crimson", "K001-1091", "Bella Christmas Red (9900-16)"],
    ["Brick Red", 142, 48, 42, "Kona Brick", "K001-1042", "Bella Barn Red (9900-138)"],
    ["Burgundy", 108, 28, 42, "Kona Burgundy", "K001-1039", "Bella Burgundy (9900-49)"],
    ["Maroon", 82, 24, 32, "Kona Wine", "K001-1391", "Bella Wine (9900-50)"],
    ["Lavender", 204, 192, 226, "Kona Lavender", "K001-1221", "Bella Lavender (9900-28)"],
    ["Lilac", 178, 152, 206, "Kona Lilac", "K001-1215", "Bella Lilac (9900-147)"],
    ["Mauve", 156, 118, 154, "Kona Wisteria", "K001-1392", "Bella Mauve (9900-135)"],
    ["Violet", 126, 86, 168, "Kona Violet", "K001-1381", "Bella Amethyst (9900-149)"],
    ["Plum", 108, 52, 114, "Kona Plum", "K001-1289", "Bella Plum (9900-150)"],
    ["Eggplant", 72, 36, 82, "Kona Eggplant", "K001-1126", "Bella Eggplant (9900-151)"],
    ["Ice Blue", 218, 234, 244, "Kona Ice Frappe", "K001-1179", "Bella Porcelain (9900-180)"],
    ["Light Blue", 168, 204, 228, "Kona Sky", "K001-1342", "Bella Sky (9900-18)"],
    ["Sky Blue", 118, 176, 218, "Kona Bluebell", "K001-1028", "Bella Baby Blue (9900-19)"],
    ["Cornflower", 92, 138, 198, "Kona Cornflower", "K001-27", "Bella Cornflower (9900-128)"],
    ["Cobalt Blue", 46, 98, 178, "Kona Blue Jay", "K001-196", "Bella Sapphire (9900-129)"],
    ["Slate Blue", 88, 120, 148, "Kona Copenhagen", "K001-447", "Bella Slate Blue (9900-127)"],
    ["Denim", 64, 96, 134, "Kona Denim", "K001-1109", "Bella Denim (9900-74)"],
    ["Royal Blue", 38, 68, 142, "Kona Royal", "K001-1313", "Bella Royal (9900-37)"],
    ["Navy", 28, 44, 84, "Kona Navy", "K001-1243", "Bella Navy (9900-40)"],
    ["Midnight", 20, 28, 52, "Kona Nautical", "K001-1246", "Bella Midnight (9900-209)"],
    ["Mint", 188, 228, 208, "Kona Mint", "K001-1235", "Bella Mint (9900-163)"],
    ["Aqua", 116, 196, 196, "Kona Aqua", "K001-1006", "Bella Aqua (9900-72)"],
    ["Turquoise", 64, 168, 176, "Kona Turquoise", "K001-1376", "Bella Turquoise (9900-164)"],
    ["Teal", 38, 118, 128, "Kona Teal Blue", "K001-1365", "Bella Teal (9900-166)"],
    ["Deep Teal", 24, 78, 88, "Kona Peacock", "K001-1270", "Bella Deep Teal (9900-272)"],
    ["Pistachio", 188, 214, 156, "Kona Celery", "K001-1065", "Bella Pistachio (9900-160)"],
    ["Sage", 148, 172, 142, "Kona Sage", "K001-1320", "Bella Sage (9900-64)"],
    ["Seafoam", 142, 194, 168, "Kona Seafoam", "K001-1327", "Bella Seafoam (9900-162)"],
    ["Lime Green", 136, 188, 72, "Kona Lime", "K001-1219", "Bella Lime (9900-119)"],
    ["Kelly Green", 58, 148, 74, "Kona Kelly", "K001-1192", "Bella Kelly (9900-75)"],
    ["Emerald", 38, 124, 82, "Kona Emerald", "K001-1133", "Bella Emerald (9900-264)"],
    ["Moss Green", 106, 126, 72, "Kona Moss", "K001-1239", "Bella Moss (9900-158)"],
    ["Olive", 112, 114, 54, "Kona Olive", "K001-1262", "Bella Olive (9900-66)"],
    ["Forest Green", 42, 86, 54, "Kona Forest", "K001-1150", "Bella Forest (9900-44)"],
    ["Pine Green", 28, 58, 42, "Kona Spruce", "K001-1346", "Bella Pine (9900-45)"],
  ];

  function getFabricCatalogMatch(r, g, b) {
    let bestEntry = NAMED_FABRIC_COLORS[0];
    let bestDist = Infinity;
    for (let i = 0; i < NAMED_FABRIC_COLORS.length; i++) {
      const entry = NAMED_FABRIC_COLORS[i];
      const d = colorDistanceSq(r, g, b, entry[1], entry[2], entry[3]);
      if (d < bestDist) {
        bestDist = d;
        bestEntry = entry;
      }
    }
    const shadeClean = bestEntry[4].replace(/^Kona\s+/i, "");
    const query = encodeURIComponent(`Kona Cotton ${shadeClean}`);
    return {
      name: bestEntry[0],
      konaName: bestEntry[4],
      konaSku: bestEntry[5],
      bellaName: bestEntry[6],
      fqsUrl: `https://www.fatquartershop.com/catalogsearch/result/?q=${query}`,
      msqcUrl: `https://www.missouriquiltco.com/search?q=${query}`,
      hancocksUrl: `https://www.hancockspaducah.com/search.php?search_query=${query}`,
    };
  }

  function getColorName(r, g, b) {
    return getFabricCatalogMatch(r, g, b).name;
  }

  // Deterministic k-means++ color quantization on sampled pixels
  function extractPalette(pixels, count) {
    // Subsample pixels to at most ~4000 opaque samples for instant extraction
    const totalPixels = pixels.length / 4;
    const stride = Math.max(1, Math.floor(totalPixels / 4000));
    const samples = [];
    for (let i = 0; i < totalPixels; i += stride) {
      const idx = i * 4;
      if (pixels[idx + 3] < 128) continue;
      samples.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }

    if (samples.length === 0) {
      return [{ id: state.nextColorId++, r: 200, g: 90, b: 50 }];
    }

    const k = Math.min(count, samples.length);

    // Deterministic farthest-point (k-means++ style) seeding
    // Pick the first centroid as the pixel closest to the overall mean
    let sumR = 0, sumG = 0, sumB = 0;
    for (const s of samples) {
      sumR += s[0];
      sumG += s[1];
      sumB += s[2];
    }
    const meanR = sumR / samples.length;
    const meanG = sumG / samples.length;
    const meanB = sumB / samples.length;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = colorDistanceSq(samples[i][0], samples[i][1], samples[i][2], meanR, meanG, meanB);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const centroids = [samples[bestIdx].slice()];
    const minDists = new Float64Array(samples.length).fill(Infinity);

    for (let c = 1; c < k; c++) {
      const last = centroids[c - 1];
      let farthestIdx = 0;
      let farthestDist = -1;
      for (let i = 0; i < samples.length; i++) {
        const d = colorDistanceSq(samples[i][0], samples[i][1], samples[i][2], last[0], last[1], last[2]);
        if (d < minDists[i]) minDists[i] = d;
        if (minDists[i] > farthestDist) {
          farthestDist = minDists[i];
          farthestIdx = i;
        }
      }
      centroids.push(samples[farthestIdx].slice());
    }

    // Run Lloyd's iterations
    const assignments = new Int32Array(samples.length);
    const maxIter = 12;
    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;
      const accumR = new Float64Array(k);
      const accumG = new Float64Array(k);
      const accumB = new Float64Array(k);
      const counts = new Int32Array(k);

      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        let nearest = 0;
        let nearestDist = Infinity;
        for (let c = 0; c < k; c++) {
          const d = colorDistanceSq(s[0], s[1], s[2], centroids[c][0], centroids[c][1], centroids[c][2]);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = c;
          }
        }
        if (assignments[i] !== nearest) {
          assignments[i] = nearest;
          changed = true;
        }
        accumR[nearest] += s[0];
        accumG[nearest] += s[1];
        accumB[nearest] += s[2];
        counts[nearest]++;
      }

      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          centroids[c][0] = Math.round(accumR[c] / counts[c]);
          centroids[c][1] = Math.round(accumG[c] / counts[c]);
          centroids[c][2] = Math.round(accumB[c] / counts[c]);
        }
      }

      if (!changed) break;
    }

    // Sort palette from darkest to lightest for easy reading
    centroids.sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));

    return centroids.map(([r, g, b]) => ({
      id: state.nextColorId++,
      r,
      g,
      b,
    }));
  }

  // --- Square Decomposition ---

  function computeSquareAverages() {
    if (!state.samplePixels) return;

    const w = state.sampleWidth;
    const h = state.sampleHeight;
    const cols = state.cols;
    // Keep cells genuinely square based on the image aspect ratio
    const rows = Math.max(1, Math.round((cols * h) / w));
    state.rows = rows;

    const cellCount = cols * rows;
    const sumR = new Float64Array(cellCount);
    const sumG = new Float64Array(cellCount);
    const sumB = new Float64Array(cellCount);
    const counts = new Int32Array(cellCount);

    const data = state.samplePixels;
    for (let y = 0; y < h; y++) {
      const row = Math.min(rows - 1, Math.floor((y * rows) / h));
      const rowOffset = row * cols;
      for (let x = 0; x < w; x++) {
        const col = Math.min(cols - 1, Math.floor((x * cols) / w));
        const pIdx = (y * w + x) * 4;
        const cIdx = rowOffset + col;
        sumR[cIdx] += data[pIdx];
        sumG[cIdx] += data[pIdx + 1];
        sumB[cIdx] += data[pIdx + 2];
        counts[cIdx]++;
      }
    }

    const averages = new Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      const n = counts[i] || 1;
      averages[i] = [sumR[i] / n, sumG[i] / n, sumB[i] / n];
    }
    state.squareAverages = averages;

    squaresValue.textContent = `${cols} × ${rows}`;
    totalSquaresLabel.textContent = `${(cols * rows).toLocaleString()} squares`;
    updateQuiltDimensions();
  }

  function formatMeasure(value, unit) {
    if (unit === "in") {
      // Quilters measure with fractional rulers: round to nearest 1/8"
      const eighths = Math.round(value * 8);
      const whole = Math.floor(eighths / 8);
      const rem = eighths % 8;
      const fracMap = { 1: "1/8", 2: "1/4", 3: "3/8", 4: "1/2", 5: "5/8", 6: "3/4", 7: "7/8" };
      if (rem === 0) return `${whole}"`;
      if (whole === 0) return `${fracMap[rem]}"`;
      return `${whole} ${fracMap[rem]}"`;
    }
    const rounded = Math.round(value * 10) / 10;
    const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${formatted} cm`;
  }

  // Extra fabric allowance for shrinkage, squaring up, and cutting mistakes
  const FABRIC_BUFFER = 0.1;

  function getFabricCode(index) {
    // A..Z, then AA..AZ
    if (index < 26) return String.fromCharCode(65 + index);
    return String.fromCharCode(65 + Math.floor(index / 26) - 1) + String.fromCharCode(65 + (index % 26));
  }

  function getUsableWof(unit) {
    return unit === "in" ? 42 : 106;
  }

  function formatYardsFraction(yards) {
    if (yards <= 0) return "0 yd";
    const eighths = Math.ceil(yards * 8);
    const whole = Math.floor(eighths / 8);
    const rem = eighths % 8;
    const fracMap = { 1: "1/8", 2: "1/4", 3: "3/8", 4: "1/2", 5: "5/8", 6: "3/4", 7: "7/8" };
    if (rem === 0) return `${whole} yd`;
    if (whole === 0) return `${fracMap[rem]} yd`;
    return `${whole} ${fracMap[rem]} yd`;
  }

  function formatFabricAmount(lengthInUnit, unit) {
    if (lengthInUnit <= 0) return unit === "in" ? "0 yd" : "0 m";
    if (unit === "in") {
      return formatYardsFraction(lengthInUnit / 36);
    }
    const meters = Math.ceil((lengthInUnit / 100) * 10) / 10;
    return `${meters.toFixed(1)} m`;
  }

  function calculateColorFabric(squareCount) {
    const unit = state.unit;
    const cutSize = Math.max(0.1, state.finishedSquareSize) + 2 * Math.max(0, state.seamAllowance);
    const wof = getUsableWof(unit);
    const squaresPerStrip = Math.max(1, Math.floor(wof / cutSize));
    if (squareCount <= 0) {
      return {
        cutSize,
        wof,
        squaresPerStrip,
        strips: 0,
        length: 0,
        formatted: formatFabricAmount(0, unit),
      };
    }
    const strips = Math.ceil(squareCount / squaresPerStrip);
    const length = strips * cutSize;
    return {
      cutSize,
      wof,
      squaresPerStrip,
      strips,
      length,
      formatted: formatFabricAmount(length * (1 + FABRIC_BUFFER), unit),
    };
  }

  function calculateBackingAndBinding() {
    const unit = state.unit;
    const finished = Math.max(0.1, state.finishedSquareSize);
    const quiltW = state.cols * finished;
    const quiltH = state.rows * finished;

    // Binding: perimeter + 10" (25 cm) for corners/joins, 40" (102 cm) usable WOF, 2.5" (6.5 cm) strip width
    const perimeter = 2 * (quiltW + quiltH);
    const bindingExtra = unit === "in" ? 10 : 25;
    const bindingWof = unit === "in" ? 40 : 102;
    const bindingStripW = unit === "in" ? 2.5 : 6.5;
    const bindingStrips = Math.ceil((perimeter + bindingExtra) / bindingWof);
    const bindingLength = bindingStrips * bindingStripW;

    // Backing: +8" (20 cm) quilting margin on both width and height
    const margin = unit === "in" ? 8 : 20;
    const wof = getUsableWof(unit);
    const backW = quiltW + margin;
    const backH = quiltH + margin;
    const panels = Math.ceil(backW / wof);
    const backingLength = panels * backH;

    return {
      bindingStrips,
      bindingStripW,
      bindingAmount: formatFabricAmount(bindingLength, unit),
      backingPanels: panels,
      backingAmount: formatFabricAmount(backingLength, unit),
    };
  }

  function formatNumericInput(val) {
    const rounded = Math.round(val * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
  }

  function updateQuiltDimensions(skipInputEl = null) {
    const unit = state.unit;
    const finished = Math.max(0.1, state.finishedSquareSize);
    const seam = Math.max(0, state.seamAllowance);

    // Cut square adds seam allowance on both left/right and top/bottom edges
    const cutSize = finished + 2 * seam;
    const cutText = `${formatMeasure(cutSize, unit)} × ${formatMeasure(cutSize, unit)}`;
    cutSquareValue.textContent = cutText;

    const quiltW = state.cols * finished;
    const quiltH = state.rows * finished;
    const quiltText = `${formatMeasure(quiltW, unit)} × ${formatMeasure(quiltH, unit)}`;

    if (finishedSizeInput && skipInputEl !== finishedSizeInput) {
      finishedSizeInput.value = formatNumericInput(finished);
    }
    if (quiltWidthInput && skipInputEl !== quiltWidthInput) {
      quiltWidthInput.value = formatNumericInput(quiltW);
    }
    if (quiltHeightInput && skipInputEl !== quiltHeightInput) {
      quiltHeightInput.value = formatNumericInput(quiltH);
    }

    wofNote.textContent =
      unit === "in"
        ? `Fabric estimates: 42" usable WOF, +10% extra for squaring up & mistakes`
        : `Fabric estimates: 106 cm usable WOF, +10% extra for squaring up & mistakes`;

    previewDimensions.textContent = `Finished: ${quiltText} · Cut squares: ${cutText}`;
    if (previewRulerWidth) previewRulerWidth.textContent = formatMeasure(quiltW, unit);
    if (previewRulerHeight) previewRulerHeight.textContent = formatMeasure(quiltH, unit);
    updateSwatchCounts(state.usageCounts);
  }

  // --- Rendering ---

  function renderQuilt() {
    if (!state.image || state.palette.length === 0) return;

    const cols = state.cols;
    const rows = state.rows;

    // Pick a crisp display square size so canvas stays sharp up to ~1000px
    const maxDim = 960;
    const squarePx = Math.max(8, Math.floor(maxDim / Math.max(cols, rows)));
    const canvasW = cols * squarePx;
    const canvasH = rows * squarePx;

    if (quiltCanvas.width !== canvasW || quiltCanvas.height !== canvasH) {
      quiltCanvas.width = canvasW;
      quiltCanvas.height = canvasH;
    }

    if (state.showingOriginal) {
      const { sx, sy, sw, sh } = getCroppedSourceRect();
      quiltCtx.drawImage(state.image, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
      return;
    }

    const palette = state.palette;
    const usageCounts = new Int32Array(palette.length);
    const assignments = new Int32Array(cols * rows);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellIdx = r * cols + c;
        const avg = state.squareAverages[cellIdx];
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let p = 0; p < palette.length; p++) {
          const pal = palette[p];
          const d = colorDistanceSq(avg[0], avg[1], avg[2], pal.r, pal.g, pal.b);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = p;
          }
        }
        assignments[cellIdx] = bestIdx;
        usageCounts[bestIdx]++;
        const chosen = palette[bestIdx];
        quiltCtx.fillStyle = `rgb(${chosen.r}, ${chosen.g}, ${chosen.b})`;
        quiltCtx.fillRect(c * squarePx, r * squarePx, squarePx, squarePx);
      }
    }

    state.gridAssignments = assignments;
    state.usageCounts = usageCounts;

    if (state.showSeamLines && squarePx >= 6) {
      quiltCtx.save();
      quiltCtx.strokeStyle = "rgba(25, 22, 18, 0.16)";
      quiltCtx.lineWidth = 1;
      quiltCtx.beginPath();
      for (let c = 1; c < cols; c++) {
        const x = c * squarePx + 0.5;
        quiltCtx.moveTo(x, 0);
        quiltCtx.lineTo(x, canvasH);
      }
      for (let r = 1; r < rows; r++) {
        const y = r * squarePx + 0.5;
        quiltCtx.moveTo(0, y);
        quiltCtx.lineTo(canvasW, y);
      }
      quiltCtx.stroke();
      quiltCtx.restore();
    }

    updateSwatchCounts(usageCounts);
  }

  function updateSwatchCounts(usageCounts) {
    const items = paletteGrid.querySelectorAll(".swatch-item");
    items.forEach((item, idx) => {
      const count = usageCounts[idx] ?? 0;
      const calc = calculateColorFabric(count);
      const countEl = item.querySelector(".swatch-count");
      const fabricEl = item.querySelector(".swatch-fabric");
      if (countEl) {
        countEl.textContent = `${count} sq`;
      }
      if (fabricEl) {
        fabricEl.textContent = calc.formatted;
      }
      item.title =
        count > 0
          ? `${count} squares · Cut ${calc.strips} WOF strip${calc.strips === 1 ? "" : "s"} (${formatMeasure(calc.cutSize, state.unit)} wide, ${calc.squaresPerStrip}/strip) · Est. ${calc.formatted}`
          : "0 squares used";
    });
  }

  function renderPaletteSwatches() {
    paletteGrid.innerHTML = "";
    const canDelete = state.palette.length > 1;
    paletteSizeValue.textContent = `${state.palette.length} ${state.palette.length === 1 ? "color" : "colors"}`;

    state.palette.forEach((color, idx) => {
      const hex = rgbToHex(color.r, color.g, color.b);
      const colorName = getColorName(color.r, color.g, color.b);
      const code = getFabricCode(idx);

      const item = document.createElement("div");
      item.className = "swatch-item";
      item.dataset.id = String(color.id);

      const colorWrap = document.createElement("label");
      colorWrap.className = "swatch-color-wrap";
      colorWrap.title = `Change Fabric ${code}: ${colorName} (${hex.toUpperCase()})`;

      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = hex;
      picker.setAttribute("aria-label", `Edit Fabric ${code}: ${colorName}`);

      const info = document.createElement("div");
      info.className = "swatch-info";

      const headerRow = document.createElement("div");
      headerRow.className = "swatch-header-row";

      const codeBadge = document.createElement("span");
      codeBadge.className = "swatch-code";
      codeBadge.textContent = code;

      const nameSpan = document.createElement("span");
      nameSpan.className = "swatch-hex";
      nameSpan.textContent = colorName;

      headerRow.appendChild(codeBadge);
      headerRow.appendChild(nameSpan);

      const statsRow = document.createElement("div");
      statsRow.className = "swatch-header-row";

      const countSpan = document.createElement("span");
      countSpan.className = "swatch-count";
      countSpan.textContent = "0 sq";

      const fabricSpan = document.createElement("span");
      fabricSpan.className = "swatch-fabric";
      fabricSpan.textContent = "0 yd";

      statsRow.appendChild(countSpan);
      statsRow.appendChild(fabricSpan);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "swatch-remove";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = canDelete ? `Remove Fabric ${code} (${colorName}) from palette` : "At least 1 color required";
      removeBtn.setAttribute("aria-label", `Remove Fabric ${code} (${colorName})`);
      removeBtn.disabled = !canDelete;

      picker.addEventListener("input", (e) => {
        const newHex = e.target.value;
        const [r, g, b] = hexToRgb(newHex);
        color.r = r;
        color.g = g;
        color.b = b;
        const updatedName = getColorName(r, g, b);
        nameSpan.textContent = updatedName;
        colorWrap.title = `Change Fabric ${code}: ${updatedName} (${newHex.toUpperCase()})`;
        renderQuilt();
      });

      removeBtn.addEventListener("click", () => {
        if (state.palette.length <= 1) return;
        state.palette = state.palette.filter((c) => c.id !== color.id);
        if (state.palette.length >= Number(paletteSizeSlider.min)) {
          paletteSizeSlider.value = String(state.palette.length);
        }
        renderPaletteSwatches();
        renderQuilt();
      });

      colorWrap.appendChild(picker);
      info.appendChild(headerRow);
      info.appendChild(statsRow);
      item.appendChild(colorWrap);
      item.appendChild(info);
      item.appendChild(removeBtn);
      paletteGrid.appendChild(item);
    });
  }

  // --- Image Ingestion ---

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
  }

  function isPatternFile(file) {
    return !!file && /\.(quilt|json)$/i.test(file.name);
  }

  function handleIncomingFile(file) {
    if (!file) return;
    if (isPatternFile(file)) {
      loadPatternFile(file);
    } else {
      loadImageFile(file);
    }
  }

  function loadImageFile(file) {
    clearError();

    if (!file || !file.type.startsWith("image/")) {
      showError("Please drop a valid image file (PNG, JPG, WebP, or GIF) or a saved .quilt pattern.");
      return;
    }

    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }

    const url = URL.createObjectURL(file);
    loadImageFromSrc(url, file.name, {
      objectUrl: url,
      onError: () => {
        URL.revokeObjectURL(url);
        showError("Could not decode that image file. Please try another one.");
      },
    });
  }

  function getCroppedSourceRect() {
    const img = state.image;
    const sx = Math.round(state.crop.x * img.naturalWidth);
    const sy = Math.round(state.crop.y * img.naturalHeight);
    const sw = Math.max(1, Math.round(state.crop.w * img.naturalWidth));
    const sh = Math.max(1, Math.round(state.crop.h * img.naturalHeight));
    return { sx, sy, sw, sh };
  }

  function updateCropButtonBadge() {
    const isCropped =
      state.crop.x > 0.002 ||
      state.crop.y > 0.002 ||
      state.crop.w < 0.996 ||
      state.crop.h < 0.996;
    cropBtn.classList.toggle("is-cropped", isCropped);
    cropBtnLabel.textContent = isCropped ? "Cropped" : "Crop";
  }

  function rebuildSampleBuffer() {
    const img = state.image;
    if (!img) return;
    const { sx, sy, sw, sh } = getCroppedSourceRect();

    // Build cached downsampled buffer of the cropped region (max 400px on longest side)
    const maxSample = 400;
    const scale = Math.min(1, maxSample / Math.max(sw, sh));
    const sampleW = Math.max(1, Math.round(sw * scale));
    const sampleH = Math.max(1, Math.round(sh * scale));

    const offscreen = document.createElement("canvas");
    offscreen.width = sampleW;
    offscreen.height = sampleH;
    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    offCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sampleW, sampleH);

    state.sampleWidth = sampleW;
    state.sampleHeight = sampleH;
    state.samplePixels = offCtx.getImageData(0, 0, sampleW, sampleH).data;
    updateCropButtonBadge();
  }

  // Loads an image from a URL/data URL. If `restore` is provided, applies saved
  // settings and palette instead of extracting a fresh palette.
  function loadImageFromSrc(src, name, { objectUrl = null, restore = null, onError } = {}) {
    const img = new Image();

    img.onload = () => {
      state.image = img;
      state.objectUrl = objectUrl;
      state.fileName = name;
      const initialTitle =
        restore && typeof restore.patternTitle === "string" && restore.patternTitle.trim()
          ? restore.patternTitle.trim()
          : derivePatternTitle(name);
      syncProjectTitle(initialTitle);
      state.crop = { x: 0, y: 0, w: 1, h: 1 };

      if (restore && restore.settings && restore.settings.crop) {
        const rc = restore.settings.crop;
        const cx = clampNumber(rc.x, 0, 0.95, 0);
        const cy = clampNumber(rc.y, 0, 0.95, 0);
        const cw = clampNumber(rc.w, 0.05, 1 - cx, 1 - cx);
        const ch = clampNumber(rc.h, 0.05, 1 - cy, 1 - cy);
        state.crop = { x: cx, y: cy, w: cw, h: ch };
      }

      closeCropStage();
      rebuildSampleBuffer();

      if (restore) {
        applyRestoredSettings(restore);
      } else {
        const targetColors = Number(paletteSizeSlider.value);
        state.palette = extractPalette(state.samplePixels, targetColors);
      }

      dropStage.hidden = true;
      workspace.hidden = false;
      topbarActions.hidden = false;

      computeSquareAverages();
      renderPaletteSwatches();
      renderQuilt();
    };

    img.onerror = () => {
      if (onError) onError();
    };

    img.src = src;
  }

  // --- Save / Load Patterns ---

  const PATTERN_FORMAT = "miriams-quiltcaster-pattern";
  const PATTERN_VERSION = 1;

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function applyRestoredSettings(saved) {
    const s = saved.settings || {};

    // Grid columns
    state.cols = Math.round(
      clampNumber(s.cols, Number(squaresSlider.min), Number(squaresSlider.max), state.cols)
    );
    squaresSlider.value = String(state.cols);

    // Seam lines
    state.showSeamLines = s.showSeamLines !== false;
    seamLinesToggle.checked = state.showSeamLines;

    if (s.pageSize === "a4" || s.pageSize === "letter") {
      setPageSize(s.pageSize);
    }
    if (s.assemblyMode === "blocks" || s.assemblyMode === "rows") {
      setAssemblyMode(s.assemblyMode);
    }

    // Units & sizing
    const unit = s.unit === "cm" ? "cm" : "in";
    state.unit = unit;
    state.finishedSquareSize = clampNumber(s.finishedSquareSize, 0.1, 100, unit === "in" ? 2.5 : 6.5);
    state.seamAllowance = clampNumber(s.seamAllowance, 0, 10, unit === "in" ? 0.25 : 0.6);
    finishedSizeInput.value = String(state.finishedSquareSize);
    seamAllowanceInput.value = String(state.seamAllowance);
    finishedSizeInput.step = unit === "cm" ? "0.5" : "0.25";
    seamAllowanceInput.step = unit === "cm" ? "0.1" : "0.125";
    unitLabels.forEach((el) => {
      el.textContent = unit;
    });
    unitBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.unit === unit));

    // Palette (exact colors, including any edits/deletions/additions)
    const savedPalette = Array.isArray(saved.palette) ? saved.palette : [];
    const restored = savedPalette
      .filter((hex) => typeof hex === "string" && /^#?[0-9a-f]{6}$/i.test(hex))
      .slice(0, 24)
      .map((hex) => {
        const [r, g, b] = hexToRgb(hex.startsWith("#") ? hex : `#${hex}`);
        return { id: state.nextColorId++, r, g, b };
      });

    if (restored.length > 0) {
      state.palette = restored;
    } else {
      state.palette = extractPalette(state.samplePixels, Number(paletteSizeSlider.value));
    }

    paletteSizeSlider.value = String(
      clampNumber(state.palette.length, Number(paletteSizeSlider.min), Number(paletteSizeSlider.max), 8)
    );
  }

  function getImageDataUrlForSave() {
    // Store a reasonably sized copy of the source image so pattern files stay small
    const img = state.image;
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    // White backing so transparent areas don't turn black in JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.92);
  }

  function savePattern() {
    if (!state.image) return;

    const currentTitle =
      (fileNameLabel && fileNameLabel.value.trim()) ||
      (patternTitleInput && patternTitleInput.value.trim()) ||
      derivePatternTitle(state.fileName);

    const pattern = {
      format: PATTERN_FORMAT,
      version: PATTERN_VERSION,
      savedAt: new Date().toISOString(),
      name: state.fileName || "quilt",
      patternTitle: currentTitle,
      settings: {
        cols: state.cols,
        showSeamLines: state.showSeamLines,
        unit: state.unit,
        finishedSquareSize: state.finishedSquareSize,
        seamAllowance: state.seamAllowance,
        pageSize: pageSizeSelect.value,
        assemblyMode: assemblyModeSelect.value,
        crop: state.crop,
      },
      palette: state.palette.map((c) => rgbToHex(c.r, c.g, c.b)),
      image: getImageDataUrlForSave(),
    };

    const blob = new Blob([JSON.stringify(pattern)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const safeName = currentTitle.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "quilt";

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.quilt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function loadPatternFile(file) {
    clearError();
    const reader = new FileReader();

    reader.onload = () => {
      let saved;
      try {
        saved = JSON.parse(String(reader.result));
      } catch {
        showError("That file isn't a valid Quiltcaster pattern.");
        return;
      }

      if (!saved || saved.format !== PATTERN_FORMAT || typeof saved.image !== "string" || !saved.image.startsWith("data:image/")) {
        showError("That file isn't a valid Quiltcaster pattern.");
        return;
      }

      if (state.objectUrl) {
        URL.revokeObjectURL(state.objectUrl);
        state.objectUrl = null;
      }

      loadImageFromSrc(saved.image, saved.name || file.name, {
        restore: saved,
        onError: () => showError("Could not read the image stored in that pattern file."),
      });
    };

    reader.onerror = () => showError("Could not read that pattern file.");
    reader.readAsText(file);
  }

  // --- Event Wiring ---

  // Drop zone click / keyboard
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  newImageBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleIncomingFile(file);
    fileInput.value = "";
  });

  // Drag & drop on initial drop zone
  ["dragenter", "dragover"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("is-dragover");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleIncomingFile(file);
  });

  // Also allow dragging a replacement image directly onto the preview canvas
  let dragDepth = 0;
  canvasFrame.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
  });

  canvasFrame.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  canvasFrame.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
  });

  canvasFrame.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleIncomingFile(file);
  });

  // Prevent browser from opening dropped files outside target areas
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  // Sliders & toggles
  squaresSlider.addEventListener("input", () => {
    state.cols = Number(squaresSlider.value);
    computeSquareAverages();
    renderQuilt();
  });

  seamLinesToggle.addEventListener("change", () => {
    state.showSeamLines = seamLinesToggle.checked;
    renderQuilt();
  });

  // Physical sizing & seam allowance controls
  finishedSizeInput.addEventListener("input", () => {
    const val = parseFloat(finishedSizeInput.value);
    if (!Number.isNaN(val) && val > 0) {
      state.finishedSquareSize = val;
      if (quiltPresetSelect) quiltPresetSelect.value = "custom";
      updateQuiltDimensions(finishedSizeInput);
    }
  });

  // Standard quilt size presets (Mini through King):
  // Reshapes the preview via a non-destructive center crop to match the preset's exact proportions,
  // recalculates the square grid & finished square size, and updates the live preview + rulers.
  if (quiltPresetSelect) {
    quiltPresetSelect.addEventListener("change", () => {
      const opt = quiltPresetSelect.selectedOptions[0];
      if (!opt || opt.value === "custom" || !state.image) return;
      const wIn = parseFloat(opt.dataset.w);
      const hIn = parseFloat(opt.dataset.h);
      if (!Number.isFinite(wIn) || !Number.isFinite(hIn) || state.cols <= 0) return;

      const scale = state.unit === "cm" ? 2.54 : 1;
      const shortSide = Math.min(wIn, hIn) * scale;
      const longSide = Math.max(wIn, hIn) * scale;

      // Match preset orientation (landscape vs. portrait) to the uploaded photo's natural orientation
      const imgAspect = state.image.naturalWidth / Math.max(1, state.image.naturalHeight);
      const targetW = imgAspect >= 1 ? longSide : shortSide;
      const targetH = imgAspect >= 1 ? shortSide : longSide;
      const targetAspect = targetW / targetH;

      // Center-crop the image non-destructively to the target quilt aspect ratio
      const normRatio = targetAspect / imgAspect;
      let cropW = 1;
      let cropH = 1;
      if (normRatio <= 1) {
        cropW = Math.max(0.1, normRatio);
      } else {
        cropH = Math.max(0.1, 1 / normRatio);
      }
      state.crop = {
        x: (1 - cropW) / 2,
        y: (1 - cropH) / 2,
        w: cropW,
        h: cropH,
      };

      rebuildSampleBuffer();
      state.finishedSquareSize = Math.max(0.25, Math.round((targetW / state.cols) * 100) / 100);
      computeSquareAverages();
      renderQuilt();
    });
  }

  // Direct finished quilt width/height editing recalculates finished square size, cut size, and all yardages
  if (quiltWidthInput) {
    quiltWidthInput.addEventListener("input", () => {
      const val = parseFloat(quiltWidthInput.value);
      if (!Number.isNaN(val) && val > 0 && state.cols > 0) {
        state.finishedSquareSize = Math.max(0.1, val / state.cols);
        if (quiltPresetSelect) quiltPresetSelect.value = "custom";
        updateQuiltDimensions(quiltWidthInput);
      }
    });
    quiltWidthInput.addEventListener("blur", () => updateQuiltDimensions());
  }

  if (quiltHeightInput) {
    quiltHeightInput.addEventListener("input", () => {
      const val = parseFloat(quiltHeightInput.value);
      if (!Number.isNaN(val) && val > 0 && state.rows > 0) {
        state.finishedSquareSize = Math.max(0.1, val / state.rows);
        if (quiltPresetSelect) quiltPresetSelect.value = "custom";
        updateQuiltDimensions(quiltHeightInput);
      }
    });
    quiltHeightInput.addEventListener("blur", () => updateQuiltDimensions());
  }

  seamAllowanceInput.addEventListener("input", () => {
    const val = parseFloat(seamAllowanceInput.value);
    if (!Number.isNaN(val) && val >= 0) {
      state.seamAllowance = val;
      updateQuiltDimensions(seamAllowanceInput);
    }
  });

  unitBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextUnit = btn.dataset.unit;
      if (nextUnit === state.unit) return;

      const factor = nextUnit === "cm" ? 2.54 : 1 / 2.54;
      state.unit = nextUnit;
      state.finishedSquareSize = Math.round(state.finishedSquareSize * factor * 100) / 100;
      state.seamAllowance = Math.round(state.seamAllowance * factor * 100) / 100;

      finishedSizeInput.value = String(state.finishedSquareSize);
      seamAllowanceInput.value = String(state.seamAllowance);
      finishedSizeInput.step = nextUnit === "cm" ? "0.5" : "0.25";
      seamAllowanceInput.step = nextUnit === "cm" ? "0.1" : "0.125";

      unitLabels.forEach((el) => {
        el.textContent = nextUnit;
      });
      unitBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.unit === nextUnit));

      updateQuiltDimensions();
    });
  });

  paletteSizeSlider.addEventListener("input", () => {
    if (!state.samplePixels) return;
    const targetColors = Number(paletteSizeSlider.value);
    state.palette = extractPalette(state.samplePixels, targetColors);
    renderPaletteSwatches();
    renderQuilt();
  });

  resetPaletteBtn.addEventListener("click", () => {
    if (!state.samplePixels) return;
    const targetColors = Number(paletteSizeSlider.value);
    state.palette = extractPalette(state.samplePixels, targetColors);
    renderPaletteSwatches();
    renderQuilt();
  });

  addColorBtn.addEventListener("click", () => {
    if (state.palette.length >= 24) return;
    state.palette.push({
      id: state.nextColorId++,
      r: 245,
      g: 242,
      b: 235,
    });
    if (state.palette.length <= Number(paletteSizeSlider.max)) {
      paletteSizeSlider.value = String(state.palette.length);
    }
    renderPaletteSwatches();
    renderQuilt();
  });

  // --- Boutique Printable PDF Pattern Booklet Export ---

  let cachedPdfFonts = null;

  async function loadPdfFonts() {
    if (cachedPdfFonts) return cachedPdfFonts;
    const files = [
      { key: "serif", path: "fonts/DMSerifDisplay-Regular.ttf", vfs: "DMSerifDisplay-Regular.ttf", family: "DMSerif", style: "normal" },
      { key: "sansReg", path: "fonts/PlusJakartaSans-Regular.ttf", vfs: "PlusJakartaSans-Regular.ttf", family: "Jakarta", style: "normal" },
      { key: "sansBold", path: "fonts/PlusJakartaSans-Bold.ttf", vfs: "PlusJakartaSans-Bold.ttf", family: "Jakarta", style: "bold" },
      { key: "mono", path: "fonts/JetBrainsMono-SemiBold.ttf", vfs: "JetBrainsMono-SemiBold.ttf", family: "JetMono", style: "bold" },
    ];
    try {
      const loaded = await Promise.all(
        files.map(async (f) => {
          const resp = await fetch(f.path);
          if (!resp.ok) throw new Error(`Font fetch failed: ${f.path}`);
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          return { ...f, base64: btoa(binary) };
        })
      );
      cachedPdfFonts = loaded;
      return loaded;
    } catch {
      return null;
    }
  }

  let cachedBrandIconDataUrl = null;

  function loadPdfBrandIcon() {
    if (cachedBrandIconDataUrl) return Promise.resolve(cachedBrandIconDataUrl);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = 192;
        const r = 36;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(size - r, 0);
        ctx.quadraticCurveTo(size, 0, size, r);
        ctx.lineTo(size, size - r);
        ctx.quadraticCurveTo(size, size, size - r, size);
        ctx.lineTo(r, size);
        ctx.quadraticCurveTo(0, size, 0, size - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 0, 0, size, size);
        cachedBrandIconDataUrl = c.toDataURL("image/png");
        resolve(cachedBrandIconDataUrl);
      };
      img.onerror = () => resolve(null);
      img.src = "icon-192-v2.png";
    });
  }

  function registerPdfFonts(doc, fontList) {
    if (!fontList) {
      return { serif: "times", sans: "helvetica", mono: "courier" };
    }
    fontList.forEach((f) => {
      doc.addFileToVFS(f.vfs, f.base64);
      doc.addFont(f.vfs, f.family, f.style);
      if (f.family === "DMSerif") {
        doc.addFont(f.vfs, f.family, "bold");
      }
      if (f.family === "JetMono") {
        doc.addFont(f.vfs, f.family, "normal");
      }
    });
    return { serif: "DMSerif", sans: "Jakarta", mono: "JetMono" };
  }

  function formatPdfMeasure(value, unit) {
    const raw = formatMeasure(value, unit);
    // Upgrade 1/4, 1/2, 3/4 to true typographic vulgar fractions (supported in Latin-1 & Jakarta)
    return raw
      .replace(/\b1\/4"/g, "\u00bc\"")
      .replace(/\b1\/2"/g, "\u00bd\"")
      .replace(/\b3\/4"/g, "\u00be\"")
      .replace(/ (\u00bc|\u00bd|\u00be)"/g, "$1\"");
  }

  function formatPdfYardage(str) {
    return str
      .replace(/\b1\/4 yd/g, "\u00bc yd")
      .replace(/\b1\/2 yd/g, "\u00bd yd")
      .replace(/\b3\/4 yd/g, "\u00be yd")
      .replace(/ (\u00bc|\u00bd|\u00be) yd/g, "$1 yd");
  }

  function calculateFatQuarterFit(squareCount) {
    const unit = state.unit;
    const cutSize = Math.max(0.1, state.finishedSquareSize) + 2 * Math.max(0, state.seamAllowance);
    // Standard Fat Quarter: 18" x 21" (45 cm x 52 cm)
    const fqW = unit === "in" ? 18 : 45;
    const fqH = unit === "in" ? 21 : 52;
    const perFq = Math.floor(fqW / cutSize) * Math.floor(fqH / cutSize);
    const neededWithBuffer = Math.ceil(squareCount * (1 + FABRIC_BUFFER));
    const fitsOneFq = squareCount > 0 && perFq >= neededWithBuffer;
    return { perFq, fitsOneFq, fqLabel: unit === "in" ? '18"\u00d721"' : "45\u00d752 cm" };
  }

  function detectPrecutNote(cutSize, unit) {
    if (unit !== "in") return null;
    const eps = 0.02;
    if (Math.abs(cutSize - 2.5) < eps) {
      return 'Pre-cut friendly! Your 2\u00bd" cut squares match standard 2\u00bd" Jelly Roll strips and Mini Charm Packs.';
    }
    if (Math.abs(cutSize - 5.0) < eps) {
      return 'Pre-cut friendly! Your 5" cut squares match standard 5" Charm Packs with zero sub-cutting.';
    }
    if (Math.abs(cutSize - 10.0) < eps) {
      return 'Pre-cut friendly! Your 10" cut squares match standard 10" Layer Cake squares.';
    }
    if (cutSize <= 5.0) {
      const perTen = Math.floor(10 / cutSize) * Math.floor(10 / cutSize);
      return `Stash tip: Accent colors with few squares can be cut from Fat Quarters (18"\u00d721") or 10" Layer Cake squares (${perTen} sq each).`;
    }
    return null;
  }

  function drawPressArrow(doc, x, y, width, pointRight, color = [90, 82, 72]) {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.014);
    const x1 = x;
    const x2 = x + width;
    doc.line(x1, y, x2, y);
    const head = 0.042;
    if (pointRight) {
      doc.line(x2, y, x2 - head, y - head * 0.68);
      doc.line(x2, y, x2 - head, y + head * 0.68);
    } else {
      doc.line(x1, y, x1 + head, y - head * 0.68);
      doc.line(x1, y, x1 + head, y + head * 0.68);
    }
  }

  function drawCodeBadge(doc, fonts, x, y, w, h, code, r, g, b) {
    doc.setFillColor(r, g, b);
    doc.setDrawColor(120, 112, 102);
    doc.setLineWidth(0.008);
    doc.roundedRect(x, y, w, h, 0.04, 0.04, "FD");
    const isLight = luminance(r, g, b) > 145;
    doc.setTextColor(isLight ? 28 : 255, isLight ? 25 : 255, isLight ? 20 : 255);
    doc.setFont(fonts.mono, "bold");
    doc.setFontSize(8.5);
    doc.text(code, x + w / 2, y + h * 0.68, { align: "center" });
  }

  function fitSingleLine(doc, text, maxW) {
    if (doc.getTextWidth(text) <= maxW) return text;
    let trimmed = text;
    while (trimmed.length > 1 && doc.getTextWidth(trimmed + "\u2026") > maxW) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed + "\u2026";
  }

  function drawWofCuttingDiagram(doc, fonts, x, y, w, cutMeasureStr, wofMeasureStr, sqPerStrip) {
    // Open editorial section (no heavy outer box — clean hairline top rule + airy whitespace)
    doc.setDrawColor(215, 206, 191);
    doc.setLineWidth(0.01);
    doc.line(x, y, x + w, y);

    doc.setFont(fonts.serif, "normal");
    doc.setFontSize(12.5);
    doc.setTextColor(34, 31, 26);
    doc.text("How to Cut from Yardage", x, y + 0.24);

    // Two clean side-by-side step callouts (never wraps past edge!)
    const colGap = 0.28;
    const colW = (w - colGap) / 2;
    doc.setFont(fonts.sans, "normal");
    doc.setFontSize(8);
    const s1Lines = doc.splitTextToSize(
      `Cut ${cutMeasureStr} strips across the full ${wofMeasureStr} Width of Fabric (selvage to selvage).`,
      colW - 0.26
    );
    const s2Lines = doc.splitTextToSize(
      `Trim selvages, then sub-cut each strip into ${sqPerStrip} precision ${cutMeasureStr} \u00d7 ${cutMeasureStr} squares.`,
      colW - 0.26
    );
    const stepsH = Math.max(s1Lines.length, s2Lines.length) * 0.16;

    // Step 1
    doc.setFont(fonts.mono, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(184, 77, 44);
    doc.text("01", x, y + 0.44);
    doc.setFont(fonts.sans, "normal");
    doc.setFontSize(8);
    doc.setTextColor(70, 65, 58);
    doc.text(s1Lines, x + 0.24, y + 0.44);

    // Step 2
    const c2X = x + colW + colGap;
    doc.setFont(fonts.mono, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(184, 77, 44);
    doc.text("02", c2X, y + 0.44);
    doc.setFont(fonts.sans, "normal");
    doc.setFontSize(8);
    doc.setTextColor(70, 65, 58);
    doc.text(s2Lines, c2X + 0.24, y + 0.44);

    // Proportional horizontal fabric strip diagram
    const sx = x + 0.04;
    const sy = y + 0.48 + stepsH + 0.06;
    const sw = w - 0.08;
    const sh = 0.44;
    const selvW = 0.24;

    // Left selvage
    doc.setFillColor(232, 225, 214);
    doc.setDrawColor(175, 166, 152);
    doc.setLineWidth(0.008);
    doc.rect(sx, sy, selvW, sh, "FD");

    // Usable strip divided into sub-cut squares
    const usableW = sw - selvW * 2;
    const numBoxes = Math.min(12, Math.max(6, sqPerStrip));
    const boxW = usableW / numBoxes;
    for (let i = 0; i < numBoxes; i++) {
      const bx = sx + selvW + i * boxW;
      doc.setFillColor(i === 0 ? 243 : 250, i === 0 ? 221 : 247, i === 0 ? 210 : 240);
      doc.setDrawColor(184, 77, 44);
      doc.setLineWidth(0.008);
      doc.rect(bx, sy, boxW, sh, "FD");
    }

    // Right selvage
    doc.setFillColor(232, 225, 214);
    doc.setDrawColor(175, 166, 152);
    doc.rect(sx + sw - selvW, sy, selvW, sh, "FD");

    // Dashed rotary cut marks on first square
    doc.setDrawColor(184, 77, 44);
    doc.setLineWidth(0.012);
    doc.setLineDashPattern([0.04, 0.03], 0);
    doc.line(sx + selvW, sy - 0.06, sx + selvW, sy + sh + 0.06);
    doc.line(sx + selvW + boxW, sy - 0.06, sx + selvW + boxW, sy + sh + 0.06);
    doc.setLineDashPattern([], 0);

    // Crisp dimension labels
    doc.setFont(fonts.mono, "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(184, 77, 44);
    doc.text(cutMeasureStr, sx + selvW + boxW / 2, sy + sh / 2 + 0.035, { align: "center" });

    // Bracket line beneath usable WOF
    const brY = sy + sh + 0.1;
    doc.setDrawColor(150, 142, 130);
    doc.setLineWidth(0.007);
    doc.line(sx + selvW, brY, sx + sw - selvW, brY);
    doc.line(sx + selvW, brY - 0.03, sx + selvW, brY + 0.03);
    doc.line(sx + sw - selvW, brY - 0.03, sx + sw - selvW, brY + 0.03);

    doc.setFont(fonts.sans, "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(108, 100, 88);
    doc.text("Selvage", sx + selvW / 2, brY + 0.13, { align: "center" });
    doc.text(`Usable Width of Fabric (${wofMeasureStr}) \u00b7 ${sqPerStrip} squares per strip`, sx + sw / 2, brY + 0.13, { align: "center" });
    doc.text("Selvage", sx + sw - selvW / 2, brY + 0.13, { align: "center" });

    return brY + 0.24 - y;
  }

  function drawNestingDiagram(doc, fonts, x, y, w, h) {
    doc.setFillColor(250, 248, 244);
    doc.setDrawColor(215, 206, 191);
    doc.setLineWidth(0.01);
    doc.roundedRect(x, y, w, h, 0.06, 0.06, "FD");

    doc.setFont(fonts.sans, "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(34, 31, 26);
    doc.text("Nesting Seams", x + w / 2, y + 0.2, { align: "center" });

    // Top row (Odd -> pressed LEFT)
    const midX = x + w / 2;
    const r1Y = y + 0.42;
    doc.setDrawColor(58, 107, 124);
    doc.setLineWidth(0.022);
    doc.line(x + 0.22, r1Y, midX - 0.02, r1Y);
    doc.line(midX + 0.02, r1Y, x + w - 0.22, r1Y);
    // Seam allowance folded left
    doc.line(midX, r1Y, midX - 0.2, r1Y + 0.09);
    drawPressArrow(doc, x + 0.24, r1Y - 0.09, 0.26, false, [58, 107, 124]);
    doc.setFont(fonts.sans, "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(58, 107, 124);
    doc.text("Odd row (press L)", x + w - 0.22, r1Y - 0.06, { align: "right" });

    // Bottom row (Even -> pressed RIGHT)
    const r2Y = y + 0.72;
    doc.setDrawColor(184, 77, 44);
    doc.setLineWidth(0.022);
    doc.line(x + 0.22, r2Y, midX - 0.02, r2Y);
    doc.line(midX + 0.02, r2Y, x + w - 0.22, r2Y);
    // Seam allowance folded right
    doc.line(midX, r2Y, midX + 0.2, r2Y - 0.09);
    drawPressArrow(doc, x + w - 0.5, r2Y + 0.11, 0.26, true, [184, 77, 44]);
    doc.setTextColor(184, 77, 44);
    doc.text("Even row (press R)", x + 0.22, r2Y + 0.14);

    doc.setFont(fonts.sans, "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(108, 100, 88);
    doc.text("Opposing folds lock corners flat", midX, y + h - 0.08, { align: "center" });
  }

  function drawKeyMapLocator(doc, fonts, x, y, maxW, maxH, colChunks, rowChunks, activeCc, activeRc, sectionNum) {
    const aspect = (state.cols || 1) / (state.rows || 1);
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    const ox = x + (maxW - w);
    const oy = y + (maxH - h) / 2;
    const cw = w / colChunks;
    const ch = h / rowChunks;

    for (let r = 0; r < rowChunks; r++) {
      for (let c = 0; c < colChunks; c++) {
        const isCurrent = r === activeRc && c === activeCc;
        doc.setFillColor(isCurrent ? 184 : 239, isCurrent ? 77 : 233, isCurrent ? 44 : 223);
        doc.setDrawColor(120, 112, 102);
        doc.setLineWidth(0.008);
        doc.rect(ox + c * cw, oy + r * ch, cw, ch, "FD");
        if (isCurrent) {
          doc.setFont(fonts.mono, "bold");
          doc.setFontSize(Math.min(7.5, Math.max(5, Math.min(cw, ch) * 32)));
          doc.setTextColor(255, 255, 255);
          doc.text(String(sectionNum), ox + (c + 0.5) * cw, oy + (r + 0.65) * ch, { align: "center" });
        }
      }
    }
    doc.setDrawColor(34, 31, 26);
    doc.setLineWidth(0.014);
    doc.rect(ox, oy, w, h, "S");
  }

  function buildMockupDataUrl({ grayscale = false } = {}) {
    const cols = state.cols;
    const rows = state.rows;
    const maxDim = grayscale ? 420 : 960;
    const sq = Math.max(4, Math.floor(maxDim / Math.max(cols, rows)));
    const off = document.createElement("canvas");
    off.width = cols * sq;
    off.height = rows * sq;
    const ctx = off.getContext("2d");

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pal = state.palette[state.gridAssignments[r * cols + c]];
        if (grayscale) {
          const lum = Math.round(luminance(pal.r, pal.g, pal.b));
          ctx.fillStyle = `rgb(${lum}, ${lum}, ${lum})`;
        } else {
          ctx.fillStyle = `rgb(${pal.r}, ${pal.g}, ${pal.b})`;
        }
        ctx.fillRect(c * sq, r * sq, sq, sq);
      }
    }

    if (sq >= 6) {
      ctx.strokeStyle = grayscale ? "rgba(0, 0, 0, 0.14)" : "rgba(25, 22, 18, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < cols; c++) {
        const x = c * sq + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, off.height);
      }
      for (let r = 1; r < rows; r++) {
        const y = r * sq + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(off.width, y);
      }
      ctx.stroke();
    }

    return {
      dataUrl: off.toDataURL("image/png"),
      width: off.width,
      height: off.height,
    };
  }

  async function exportPdfPattern() {
    if (!state.image || state.palette.length === 0 || state.gridAssignments.length === 0) return;

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF export library is still loading or unavailable offline. Please check your connection and try again.");
      return;
    }

    exportPdfBtn.disabled = true;
    const originalBtnHtml = exportPdfBtn.innerHTML;
    exportPdfBtn.textContent = "Preparing Booklet...";

    try {
      const [fontData, brandIconDataUrl] = await Promise.all([loadPdfFonts(), loadPdfBrandIcon()]);
      const { jsPDF } = window.jspdf;
      const isA4 = pageSizeSelect.value === "a4";
      const assemblyMode = assemblyModeSelect ? assemblyModeSelect.value : "rows";
      const isBlockMode = assemblyMode === "blocks";
      const BLOCK_SIZE = 8;

      const doc = new jsPDF({ orientation: "portrait", unit: "in", format: isA4 ? "a4" : "letter" });
      doc.setLineHeightFactor(1.42);
      const fonts = registerPdfFonts(doc, fontData);

      const pageW = isA4 ? 8.27 : 8.5;
      const pageH = isA4 ? 11.69 : 11.0;
      const margin = 0.55;
      const contentW = pageW - margin * 2;

      const unit = state.unit;
      const cols = state.cols;
      const rows = state.rows;
      const finished = Math.max(0.1, state.finishedSquareSize);
      const seam = Math.max(0, state.seamAllowance);
      const cutSize = finished + 2 * seam;
      const quiltW = cols * finished;
      const quiltH = rows * finished;
      const wof = getUsableWof(unit);

      const customTitle = patternTitleInput ? patternTitleInput.value.trim() : "";
      const title = customTitle || derivePatternTitle(state.fileName) || "Custom Pixel Quilt";

      // Build active color list (skipping any palette colors with 0 assigned squares)
      const activeColors = state.palette
        .map((color, idx) => {
          const count = state.usageCounts[idx] || 0;
          const match = getFabricCatalogMatch(color.r, color.g, color.b);
          const fq = calculateFatQuarterFit(count);
          return {
            index: idx,
            code: getFabricCode(idx),
            name: match.name,
            match,
            fq,
            hex: rgbToHex(color.r, color.g, color.b).toUpperCase(),
            r: color.r,
            g: color.g,
            b: color.b,
            count,
            fabric: calculateColorFabric(count),
          };
        })
        .filter((c) => c.count > 0);

      // Map palette index -> stable fabric letter (A, B, C...) matching the UI swatches
      const codeByPaletteIndex = new Map();
      state.palette.forEach((_, idx) => {
        codeByPaletteIndex.set(idx, getFabricCode(idx));
      });

      const drawRunningHeader = (sectionNumStr, sectionLabel) => {
        // Warm pill eyebrow
        doc.setFillColor(246, 242, 235);
        doc.setDrawColor(223, 214, 199);
        doc.setLineWidth(0.008);
        doc.roundedRect(margin, 0.42, 2.32, 0.24, 0.05, 0.05, "FD");

        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(7.2);
        doc.setTextColor(184, 77, 44);
        doc.text(`${sectionNumStr} \u00b7 ${sectionLabel}`, margin + 0.1, 0.58);

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(135, 127, 115);
        doc.text(fitSingleLine(doc, title.toUpperCase(), contentW - 2.5), pageW - margin, 0.58, { align: "right" });

        doc.setDrawColor(228, 221, 210);
        doc.setLineWidth(0.008);
        doc.line(margin, 0.74, pageW - margin, 0.74);
      };

      const sectionPages = {
        cutting: 2,
        shopping: 3,
        map: 4,
        assembly: 5,
        tags: 6,
      };

      // ================= PAGE 1: BOUTIQUE MAGAZINE COVER =================
      // Subtle warm header band
      doc.setFillColor(246, 242, 235);
      doc.rect(0, 0, pageW, 1.95, "F");
      doc.setDrawColor(223, 214, 199);
      doc.setLineWidth(0.01);
      doc.line(0, 1.95, pageW, 1.95);

      // Patchwork quilt-star brand icon on cover
      const embX = margin;
      const embY = 0.44;
      const embSize = 0.44;
      if (brandIconDataUrl) {
        doc.addImage(brandIconDataUrl, "PNG", embX, embY, embSize, embSize);
      }

      const eyebrowX = brandIconDataUrl ? embX + embSize + 0.14 : embX;
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(8);
      doc.setTextColor(184, 77, 44);
      doc.text("MIRIAM'S QUILTCASTER  \u00b7  CUSTOM PIXEL QUILT PATTERN", eyebrowX, 0.7);

      // Editorial Serif Title
      doc.setFont(fonts.serif, "normal");
      doc.setFontSize(26);
      doc.setTextColor(34, 31, 26);
      const titleLines = doc.splitTextToSize(title, contentW);
      doc.text(titleLines[0], margin, 1.18);

      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(10);
      doc.setTextColor(108, 100, 88);
      const subSummary = `Finished Quilt: ${formatPdfMeasure(quiltW, unit)} \u00d7 ${formatPdfMeasure(quiltH, unit)}   \u00b7   ${(cols * rows).toLocaleString()} Squares   \u00b7   ${activeColors.length} Solid Fabrics`;
      doc.text(subSummary, margin, 1.48);

      // Terracotta accent rule
      doc.setDrawColor(184, 77, 44);
      doc.setLineWidth(0.025);
      doc.line(margin, 1.66, margin + 0.85, 1.66);

      // Clean 6-stat specification ribbon
      const specY = 2.15;
      const specH = 0.96;
      doc.setFillColor(252, 250, 247);
      doc.setDrawColor(223, 214, 199);
      doc.setLineWidth(0.01);
      doc.roundedRect(margin, specY, contentW, specH, 0.07, 0.07, "FD");

      const coverStats = [
        ["FINISHED QUILT", `${formatPdfMeasure(quiltW, unit)} \u00d7 ${formatPdfMeasure(quiltH, unit)}`],
        ["GRID DIMENSIONS", `${cols} cols \u00d7 ${rows} rows`],
        ["FINISHED SQUARE", `${formatPdfMeasure(finished, unit)} \u00d7 ${formatPdfMeasure(finished, unit)}`],
        ["CUT SQUARE SIZE", `${formatPdfMeasure(cutSize, unit)} \u00d7 ${formatPdfMeasure(cutSize, unit)}`],
        ["SEAM ALLOWANCE", formatPdfMeasure(seam, unit)],
        ["ASSEMBLY STYLE", isBlockMode ? "8\u00d78 Sub-Blocks" : "Row-by-Row"],
      ];

      const specColW = contentW / 3;
      coverStats.forEach(([lbl, val], idx) => {
        const c = idx % 3;
        const r = Math.floor(idx / 3);
        const sx = margin + 0.18 + c * specColW;
        const sy = specY + 0.25 + r * 0.44;
        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(135, 127, 115);
        doc.text(lbl, sx, sy);
        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(10);
        doc.setTextColor(34, 31, 26);
        doc.text(val, sx, sy + 0.17);
      });

      // Spacious Gallery-Framed Hero Mockup
      const mockup = buildMockupDataUrl({ grayscale: false });
      const grayMockup = buildMockupDataUrl({ grayscale: true });
      const bottomStripH = 1.65;
      const heroTop = specY + specH + 0.28;
      const heroAvailH = pageH - heroTop - bottomStripH - 0.72;
      const heroAvailW = contentW - 0.2;
      const imgAspect = mockup.width / mockup.height;
      let drawW = heroAvailW;
      let drawH = drawW / imgAspect;
      if (drawH > heroAvailH) {
        drawH = heroAvailH;
        drawW = drawH * imgAspect;
      }
      const imgX = margin + (contentW - drawW) / 2;
      const imgY = heroTop + (heroAvailH - drawH) / 2;

      // Gallery mat frame
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(210, 200, 184);
      doc.setLineWidth(0.014);
      doc.roundedRect(imgX - 0.1, imgY - 0.1, drawW + 0.2, drawH + 0.2, 0.05, 0.05, "FD");
      doc.addImage(mockup.dataUrl, "PNG", imgX, imgY, drawW, drawH);

      // Bottom Cover Strip: Left = Grayscale Value Check (B3) | Right = Clickable Table of Contents (A4)
      const stripY = pageH - 0.55 - bottomStripH;
      const valCardW = 2.65;
      doc.setFillColor(246, 242, 235);
      doc.setDrawColor(223, 214, 199);
      doc.setLineWidth(0.01);
      doc.roundedRect(margin, stripY, valCardW, bottomStripH, 0.07, 0.07, "FD");

      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(34, 31, 26);
      doc.text("VALUE & CONTRAST CHECK", margin + 0.14, stripY + 0.22);

      // Fit grayscale thumbnail inside value card
      const gMaxW = 1.15;
      const gMaxH = bottomStripH - 0.42;
      let gw = gMaxW;
      let gh = gw / imgAspect;
      if (gh > gMaxH) {
        gh = gMaxH;
        gw = gh * imgAspect;
      }
      doc.setDrawColor(160, 152, 140);
      doc.setLineWidth(0.008);
      doc.rect(margin + 0.14, stripY + 0.32, gw, gh, "S");
      doc.addImage(grayMockup.dataUrl, "PNG", margin + 0.14, stripY + 0.32, gw, gh);

      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(108, 100, 88);
      const valNotes = doc.splitTextToSize(
        "Viewing your quilt in grayscale confirms light/dark value contrast when swapping fabrics.",
        valCardW - gw - 0.36
      );
      doc.text(valNotes, margin + gw + 0.24, stripY + 0.45);

      // Right card placeholder coords for Interactive TOC (filled once exact page numbers are known)
      const tocX = margin + valCardW + 0.2;
      const tocW = contentW - valCardW - 0.2;
      doc.setFillColor(252, 250, 247);
      doc.setDrawColor(223, 214, 199);
      doc.roundedRect(tocX, stripY, tocW, bottomStripH, 0.07, 0.07, "FD");

      // ================= PAGE 2: 01 · MATERIALS, CUTTING & SCALE CHECK =================
      doc.addPage();
      sectionPages.cutting = doc.getNumberOfPages();
      let curY = 1.05;

      const drawCuttingPageHeader = (isCont) => {
        drawRunningHeader("01", "MATERIALS & CUTTING");
        doc.setFont(fonts.serif, "normal");
        doc.setFontSize(18);
        doc.setTextColor(34, 31, 26);
        doc.text(
          isCont ? "Materials & WOF Cutting Chart (cont.)" : "Fabric Requirements & Cutting Chart",
          margin,
          curY
        );
        curY += 0.22;

        if (!isCont) {
          doc.setFont(fonts.sans, "normal");
          doc.setFontSize(8.6);
          doc.setTextColor(108, 100, 88);
          const cutIntroLines = doc.splitTextToSize(
            `Cut ${formatPdfMeasure(cutSize, unit)} \u00d7 ${formatPdfMeasure(cutSize, unit)} squares (includes ${formatPdfMeasure(seam, unit)} seam allowance). Yardage includes +10% safety buffer on ${formatPdfMeasure(wof, unit)} WOF.`,
            contentW
          );
          doc.text(cutIntroLines, margin, curY);
          curY += cutIntroLines.length * 0.15 + 0.06;

          const precutMsg = detectPrecutNote(cutSize, unit);
          if (precutMsg) {
            doc.setFont(fonts.sans, "bold");
            doc.setFontSize(7.8);
            const precutLines = doc.splitTextToSize(precutMsg, contentW - 0.24);
            const bannerH = precutLines.length * 0.145 + 0.13;
            doc.setFillColor(251, 243, 238);
            doc.setDrawColor(228, 192, 176);
            doc.setLineWidth(0.008);
            doc.roundedRect(margin, curY, contentW, bannerH, 0.05, 0.05, "FD");
            doc.setTextColor(184, 77, 44);
            doc.text(precutLines, margin + 0.12, curY + 0.17);
            curY += bannerH + 0.09;
          } else {
            curY += 0.06;
          }
        } else {
          curY += 0.1;
        }

        // Editorial light table header (warm parchment band + crisp bottom rule)
        doc.setFillColor(239, 233, 223);
        doc.rect(margin, curY, contentW, 0.28, "F");
        doc.setDrawColor(34, 31, 26);
        doc.setLineWidth(0.012);
        doc.line(margin, curY + 0.28, margin + contentW, curY + 0.28);
        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(7.2);
        doc.setTextColor(92, 84, 73);
        doc.text("CODE", margin + 0.08, curY + 0.18);
        doc.text("SWATCH", margin + 0.58, curY + 0.18);
        doc.text("TAPE FABRIC", margin + 1.14, curY + 0.18);
        doc.text("COLOR NAME", margin + 2.12, curY + 0.18);
        doc.text("SQUARES", margin + 3.75, curY + 0.18, { align: "right" });
        doc.text(`CUTTING (${formatPdfMeasure(cutSize, unit)} STRIPS)`, margin + 3.92, curY + 0.18);
        doc.text("NEED", margin + contentW - 0.1, curY + 0.18, { align: "right" });
        curY += 0.31;
      };

      drawCuttingPageHeader(false);

      const cutRowH = 0.42;
      activeColors.forEach((c, idx) => {
        if (curY + cutRowH > pageH - 0.7) {
          doc.addPage();
          curY = 1.05;
          drawCuttingPageHeader(true);
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 245, 239);
          doc.rect(margin, curY, contentW, cutRowH, "F");
        }

        drawCodeBadge(doc, fonts, margin + 0.08, curY + 0.09, 0.36, 0.24, c.code, c.r, c.g, c.b);

        doc.setFillColor(c.r, c.g, c.b);
        doc.setDrawColor(140, 132, 120);
        doc.setLineWidth(0.008);
        doc.roundedRect(margin + 0.58, curY + 0.08, 0.42, 0.26, 0.03, 0.03, "FD");

        doc.setDrawColor(180, 172, 160);
        doc.setLineDashPattern([0.04, 0.03], 0);
        doc.roundedRect(margin + 1.14, curY + 0.06, 0.84, 0.3, 0.03, 0.03, "S");
        doc.setLineDashPattern([], 0);

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(8.8);
        doc.setTextColor(34, 31, 26);
        doc.text(fitSingleLine(doc, c.name, 1.12), margin + 2.12, curY + 0.25);

        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(8.6);
        doc.text(String(c.count), margin + 3.75, curY + 0.25, { align: "right" });

        const cutColMaxW = contentW - 4.72;
        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(8.1);
        doc.setTextColor(70, 65, 58);
        const stripTxt = `${c.fabric.strips} WOF strip${c.fabric.strips === 1 ? "" : "s"} (${c.fabric.squaresPerStrip}/strip)`;
        doc.text(fitSingleLine(doc, stripTxt, cutColMaxW), margin + 3.92, curY + 0.2);
        if (c.fq.fitsOneFq) {
          doc.setFont(fonts.sans, "bold");
          doc.setFontSize(6.9);
          doc.setTextColor(58, 107, 124);
          doc.text(fitSingleLine(doc, `or 1 Fat Quarter (${c.fq.fqLabel}, yields ${c.fq.perFq})`, cutColMaxW), margin + 3.92, curY + 0.34);
        }

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(8.8);
        doc.setTextColor(184, 77, 44);
        doc.text(formatPdfYardage(c.fabric.formatted), margin + contentW - 0.1, curY + 0.25, { align: "right" });

        doc.setDrawColor(234, 228, 218);
        doc.setLineWidth(0.006);
        doc.line(margin, curY + cutRowH, margin + contentW, curY + cutRowH);
        curY += cutRowH;
      });

      // Backing & Binding + Full-Width WOF Strip Diagram + Full-Width 1:1 Cut Template Card
      const extras = calculateBackingAndBinding();
      const sampleSqPerStrip = Math.max(1, Math.floor(wof / cutSize));

      // 1) Editorial 2-column Finishing Fabrics strip (open typography, no heavy box)
      const finishStripH = 0.62;
      if (curY + finishStripH + 0.16 > pageH - 0.65) {
        doc.addPage();
        drawRunningHeader("01", "MATERIALS & CUTTING");
        curY = 1.0;
      } else {
        curY += 0.18;
      }

      doc.setFillColor(248, 245, 239);
      doc.rect(margin, curY, contentW, finishStripH, "F");
      doc.setDrawColor(215, 206, 191);
      doc.setLineWidth(0.008);
      doc.line(margin, curY, margin + contentW, curY);
      doc.line(margin, curY + finishStripH, margin + contentW, curY + finishStripH);

      const halfW = contentW / 2;
      doc.line(margin + halfW, curY + 0.1, margin + halfW, curY + finishStripH - 0.1);

      // Left column: Binding
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(135, 127, 115);
      doc.text("BINDING FABRIC", margin + 0.14, curY + 0.2);
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(9.2);
      doc.setTextColor(184, 77, 44);
      doc.text(formatPdfYardage(extras.bindingAmount), margin + 0.14, curY + 0.41);
      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(90, 82, 72);
      doc.text(
        `${extras.bindingStrips} strips at ${formatPdfMeasure(extras.bindingStripW, unit)} wide`,
        margin + 0.92,
        curY + 0.41
      );

      // Right column: Backing
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(135, 127, 115);
      doc.text("BACKING FABRIC", margin + halfW + 0.16, curY + 0.2);
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(9.2);
      doc.setTextColor(184, 77, 44);
      doc.text(formatPdfYardage(extras.backingAmount), margin + halfW + 0.16, curY + 0.41);
      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(90, 82, 72);
      doc.text(
        `${extras.backingPanels} WOF panel${extras.backingPanels === 1 ? "" : "s"} (+${unit === "in" ? '8"' : "20 cm"} margin)`,
        margin + halfW + 0.96,
        curY + 0.41
      );
      curY += finishStripH + 0.24;

      // 2) Open Editorial WOF Strip-Cutting Guide
      const estWofH = 1.5;
      if (curY + estWofH > pageH - 0.65) {
        doc.addPage();
        drawRunningHeader("01", "MATERIALS & CUTTING");
        curY = 1.0;
      }
      const actualWofH = drawWofCuttingDiagram(
        doc,
        fonts,
        margin,
        curY,
        contentW,
        formatPdfMeasure(cutSize, unit),
        formatPdfMeasure(wof, unit),
        sampleSqPerStrip
      );
      curY += actualWofH + 0.2;

      // 3) Architectural 1:1 Cut-Square Template & Printer Scale Check (open editorial layout)
      const cutSizeIn = unit === "in" ? cutSize : cutSize / 2.54;
      const finishedIn = unit === "in" ? finished : finished / 2.54;
      const useCutSquare = cutSizeIn <= 3.5;
      const fallbackSize = unit === "in" ? 1 : 2 / 2.54;
      const tsSize = useCutSquare ? cutSizeIn : fallbackSize;
      const tsSectionH = Math.max(1.55, tsSize + 0.45);

      if (curY + tsSectionH > pageH - 0.65) {
        doc.addPage();
        drawRunningHeader("01", "MATERIALS & CUTTING");
        curY = 1.0;
      }

      // Clean hairline top divider
      doc.setDrawColor(215, 206, 191);
      doc.setLineWidth(0.01);
      doc.line(margin, curY, margin + contentW, curY);

      const sqX = margin + 0.04;
      const sqY = curY + 0.38;

      // Architectural top dimension bracket above the square
      const tsExpected = useCutSquare
        ? `${formatPdfMeasure(cutSize, unit)}`
        : unit === "in" ? '1"' : "2 cm";
      const dimY = sqY - 0.1;
      doc.setDrawColor(140, 132, 120);
      doc.setLineWidth(0.007);
      doc.line(sqX, dimY, sqX + tsSize, dimY);
      doc.line(sqX, dimY - 0.035, sqX, dimY + 0.035);
      doc.line(sqX + tsSize, dimY - 0.035, sqX + tsSize, dimY + 0.035);
      doc.setFont(fonts.mono, "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(34, 31, 26);
      doc.text(
        useCutSquare ? `${tsExpected} cut` : `${tsExpected} scale check`,
        sqX + tsSize / 2,
        dimY - 0.05,
        { align: "center" }
      );

      // Outer solid cut square (subtle crisp stroke)
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(34, 31, 26);
      doc.setLineWidth(0.015);
      doc.rect(sqX, sqY, tsSize, tsSize, "FD");

      // Inner finished square shaded softly in warm linen with dashed terracotta seam line
      if (useCutSquare && seam > 0) {
        const inset = (cutSizeIn - finishedIn) / 2;
        doc.setFillColor(246, 242, 235);
        doc.setDrawColor(184, 77, 44);
        doc.setLineWidth(0.01);
        doc.setLineDashPattern([0.05, 0.035], 0);
        doc.rect(sqX + inset, sqY + inset, finishedIn, finishedIn, "FD");
        doc.setLineDashPattern([], 0);
      }

      // Clean centered spec inside the square
      const sqMidX = sqX + tsSize / 2;
      const sqMidY = sqY + tsSize / 2;
      if (useCutSquare && tsSize >= 1.6) {
        doc.setFont(fonts.serif, "normal");
        doc.setFontSize(12);
        doc.setTextColor(34, 31, 26);
        doc.text(`${formatPdfMeasure(finished, unit)} finished`, sqMidX, sqMidY - 0.02, { align: "center" });
        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(7.2);
        doc.setTextColor(184, 77, 44);
        doc.text(`${formatPdfMeasure(seam, unit)} seam allowance`, sqMidX, sqMidY + 0.16, { align: "center" });
      } else {
        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(8);
        doc.setTextColor(34, 31, 26);
        doc.text(tsExpected, sqMidX, sqMidY + 0.03, { align: "center" });
      }

      // Right side: Editorial Serif heading + airy bulleted verification checklist
      const noteX = sqX + tsSize + 0.36;
      const noteW = margin + contentW - noteX;
      let ny = curY + 0.32;

      doc.setFont(fonts.serif, "normal");
      doc.setFontSize(13.5);
      doc.setTextColor(34, 31, 26);
      doc.text(
        useCutSquare ? "1:1 Cut Template & Scale Check" : "Printer Scale Verification",
        noteX,
        ny
      );
      ny += 0.22;

      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(8.4);
      doc.setTextColor(90, 82, 72);
      const introCopy = doc.splitTextToSize(
        useCutSquare
          ? `This diagram is drawn at exact 1:1 scale so you can verify your printer settings with a quilting ruler—or trace it as a quick cutting template.`
          : `Verify your printer scale with a ruler before cutting fabric so all pattern proportions remain accurate.`,
        noteW
      );
      doc.text(introCopy, noteX, ny);
      ny += introCopy.length * 0.175 + 0.14;

      const checks = [
        `Print at 100% / "Actual Size" (turn OFF "Fit to Page") on ${isA4 ? "A4" : "US Letter"} paper.`,
        useCutSquare
          ? `Solid outer border must measure exactly ${tsExpected} \u00d7 ${tsExpected}.`
          : `Square must measure exactly ${tsExpected} \u00d7 ${tsExpected}.`,
        useCutSquare
          ? `Dashed terracotta inner box shows the ${formatPdfMeasure(finished, unit)} finished square (${formatPdfMeasure(seam, unit)} seam margin).`
          : `Pre-wash and press fabrics before rotary cutting if you normally do.`,
      ];

      checks.forEach((item) => {
        const lines = doc.splitTextToSize(item, noteW - 0.24);
        doc.setDrawColor(140, 132, 120);
        doc.setLineWidth(0.01);
        doc.roundedRect(noteX, ny - 0.09, 0.12, 0.12, 0.02, 0.02, "S");
        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(8.2);
        doc.setTextColor(34, 31, 26);
        doc.text(lines, noteX + 0.2, ny);
        ny += lines.length * 0.17 + 0.09;
      });

      // ================= PAGE 3: 02 · FABRIC SHOPPING LIST & BUDGET =================
      doc.addPage();
      sectionPages.shopping = doc.getNumberOfPages();
      let shopY = 1.05;

      const PRICE_FQS = 7.48;
      const PRICE_HANCOCKS = 7.98;
      const PRICE_MSQC = 8.48;
      const AVG_PRICE_YD = 7.98;
      const PRICE_FQ = 3.5; // Typical solid Fat Quarter price

      const getSmartShoppingOption = (c) => {
        const rawYards =
          unit === "in"
            ? (c.fabric.length * (1 + FABRIC_BUFFER)) / 36
            : (c.fabric.length * (1 + FABRIC_BUFFER)) / 91.44;
        const yds = Math.max(0.25, Math.ceil(rawYards * 8) / 8);
        const ydCostAvg = yds * AVG_PRICE_YD;
        // Recommend 1 Fat Quarter when it fits with +10% buffer and costs less than yardage (or saves leftover waste)
        if (c.fq.fitsOneFq && PRICE_FQ <= ydCostAvg + 0.5) {
          return {
            isFq: true,
            buyLabel: "1 Fat Quarter",
            subLabel: `(or ${formatPdfYardage(c.fabric.formatted)})`,
            unitPriceLabel: `~$${PRICE_FQ.toFixed(2)}/FQ`,
            costLow: 3.25,
            costHigh: 3.98,
            costAvg: PRICE_FQ,
          };
        }
        return {
          isFq: false,
          buyLabel: formatPdfYardage(c.fabric.formatted),
          subLabel: `${c.fabric.strips} WOF strip${c.fabric.strips === 1 ? "" : "s"}`,
          unitPriceLabel: `$${PRICE_FQS.toFixed(2)}-$${PRICE_MSQC.toFixed(2)}/yd`,
          costLow: yds * PRICE_FQS,
          costHigh: yds * PRICE_MSQC,
          costAvg: ydCostAvg,
        };
      };

      const drawShoppingHeader = (isContinuation) => {
        drawRunningHeader("02", "SHOPPING LIST");
        doc.setFont(fonts.serif, "normal");
        doc.setFontSize(18);
        doc.setTextColor(34, 31, 26);
        doc.text(
          isContinuation ? "Fabric Shopping List (cont.)" : "Fabric Shopping List & Where to Buy",
          margin,
          shopY
        );
        shopY += 0.22;

        if (!isContinuation) {
          doc.setFont(fonts.sans, "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(108, 100, 88);
          const shopIntro = doc.splitTextToSize(
            "Matched to Robert Kaufman Kona Cotton Solids & Moda Bella Solids, automatically flagging money-saving Fat Quarters.",
            contentW
          );
          doc.text(shopIntro, margin, shopY);
          shopY += shopIntro.length * 0.15 + 0.06;

          doc.setFillColor(246, 242, 235);
          doc.setDrawColor(215, 206, 191);
          doc.setLineWidth(0.01);
          doc.roundedRect(margin, shopY, contentW, 0.74, 0.06, 0.06, "FD");

          doc.setFont(fonts.sans, "bold");
          doc.setFontSize(8.2);
          doc.setTextColor(34, 31, 26);
          doc.text("Recommended Online Quilt Shops (Click any store or row link to open):", margin + 0.14, shopY + 0.2);

          doc.setFont(fonts.sans, "normal");
          doc.setFontSize(8);
          doc.setTextColor(184, 77, 44);
          doc.textWithLink(
            `\u2022 Fat Quarter Shop (~$${PRICE_FQS.toFixed(2)}/yd, ~$3.48/FQ)  \u2014  fatquartershop.com/kona-cotton-yardage`,
            margin + 0.14,
            shopY + 0.37,
            { url: "https://www.fatquartershop.com/kona-cotton-yardage" }
          );
          doc.textWithLink(
            `\u2022 Hancock's of Paducah (~$${PRICE_HANCOCKS.toFixed(2)}/yd)  \u2014  hancockspaducah.com`,
            margin + 0.14,
            shopY + 0.52,
            { url: "https://www.hancockspaducah.com/search.php?search_query=Kona+Cotton" }
          );
          doc.textWithLink(
            `\u2022 Missouri Star Quilt Co. (~$${PRICE_MSQC.toFixed(2)}/yd)  \u2014  missouriquiltco.com/collections/kona-cotton-solids`,
            margin + 0.14,
            shopY + 0.67,
            { url: "https://www.missouriquiltco.com/collections/kona-cotton-solids" }
          );
          shopY += 0.88;
        } else {
          shopY += 0.1;
        }

        // Responsive column anchors (fits both US Letter 7.40" and A4 7.17")
        const estColRight = margin + contentW - 1.22;
        const linksColX = margin + contentW - 1.1;

        doc.setFillColor(239, 233, 223);
        doc.rect(margin, shopY, contentW, 0.28, "F");
        doc.setDrawColor(34, 31, 26);
        doc.setLineWidth(0.012);
        doc.line(margin, shopY + 0.28, margin + contentW, shopY + 0.28);
        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(7.2);
        doc.setTextColor(92, 84, 73);
        doc.text("CODE", margin + 0.08, shopY + 0.18);
        doc.text("CLOSEST SOLID MATCH (KONA & BELLA)", margin + 0.58, shopY + 0.18);
        doc.text("BUY QTY", margin + 3.28, shopY + 0.18);
        doc.text("UNIT PRICE", margin + 4.46, shopY + 0.18);
        doc.text("EST.", estColRight, shopY + 0.18, { align: "right" });
        doc.text("SHOP LINKS", linksColX, shopY + 0.18);
        shopY += 0.31;
      };

      drawShoppingHeader(false);

      let totalTopCostLow = 0;
      let totalTopCostHigh = 0;
      let totalTopCostAvg = 0;
      const shopRowH = 0.46;
      const estColRight = margin + contentW - 1.22;
      const linksColX = margin + contentW - 1.1;

      activeColors.forEach((c, idx) => {
        if (shopY + shopRowH > pageH - 1.35) {
          doc.addPage();
          shopY = 1.05;
          drawShoppingHeader(true);
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 245, 239);
          doc.rect(margin, shopY, contentW, shopRowH, "F");
        }

        const opt = getSmartShoppingOption(c);
        totalTopCostLow += opt.costLow;
        totalTopCostHigh += opt.costHigh;
        totalTopCostAvg += opt.costAvg;

        drawCodeBadge(doc, fonts, margin + 0.08, shopY + 0.11, 0.38, 0.24, c.code, c.r, c.g, c.b);

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(34, 31, 26);
        doc.text(fitSingleLine(doc, `${c.match.konaName} (${c.match.konaSku})`, 2.6), margin + 0.58, shopY + 0.19);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(7.2);
        doc.setTextColor(108, 100, 88);
        doc.text(fitSingleLine(doc, `Alt: ${c.match.bellaName}`, 2.6), margin + 0.58, shopY + 0.35);

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(8.3);
        doc.setTextColor(opt.isFq ? 58 : 34, opt.isFq ? 107 : 31, opt.isFq ? 124 : 26);
        doc.text(fitSingleLine(doc, opt.buyLabel, 1.12), margin + 3.28, shopY + 0.19);
        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(6.9);
        doc.setTextColor(120, 112, 102);
        doc.text(fitSingleLine(doc, opt.subLabel, 1.12), margin + 3.28, shopY + 0.34);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(7.6);
        doc.setTextColor(70, 65, 58);
        doc.text(opt.unitPriceLabel, margin + 4.46, shopY + 0.25);

        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(8.3);
        doc.setTextColor(184, 77, 44);
        doc.text(`~$${opt.costAvg.toFixed(2)}`, estColRight, shopY + 0.25, { align: "right" });

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(7.3);
        doc.setTextColor(58, 107, 124);
        doc.textWithLink("FQS", linksColX, shopY + 0.25, { url: c.match.fqsUrl });
        doc.text("\u00b7", linksColX + 0.26, shopY + 0.25);
        doc.textWithLink("MSQC", linksColX + 0.33, shopY + 0.25, { url: c.match.msqcUrl });
        doc.text("\u00b7", linksColX + 0.69, shopY + 0.25);
        doc.textWithLink("HPC", linksColX + 0.76, shopY + 0.25, { url: c.match.hancocksUrl });

        doc.setDrawColor(234, 228, 218);
        doc.setLineWidth(0.006);
        doc.line(margin, shopY + shopRowH, margin + contentW, shopY + shopRowH);
        shopY += shopRowH;
      });

      if (shopY + 0.95 > pageH - 0.65) {
        doc.addPage();
        drawRunningHeader("02", "SHOPPING LIST");
        shopY = 1.05;
      } else {
        shopY += 0.2;
      }

      const bindingLenIn =
        unit === "in"
          ? extras.bindingStrips * extras.bindingStripW
          : (extras.bindingStrips * extras.bindingStripW) / 2.54;
      const backingLenIn =
        unit === "in"
          ? extras.backingPanels * (quiltH + 8)
          : (extras.backingPanels * (quiltH + 20)) / 2.54;
      const bindingYds = Math.max(0.25, Math.ceil((bindingLenIn / 36) * 8) / 8);
      const backingYds = Math.max(0.5, Math.ceil((backingLenIn / 36) * 8) / 8);
      const bindCost = bindingYds * AVG_PRICE_YD;
      const backCost = backingYds * AVG_PRICE_YD;
      const grandTotal = totalTopCostAvg + bindCost + backCost;

      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(8.3);
      const budgetBreakdown = doc.splitTextToSize(
        `Quilt Top (${activeColors.length} fabrics): ~$${totalTopCostAvg.toFixed(2)} ($${totalTopCostLow.toFixed(2)}\u2013$${totalTopCostHigh.toFixed(2)})   \u00b7   Binding: ~$${bindCost.toFixed(2)}   \u00b7   Backing: ~$${backCost.toFixed(2)}`,
        contentW - 0.32
      );
      const budgetBoxH = 0.58 + budgetBreakdown.length * 0.15;

      doc.setFillColor(246, 242, 235);
      doc.setDrawColor(215, 206, 191);
      doc.setLineWidth(0.01);
      doc.roundedRect(margin, shopY, contentW, budgetBoxH, 0.06, 0.06, "FD");

      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(9);
      doc.setTextColor(34, 31, 26);
      doc.text("Estimated Project Fabric Budget (with Smart Fat Quarter Optimization)", margin + 0.16, shopY + 0.23);
      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(8.3);
      doc.setTextColor(70, 65, 58);
      doc.text(budgetBreakdown, margin + 0.16, shopY + 0.43);
      doc.setFont(fonts.sans, "bold");
      doc.setTextColor(184, 77, 44);
      doc.text(
        `Estimated Grand Total (Top + Binding + Backing): ~$${grandTotal.toFixed(2)} USD`,
        margin + 0.16,
        shopY + 0.43 + budgetBreakdown.length * 0.15 + 0.06
      );

      // ================= PAGE 4+: 03 · ANNOTATED QUILT LAYOUT MAP =================
      const maxColsPerPage = isBlockMode ? 24 : 20;
      const maxRowsPerPage = isBlockMode ? 24 : 26;
      const colChunks = Math.ceil(cols / maxColsPerPage);
      const rowChunks = Math.ceil(rows / maxRowsPerPage);
      const totalSections = colChunks * rowChunks;
      let sectionNum = 0;

      for (let rc = 0; rc < rowChunks; rc++) {
        const rStart = rc * maxRowsPerPage;
        const rEnd = Math.min(rows, rStart + maxRowsPerPage);
        const subRows = rEnd - rStart;

        for (let cc = 0; cc < colChunks; cc++) {
          const cStart = cc * maxColsPerPage;
          const cEnd = Math.min(cols, cStart + maxColsPerPage);
          const subCols = cEnd - cStart;
          sectionNum++;

          doc.addPage();
          if (sectionNum === 1) sectionPages.map = doc.getNumberOfPages();
          drawRunningHeader("03", "QUILT LAYOUT MAP");

          const mapHeaderMaxW = totalSections > 1 ? contentW - 1.3 : contentW;
          doc.setFont(fonts.serif, "normal");
          doc.setFontSize(17);
          doc.setTextColor(34, 31, 26);
          const sectionTitle =
            totalSections > 1
              ? `Quilt Layout Map \u2014 Section ${sectionNum} of ${totalSections}`
              : "Quilt Layout Grid Map";
          doc.text(fitSingleLine(doc, sectionTitle, mapHeaderMaxW), margin, 1.05);

          doc.setFont(fonts.sans, "normal");
          doc.setFontSize(8.1);
          doc.setTextColor(108, 100, 88);
          const guideDesc = isBlockMode
            ? `Columns ${cStart + 1}\u2013${cEnd}, Rows ${rStart + 1}\u2013${rEnd}  \u00b7  Terracotta lines mark 8\u00d78 Sub-Blocks  \u00b7  Arrows show pressing`
            : `Columns ${cStart + 1}\u2013${cEnd}, Rows ${rStart + 1}\u2013${rEnd}  \u00b7  Bold lines every 5 squares  \u00b7  Arrows show alternating pressing`;
          const guideLines = doc.splitTextToSize(guideDesc, mapHeaderMaxW);
          doc.text(guideLines, margin, 1.24);

          // Mini Key-Map Locator Thumbnail in top-right (B1)
          if (totalSections > 1) {
            drawKeyMapLocator(doc, fonts, pageW - margin - 1.15, 0.84, 1.15, 0.52, colChunks, rowChunks, cc, rc, sectionNum);
          }

          const labelLeftW = 0.44;
          const arrowRightW = 0.34;
          const labelTopH = 0.26;
          const gridTopY = Math.max(1.46, 1.18 + guideLines.length * 0.14 + 0.08);
          const gridAreaW = contentW - labelLeftW - arrowRightW;
          const gridAreaH = pageH - gridTopY - labelTopH - 0.65;

          const cellSize = Math.min(0.44, gridAreaW / subCols, gridAreaH / subRows);
          const gridW = subCols * cellSize;
          const gridH = subRows * cellSize;
          const gridX = margin + labelLeftW + (gridAreaW - gridW) / 2;
          const gridY = gridTopY + labelTopH;

          // Column numbers
          const headerFont = Math.min(7.8, Math.max(5.5, cellSize * 21));
          doc.setFont(fonts.mono, "bold");
          doc.setFontSize(headerFont);
          doc.setTextColor(90, 82, 72);
          for (let c = 0; c < subCols; c++) {
            const cx = gridX + (c + 0.5) * cellSize;
            doc.text(String(cStart + c + 1), cx, gridY - 0.08, { align: "center" });
          }

          const cellFont = Math.min(9.2, Math.max(5.5, cellSize * 25));
          for (let r = 0; r < subRows; r++) {
            const globalRow = rStart + r;
            const ry = gridY + r * cellSize;

            doc.setFont(fonts.mono, "bold");
            doc.setFontSize(headerFont);
            doc.setTextColor(90, 82, 72);
            doc.text(`R${globalRow + 1}`, gridX - 0.07, ry + cellSize * 0.64, { align: "right" });

            const pointRight = globalRow % 2 === 1;
            drawPressArrow(doc, gridX + gridW + 0.08, ry + cellSize * 0.5, 0.18, pointRight);

            for (let c = 0; c < subCols; c++) {
              const globalCol = cStart + c;
              const palIdx = state.gridAssignments[globalRow * cols + globalCol];
              const pal = state.palette[palIdx];
              const code = codeByPaletteIndex.get(palIdx) || "?";
              const cx = gridX + c * cellSize;

              doc.setFillColor(pal.r, pal.g, pal.b);
              doc.setDrawColor(168, 160, 150);
              doc.setLineWidth(0.005);
              doc.rect(cx, ry, cellSize, cellSize, "FD");

              const isLight = luminance(pal.r, pal.g, pal.b) > 142;
              doc.setTextColor(isLight ? 25 : 255, isLight ? 22 : 255, isLight ? 18 : 255);
              doc.setFont(fonts.mono, "bold");
              doc.setFontSize(cellFont);
              doc.text(code, cx + cellSize / 2, ry + cellSize * 0.65, { align: "center" });
            }
          }

          // Guide lines (8x8 terracotta block boundaries in Block Mode, or 5x5 dark guides in Row Mode)
          const stepGuide = isBlockMode ? BLOCK_SIZE : 5;
          if (isBlockMode) {
            doc.setDrawColor(184, 77, 44);
          } else {
            doc.setDrawColor(34, 31, 26);
          }
          doc.setLineWidth(0.02);
          doc.rect(gridX, gridY, gridW, gridH, "S");
          doc.setLineWidth(0.016);
          for (let c = 1; c < subCols; c++) {
            if ((cStart + c) % stepGuide === 0) {
              const x = gridX + c * cellSize;
              doc.line(x, gridY, x, gridY + gridH);
            }
          }
          for (let r = 1; r < subRows; r++) {
            if ((rStart + r) % stepGuide === 0) {
              const y = gridY + r * cellSize;
              doc.line(gridX, y, gridX + gridW, y);
            }
          }

          // Tiled page tape-join edge hints when multi-page
          if (totalSections > 1) {
            doc.setFont(fonts.sans, "bold");
            doc.setFontSize(6.5);
            doc.setTextColor(184, 77, 44);
            if (cc < colChunks - 1) {
              doc.text("TAPE / JOIN RIGHT", gridX + gridW - 0.24, gridY + gridH + 0.16, { align: "right" });
              drawPressArrow(doc, gridX + gridW - 0.2, gridY + gridH + 0.13, 0.18, true, [184, 77, 44]);
            }
            if (rc < rowChunks - 1) {
              doc.text("TAPE / JOIN BELOW", gridX + gridW / 2, gridY + gridH + 0.16, { align: "center" });
            }
          }
        }
      }

      // ================= PAGE(S): 04 · STEP-BY-STEP ASSEMBLY & VISUAL CHIP CHECKLIST =================
      doc.addPage();
      sectionPages.assembly = doc.getNumberOfPages();
      let ay = 1.05;

      const drawAssemblyHeader = (isContinuation) => {
        drawRunningHeader("04", "ASSEMBLY & CHECKLIST");
        doc.setFont(fonts.serif, "normal");
        doc.setFontSize(18);
        doc.setTextColor(34, 31, 26);
        const heading = isBlockMode
          ? isContinuation
            ? "8\u00d78 Sub-Block Checklist (cont.)"
            : "8\u00d78 Sub-Block Assembly & Visual Checklist"
          : isContinuation
            ? "Row-by-Row Visual Checklist (cont.)"
            : "Row-by-Row Assembly & Visual Checklist";
        doc.text(heading, margin, ay);
        ay += 0.22;

        if (!isContinuation) {
          const nestW = 2.25;
          const notesW = contentW - nestW - 0.2;
          const startNotesY = ay;

          doc.setFont(fonts.sans, "normal");
          doc.setFontSize(8.3);
          doc.setTextColor(70, 65, 58);
          const steps = isBlockMode
            ? [
                `1. Clip Printable Fabric Tags (Section 05) onto each stack of ${formatPdfMeasure(cutSize, unit)} squares.`,
                "2. Piece manageable 8\u00d78 Sub-Blocks first (or smaller edge blocks on the right/bottom borders).",
                `3. Inside each block, sew mini-rows left-to-right with a ${formatPdfMeasure(seam, unit)} seam; press odd rows LEFT, even rows RIGHT.`,
                "4. Pin a Block Tag to the top-left corner of each finished block, then join blocks into rows and assemble the quilt top!",
              ]
            : [
                `1. Clip Printable Fabric Tags (Section 05) onto each stack of ${formatPdfMeasure(cutSize, unit)} squares.`,
                "2. Lay out one row left-to-right using the colored chips below; pin its Row Tag to the first square so rows stay oriented.",
                `3. Chain-piece pairs across the row with a ${formatPdfMeasure(seam, unit)} seam. Long runs (like 4\u00d7A) can be strip-pieced.`,
                "4. Press odd rows LEFT and even rows RIGHT so intersecting seams lock flat when joining rows top-to-bottom.",
              ];

          steps.forEach((line) => {
            const wrappedNote = doc.splitTextToSize(line, notesW);
            doc.text(wrappedNote, margin, ay + 0.12);
            ay += 0.155 * wrappedNote.length + 0.045;
          });

          drawNestingDiagram(doc, fonts, margin + notesW + 0.2, startNotesY, nestW, Math.max(1.02, ay - startNotesY));
          ay = Math.max(ay, startNotesY + 1.08) + 0.18;
        } else {
          ay += 0.1;
        }
      };

      drawAssemblyHeader(false);

      // Helper to encode a segment [cStart..cEnd) of row `r` into run-length items { count, code, pal }
      const encodeRowRuns = (r, cStart, cEnd) => {
        const runs = [];
        let prevCode = null;
        let prevPal = null;
        let runLen = 0;
        for (let c = cStart; c < cEnd; c++) {
          const pIdx = state.gridAssignments[r * cols + c];
          const code = codeByPaletteIndex.get(pIdx) || "?";
          const pal = state.palette[pIdx];
          if (code === prevCode) {
            runLen++;
          } else {
            if (prevCode !== null) runs.push({ count: runLen, code: prevCode, pal: prevPal });
            prevCode = code;
            prevPal = pal;
            runLen = 1;
          }
        }
        if (prevCode !== null) runs.push({ count: runLen, code: prevCode, pal: prevPal });
        return runs;
      };

      // Draw a sequence of colored chips with automatic line wrapping
      const renderChipRow = (labelPrefix, pressRight, runs, indentX = margin) => {
        const chipH = 0.2;
        const chipGapX = 0.05;
        const lineStepY = 0.25;
        const labelW = 1.08;
        const startChipsX = indentX + 0.22 + labelW;
        const maxRightX = pageW - margin;

        // Pre-measure how many lines needed so we never split a single row across pages
        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(7.4);
        let simX = startChipsX;
        let linesCount = 1;
        const chipWidths = runs.map((run) => {
          const txt = `${run.count}\u00d7${run.code}`;
          const w = Math.max(0.38, doc.getTextWidth(txt) + 0.14);
          if (simX + w > maxRightX && simX > startChipsX) {
            linesCount++;
            simX = startChipsX;
          }
          simX += w + chipGapX;
          return { txt, w, run };
        });

        const totalH = linesCount * lineStepY + 0.06;
        if (ay + totalH > pageH - 0.65) {
          doc.addPage();
          ay = 1.05;
          drawAssemblyHeader(true);
        }

        // Checkbox
        doc.setDrawColor(130, 122, 110);
        doc.setLineWidth(0.01);
        doc.roundedRect(indentX, ay + 0.03, 0.14, 0.14, 0.02, 0.02, "S");

        // Row label + pressing vector arrow
        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(8.2);
        doc.setTextColor(34, 31, 26);
        doc.text(labelPrefix, indentX + 0.2, ay + 0.14);
        drawPressArrow(doc, indentX + 0.2 + labelW - 0.3, ay + 0.1, 0.2, pressRight, [120, 112, 102]);

        let cx = startChipsX;
        let cy = ay;
        chipWidths.forEach(({ txt, w, run }) => {
          if (cx + w > maxRightX && cx > startChipsX) {
            cx = startChipsX;
            cy += lineStepY;
          }
          const pal = run.pal || { r: 230, g: 230, b: 230 };
          doc.setFillColor(pal.r, pal.g, pal.b);
          doc.setDrawColor(145, 137, 125);
          doc.setLineWidth(0.006);
          doc.roundedRect(cx, cy, w, chipH, 0.04, 0.04, "FD");

          const isLight = luminance(pal.r, pal.g, pal.b) > 145;
          doc.setTextColor(isLight ? 25 : 255, isLight ? 22 : 255, isLight ? 18 : 255);
          doc.setFont(fonts.mono, "bold");
          doc.setFontSize(7.4);
          doc.text(txt, cx + w / 2, cy + 0.138, { align: "center" });
          cx += w + chipGapX;
        });

        ay += totalH;
      };

      if (!isBlockMode) {
        for (let r = 0; r < rows; r++) {
          const runs = encodeRowRuns(r, 0, cols);
          renderChipRow(`Row ${r + 1}`, r % 2 === 1, runs);
        }
      } else {
        const bCols = Math.ceil(cols / BLOCK_SIZE);
        const bRows = Math.ceil(rows / BLOCK_SIZE);
        for (let br = 0; br < bRows; br++) {
          for (let bc = 0; bc < bCols; bc++) {
            const r0 = br * BLOCK_SIZE;
            const r1 = Math.min(rows, r0 + BLOCK_SIZE);
            const c0 = bc * BLOCK_SIZE;
            const c1 = Math.min(cols, c0 + BLOCK_SIZE);

            if (ay + 0.55 > pageH - 0.65) {
              doc.addPage();
              ay = 1.05;
              drawAssemblyHeader(true);
            }

            doc.setFillColor(246, 242, 235);
            doc.setDrawColor(223, 214, 199);
            doc.setLineWidth(0.008);
            doc.roundedRect(margin, ay, contentW, 0.24, 0.04, 0.04, "FD");
            doc.setFont(fonts.sans, "bold");
            doc.setFontSize(8.2);
            doc.setTextColor(184, 77, 44);
            doc.text(
              `BLOCK R${br + 1}\u00b7C${bc + 1}   (Columns ${c0 + 1}\u2013${c1}, Rows ${r0 + 1}\u2013${r1})`,
              margin + 0.1,
              ay + 0.16
            );
            ay += 0.3;

            for (let r = r0; r < r1; r++) {
              const runs = encodeRowRuns(r, c0, c1);
              renderChipRow(`Row ${r + 1}`, r % 2 === 1, runs, margin + 0.08);
            }
            ay += 0.08;
          }
        }
      }

      // ================= FINAL PAGE(S): 05 · PRINTABLE FABRIC & ROW PIN TAGS =================
      doc.addPage();
      sectionPages.tags = doc.getNumberOfPages();
      let ty = 1.05;

      const drawTagsPageHeader = (isCont) => {
        drawRunningHeader("05", "PRINTABLE PIN TAGS");
        doc.setFont(fonts.serif, "normal");
        doc.setFontSize(18);
        doc.setTextColor(34, 31, 26);
        doc.text(
          isCont ? "Cut-Apart Organization Tags (cont.)" : "Cut-Apart Fabric & Row Pin Tags",
          margin,
          ty
        );
        ty += 0.22;
        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(8.4);
        doc.setTextColor(108, 100, 88);
        const tagIntro = doc.splitTextToSize(
          "Cut along the dashed lines. Clip Fabric Tags onto your cut stacks, and pin Row/Block Tags onto the TOP-LEFT square of each unit.",
          contentW
        );
        doc.text(tagIntro, margin, ty);
        ty += tagIntro.length * 0.15 + 0.1;
      };

      drawTagsPageHeader(false);

      // 1. Fabric Stack Tags (3 columns)
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(34, 31, 26);
      doc.text("FABRIC STACK TAGS", margin, ty);
      ty += 0.12;

      const fCols = 3;
      const fGap = 0.14;
      const fTagW = (contentW - fGap * (fCols - 1)) / fCols;
      const fTagH = 0.78;

      activeColors.forEach((c, i) => {
        const col = i % fCols;
        if (col === 0 && i > 0) ty += fTagH + 0.12;
        if (ty + fTagH > pageH - 0.65) {
          doc.addPage();
          ty = 1.05;
          drawTagsPageHeader(true);
        }
        const tx = margin + col * (fTagW + fGap);

        // Dashed cut border
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(165, 156, 144);
        doc.setLineWidth(0.01);
        doc.setLineDashPattern([0.05, 0.04], 0);
        doc.roundedRect(tx, ty, fTagW, fTagH, 0.04, 0.04, "FD");
        doc.setLineDashPattern([], 0);

        // Color header band
        doc.setFillColor(c.r, c.g, c.b);
        doc.rect(tx + 0.03, ty + 0.03, fTagW - 0.06, 0.2, "F");

        // Pin/clip hole circle
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(140, 132, 120);
        doc.circle(tx + fTagW - 0.16, ty + 0.42, 0.045, "FD");

        drawCodeBadge(doc, fonts, tx + 0.08, ty + 0.3, 0.34, 0.22, c.code, c.r, c.g, c.b);

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(8.4);
        doc.setTextColor(34, 31, 26);
        doc.text(fitSingleLine(doc, c.name, fTagW - 0.72), tx + 0.5, ty + 0.42);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(7);
        doc.setTextColor(108, 100, 88);
        doc.text(fitSingleLine(doc, `${c.count} sq \u00b7 Cut ${formatPdfMeasure(cutSize, unit)}`, fTagW - 0.58), tx + 0.5, ty + 0.58);
        doc.text(fitSingleLine(doc, c.match.konaName, fTagW - 0.58), tx + 0.5, ty + 0.7);
      });
      ty += fTagH + 0.3;

      // 2. Row or Block Pin Tags (4 columns)
      const pinItems = [];
      if (!isBlockMode) {
        for (let r = 0; r < rows; r++) {
          pinItems.push({
            title: `ROW ${r + 1}`,
            sub: "PIN TOP-LEFT",
            arrowRight: r % 2 === 1,
          });
        }
      } else {
        const bCols = Math.ceil(cols / BLOCK_SIZE);
        const bRows = Math.ceil(rows / BLOCK_SIZE);
        for (let br = 0; br < bRows; br++) {
          for (let bc = 0; bc < bCols; bc++) {
            pinItems.push({
              title: `BLOCK R${br + 1}\u00b7C${bc + 1}`,
              sub: "PIN TOP-LEFT",
              arrowRight: null,
            });
          }
        }
      }

      if (ty + 0.7 > pageH - 0.65) {
        doc.addPage();
        ty = 1.05;
        drawTagsPageHeader(true);
      }

      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(34, 31, 26);
      doc.text(isBlockMode ? "SUB-BLOCK PIN TAGS" : "ROW HEADER PIN TAGS", margin, ty);
      ty += 0.12;

      const rCols = 4;
      const rGap = 0.1;
      const rTagW = (contentW - rGap * (rCols - 1)) / rCols;
      const rTagH = 0.44;

      pinItems.forEach((item, i) => {
        const col = i % rCols;
        if (col === 0 && i > 0) ty += rTagH + 0.08;
        if (ty + rTagH > pageH - 0.65) {
          doc.addPage();
          ty = 1.05;
          drawTagsPageHeader(true);
        }
        const rx = margin + col * (rTagW + rGap);

        doc.setFillColor(252, 250, 247);
        doc.setDrawColor(165, 156, 144);
        doc.setLineWidth(0.008);
        doc.setLineDashPattern([0.04, 0.03], 0);
        doc.roundedRect(rx, ty, rTagW, rTagH, 0.04, 0.04, "FD");
        doc.setLineDashPattern([], 0);

        doc.setDrawColor(140, 132, 120);
        doc.circle(rx + 0.12, ty + rTagH / 2, 0.035, "S");

        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(8);
        doc.setTextColor(34, 31, 26);
        doc.text(item.title, rx + 0.22, ty + 0.19);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(108, 100, 88);
        doc.text(item.sub, rx + 0.22, ty + 0.34);

        if (item.arrowRight !== null) {
          drawPressArrow(doc, rx + rTagW - 0.34, ty + 0.22, 0.22, item.arrowRight, [184, 77, 44]);
        }
      });

      // ================= POPULATE INTERACTIVE TABLE OF CONTENTS ON PAGE 1 =================
      doc.setPage(1);
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(34, 31, 26);
      doc.text("PATTERN CONTENTS (TAP TO JUMP)", tocX + 0.16, stripY + 0.22);

      const tocEntries = [
        ["01", "Materials, WOF Cutting & Scale Check", sectionPages.cutting],
        ["02", "Fabric Shopping List & Budget", sectionPages.shopping],
        ["03", "Annotated Quilt Layout Map", sectionPages.map],
        ["04", isBlockMode ? "8\u00d78 Block Assembly & Visual Chips" : "Row Assembly & Visual Chips", sectionPages.assembly],
        ["05", "Cut-Apart Fabric & Pin Tags", sectionPages.tags],
      ];

      tocEntries.forEach(([num, label, targetPage], idx) => {
        const ey = stripY + 0.44 + idx * 0.24;
        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(184, 77, 44);
        doc.text(num, tocX + 0.16, ey);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(8);
        doc.setTextColor(34, 31, 26);
        doc.text(label, tocX + 0.42, ey);

        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(108, 100, 88);
        doc.text(`p. ${targetPage}`, tocX + tocW - 0.16, ey, { align: "right" });

        // Make the entire TOC line clickable to jump to targetPage
        doc.link(tocX + 0.12, ey - 0.14, tocW - 0.24, 0.2, { pageNumber: targetPage });
      });

      // ================= PAGE FOOTERS ACROSS ALL PAGES =================
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(228, 221, 210);
        doc.setLineWidth(0.006);
        doc.line(margin, pageH - 0.44, pageW - margin, pageH - 0.44);

        if (brandIconDataUrl) {
          doc.addImage(brandIconDataUrl, "PNG", margin, pageH - 0.38, 0.15, 0.15);
        }
        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(135, 127, 115);
        doc.text(
          "Miriam's Quiltcaster  \u00b7  Custom Pixel Quilt Pattern",
          brandIconDataUrl ? margin + 0.21 : margin,
          pageH - 0.27
        );
        doc.setFont(fonts.mono, "bold");
        doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 0.27, { align: "right" });
      }

      const safeFile = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "quiltcaster";
      doc.save(`${safeFile}-quilt-pattern.pdf`);
    } finally {
      exportPdfBtn.disabled = false;
      exportPdfBtn.innerHTML = originalBtnHtml;
    }
  }

  exportPdfBtn.addEventListener("click", exportPdfPattern);
  assemblyModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setAssemblyMode(btn.dataset.assembly));
  });

  // Default paper size: Letter for US/Canada, A4 elsewhere
  const lang = (navigator.language || "en-US").toUpperCase();
  setPageSize(/-(US|CA|MX|PH)$/.test(lang) || lang === "EN" ? "letter" : "a4");
  pageSizeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setPageSize(btn.dataset.pageSize));
  });

  // Save / open patterns
  savePatternBtn.addEventListener("click", savePattern);
  if (browseImageBtn) {
    browseImageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }
  const openPatternPicker = (e) => {
    if (e) e.stopPropagation();
    patternInput.click();
  };
  openPatternBtn.addEventListener("click", openPatternPicker);
  openPatternBtnTop.addEventListener("click", openPatternPicker);
  patternInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) loadPatternFile(file);
    patternInput.value = "";
  });

  // Keyboard shortcut: Cmd/Ctrl + S saves the current pattern
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && state.image) {
      e.preventDefault();
      savePattern();
    }
  });

  // --- Interactive Non-Destructive Image Cropping ---

  // Inner canvas padding (px) around the photo so edge/corner handles are never clipped
  const CROP_PAD = 16;
  let draftCrop = { x: 0, y: 0, w: 1, h: 1 };
  let cropAspect = null; // null for free, or desired (pixelW / pixelH) ratio
  let cropDrag = null;
  let cropHoverMode = null; // Currently hovered handle or 'move'

  function setCropAspectButton(aspectStr) {
    cropAspectBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.aspect === aspectStr);
    });
    if (aspectStr === "free") {
      cropAspect = null;
      renderCropCanvas();
      return;
    }
    const ratio = parseFloat(aspectStr);
    if (!Number.isFinite(ratio) || !state.image) {
      cropAspect = null;
      return;
    }
    cropAspect = ratio;
    // Cap preset selection to 78% of image so user can immediately reposition it in any direction
    fitDraftCropToAspect(ratio, 0.78);
    renderCropCanvas();
  }

  function fitDraftCropToAspect(pixelRatio, maxBound = 1, driveAxis = "auto") {
    if (!state.image) return;
    const imgAspect = state.image.naturalWidth / state.image.naturalHeight;
    // Normalized w / h ratio so that (w * natW) / (h * natH) === pixelRatio
    const normRatio = pixelRatio / imgAspect;

    const cx = draftCrop.x + draftCrop.w / 2;
    const cy = draftCrop.y + draftCrop.h / 2;

    let w = Math.min(maxBound, draftCrop.w);
    let h = Math.min(maxBound, draftCrop.h);

    if (driveAxis === "h") {
      w = h * normRatio;
    } else if (driveAxis === "w") {
      h = w / normRatio;
    } else {
      // Fit within current bounds and maxBound
      if (w / normRatio <= maxBound) {
        h = w / normRatio;
      } else {
        h = maxBound;
        w = h * normRatio;
      }
    }

    if (h > maxBound) {
      h = maxBound;
      w = h * normRatio;
    }
    if (w > maxBound) {
      w = maxBound;
      h = w / normRatio;
    }

    const minSize = 0.08;
    if (w < minSize) {
      w = minSize;
      h = w / normRatio;
    }
    if (h < minSize) {
      h = minSize;
      w = h * normRatio;
    }

    let x = Math.max(0, Math.min(1 - w, cx - w / 2));
    let y = Math.max(0, Math.min(1 - h, cy - h / 2));
    draftCrop = { x, y, w, h };
  }

  function openCropStage() {
    if (!state.image) return;
    const isFullUnmodified =
      state.crop.x < 0.002 &&
      state.crop.y < 0.002 &&
      state.crop.w > 0.996 &&
      state.crop.h > 0.996;
    // Start at an 80% centered frame on first open so there's immediate room on all 4 sides to reposition
    draftCrop = isFullUnmodified
      ? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
      : { ...state.crop };
    cropAspect = null;
    cropAspectBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.aspect === "free");
    });

    const img = state.image;
    const maxDim = 820;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const imgW = Math.max(120, Math.round(img.naturalWidth * scale));
    const imgH = Math.max(120, Math.round(img.naturalHeight * scale));
    // Add padding around the image so corner handles are never clipped at the canvas edge
    cropCanvas.width = imgW + CROP_PAD * 2;
    cropCanvas.height = imgH + CROP_PAD * 2;

    previewToolbar.hidden = true;
    canvasFrame.hidden = true;
    exportBar.hidden = true;
    cropStage.hidden = false;

    renderCropCanvas();
  }

  function closeCropStage() {
    cropStage.hidden = true;
    previewToolbar.hidden = false;
    canvasFrame.hidden = false;
    exportBar.hidden = false;
    cropDrag = null;
  }

  function applyCrop() {
    if (!state.image) return;
    state.crop = { ...draftCrop };
    closeCropStage();
    rebuildSampleBuffer();

    if (cropReextractToggle.checked) {
      const targetColors = Number(paletteSizeSlider.value);
      state.palette = extractPalette(state.samplePixels, targetColors);
    }

    computeSquareAverages();
    renderPaletteSwatches();
    renderQuilt();
  }

  function getCropHandles(bx, by, bw, bh) {
    const mx = bx + bw / 2;
    const my = by + bh / 2;
    const rx = bx + bw;
    const by2 = by + bh;
    return [
      { id: "nw", x: bx, y: by },
      { id: "ne", x: rx, y: by },
      { id: "se", x: rx, y: by2 },
      { id: "sw", x: bx, y: by2 },
      { id: "n", x: mx, y: by },
      { id: "e", x: rx, y: my },
      { id: "s", x: mx, y: by2 },
      { id: "w", x: bx, y: my },
    ];
  }

  function renderCropCanvas() {
    if (!state.image || cropStage.hidden) return;
    const cw = cropCanvas.width;
    const ch = cropCanvas.height;
    const iw = cw - CROP_PAD * 2;
    const ih = ch - CROP_PAD * 2;

    cropCtx.clearRect(0, 0, cw, ch);
    cropCtx.fillStyle = "#221f1a";
    cropCtx.fillRect(0, 0, cw, ch);
    cropCtx.drawImage(state.image, CROP_PAD, CROP_PAD, iw, ih);

    // Dim outside area
    cropCtx.fillStyle = "rgba(22, 19, 16, 0.58)";
    cropCtx.fillRect(0, 0, cw, ch);

    const bx = CROP_PAD + draftCrop.x * iw;
    const by = CROP_PAD + draftCrop.y * ih;
    const bw = draftCrop.w * iw;
    const bh = draftCrop.h * ih;

    // Bright cropped area
    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.rect(bx, by, bw, bh);
    cropCtx.clip();
    cropCtx.drawImage(state.image, CROP_PAD, CROP_PAD, iw, ih);

    // Rule of thirds lines
    cropCtx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    cropCtx.lineWidth = 1;
    cropCtx.beginPath();
    for (let i = 1; i <= 2; i++) {
      const gx = bx + (bw * i) / 3;
      const gy = by + (bh * i) / 3;
      cropCtx.moveTo(gx, by);
      cropCtx.lineTo(gx, by + bh);
      cropCtx.moveTo(bx, gy);
      cropCtx.lineTo(bx + bw, gy);
    }
    cropCtx.stroke();
    cropCtx.restore();

    // Crisp crop border
    cropCtx.strokeStyle = "#ffffff";
    cropCtx.lineWidth = 2.5;
    cropCtx.strokeRect(bx, by, bw, bh);

    // Center 4-way move handle badge (visual indicator that dragging inside repositions the box)
    const activeMode = cropDrag ? cropDrag.mode : cropHoverMode;
    const isMoveActive = activeMode === "move";
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.arc(cx, cy, isMoveActive ? 17 : 15, 0, Math.PI * 2);
    cropCtx.fillStyle = isMoveActive ? "rgba(184, 77, 44, 0.92)" : "rgba(34, 31, 26, 0.72)";
    cropCtx.fill();
    cropCtx.lineWidth = 2;
    cropCtx.strokeStyle = "#ffffff";
    cropCtx.stroke();

    // Draw 4-way move arrows inside center badge
    cropCtx.beginPath();
    const arm = 7.5;
    const head = 3;
    // Horizontal & vertical cross
    cropCtx.moveTo(cx - arm, cy);
    cropCtx.lineTo(cx + arm, cy);
    cropCtx.moveTo(cx, cy - arm);
    cropCtx.lineTo(cx, cy + arm);
    // Arrowheads
    cropCtx.moveTo(cx - arm + head, cy - head);
    cropCtx.lineTo(cx - arm, cy);
    cropCtx.lineTo(cx - arm + head, cy + head);
    cropCtx.moveTo(cx + arm - head, cy - head);
    cropCtx.lineTo(cx + arm, cy);
    cropCtx.lineTo(cx + arm - head, cy + head);
    cropCtx.moveTo(cx - head, cy - arm + head);
    cropCtx.lineTo(cx, cy - arm);
    cropCtx.lineTo(cx + head, cy - arm + head);
    cropCtx.moveTo(cx - head, cy + arm - head);
    cropCtx.lineTo(cx, cy + arm);
    cropCtx.lineTo(cx + head, cy + arm - head);
    cropCtx.stroke();
    cropCtx.restore();

    // Corner and mid-edge handles (sized clearly for touch & desktop, with hover/active highlight)
    const handles = getCropHandles(bx, by, bw, bh);
    handles.forEach((h) => {
      const isHovered = activeMode === h.id;
      const baseR = h.id.length === 2 ? 10 : 7.5;
      const r = isHovered ? baseR + 2.5 : baseR;
      cropCtx.beginPath();
      cropCtx.arc(h.x, h.y, r, 0, Math.PI * 2);
      cropCtx.fillStyle = isHovered ? "#b84d2c" : "#ffffff";
      cropCtx.fill();
      cropCtx.lineWidth = 2.5;
      cropCtx.strokeStyle = isHovered ? "#ffffff" : "#b84d2c";
      cropCtx.stroke();
    });
  }

  function clientToCropNorm(clientX, clientY) {
    const rect = cropCanvas.getBoundingClientRect();
    const scaleX = cropCanvas.width / Math.max(1, rect.width);
    const scaleY = cropCanvas.height / Math.max(1, rect.height);
    const padCssX = CROP_PAD / scaleX;
    const padCssY = CROP_PAD / scaleY;
    const imgCssW = Math.max(1, rect.width - padCssX * 2);
    const imgCssH = Math.max(1, rect.height - padCssY * 2);

    const nx = Math.max(0, Math.min(1, (clientX - rect.left - padCssX) / imgCssW));
    const ny = Math.max(0, Math.min(1, (clientY - rect.top - padCssY) / imgCssH));
    return {
      nx,
      ny,
      px: clientX - rect.left,
      py: clientY - rect.top,
      padCssX,
      padCssY,
      imgCssW,
      imgCssH,
    };
  }

  function hitTestCropTarget(clientX, clientY, isTouch) {
    const { nx, ny, px, py, padCssX, padCssY, imgCssW, imgCssH } = clientToCropNorm(clientX, clientY);
    const bx = padCssX + draftCrop.x * imgCssW;
    const by = padCssY + draftCrop.y * imgCssH;
    const bw = draftCrop.w * imgCssW;
    const bh = draftCrop.h * imgCssH;

    // 1. Center move badge ALWAYS repositions the selection, even when the crop box is small
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const centerRadius = isTouch ? 26 : 18;
    if ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= centerRadius * centerRadius) {
      return { mode: "move", nx, ny };
    }

    // 2. Check 8 border handles (cap hit radius to 28% of box dimension so interior remains draggable)
    const maxHandleRad = Math.max(12, Math.min(bw, bh) * 0.28);
    const hitRadius = Math.min(maxHandleRad, isTouch ? 30 : 20);
    const handles = getCropHandles(bx, by, bw, bh);
    let hitHandle = null;
    let bestDist = hitRadius * hitRadius;
    for (const h of handles) {
      const dx = px - h.x;
      const dy = py - h.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestDist) {
        bestDist = d2;
        hitHandle = h.id;
      }
    }

    if (hitHandle) {
      return { mode: hitHandle, nx, ny };
    }

    // 3. Inside the crop box -> reposition (move)
    if (
      nx >= draftCrop.x &&
      nx <= draftCrop.x + draftCrop.w &&
      ny >= draftCrop.y &&
      ny <= draftCrop.y + draftCrop.h
    ) {
      return { mode: "move", nx, ny };
    }

    // 4. Outside the crop box -> recenter the crop box onto the pointer and continue dragging to reposition
    return { mode: "recenter-move", nx, ny };
  }

  function startCropInteraction(clientX, clientY, isTouch) {
    if (!state.image) return;
    const hit = hitTestCropTarget(clientX, clientY, isTouch);

    if (hit.mode === "recenter-move") {
      draftCrop.x = Math.max(0, Math.min(1 - draftCrop.w, hit.nx - draftCrop.w / 2));
      draftCrop.y = Math.max(0, Math.min(1 - draftCrop.h, hit.ny - draftCrop.h / 2));
      renderCropCanvas();
      cropDrag = { mode: "move", startNx: hit.nx, startNy: hit.ny, startCrop: { ...draftCrop } };
      return;
    }

    cropDrag = { mode: hit.mode, startNx: hit.nx, startNy: hit.ny, startCrop: { ...draftCrop } };
  }

  function updateCropCursor(clientX, clientY) {
    if (!state.image || cropStage.hidden) return;
    const hit = hitTestCropTarget(clientX, clientY, false);
    const mode = cropDrag ? cropDrag.mode : hit.mode;
    const cursorMap = {
      move: "move",
      "recenter-move": "pointer",
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
    };
    cropCanvas.style.cursor = cursorMap[mode] || "default";
    if (cropHoverMode !== mode) {
      cropHoverMode = mode;
      renderCropCanvas();
    }
  }

  function moveCropInteraction(clientX, clientY) {
    if (!cropDrag || !state.image) return;
    const { nx, ny } = clientToCropNorm(clientX, clientY);
    const dx = nx - cropDrag.startNx;
    const dy = ny - cropDrag.startNy;
    const s = cropDrag.startCrop;
    const minSize = 0.08;

    if (cropDrag.mode === "move") {
      draftCrop.x = Math.max(0, Math.min(1 - s.w, s.x + dx));
      draftCrop.y = Math.max(0, Math.min(1 - s.h, s.y + dy));
      renderCropCanvas();
      return;
    }

    let x1 = s.x;
    let y1 = s.y;
    let x2 = s.x + s.w;
    let y2 = s.y + s.h;

    if (cropDrag.mode.includes("w")) x1 = Math.max(0, Math.min(x2 - minSize, s.x + dx));
    if (cropDrag.mode.includes("e")) x2 = Math.min(1, Math.max(x1 + minSize, s.x + s.w + dx));
    if (cropDrag.mode.includes("n")) y1 = Math.max(0, Math.min(y2 - minSize, s.y + dy));
    if (cropDrag.mode.includes("s")) y2 = Math.min(1, Math.max(y1 + minSize, s.y + s.h + dy));

    draftCrop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    if (cropAspect) {
      const driveAxis = cropDrag.mode === "n" || cropDrag.mode === "s" ? "h" : "w";
      fitDraftCropToAspect(cropAspect, 1, driveAxis);
    }
    renderCropCanvas();
  }

  const endCropDrag = (e) => {
    if (!cropDrag) return;
    cropDrag = null;
    if (e && typeof e.clientX === "number") {
      updateCropCursor(e.clientX, e.clientY);
    } else {
      renderCropCanvas();
    }
  };

  // Explicit non-passive touch listeners for iOS Safari / Android mobile web
  cropCanvas.addEventListener(
    "touchstart",
    (e) => {
      if (!state.image || e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      startCropInteraction(t.clientX, t.clientY, true);
    },
    { passive: false }
  );

  cropCanvas.addEventListener(
    "touchmove",
    (e) => {
      if (!cropDrag || e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      moveCropInteraction(t.clientX, t.clientY);
    },
    { passive: false }
  );

  cropCanvas.addEventListener("touchend", endCropDrag);
  cropCanvas.addEventListener("touchcancel", endCropDrag);

  // Desktop mouse listeners
  cropCanvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startCropInteraction(e.clientX, e.clientY, false);
    updateCropCursor(e.clientX, e.clientY);
  });

  cropCanvas.addEventListener("mousemove", (e) => {
    if (!cropDrag) {
      updateCropCursor(e.clientX, e.clientY);
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!cropDrag) return;
    moveCropInteraction(e.clientX, e.clientY);
    updateCropCursor(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", endCropDrag);

  cropBtn.addEventListener("click", openCropStage);
  cropCancelBtn.addEventListener("click", closeCropStage);
  cropApplyBtn.addEventListener("click", applyCrop);
  cropResetBtn.addEventListener("click", () => {
    draftCrop = { x: 0, y: 0, w: 1, h: 1 };
    setCropAspectButton("free");
    renderCropCanvas();
  });
  cropAspectBtns.forEach((btn) => {
    btn.addEventListener("click", () => setCropAspectButton(btn.dataset.aspect));
  });

  // Hold to compare original image
  const showOriginal = () => {
    if (!state.image) return;
    state.showingOriginal = true;
    renderQuilt();
  };
  const showQuilt = () => {
    if (!state.showingOriginal) return;
    state.showingOriginal = false;
    renderQuilt();
  };

  compareBtn.addEventListener("pointerdown", showOriginal);
  window.addEventListener("pointerup", showQuilt);
  compareBtn.addEventListener("pointerleave", showQuilt);
  compareBtn.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") showOriginal();
  });
  compareBtn.addEventListener("keyup", showQuilt);
})();
