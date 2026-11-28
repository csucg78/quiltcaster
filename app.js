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
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  const historyMenuBtn = document.getElementById("history-menu-btn");
  const historyPopover = document.getElementById("history-popover");
  const historyList = document.getElementById("history-list");
  const historyCount = document.getElementById("history-count");

  const squaresSlider = document.getElementById("squares-slider");
  const squaresValue = document.getElementById("squares-value");
  const totalSquaresLabel = document.getElementById("total-squares-label");
  const gridLayoutSelect = document.getElementById("grid-layout-select");
  const mathMenuBtn = document.getElementById("math-menu-btn");
  const mathMenuLabel = document.getElementById("math-menu-label");
  const mathMenuPopover = document.getElementById("math-menu-popover");
  const mathPropsBtn = document.getElementById("math-props-btn");
  const shuffleQuiltBtn = document.getElementById("shuffle-quilt-btn");
  const mathPropsPopover = document.getElementById("math-props-popover");
  const mathPropsTitle = document.getElementById("math-props-title");
  const mathPropsClose = document.getElementById("math-props-close");
  const mathPropsBody = document.getElementById("math-props-body");
  const mathReversePalette = document.getElementById("math-reverse-palette");
  const mathPropsReset = document.getElementById("math-props-reset");
  const mapPopover = document.getElementById("map-popover");
  const mapPopoverClose = document.getElementById("map-popover-close");
  const mapForm = document.getElementById("map-form");
  const mapLocationInput = document.getElementById("map-location-input");
  const mapStyleSelect = document.getElementById("map-style-select");
  const mapZoomSlider = document.getElementById("map-zoom-slider");
  const mapZoomValue = document.getElementById("map-zoom-value");
  const mapExtractPalette = document.getElementById("map-extract-palette");
  const mapStatus = document.getElementById("map-status");
  const mapLoadBtn = document.getElementById("map-load-btn");
  const mapQuickChips = document.querySelectorAll("[data-map-loc]");
  const seamLinesBtn = document.getElementById("seam-lines-btn");
  const thirdsOverlayBtn = document.getElementById("thirds-overlay-btn");
  const hstSwitchRow = document.getElementById("hst-switch-row");
  const hstToggle = document.getElementById("hst-toggle");
  const hstControls = document.getElementById("hst-controls");
  const hstModeBtns = document.querySelectorAll("[data-hst-mode]");
  const hstEdgePanel = document.getElementById("hst-edge-panel");
  const hstRatioPanel = document.getElementById("hst-ratio-panel");
  const hstEdgeSlider = document.getElementById("hst-edge-slider");
  const hstEdgeValue = document.getElementById("hst-edge-value");
  const hstRatioSlider = document.getElementById("hst-ratio-slider");
  const hstRatioValue = document.getElementById("hst-ratio-value");
  const paintToggleBtn = document.getElementById("paint-toggle-btn");
  const panToggleBtn = document.getElementById("pan-toggle-btn");
  const paintBtnLabel = document.getElementById("paint-btn-label");
  const paintToolbar = document.getElementById("paint-toolbar");
  const paintFabricStrip = document.getElementById("paint-fabric-strip");
  const paintBrushBtns = document.querySelectorAll("[data-paint-brush]");
  const paintSizeBtns = document.querySelectorAll("[data-paint-size]");
  const paintStatusLabel = document.getElementById("paint-status-label");
  const paintClearBtn = document.getElementById("paint-clear-btn");
  const paintDoneBtn = document.getElementById("paint-done-btn");

  const regionBtns = document.querySelectorAll("[data-region]");
  const unitModeBadge = document.getElementById("unit-mode-badge");
  const unitLabels = document.querySelectorAll("[data-unit-label]");
  const finishedSizeInput = document.getElementById("finished-size-input");
  const seamAllowanceInput = document.getElementById("seam-allowance-input");
  const quiltPresetSelect = document.getElementById("quilt-preset-select");
  const quiltWidthInput = document.getElementById("quilt-width-input");
  const quiltHeightInput = document.getElementById("quilt-height-input");
  const dimensionsSummary = document.getElementById("dimensions-summary");
  const cutSquareLabel = document.getElementById("cut-square-label");
  const cutSquareValue = document.getElementById("cut-square-value");
  const hstCutStat = document.getElementById("hst-cut-stat");
  const hstCutLabel = document.getElementById("hst-cut-label");
  const hstCutSquareValue = document.getElementById("hst-cut-square-value");
  const wofNote = document.getElementById("wof-note");
  const previewRulerWidth = document.getElementById("preview-ruler-width");
  const previewRulerHeight = document.getElementById("preview-ruler-height");
  const cropSubtitle = document.getElementById("crop-subtitle");
  const cropQuiltSizeBtn = document.getElementById("crop-quilt-size-btn");

  const paletteSizeSlider = document.getElementById("palette-size-slider");
  const paletteSizeValue = document.getElementById("palette-size-value");
  const paletteGrid = document.getElementById("palette-grid");
  const addColorBtn = document.getElementById("add-color-btn");
  const harmonyPaletteBtn = document.getElementById("harmony-palette-btn");
  const harmonyPopover = document.getElementById("harmony-popover");
  const harmonyPopoverClose = document.getElementById("harmony-popover-close");
  const harmonyTabBtns = document.querySelectorAll("[data-harmony-tab]");
  const harmonyMathPanel = document.getElementById("harmony-math-panel");
  const harmonyCuratedPanel = document.getElementById("harmony-curated-panel");
  const harmonyCuratedList = document.getElementById("harmony-curated-list");
  const harmonyFormulaHint = document.getElementById("harmony-formula-hint");
  const harmonyRuleBtns = document.querySelectorAll("[data-harmony-rule]");
  const harmonyHueSlider = document.getElementById("harmony-hue-slider");
  const harmonyHueDot = document.getElementById("harmony-hue-dot");
  const harmonyHueValue = document.getElementById("harmony-hue-value");
  const harmonySatSlider = document.getElementById("harmony-sat-slider");
  const harmonySatValue = document.getElementById("harmony-sat-value");
  const harmonyContrastSlider = document.getElementById("harmony-contrast-slider");
  const harmonyContrastValue = document.getElementById("harmony-contrast-value");
  const harmonyLibrarySelect = document.getElementById("harmony-library-select");
  const harmonySnapCurrentBtn = document.getElementById("harmony-snap-current-btn");
  const harmonyMapNote = document.getElementById("harmony-map-note");
  const harmonyPreviewStrip = document.getElementById("harmony-preview-strip");
  const harmonyPreserveWrap = document.getElementById("harmony-preserve-wrap");
  const harmonyPreserveSlots = document.getElementById("harmony-preserve-slots");
  const harmonyReverseValues = document.getElementById("harmony-reverse-values");
  const harmonyRestoreBtn = document.getElementById("harmony-restore-btn");
  const harmonyRollBtn = document.getElementById("harmony-roll-btn");
  const snapKonaBtn = document.getElementById("snap-kona-btn");
  const resetPaletteBtn = document.getElementById("reset-palette-btn");

  const compareBtn = document.getElementById("compare-btn");
  const exportSheetBtn = document.getElementById("export-sheet-btn");
  const exportPdfBtn = document.getElementById("export-pdf-btn");
  const assemblyModeSelect = document.getElementById("assembly-mode-select");
  const assemblyModeBtns = document.querySelectorAll(".segmented-btn[data-assembly]");
  const pageSizeSelect = document.getElementById("page-size-select");
  const savePatternBtn = document.getElementById("save-pattern-btn");
  const browseImageBtn = document.getElementById("browse-image-btn");
  const blankQuiltBtn = document.getElementById("blank-quilt-btn");
  const importImageBtn = document.getElementById("import-image-btn");
  const importImageInput = document.getElementById("import-image-input");
  const openPatternBtn = document.getElementById("open-pattern-btn");
  const openPatternBtnTop = document.getElementById("open-pattern-btn-top");
  const patternInput = document.getElementById("pattern-input");
  const fabricPatternInput = document.getElementById("fabric-pattern-input");

  const swatchPopover = document.getElementById("swatch-popover");
  const swatchPopoverTitle = document.getElementById("swatch-popover-title");
  const swatchPopoverClose = document.getElementById("swatch-popover-close");
  const swatchPopoverColor = document.getElementById("swatch-popover-color");
  const swatchPopoverHex = document.getElementById("swatch-popover-hex");
  const swatchRemovePrintBtn = document.getElementById("swatch-remove-print-btn");
  const swatchPrintPreviewRow = document.getElementById("swatch-print-preview-row");
  const swatchPrintThumb = document.getElementById("swatch-print-thumb");
  const swatchPrintName = document.getElementById("swatch-print-name");
  const swatchMatchAvgBtn = document.getElementById("swatch-match-avg-btn");
  const swatchPrintScaleRow = document.getElementById("swatch-print-scale-row");
  const swatchPrintScale = document.getElementById("swatch-print-scale");
  const swatchPrintScaleValue = document.getElementById("swatch-print-scale-value");
  const swatchCutModeBtns = document.querySelectorAll("[data-cut-mode]");
  const swatchUploadPrintBtn = document.getElementById("swatch-upload-print-btn");
  const swatchUploadPrintLabel = document.getElementById("swatch-upload-print-label");
  const swatchLibraryTabs = document.querySelectorAll("[data-lib-tab]");
  const swatchLibraryCaption = document.getElementById("swatch-library-caption");
  const swatchLibrarySearch = document.getElementById("swatch-library-search");
  const swatchLibraryGrid = document.getElementById("swatch-library-grid");

  const PRESET_LABELS = {
    mini: { in: 'Mini · 12×12 to 20×20"', cm: "Mini · 30×30 to 50×50 cm" },
    wall: { in: 'Wall Hanging · 20×20 to 40×40"', cm: "Wall Hanging · 50×50 to 100×100 cm" },
    crib: { in: 'Crib · 36×52"', cm: "Crib · 91×132 cm" },
    lap: { in: 'Lap · 40×50"', cm: "Lap · 102×127 cm" },
    throw: { in: 'Throw · 50×65"', cm: "Throw · 127×165 cm" },
    twin: { in: 'Twin · 68×86 to 70×90"', cm: "Twin · 173×218 to 178×229 cm" },
    double: { in: 'Double · 80×90 to 85×95"', cm: "Double · 203×229 to 216×241 cm" },
    queen: { in: 'Queen · 90×95 to 90×108"', cm: "Queen · 229×241 to 229×274 cm" },
    king: { in: 'King · 108×95 to 110×108"', cm: "King · 274×241 to 279×274 cm" },
  };

  function updatePresetOptionLabels(unit) {
    if (!quiltPresetSelect) return;
    Array.from(quiltPresetSelect.options).forEach((opt) => {
      const labels = PRESET_LABELS[opt.value];
      if (labels) {
        opt.textContent = unit === "cm" ? labels.cm : labels.in;
      }
    });
  }

  function syncRegionUI(unit) {
    const isMetric = unit === "cm";
    pageSizeSelect.value = isMetric ? "a4" : "letter";
    regionBtns.forEach((btn) => {
      const active = (isMetric && btn.dataset.region === "metric") || (!isMetric && btn.dataset.region === "us");
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    if (unitModeBadge) {
      unitModeBadge.textContent = isMetric ? "cm · A4" : "in · Letter";
    }
    unitLabels.forEach((el) => {
      el.textContent = unit;
    });
    updatePresetOptionLabels(unit);
  }

  function setPageSize(size) {
    const valid = size === "a4" ? "a4" : "letter";
    pageSizeSelect.value = valid;
  }

  // Switches global regional standard between US (in + Letter) and Metric / Rest of World (cm + A4)
  function setGlobalRegionMode(mode, { convertValues = true, record = true, persist = true } = {}) {
    const nextUnit = mode === "metric" ? "cm" : "in";
    const changed = nextUnit !== state.unit;

    if (changed && convertValues) {
      const factor = nextUnit === "cm" ? 2.54 : 1 / 2.54;
      state.finishedSquareSize = Math.round(state.finishedSquareSize * factor * 100) / 100;
      state.seamAllowance = Math.round(state.seamAllowance * factor * 100) / 100;
      if (state.targetQuiltSize) {
        state.targetQuiltSize = {
          ...state.targetQuiltSize,
          w: state.targetQuiltSize.w * factor,
          h: state.targetQuiltSize.h * factor,
        };
      }
    }

    state.unit = nextUnit;
    finishedSizeInput.value = formatNumericInput(state.finishedSquareSize);
    seamAllowanceInput.value = formatNumericInput(state.seamAllowance);
    finishedSizeInput.step = nextUnit === "cm" ? "0.5" : "0.25";
    seamAllowanceInput.step = nextUnit === "cm" ? "0.1" : "0.125";

    syncRegionUI(nextUnit);

    if (persist) {
      try {
        localStorage.setItem("quiltcaster-region", mode === "metric" ? "metric" : "us");
      } catch {
        // Ignore storage restrictions in private browsing
      }
    }

    if (state.image) {
      updateQuiltDimensions();
      if (!cropStage.hidden) {
        updateCropLockUI();
        renderCropCanvas();
      }
      if (changed && record) {
        recordHistory(nextUnit === "cm" ? "Mode: Metric (cm · A4)" : "Mode: US (in · Letter)");
      }
    }
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

  function getCurrentProjectTitle() {
    const custom = fileNameLabel ? fileNameLabel.value.trim() : "";
    return custom || derivePatternTitle(state.fileName) || "Custom Pixel Quilt";
  }

  function syncProjectTitle(title, sourceEl = null) {
    const val = title || "";
    if (fileNameLabel && sourceEl !== fileNameLabel) {
      fileNameLabel.value = val;
    }
    const clean = val.trim();
    document.title = clean ? `${clean} · Miriam's Quiltcaster` : "Miriam's Quiltcaster";
  }

  if (fileNameLabel) {
    fileNameLabel.addEventListener("input", () => {
      syncProjectTitle(fileNameLabel.value, fileNameLabel);
      const clean = fileNameLabel.value.trim();
      recordHistory(clean ? `Renamed to "${clean}"` : "Cleared title", "title");
    });
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

  // Resolution-independent 240×240 normalized preference mask (matches HARD_MAX_COLS = 240):
  //   0 = Auto (governed by global HST toggle & ratio)
  //   1 = Force Solid Square
  //   2 = Force HST (auto sharpest '/' or '\' diagonal)
  //   3 = Force '/' HST
  //   4 = Force '\' HST
  const PAINT_MASK_RES = 240;

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
    // Grid, Block Layout & Half-Square Triangles (HSTs)
    gridLayout: "grid", // "grid" | "staggered" | "brick" | "subway" | "vertical-brick"
    layoutCells: [], // Array of { idx, c, r, x0, y0, x1, y1, isHalf }
    layoutCellW: 0, // Last rendered cell width (px) on preview canvas
    layoutCellH: 0, // Last rendered cell height (px) on preview canvas
    cols: Number(squaresSlider.value),
    rows: 1,
    squareAverages: [], // Array of [r, g, b] for each cell (length = cols * rows)
    hstSlashAverages: [], // Array of [tlR, tlG, tlB, brR, brG, brB] per cell (/ diagonal)
    hstBackslashAverages: [], // Array of [blR, blG, blB, trR, trG, trB] per cell (\ diagonal)
    cellDiagStats: [], // Exact per-cell internal RGB variance & counts for true pixel-level SSE & diagonal dominance
    hstEnabled: hstToggle ? hstToggle.checked : false,
    hstMode: "edges", // "edges" (Edge Refinement) | "ratio" (Overall Ratio)
    hstEdgeSensitivity: hstEdgeSlider ? Number(hstEdgeSlider.value) : 55,
    hstRatio: hstRatioSlider ? Number(hstRatioSlider.value) : 35,
    hstCount: 0,
    smoothableDiag: new Uint8Array(0), // Per-cell: 0 = flat/non-edge, 1 = '/' smooths edge, 2 = '\' smooths edge
    paintMask: new Uint8Array(PAINT_MASK_RES * PAINT_MASK_RES),
    paintMode: false,
    panMode: false,
    paintBrush: "hst", // "color" | "hst-slash" | "hst-back" | "fill" | "hst" | "square" | "auto"
    paintSize: 3, // 1 | 3 | 5
    paintFabricIdx: 0, // Active palette index when painting colors/fabrics
    isBlankQuilt: false, // True when started from Paint Blank Quilt (no source photo)
    activeMathPattern: "", // Currently generated fractal/math pattern id (auto-regenerates on resize/layout change)
    mathParams: {}, // Live parameter values for the active math/fractal pattern
    mathTransform: { offsetX: 0, offsetY: 0, scale: 1.0, rotate: 0 }, // Universal pan/zoom/rotate for all generated patterns
    mathReversePalette: false,
    activeMap: null, // { lat, lon, zoom, style, label, extractColors, stitchCanvas, cropX, cropY } when viewing a Map/Satellite quilt
    manualCells: new Map(), // "col,row" -> { t: 0|1|2, a: palIdx, b: palIdx }
    paintedCellsCount: 0,
    hasPaintedMask: false,
    cellTypes: new Uint8Array(0), // 0 = solid square, 1 = '/' HST (TL+BR), 2 = '\' HST (BL+TR)
    gridAssignments: new Int32Array(0), // Primary palette index (solid square, or Half A: TL / BL)
    gridAssignmentsB: new Int32Array(0), // Secondary palette index (Half B: BR / TR for HSTs, -1 for solid)
    solidCounts: new Int32Array(0), // Solid square count per palette color
    hstHalfCounts: new Int32Array(0), // HST triangle half count per palette color
    hstStarterCounts: new Int32Array(0), // 2-at-a-time HST starter squares needed per palette color
    usageCounts: new Int32Array(0), // Total pieces (solid + HST halves) per palette color
    // Palette: array of { id, r, g, b }
    palette: [],
    // Optional luminance-ordered source RGB clusters captured before a harmony palette swap,
    // allowing photos & satellite maps to keep their exact contours and HST diagonals while swapping fabrics
    sourcePalette: null,
    harmonyConfig: {
      tab: "math", // "math" | "curated"
      curatedId: "pnw",
      rule: "triadic",
      baseHue: 210,
      saturation: 62,
      contrast: 74,
      library: "kona",
      preserveSlots: true,
      reverseValues: false,
      lastMathTargets: [],
    },
    nextColorId: 1,
    showSeamLines: true,
    showThirdsOverlay: false,
    showingOriginal: false,
    // Physical quilt sizing
    unit: "in",
    finishedSquareSize: Number(finishedSizeInput.value) || 2.5,
    seamAllowance: Number(seamAllowanceInput.value) || 0.25,
    // Optional locked target quilt size ({ w, h, label } in current unit) when a preset or W×H is chosen
    targetQuiltSize: null,
    // Persistent Undo/Redo stack (saved inside .quilt pattern files)
    history: [],
    historyIndex: -1,
    isRestoringHistory: false,
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

  // Curated Kaffe Fassett (FreeSpirit Classics & Collective) fabric catalog
  const KAFFE_FASSETT_FABRICS = [
    { id: "kf-abdot-turq", name: "Aboriginal Dot Turquoise", designer: "Kaffe Fassett", rgb: [42, 162, 174], colors: ["#1f9aa8", "#74dce0", "#f4d458", "#e86488", "#185866"], style: "dots" },
    { id: "kf-abdot-black", name: "Aboriginal Dot Black", designer: "Kaffe Fassett", rgb: [34, 34, 38], colors: ["#1e1e22", "#e85468", "#48b8c4", "#f0c848", "#88c454"], style: "dots" },
    { id: "kf-abdot-red", name: "Aboriginal Dot Red", designer: "Kaffe Fassett", rgb: [188, 42, 48], colors: ["#b82830", "#f4a442", "#f6d868", "#e87898", "#6e1620"], style: "dots" },
    { id: "kf-abdot-lime", name: "Aboriginal Dot Lime", designer: "Kaffe Fassett", rgb: [132, 184, 62], colors: ["#82b83c", "#d8ec68", "#3ea89c", "#f4c842", "#4c7828"], style: "dots" },
    { id: "kf-abdot-plum", name: "Aboriginal Dot Plum", designer: "Kaffe Fassett", rgb: [108, 46, 98], colors: ["#682c60", "#d864a8", "#5498c8", "#f2b858", "#3e183c"], style: "dots" },
    { id: "kf-abdot-ochre", name: "Aboriginal Dot Ochre", designer: "Kaffe Fassett", rgb: [204, 148, 48], colors: ["#c8922e", "#f6d668", "#c85238", "#4a8478", "#7c5218"], style: "dots" },
    { id: "kf-rglass-red", name: "Roman Glass Red", designer: "Kaffe Fassett", rgb: [184, 52, 62], colors: ["#7a1c28", "#c8343e", "#ec7854", "#f4c458", "#94346c"], style: "roman-glass" },
    { id: "kf-rglass-turq", name: "Roman Glass Turquoise", designer: "Kaffe Fassett", rgb: [44, 148, 162], colors: ["#185868", "#2d96a4", "#7ad8d4", "#4e6cb8", "#d8e488"], style: "roman-glass" },
    { id: "kf-rglass-purple", name: "Roman Glass Purple", designer: "Kaffe Fassett", rgb: [112, 58, 146], colors: ["#3e1e5e", "#743c9c", "#b874d8", "#4898c8", "#e87ca8"], style: "roman-glass" },
    { id: "kf-rglass-emerald", name: "Roman Glass Emerald", designer: "Kaffe Fassett", rgb: [46, 134, 86], colors: ["#1c5838", "#328c58", "#88cc68", "#3ca4a8", "#e8d658"], style: "roman-glass" },
    { id: "kf-rglass-pink", name: "Roman Glass Pink", designer: "Kaffe Fassett", rgb: [216, 102, 138], colors: ["#943258", "#dc668c", "#f4a8c0", "#f2b468", "#7c64b4"], style: "roman-glass" },
    { id: "kf-paper-jewel", name: "Paperweight Jewel", designer: "Kaffe Fassett", rgb: [98, 56, 132], colors: ["#281c48", "#c83868", "#3ca4b8", "#f2bc44", "#68b858"], style: "paperweight" },
    { id: "kf-paper-teal", name: "Paperweight Teal", designer: "Kaffe Fassett", rgb: [38, 126, 136], colors: ["#1a4e58", "#2d8c98", "#7ed2cc", "#e89248", "#c84c78"], style: "paperweight" },
    { id: "kf-paper-pumpkin", name: "Paperweight Pumpkin", designer: "Kaffe Fassett", rgb: [212, 104, 46], colors: ["#7c3018", "#d8682c", "#f4b448", "#4c8878", "#c44458"], style: "paperweight" },
    { id: "kf-paper-purple", name: "Paperweight Purple", designer: "Kaffe Fassett", rgb: [122, 68, 152], colors: ["#3c2058", "#7e44a2", "#c484dc", "#4cb4a8", "#f0b858"], style: "paperweight" },
    { id: "kf-stripe-bright", name: "Artisan Stripe Brights", designer: "Kaffe Fassett", rgb: [172, 86, 98], colors: ["#c83848", "#3288a8", "#e8b438", "#5c9e54", "#7a3e8c"], style: "stripe" },
  ];

  // Curated Brandon Mably (Kaffe Fassett Collective / FreeSpirit) graphic & geometric fabric catalog
  const BRANDON_MABLY_FABRICS = [
    { id: "bm-game-magenta", name: "Gameboard Magenta", designer: "Brandon Mably", rgb: [178, 48, 114], colors: ["#b62e72", "#e86aa8", "#3888b8", "#f2c448", "#2c1e38"], style: "gameboard" },
    { id: "bm-game-black", name: "Gameboard Black", designer: "Brandon Mably", rgb: [42, 42, 48], colors: ["#222228", "#e85448", "#48b4a8", "#f2c844", "#f0ece4"], style: "gameboard" },
    { id: "bm-game-purple", name: "Gameboard Purple", designer: "Brandon Mably", rgb: [108, 62, 148], colors: ["#6c3e94", "#a874d4", "#48a898", "#e88454", "#2e1c48"], style: "gameboard" },
    { id: "bm-bubble-aqua", name: "Bubble Stripe Aqua", designer: "Brandon Mably", rgb: [66, 174, 182], colors: ["#3caab4", "#98e2e4", "#f2cc48", "#e86888", "#246474"], style: "bubble-stripe" },
    { id: "bm-bubble-yellow", name: "Bubble Stripe Yellow", designer: "Brandon Mably", rgb: [228, 182, 54], colors: ["#e6b834", "#fae078", "#d85842", "#4898a8", "#946418"], style: "bubble-stripe" },
    { id: "bm-bubble-red", name: "Bubble Stripe Red", designer: "Brandon Mably", rgb: [194, 52, 58], colors: ["#c4343a", "#f07c68", "#f6ce58", "#3e8898", "#741a24"], style: "bubble-stripe" },
    { id: "bm-gingham-coral", name: "Gingham Coral", designer: "Brandon Mably", rgb: [224, 112, 96], colors: ["#e06c5c", "#f4a898", "#fbf2ee", "#c44238", "#f4cc78"], style: "gingham" },
    { id: "bm-gingham-purple", name: "Gingham Purple", designer: "Brandon Mably", rgb: [126, 78, 158], colors: ["#7c4c9e", "#b890d4", "#f2eaf8", "#4c286c", "#68b4b8"], style: "gingham" },
    { id: "bm-gingham-aqua", name: "Gingham Aqua", designer: "Brandon Mably", rgb: [72, 168, 176], colors: ["#46a6b0", "#98d8dc", "#eef8f8", "#226c78", "#e8c458"], style: "gingham" },
    { id: "bm-wobble-blue", name: "Wobble Blue", designer: "Brandon Mably", rgb: [48, 94, 164], colors: ["#1e4484", "#3668b8", "#7eb4e4", "#e8f0f8", "#288898"], style: "wobble" },
    { id: "bm-wobble-red", name: "Wobble Red", designer: "Brandon Mably", rgb: [188, 52, 62], colors: ["#7e1c24", "#c4343e", "#ec7e68", "#f6d078", "#a43868"], style: "wobble" },
    { id: "bm-wobble-green", name: "Wobble Green", designer: "Brandon Mably", rgb: [68, 146, 86], colors: ["#286438", "#469458", "#96cc78", "#e4e482", "#2e8488"], style: "wobble" },
    { id: "bm-comb-teal", name: "Comb Stripe Teal", designer: "Brandon Mably", rgb: [38, 128, 134], colors: ["#1a5c64", "#2c8c94", "#78c8c4", "#e88448", "#f2cc58"], style: "stripe" },
    { id: "bm-comb-rust", name: "Comb Stripe Rust", designer: "Brandon Mably", rgb: [176, 84, 48], colors: ["#7c3018", "#b8542e", "#e49654", "#488488", "#e8d488"], style: "stripe" },
    { id: "bm-fronds-turq", name: "Fronds Turquoise", designer: "Brandon Mably", rgb: [46, 152, 164], colors: ["#1c6874", "#329ca8", "#88dcd8", "#c8e068", "#e87888"], style: "chrysanthemum" },
    { id: "bm-checkmate-blue", name: "Checkmate Blue", designer: "Brandon Mably", rgb: [44, 78, 138], colors: ["#1e3868", "#345ea4", "#84b4e0", "#f0ece4", "#d87448"], style: "gameboard" },
  ];

  // Curated Philip Jacobs / Kaffe Fassett Collective (FreeSpirit) patterned fabric catalog
  // Modeled on My Favorite Quilt Store's Philip Jacobs collection (myfavoritequiltstore.com)
  const PHILIP_JACOBS_FABRICS = [
    { id: "pj-chrys-blue", name: "Japanese Chrysanthemum Blue", rgb: [54, 72, 148], colors: ["#1d2b68", "#3a54a8", "#6d78d4", "#d94f90", "#2f8ca6"], style: "chrysanthemum" },
    { id: "pj-chrys-purple", name: "Japanese Chrysanthemum Purple", rgb: [112, 62, 156], colors: ["#3c1d66", "#783ca8", "#b46be0", "#2fa89c", "#5b7ee0"], style: "chrysanthemum" },
    { id: "pj-chrys-magenta", name: "Japanese Chrysanthemum Magenta", rgb: [184, 48, 114], colors: ["#6e1542", "#c42e78", "#e86aa8", "#f0a058", "#502878"], style: "chrysanthemum" },
    { id: "pj-house-leeks-red", name: "House Leeks Red", rgb: [178, 84, 68], colors: ["#7a2628", "#c84b36", "#df8a44", "#7e9648", "#8d3c68"], style: "rosette" },
    { id: "pj-flora-green", name: "Flora Green", rgb: [116, 152, 92], colors: ["#3e6b46", "#78ad58", "#b2d478", "#8a72c4", "#e0c862"], style: "dahlia" },
    { id: "pj-shaggy-aqua", name: "Shaggy Aqua", rgb: [64, 166, 174], colors: ["#1e6878", "#38a8b2", "#88d6d4", "#e8c454", "#2e4884"], style: "shaggy" },
    { id: "pj-van-gogh-black", name: "Van Gogh Black", rgb: [44, 48, 62], colors: ["#1b1e28", "#344468", "#d6a438", "#c85c42", "#4e8e7c"], style: "swirl" },
    { id: "pj-brocade-peony-hot", name: "Brocade Peony Hot", rgb: [196, 62, 82], colors: ["#781a2c", "#d43652", "#f28444", "#f0c852", "#4c8456"], style: "peony" },
    { id: "pj-brocade-peony-nat", name: "Brocade Peony Natural", rgb: [212, 198, 176], colors: ["#e8dec8", "#c9b596", "#a87458", "#7e9478", "#d49c88"], style: "peony" },
    { id: "pj-guinea-white", name: "White Guinea Flower", rgb: [228, 220, 212], colors: ["#f2ece4", "#d8c8bc", "#e898a8", "#648e66", "#3a4048"], style: "dahlia" },
    { id: "pj-dancing-dahlias", name: "Dancing Dahlias Crimson", rgb: [172, 46, 56], colors: ["#5e1620", "#b82c38", "#e86452", "#f2b84c", "#3a6e4c"], style: "dahlia" },
    { id: "pj-cactus-gold", name: "Cactus Flower Gold", rgb: [212, 162, 54], colors: ["#946218", "#d89c28", "#f4cc58", "#c8543c", "#4e8458"], style: "chrysanthemum" },
    { id: "pj-hokusai-cobalt", name: "Hokusai's Mums Cobalt", rgb: [38, 86, 152], colors: ["#183668", "#2a5ea8", "#6ea4dc", "#e8d6a8", "#2c7c88"], style: "chrysanthemum" },
    { id: "pj-coleus-contrast", name: "Coleus Contrast", rgb: [98, 56, 78], colors: ["#321c2c", "#7e2c52", "#c44c68", "#88b454", "#e4c852"], style: "rosette" },
    { id: "pj-brassica-forest", name: "Brassica Forest", rgb: [52, 96, 68], colors: ["#1f4230", "#3a6e4c", "#6ea474", "#9c82b8", "#c8d688"], style: "rosette" },
    { id: "pj-millefiore-berry", name: "Millefiore Berry", rgb: [148, 54, 108], colors: ["#561c42", "#9e3472", "#d8649c", "#548ec4", "#f0b458"], style: "dahlia" },
    { id: "pj-gradi-teal", name: "Gradi Floral Teal", rgb: [42, 124, 128], colors: ["#1a565c", "#2d848a", "#68b8b4", "#e08468", "#f2d282"], style: "peony" },
    { id: "pj-petunias-rose", name: "Petunias Rose", rgb: [204, 108, 134], colors: ["#8e3654", "#cf6282", "#eda0b4", "#74a46c", "#f4d898"], style: "peony" },
    { id: "pj-pinwheels-indigo", name: "Pinwheels Indigo", rgb: [46, 56, 102], colors: ["#1d2448", "#36447c", "#6c7eb8", "#d88454", "#54a8a4"], style: "swirl" },
    { id: "pj-onion-rings-rust", name: "Onion Rings Rust", rgb: [176, 94, 54], colors: ["#7a341c", "#b8582c", "#e09248", "#c8b878", "#4c5c64"], style: "swirl" },
    { id: "pj-snow-leopard-grey", name: "Snow Leopard Grey", rgb: [144, 142, 138], colors: ["#5c5a56", "#908e88", "#c6c2ba", "#383634", "#d8cfc2"], style: "shaggy" },
    { id: "pj-exotic-coral", name: "Exotic Bloom Coral", rgb: [224, 114, 92], colors: ["#a83e2e", "#e26e56", "#f6a688", "#589e8c", "#f2d068"], style: "peony" },
    { id: "pj-gardenia-sage", name: "Gardenia Sage", rgb: [148, 174, 146], colors: ["#5a785c", "#8ea88c", "#c6d8be", "#f2ece0", "#c88e84"], style: "dahlia" },
    { id: "pj-lotus-plum", name: "Lotus Pond Plum", rgb: [98, 52, 92], colors: ["#3e1c3a", "#6e3468", "#a85c9c", "#4c8878", "#e8a472"], style: "chrysanthemum" },
  ];

  const pjSwatchCache = new Map();

  function getPhilipJacobsDataUrl(fabric) {
    if (!fabric) return null;
    if (pjSwatchCache.has(fabric.id)) return pjSwatchCache.get(fabric.id);
    const size = 192;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    const pal = fabric.colors;

    // Seeded deterministic PRNG per fabric
    let seed = 0;
    for (let i = 0; i < fabric.id.length; i++) seed = (seed * 31 + fabric.id.charCodeAt(i)) | 0;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return ((seed >>> 0) % 10000) / 10000;
    };

    // Rich painted background
    ctx.fillStyle = pal[0];
    ctx.fillRect(0, 0, size, size);

    // Kaffe Fassett & Brandon Mably dedicated graphic/dot/glass/weave motif renderers
    if (fabric.style === "dots") {
      // Kaffe Fassett Aboriginal Dot: organic multi-sized colorful dot field
      const step = 16;
      for (let gy = 0; gy < size; gy += step) {
        for (let gx = 0; gx < size; gx += step) {
          const jx = (rand() - 0.5) * 6;
          const jy = (rand() - 0.5) * 6;
          const r = 2.6 + rand() * 3.8;
          ctx.fillStyle = pal[1 + Math.floor(rand() * (pal.length - 1))];
          ctx.beginPath();
          ctx.arc((gx + 8 + jx + size) % size, (gy + 8 + jy + size) % size, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const dataUrl = c.toDataURL("image/jpeg", 0.88);
      pjSwatchCache.set(fabric.id, dataUrl);
      return dataUrl;
    }

    if (fabric.style === "roman-glass") {
      // Kaffe Fassett Roman Glass: concentric mottled blown-glass rings & flecks
      for (let i = 0; i < 24; i++) {
        const cx = rand() * size;
        const cy = rand() * size;
        const r = 10 + rand() * 20;
        for (let ox = -size; ox <= size; ox += size) {
          for (let oy = -size; oy <= size; oy += size) {
            const x = cx + ox;
            const y = cy + oy;
            if (x + r < 0 || x - r > size || y + r < 0 || y - r > size) continue;
            ctx.fillStyle = pal[1 + (i % (pal.length - 1))];
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = pal[(i + 2) % pal.length];
            ctx.beginPath();
            ctx.arc(x, y, r * 0.58, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = pal[(i + 3) % pal.length];
            ctx.beginPath();
            ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      const dataUrl = c.toDataURL("image/jpeg", 0.88);
      pjSwatchCache.set(fabric.id, dataUrl);
      return dataUrl;
    }

    if (fabric.style === "paperweight") {
      // Kaffe Fassett Paperweight: bold layered concentric glass medallions
      for (let i = 0; i < 9; i++) {
        const cx = rand() * size;
        const cy = rand() * size;
        const r = 24 + rand() * 22;
        for (let ox = -size; ox <= size; ox += size) {
          for (let oy = -size; oy <= size; oy += size) {
            const x = cx + ox;
            const y = cy + oy;
            if (x + r < 0 || x - r > size || y + r < 0 || y - r > size) continue;
            for (let ring = 4; ring >= 1; ring--) {
              ctx.fillStyle = pal[(i + ring) % pal.length];
              ctx.beginPath();
              ctx.arc(x, y, (r * ring) / 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      const dataUrl = c.toDataURL("image/jpeg", 0.88);
      pjSwatchCache.set(fabric.id, dataUrl);
      return dataUrl;
    }

    if (fabric.style === "stripe" || fabric.style === "bubble-stripe") {
      const cols = 8;
      const bw = size / cols;
      for (let i = 0; i < cols; i++) {
        ctx.fillStyle = pal[i % pal.length];
        ctx.fillRect(i * bw, 0, bw + 1, size);
        if (fabric.style === "bubble-stripe") {
          ctx.fillStyle = pal[(i + 2) % pal.length];
          for (let y = 10; y < size; y += 20) {
            ctx.beginPath();
            ctx.arc(i * bw + bw * 0.5, y + (i % 2) * 8, bw * 0.28, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      const dataUrl = c.toDataURL("image/jpeg", 0.88);
      pjSwatchCache.set(fabric.id, dataUrl);
      return dataUrl;
    }

    if (fabric.style === "gameboard" || fabric.style === "gingham") {
      const n = fabric.style === "gingham" ? 6 : 8;
      const sq = size / n;
      for (let r = 0; r < n; r++) {
        for (let col = 0; col < n; col++) {
          if (fabric.style === "gingham") {
            const idx = (r % 2) + (col % 2);
            ctx.fillStyle = pal[idx % pal.length];
          } else {
            ctx.fillStyle = pal[(r * 3 + col * 5 + Math.floor(rand() * 2)) % pal.length];
          }
          ctx.fillRect(col * sq, r * sq, sq + 0.5, sq + 0.5);
        }
      }
      const dataUrl = c.toDataURL("image/jpeg", 0.88);
      pjSwatchCache.set(fabric.id, dataUrl);
      return dataUrl;
    }

    if (fabric.style === "wobble") {
      const bands = 10;
      const bh = size / bands;
      for (let b = 0; b < bands; b++) {
        ctx.strokeStyle = pal[b % pal.length];
        ctx.lineWidth = bh * 0.72;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 6) {
          const y = (b + 0.5) * bh + Math.sin((x / size) * Math.PI * 4 + b * 0.9) * 7;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const dataUrl = c.toDataURL("image/jpeg", 0.88);
      pjSwatchCache.set(fabric.id, dataUrl);
      return dataUrl;
    }

    // Subtle painterly background wash
    for (let i = 0; i < 18; i++) {
      const gx = rand() * size;
      const gy = rand() * size;
      const gr = 24 + rand() * 44;
      ctx.fillStyle = pal[1 + (i % (pal.length - 1))];
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const drawFloralHead = (cx, cy, radius, style) => {
      // Draw wrapped across edges so the tile repeats organically
      for (let ox = -size; ox <= size; ox += size) {
        for (let oy = -size; oy <= size; oy += size) {
          const x = cx + ox;
          const y = cy + oy;
          if (x + radius < -4 || x - radius > size + 4 || y + radius < -4 || y - radius > size + 4) continue;
          ctx.save();
          ctx.translate(x, y);
          if (style === "chrysanthemum") {
            const petals = 20;
            for (let ring = 0; ring < 3; ring++) {
              const rLen = radius * (1 - ring * 0.26);
              const col = pal[(ring + 1) % pal.length];
              ctx.fillStyle = col;
              for (let p = 0; p < petals; p++) {
                const ang = (p / petals) * Math.PI * 2 + ring * 0.22;
                ctx.save();
                ctx.rotate(ang);
                ctx.beginPath();
                ctx.ellipse(rLen * 0.56, 0, rLen * 0.52, rLen * 0.14, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
            }
            ctx.fillStyle = pal[pal.length - 1];
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
            ctx.fill();
          } else if (style === "dahlia" || style === "rosette") {
            const rings = style === "rosette" ? 4 : 3;
            for (let ring = 0; ring < rings; ring++) {
              const count = 12 - ring * 2;
              const rDist = radius * (0.72 - ring * 0.2);
              const pRad = radius * (0.32 - ring * 0.05);
              ctx.fillStyle = pal[(ring + 1) % pal.length];
              for (let p = 0; p < count; p++) {
                const ang = (p / count) * Math.PI * 2 + ring * 0.35;
                ctx.beginPath();
                ctx.arc(Math.cos(ang) * rDist, Math.sin(ang) * rDist, pRad, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = pal[0];
                ctx.lineWidth = 1.2;
                ctx.stroke();
              }
            }
            ctx.fillStyle = pal[pal.length - 1];
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
            ctx.fill();
          } else if (style === "peony") {
            for (let ring = 0; ring < 3; ring++) {
              const count = 7 + ring * 2;
              const rDist = radius * (0.58 - ring * 0.16);
              ctx.fillStyle = pal[(ring + 1) % pal.length];
              for (let p = 0; p < count; p++) {
                const ang = (p / count) * Math.PI * 2 + ring * 0.4;
                ctx.beginPath();
                ctx.ellipse(
                  Math.cos(ang) * rDist,
                  Math.sin(ang) * rDist,
                  radius * (0.42 - ring * 0.08),
                  radius * (0.28 - ring * 0.05),
                  ang,
                  0,
                  Math.PI * 2
                );
                ctx.fill();
              }
            }
            ctx.fillStyle = pal[3 % pal.length];
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
            ctx.fill();
          } else if (style === "swirl") {
            for (let ring = 4; ring >= 1; ring--) {
              ctx.strokeStyle = pal[ring % pal.length];
              ctx.lineWidth = 5;
              ctx.beginPath();
              ctx.arc(0, 0, (radius * ring) / 4, 0, Math.PI * 1.85);
              ctx.stroke();
            }
          } else {
            // Shaggy painterly strokes
            for (let k = 0; k < 16; k++) {
              const ang = (k / 16) * Math.PI * 2;
              ctx.strokeStyle = pal[1 + (k % (pal.length - 1))];
              ctx.lineWidth = 4.5;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(Math.cos(ang) * radius, Math.sin(ang) * radius);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
    };

    const motifCount = fabric.style === "shaggy" ? 11 : 7;
    for (let m = 0; m < motifCount; m++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rad = 28 + rand() * 26;
      drawFloralHead(cx, cy, rad, fabric.style);
    }

    const dataUrl = c.toDataURL("image/jpeg", 0.88);
    pjSwatchCache.set(fabric.id, dataUrl);
    return dataUrl;
  }

  function getClosestPhilipJacobsMatch(r, g, b) {
    let best = PHILIP_JACOBS_FABRICS[0];
    let bestDist = Infinity;
    for (let i = 0; i < PHILIP_JACOBS_FABRICS.length; i++) {
      const f = PHILIP_JACOBS_FABRICS[i];
      const d = colorDistanceSq(r, g, b, f.rgb[0], f.rgb[1], f.rgb[2]);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  }

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
    const pj = getClosestPhilipJacobsMatch(r, g, b);
    return {
      name: bestEntry[0],
      konaName: bestEntry[4],
      konaSku: bestEntry[5],
      bellaName: bestEntry[6],
      pjName: `Philip Jacobs ${pj.name}`,
      pjUrl: `https://myfavoritequiltstore.com/search?q=${encodeURIComponent(`Philip Jacobs ${pj.name}`)}`,
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

  // Supported quilt block layouts (Square Grid + Staggered / Brick / Subway / Half-Drop)
  const GRID_LAYOUTS = {
    grid: { id: "grid", label: "Square Grid", aspect: 1.0, stagger: "none", supportsHst: true, unitName: "square" },
    staggered: { id: "staggered", label: "Staggered Squares", aspect: 1.0, stagger: "row", supportsHst: false, unitName: "square" },
    brick: { id: "brick", label: "Brick (Running Bond)", aspect: 1.5, stagger: "row", supportsHst: false, unitName: "brick" },
    subway: { id: "subway", label: "Subway Tile", aspect: 2.0, stagger: "row", supportsHst: false, unitName: "tile" },
    "vertical-brick": { id: "vertical-brick", label: "Vertical Brick", aspect: 2 / 3, stagger: "col", supportsHst: false, unitName: "brick" },
  };

  function getLayoutConfig(layoutId = state.gridLayout) {
    return GRID_LAYOUTS[layoutId] || GRID_LAYOUTS.grid;
  }

  function getUnitFinishedDims(finished = state.finishedSquareSize, layoutId = state.gridLayout) {
    const cfg = getLayoutConfig(layoutId);
    const base = Math.max(0.1, finished);
    if (cfg.aspect >= 1) {
      return { w: base * cfg.aspect, h: base };
    }
    return { w: base, h: base / cfg.aspect };
  }

  function buildLayoutCells(cols, rows, layoutId = state.gridLayout) {
    const cfg = getLayoutConfig(layoutId);
    const cells = [];
    if (cfg.stagger === "row") {
      for (let r = 0; r < rows; r++) {
        if (r % 2 === 0) {
          for (let c = 0; c < cols; c++) {
            cells.push({ idx: cells.length, c, r, x0: c, y0: r, x1: c + 1, y1: r + 1, isHalf: false });
          }
        } else {
          cells.push({ idx: cells.length, c: 0, r, x0: 0, y0: r, x1: 0.5, y1: r + 1, isHalf: true });
          for (let c = 1; c < cols; c++) {
            cells.push({ idx: cells.length, c, r, x0: c - 0.5, y0: r, x1: c + 0.5, y1: r + 1, isHalf: false });
          }
          cells.push({ idx: cells.length, c: cols, r, x0: cols - 0.5, y0: r, x1: cols, y1: r + 1, isHalf: true });
        }
      }
    } else if (cfg.stagger === "col") {
      for (let c = 0; c < cols; c++) {
        if (c % 2 === 0) {
          for (let r = 0; r < rows; r++) {
            cells.push({ idx: cells.length, c, r, x0: c, y0: r, x1: c + 1, y1: r + 1, isHalf: false });
          }
        } else {
          cells.push({ idx: cells.length, c, r: 0, x0: c, y0: 0, x1: c + 1, y1: 0.5, isHalf: true });
          for (let r = 1; r < rows; r++) {
            cells.push({ idx: cells.length, c, r, x0: c, y0: r - 0.5, x1: c + 1, y1: r + 0.5, isHalf: false });
          }
          cells.push({ idx: cells.length, c, r: rows, x0: c, y0: rows - 0.5, x1: c + 1, y1: rows, isHalf: true });
        }
      }
    } else {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({ idx: cells.length, c, r, x0: c, y0: r, x1: c + 1, y1: r + 1, isHalf: false });
        }
      }
    }
    return cells;
  }

  function lookupLayoutCellIndex(fx, fy, cols, rows, layoutId = state.gridLayout) {
    const cfg = getLayoutConfig(layoutId);
    if (cfg.stagger === "row") {
      const r = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
      const evenBefore = Math.ceil(r / 2);
      const oddBefore = Math.floor(r / 2);
      const rowStart = evenBefore * cols + oddBefore * (cols + 1);
      if (r % 2 === 0) {
        const c = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
        return rowStart + c;
      }
      if (fx < 0.5) return rowStart;
      if (fx >= cols - 0.5) return rowStart + cols;
      const c = Math.max(1, Math.min(cols - 1, Math.floor(fx + 0.5)));
      return rowStart + c;
    }
    if (cfg.stagger === "col") {
      const c = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
      const evenBefore = Math.ceil(c / 2);
      const oddBefore = Math.floor(c / 2);
      const colStart = evenBefore * rows + oddBefore * (rows + 1);
      if (c % 2 === 0) {
        const r = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
        return colStart + r;
      }
      if (fy < 0.5) return colStart;
      if (fy >= rows - 0.5) return colStart + rows;
      const r = Math.max(1, Math.min(rows - 1, Math.floor(fy + 0.5)));
      return colStart + r;
    }
    const r = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
    const c = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
    return r * cols + c;
  }

  function syncGridLayoutUI() {
    const cfg = getLayoutConfig();
    if (gridLayoutSelect && gridLayoutSelect.value !== cfg.id) {
      gridLayoutSelect.value = cfg.id;
    }
    const hstAllowed = cfg.supportsHst;
    if (hstSwitchRow) hstSwitchRow.hidden = !hstAllowed;
    if (hstControls) hstControls.hidden = !hstAllowed || !state.hstEnabled;
    // Hide HST paint brushes when in staggered rectangular layouts
    document.querySelectorAll('[data-paint-brush="hst-slash"], [data-paint-brush="hst-back"], [data-paint-brush="hst"]').forEach((el) => {
      if (el.dataset.photoOnly === "true" && state.isBlankQuilt) {
        el.hidden = true;
      } else {
        el.hidden = !hstAllowed;
      }
    });
    if (!hstAllowed && (state.paintBrush === "hst-slash" || state.paintBrush === "hst-back" || state.paintBrush === "hst")) {
      setPaintBrush("color");
    }
  }

  function computeSquareAverages(skipInputEl = null) {
    if (!state.samplePixels) return;

    const w = state.sampleWidth;
    const h = state.sampleHeight;
    const cols = state.cols;
    const cfg = getLayoutConfig();
    // Preserve exact image aspect ratio using the layout's unit aspect (cellW / cellH)
    const rows = Math.max(1, Math.round((cols * cfg.aspect * h) / w));
    state.rows = rows;
    state.layoutCells = buildLayoutCells(cols, rows, cfg.id);

    const cellCount = state.layoutCells.length;
    const sumR = new Float64Array(cellCount);
    const sumG = new Float64Array(cellCount);
    const sumB = new Float64Array(cellCount);
    const sumSq = new Float64Array(cellCount);
    const counts = new Int32Array(cellCount);

    const isSquareGrid = cfg.stagger === "none";
    const data = state.samplePixels;

    if (!isSquareGrid) {
      // Exact pixel-footprint averaging for Staggered Squares, Brick, Subway Tile, and Vertical Brick
      for (let y = 0; y < h; y++) {
        const fy = ((y + 0.5) * rows) / h;
        for (let x = 0; x < w; x++) {
          const fx = ((x + 0.5) * cols) / w;
          const cIdx = lookupLayoutCellIndex(fx, fy, cols, rows, cfg.id);
          const pIdx = (y * w + x) * 4;
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
      state.hstSlashAverages = [];
      state.hstBackslashAverages = [];
      state.cellDiagStats = [];
      squaresValue.textContent = `${cols} × ${rows}`;
      updateUnitBreakdownLabels();
      updateQuiltDimensions(skipInputEl);
      return;
    }

    // Triangle accumulators for '/' (TL + BR) and '\' (BL + TR) Half-Square Triangles (Square Grid only)
    const tlR = new Float64Array(cellCount);
    const tlG = new Float64Array(cellCount);
    const tlB = new Float64Array(cellCount);
    const tlSq = new Float64Array(cellCount);
    const tlN = new Int32Array(cellCount);
    const brR = new Float64Array(cellCount);
    const brG = new Float64Array(cellCount);
    const brB = new Float64Array(cellCount);
    const brSq = new Float64Array(cellCount);
    const brN = new Int32Array(cellCount);

    const blR = new Float64Array(cellCount);
    const blG = new Float64Array(cellCount);
    const blB = new Float64Array(cellCount);
    const blSq = new Float64Array(cellCount);
    const blN = new Int32Array(cellCount);
    const trR = new Float64Array(cellCount);
    const trG = new Float64Array(cellCount);
    const trB = new Float64Array(cellCount);
    const trSq = new Float64Array(cellCount);
    const trN = new Int32Array(cellCount);

    // Axis-aligned half accumulators (left vs right, top vs bottom) for exact H/V vs diagonal variance comparison
    const leftR = new Float64Array(cellCount);
    const leftG = new Float64Array(cellCount);
    const leftB = new Float64Array(cellCount);
    const leftSq = new Float64Array(cellCount);
    const leftN = new Int32Array(cellCount);
    const topR = new Float64Array(cellCount);
    const topG = new Float64Array(cellCount);
    const topB = new Float64Array(cellCount);
    const topSq = new Float64Array(cellCount);
    const topN = new Int32Array(cellCount);

    for (let y = 0; y < h; y++) {
      const fy = ((y + 0.5) * rows) / h;
      const row = Math.min(rows - 1, Math.floor(fy));
      const v = fy - row;
      const rowOffset = row * cols;
      for (let x = 0; x < w; x++) {
        const fx = ((x + 0.5) * cols) / w;
        const col = Math.min(cols - 1, Math.floor(fx));
        const u = fx - col;
        const pIdx = (y * w + x) * 4;
        const rVal = data[pIdx];
        const gVal = data[pIdx + 1];
        const bVal = data[pIdx + 2];
        const pSq = rVal * rVal + gVal * gVal + bVal * bVal;
        const cIdx = rowOffset + col;

        sumR[cIdx] += rVal;
        sumG[cIdx] += gVal;
        sumB[cIdx] += bVal;
        sumSq[cIdx] += pSq;
        counts[cIdx]++;

        if (u < 0.5) {
          leftR[cIdx] += rVal;
          leftG[cIdx] += gVal;
          leftB[cIdx] += bVal;
          leftSq[cIdx] += pSq;
          leftN[cIdx]++;
        }
        if (v < 0.5) {
          topR[cIdx] += rVal;
          topG[cIdx] += gVal;
          topB[cIdx] += bVal;
          topSq[cIdx] += pSq;
          topN[cIdx]++;
        }

        if (u + v < 1 || (u + v === 1 && u < 0.5)) {
          tlR[cIdx] += rVal;
          tlG[cIdx] += gVal;
          tlB[cIdx] += bVal;
          tlSq[cIdx] += pSq;
          tlN[cIdx]++;
        } else {
          brR[cIdx] += rVal;
          brG[cIdx] += gVal;
          brB[cIdx] += bVal;
          brSq[cIdx] += pSq;
          brN[cIdx]++;
        }

        if (v > u || (v === u && v >= 0.5)) {
          blR[cIdx] += rVal;
          blG[cIdx] += gVal;
          blB[cIdx] += bVal;
          blSq[cIdx] += pSq;
          blN[cIdx]++;
        } else {
          trR[cIdx] += rVal;
          trG[cIdx] += gVal;
          trB[cIdx] += bVal;
          trSq[cIdx] += pSq;
          trN[cIdx]++;
        }
      }
    }

    const regionVar = (sr, sg, sb, sq, n) =>
      n > 0 ? Math.max(0, sq - (sr * sr + sg * sg + sb * sb) / n) : 0;

    const averages = new Array(cellCount);
    const slashAvgs = new Array(cellCount);
    const backslashAvgs = new Array(cellCount);
    const cellDiagStats = new Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      const n = counts[i] || 1;
      const ar = sumR[i] / n;
      const ag = sumG[i] / n;
      const ab = sumB[i] / n;
      averages[i] = [ar, ag, ab];

      slashAvgs[i] = [
        tlN[i] > 0 ? tlR[i] / tlN[i] : ar,
        tlN[i] > 0 ? tlG[i] / tlN[i] : ag,
        tlN[i] > 0 ? tlB[i] / tlN[i] : ab,
        brN[i] > 0 ? brR[i] / brN[i] : ar,
        brN[i] > 0 ? brG[i] / brN[i] : ag,
        brN[i] > 0 ? brB[i] / brN[i] : ab,
      ];

      backslashAvgs[i] = [
        blN[i] > 0 ? blR[i] / blN[i] : ar,
        blN[i] > 0 ? blG[i] / blN[i] : ag,
        blN[i] > 0 ? blB[i] / blN[i] : ab,
        trN[i] > 0 ? trR[i] / trN[i] : ar,
        trN[i] > 0 ? trG[i] / trN[i] : ag,
        trN[i] > 0 ? trB[i] / trN[i] : ab,
      ];

      const varWhole = regionVar(sumR[i], sumG[i], sumB[i], sumSq[i], n);
      const varSlash =
        regionVar(tlR[i], tlG[i], tlB[i], tlSq[i], tlN[i]) +
        regionVar(brR[i], brG[i], brB[i], brSq[i], brN[i]);
      const varBack =
        regionVar(blR[i], blG[i], blB[i], blSq[i], blN[i]) +
        regionVar(trR[i], trG[i], trB[i], trSq[i], trN[i]);

      const ln = leftN[i];
      const rn = n - ln;
      const varVert =
        regionVar(leftR[i], leftG[i], leftB[i], leftSq[i], ln) +
        regionVar(sumR[i] - leftR[i], sumG[i] - leftG[i], sumB[i] - leftB[i], sumSq[i] - leftSq[i], rn);

      const tn = topN[i];
      const bn = n - tn;
      const varHoriz =
        regionVar(topR[i], topG[i], topB[i], topSq[i], tn) +
        regionVar(sumR[i] - topR[i], sumG[i] - topG[i], sumB[i] - topB[i], sumSq[i] - topSq[i], bn);

      cellDiagStats[i] = {
        n,
        nTL: tlN[i],
        nBR: brN[i],
        nBL: blN[i],
        nTR: trN[i],
        varWhole,
        varSlash,
        varBack,
        minAxisVar: Math.min(varVert, varHoriz),
      };
    }
    state.squareAverages = averages;
    state.hstSlashAverages = slashAvgs;
    state.hstBackslashAverages = backslashAvgs;
    state.cellDiagStats = cellDiagStats;

    squaresValue.textContent = `${cols} × ${rows}`;
    updateUnitBreakdownLabels();
    updateQuiltDimensions(skipInputEl);
  }

  function updateUnitBreakdownLabels() {
    const cfg = getLayoutConfig();
    if (cfg.stagger !== "none" && state.layoutCells.length > 0) {
      let fullCnt = 0;
      let halfCnt = 0;
      for (let i = 0; i < state.layoutCells.length; i++) {
        if (state.layoutCells[i].isHalf) halfCnt++;
        else fullCnt++;
      }
      totalSquaresLabel.textContent = `${fullCnt.toLocaleString()} ${cfg.unitName}s · ${halfCnt} halves`;
    } else {
      const total = state.cols * state.rows;
      const hsts = state.hstEnabled ? state.hstCount : 0;
      const solids = Math.max(0, total - hsts);
      if (state.hstEnabled && hsts > 0) {
        totalSquaresLabel.textContent = `${solids.toLocaleString()} sq · ${hsts.toLocaleString()} HSTs`;
      } else {
        totalSquaresLabel.textContent = `${total.toLocaleString()} squares`;
      }
    }
    if (hstEdgeValue) {
      hstEdgeValue.textContent = `${state.hstEdgeSensitivity}%`;
    }
    if (hstRatioValue) {
      hstRatioValue.textContent = `${state.hstRatio}%`;
    }
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

  // Standard 2-at-a-time HST starter square cut size:
  // Finished square + 3.5 * seamAllowance (exact quilting standard: Finished + 7/8" at 1/4" seam).
  function getHstCutSize() {
    return Math.max(0.1, state.finishedSquareSize) + 3.5 * Math.max(0, state.seamAllowance);
  }

  function calculateColorFabric(solidSquareCount, hstStarterSquareCount = 0) {
    const unit = state.unit;
    const cutSize = Math.max(0.1, state.finishedSquareSize) + 2 * Math.max(0, state.seamAllowance);
    const hstCutSize = getHstCutSize();
    const wof = getUsableWof(unit);
    const squaresPerStrip = Math.max(1, Math.floor(wof / cutSize));
    const hstSquaresPerStrip = Math.max(1, Math.floor(wof / hstCutSize));
    if (solidSquareCount <= 0 && hstStarterSquareCount <= 0) {
      return {
        cutSize,
        hstCutSize,
        wof,
        squaresPerStrip,
        hstSquaresPerStrip,
        strips: 0,
        hstStrips: 0,
        length: 0,
        formatted: formatFabricAmount(0, unit),
      };
    }
    const strips = solidSquareCount > 0 ? Math.ceil(solidSquareCount / squaresPerStrip) : 0;
    const hstStrips = hstStarterSquareCount > 0 ? Math.ceil(hstStarterSquareCount / hstSquaresPerStrip) : 0;
    const length = strips * cutSize + hstStrips * hstCutSize;
    return {
      cutSize,
      hstCutSize,
      wof,
      squaresPerStrip,
      hstSquaresPerStrip,
      strips,
      hstStrips,
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
    const cfg = getLayoutConfig();
    const finished = Math.max(0.1, state.finishedSquareSize);
    const seam = Math.max(0, state.seamAllowance);
    const uDims = getUnitFinishedDims(finished, cfg.id);

    // Cut unit adds seam allowance on both left/right and top/bottom edges
    const cutW = uDims.w + 2 * seam;
    const cutH = uDims.h + 2 * seam;
    const isStaggered = cfg.stagger !== "none";

    if (isStaggered) {
      const halfCutW = cfg.stagger === "row" ? uDims.w * 0.5 + 2 * seam : cutW;
      const halfCutH = cfg.stagger === "col" ? uDims.h * 0.5 + 2 * seam : cutH;
      if (cutSquareLabel) cutSquareLabel.textContent = `Cut ${cfg.unitName}`;
      cutSquareValue.textContent = `${formatMeasure(cutW, unit)} × ${formatMeasure(cutH, unit)}`;
      if (hstCutLabel) hstCutLabel.textContent = "Edge half";
      if (hstCutStat) hstCutStat.hidden = false;
      if (dimensionsSummary) dimensionsSummary.classList.add("has-hst");
      if (hstCutSquareValue) hstCutSquareValue.textContent = `${formatMeasure(halfCutW, unit)} × ${formatMeasure(halfCutH, unit)}`;
    } else {
      const cutSize = finished + 2 * seam;
      if (cutSquareLabel) cutSquareLabel.textContent = "Cut square";
      cutSquareValue.textContent = state.hstEnabled
        ? formatMeasure(cutSize, unit)
        : `${formatMeasure(cutSize, unit)} × ${formatMeasure(cutSize, unit)}`;
      if (hstCutLabel) hstCutLabel.textContent = "HST starter";
      const hstCutSize = getHstCutSize();
      if (hstCutStat) hstCutStat.hidden = !state.hstEnabled;
      if (dimensionsSummary) dimensionsSummary.classList.toggle("has-hst", state.hstEnabled);
      if (hstCutSquareValue) hstCutSquareValue.textContent = formatMeasure(hstCutSize, unit);
    }

    const quiltW = state.cols * uDims.w;
    const quiltH = state.rows * uDims.h;

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
        ? `Yardage assumes 42" WOF + 10% buffer`
        : `Yardage assumes 106 cm WOF + 10% buffer`;

    if (previewRulerWidth) previewRulerWidth.textContent = formatMeasure(quiltW, unit);
    if (previewRulerHeight) previewRulerHeight.textContent = formatMeasure(quiltH, unit);
    updateSwatchCounts();
  }

  // --- Rendering ---

  // Fit the preview canvas cleanly inside the preview frame while preserving exact
  // aspect ratio, so the top and right architectural dimension rulers hug it tightly.
  function sizePreviewCanvas(canvasW, canvasH) {
    if (!canvasW || !canvasH || !canvasFrame) return;
    const isMobile = window.innerWidth <= 600;
    const padX = isMobile ? 24 : 48;
    const rulerSideW = 38;
    const rulerTopH = 36;
    const availW = Math.max(140, (canvasFrame.clientWidth || 640) - padX - rulerSideW);
    const maxViewportH = Math.round(window.innerHeight * (isMobile ? 0.52 : 0.64));
    const availH = Math.max(180, maxViewportH - rulerTopH);
    const scale = Math.min(availW / canvasW, availH / canvasH);
    quiltCanvas.style.width = `${Math.max(60, Math.round(canvasW * scale))}px`;
    quiltCanvas.style.height = `${Math.max(60, Math.round(canvasH * scale))}px`;
  }

  // Returns the 2 closest palette indices [idx1, dist1, idx2, dist2] for (r, g, b) in O(K) time
  function findTopTwoPalette(r, g, b, palette) {
    let i1 = 0;
    let d1 = Infinity;
    let i2 = 0;
    let d2 = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const pal = palette[p];
      const d = colorDistanceSq(r, g, b, pal.r, pal.g, pal.b);
      if (d < d1) {
        d2 = d1;
        i2 = i1;
        d1 = d;
        i1 = p;
      } else if (d < d2) {
        d2 = d;
        i2 = p;
      }
    }
    return [i1, d1, i2, d2];
  }

  // Evaluates the best distinct-color HST pair (pA !== pB) in O(K) time using top-2 palette candidates,
  // also reporting `naturalDistinct` (true when the two halves naturally map to two DIFFERENT palette fabrics).
  function bestDistinctHstPair(rA, gA, bA, rB, gB, bB, palette) {
    const [a1, da1, a2, da2] = findTopTwoPalette(rA, gA, bA, palette);
    const [b1, db1, b2, db2] = findTopTwoPalette(rB, gB, bB, palette);
    if (a1 !== b1) {
      return { pA: a1, pB: b1, err: 0.5 * (da1 + db1), naturalDistinct: true };
    }
    if (da1 + db2 <= da2 + db1) {
      return { pA: a1, pB: b2, err: 0.5 * (da1 + db2), naturalDistinct: false };
    }
    return { pA: a2, pB: b1, err: 0.5 * (da2 + db1), naturalDistinct: false };
  }

  function rgbDistSq(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return dr * dr + dg * dg + db * db;
  }

  // Samples the normalized 240×240 paint preference mask at cell (col, row).
  // Because PAINT_MASK_RES >= HARD_MAX_COLS, every cell maps to a non-empty, disjoint span.
  function sampleCellPaintPref(col, row, cols, rows) {
    const R = PAINT_MASK_RES;
    const x0 = Math.round((col * R) / cols);
    const x1 = Math.max(x0 + 1, Math.round(((col + 1) * R) / cols));
    const y0 = Math.round((row * R) / rows);
    const y1 = Math.max(y0 + 1, Math.round(((row + 1) * R) / rows));
    const cx = Math.min(R - 1, Math.floor((x0 + x1) / 2));
    const cy = Math.min(R - 1, Math.floor((y0 + y1) / 2));
    return state.paintMask[cy * R + cx];
  }

  function writeCellPaintPref(col, row, cols, rows, prefVal) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const R = PAINT_MASK_RES;
    const x0 = Math.round((col * R) / cols);
    const x1 = Math.max(x0 + 1, Math.round(((col + 1) * R) / cols));
    const y0 = Math.round((row * R) / rows);
    const y1 = Math.max(y0 + 1, Math.round(((row + 1) * R) / rows));
    let changed = false;
    for (let my = y0; my < y1; my++) {
      const rowOff = my * R;
      for (let mx = x0; mx < x1; mx++) {
        if (state.paintMask[rowOff + mx] !== prefVal) {
          state.paintMask[rowOff + mx] = prefVal;
          changed = true;
        }
      }
    }
    return changed;
  }

  function assignGridCells() {
    const cols = state.cols;
    const rows = state.rows;
    const cfg = getLayoutConfig();
    const isStaggered = cfg.stagger !== "none";
    if (!state.layoutCells || state.layoutCells.length === 0) {
      state.layoutCells = buildLayoutCells(cols, rows, cfg.id);
    }
    const totalCells = isStaggered ? state.layoutCells.length : cols * rows;
    const palette = state.palette;
    const K = palette.length;
    const matchPalette =
      state.sourcePalette && state.sourcePalette.length === K ? state.sourcePalette : palette;

    const cellTypes = new Uint8Array(totalCells);
    const assignmentsA = new Int32Array(totalCells);
    const assignmentsB = new Int32Array(totalCells).fill(-1);

    if (isStaggered) {
      if (!state.isBlankQuilt) {
        for (let i = 0; i < totalCells; i++) {
          const avg = state.squareAverages[i] || [244, 239, 230];
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let p = 0; p < K; p++) {
            const pal = matchPalette[p];
            const d = colorDistanceSq(avg[0], avg[1], avg[2], pal.r, pal.g, pal.b);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = p;
            }
          }
          assignmentsA[i] = bestIdx;
        }
      }
      let effectivePaintedCount = 0;
      if (state.manualCells.size > 0) {
        for (let i = 0; i < totalCells; i++) {
          const cell = state.layoutCells[i];
          const manual = state.manualCells.get(`${cell.c},${cell.r}`);
          if (manual) {
            assignmentsA[i] = Math.max(0, Math.min(K - 1, manual.a));
            effectivePaintedCount++;
          }
        }
      }
      const solidCounts = new Int32Array(K);
      const hstHalfCounts = new Int32Array(K);
      const hstStarterCounts = new Int32Array(K);
      for (let i = 0; i < totalCells; i++) {
        solidCounts[assignmentsA[i]]++;
      }
      const usageCounts = new Int32Array(solidCounts);
      state.hasPaintedMask = state.manualCells.size > 0;
      state.smoothableDiag = new Uint8Array(0);
      state.paintedCellsCount = effectivePaintedCount;
      state.hstCount = 0;
      state.cellTypes = cellTypes;
      state.gridAssignments = assignmentsA;
      state.gridAssignmentsB = assignmentsB;
      state.solidCounts = solidCounts;
      state.hstHalfCounts = hstHalfCounts;
      state.hstStarterCounts = hstStarterCounts;
      state.usageCounts = usageCounts;
      return;
    }

    const sqBest = new Int32Array(totalCells);
    const sqErrors = new Float64Array(totalCells);
    const cellPrefs = new Uint8Array(totalCells);
    const smoothableDiag = new Uint8Array(totalCells);

    let rawMaskActiveCount = 0;
    if (!state.isBlankQuilt) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const pref = sampleCellPaintPref(c, r, cols, rows);
          cellPrefs[i] = pref;
          if (pref !== 0) rawMaskActiveCount++;

          const avg = state.squareAverages[i];
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let p = 0; p < K; p++) {
            const pal = matchPalette[p];
            const d = colorDistanceSq(avg[0], avg[1], avg[2], pal.r, pal.g, pal.b);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = p;
            }
          }
          sqBest[i] = bestIdx;
          assignmentsA[i] = bestIdx;
          sqErrors[i] = bestDist;
        }
      }
    }
    state.hasPaintedMask = rawMaskActiveCount > 0 || state.manualCells.size > 0;

    let hstCount = 0;
    let effectivePaintedCount = 0;
    if (!state.isBlankQuilt && (state.hstEnabled || state.paintMode) && K >= 2) {
      const bestDiag = new Uint8Array(totalCells);
      const bestPairA = new Int32Array(totalCells);
      const bestPairB = new Int32Array(totalCells);
      const slashPairA = new Int32Array(totalCells);
      const slashPairB = new Int32Array(totalCells);
      const backPairA = new Int32Array(totalCells);
      const backPairB = new Int32Array(totalCells);
      const edgeScores = new Float64Array(totalCells);
      const rankScores = new Float64Array(totalCells);
      const autoCandidates = [];

      const needHstEval =
        state.paintMode || state.hstMode === "edges" || state.hstRatio > 0 || rawMaskActiveCount > 0;
      if (needHstEval) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            const s = state.hstSlashAverages[i];
            const b = state.hstBackslashAverages[i];
            const slash = bestDistinctHstPair(s[0], s[1], s[2], s[3], s[4], s[5], matchPalette);
            const back = bestDistinctHstPair(b[0], b[1], b[2], b[3], b[4], b[5], matchPalette);
            slashPairA[i] = slash.pA;
            slashPairB[i] = slash.pB;
            backPairA[i] = back.pA;
            backPairB[i] = back.pB;

            // Exact pixel-level Sum of Squared Errors (SSE) via parallel-axis variance theorem:
            //   SSE(region, pal) = internalVar(region) + N_region * ||mean(region) - pal||^2
            // This compares solid squares vs '/' HST vs '\' HST at the actual pixel level —
            // preventing horizontal ocean horizons, vertical lines, or smooth sky gradients
            // from turning into nonsensical diagonal zigzags.
            const st = state.cellDiagStats[i];
            const avg = state.squareAverages[i];
            const sqPal = matchPalette[sqBest[i]];
            const solidSSE = st.varWhole + st.n * rgbDistSq(avg[0], avg[1], avg[2], sqPal.r, sqPal.g, sqPal.b);

            const sPalA = matchPalette[slash.pA];
            const sPalB = matchPalette[slash.pB];
            const slashSSE =
              st.varSlash +
              st.nTL * rgbDistSq(s[0], s[1], s[2], sPalA.r, sPalA.g, sPalA.b) +
              st.nBR * rgbDistSq(s[3], s[4], s[5], sPalB.r, sPalB.g, sPalB.b);

            const bPalA = matchPalette[back.pA];
            const bPalB = matchPalette[back.pB];
            const backSSE =
              st.varBack +
              st.nBL * rgbDistSq(b[0], b[1], b[2], bPalA.r, bPalA.g, bPalA.b) +
              st.nTR * rgbDistSq(b[3], b[4], b[5], bPalB.r, bPalB.g, bPalB.b);

            // Variance explained in source pixels by '/', '\', and best H/V axis split
            const slashExplained = Math.max(0, st.varWhole - st.varSlash);
            const backExplained = Math.max(0, st.varWhole - st.varBack);
            const axisExplained = Math.max(0, st.varWhole - st.minAxisVar);

            let hstSSE;
            let diagExplained;
            let otherDiagExplained;
            let naturalDistinct;
            let rawDiagContrast;
            if (slashSSE <= backSSE) {
              bestDiag[i] = 1; // '/' (TL + BR)
              bestPairA[i] = slash.pA;
              bestPairB[i] = slash.pB;
              hstSSE = slashSSE;
              diagExplained = slashExplained;
              otherDiagExplained = backExplained;
              naturalDistinct = slash.naturalDistinct;
              rawDiagContrast = Math.sqrt(colorDistanceSq(s[0], s[1], s[2], s[3], s[4], s[5]));
            } else {
              bestDiag[i] = 2; // '\' (BL + TR)
              bestPairA[i] = back.pA;
              bestPairB[i] = back.pB;
              hstSSE = backSSE;
              diagExplained = backExplained;
              otherDiagExplained = slashExplained;
              naturalDistinct = back.naturalDistinct;
              rawDiagContrast = Math.sqrt(colorDistanceSq(b[0], b[1], b[2], b[3], b[4], b[5]));
            }

            const sseGain = solidSSE - hstSSE;
            const reductionRatio = solidSSE > 1 ? sseGain / solidSSE : 0;

            // True diagonal edge criteria:
            //   1. Both triangle halves naturally map to two DIFFERENT palette fabrics (no fake splits on uniform areas)
            //   2. Diagonal split explains at least as much image variance as a horizontal/vertical cut (rejects flat horizons!)
            //   3. Chosen diagonal clearly beats the opposite diagonal (rejects ambiguous noise)
            //   4. HST eliminates at least 14% of true per-pixel SSE with real visible contrast
            const isTrueDiagonal =
              naturalDistinct &&
              diagExplained > 0 &&
              diagExplained >= axisExplained * 0.92 &&
              diagExplained >= otherDiagExplained * 1.2 &&
              reductionRatio >= 0.14 &&
              rawDiagContrast >= 24;

            if (isTrueDiagonal) {
              smoothableDiag[i] = bestDiag[i];
              const rmsGain = Math.sqrt(Math.max(0, sseGain / Math.max(1, st.n)));
              edgeScores[i] = reductionRatio * rmsGain;
            } else {
              smoothableDiag[i] = 0;
              edgeScores[i] = 0;
            }
            // For Mix Ratio mode, always rank genuine true diagonals highest, then by per-pixel SSE gain
            rankScores[i] =
              (isTrueDiagonal ? 1e6 : naturalDistinct ? 0 : -1e6) +
              (sseGain >= 0 ? Math.sqrt(sseGain / Math.max(1, st.n)) : -Math.sqrt(-sseGain / Math.max(1, st.n)));

            if (!state.hstEnabled) continue;

            const pref = cellPrefs[i];
            if (pref === 1) {
              // Force Solid Square
              effectivePaintedCount++;
            } else if (pref >= 2) {
              // Painted with △ Smooth Edges brush: ONLY convert cells where triangles genuinely smooth an edge!
              if (smoothableDiag[i] > 0) {
                effectivePaintedCount++;
                if (pref === 3) {
                  cellTypes[i] = 1;
                  assignmentsA[i] = slashPairA[i];
                  assignmentsB[i] = slashPairB[i];
                } else if (pref === 4) {
                  cellTypes[i] = 2;
                  assignmentsA[i] = backPairA[i];
                  assignmentsB[i] = backPairB[i];
                } else {
                  cellTypes[i] = bestDiag[i];
                  assignmentsA[i] = bestPairA[i];
                  assignmentsB[i] = bestPairB[i];
                }
                hstCount++;
              }
            } else {
              autoCandidates.push(i);
            }
          }
        }

        if (state.hstEnabled) {
          if (state.hstMode === "edges") {
            const t = (100 - state.hstEdgeSensitivity) / 100;
            const minEdgeScore = 3 + 55 * t * t;
            for (let k = 0; k < autoCandidates.length; k++) {
              const idx = autoCandidates[k];
              if (smoothableDiag[idx] > 0 && edgeScores[idx] >= minEdgeScore) {
                cellTypes[idx] = bestDiag[idx];
                assignmentsA[idx] = bestPairA[idx];
                assignmentsB[idx] = bestPairB[idx];
                hstCount++;
              }
            }
          } else if (state.hstRatio > 0 && autoCandidates.length > 0) {
            const targetAutoCount = Math.min(
              autoCandidates.length,
              Math.round(autoCandidates.length * (state.hstRatio / 100))
            );
            if (targetAutoCount > 0) {
              autoCandidates.sort((a, b) => rankScores[b] - rankScores[a]);
              for (let k = 0; k < targetAutoCount; k++) {
                const idx = autoCandidates[k];
                cellTypes[idx] = bestDiag[idx];
                assignmentsA[idx] = bestPairA[idx];
                assignmentsB[idx] = bestPairB[idx];
                hstCount++;
              }
            }
          }
        }
      }
    } else if (rawMaskActiveCount > 0) {
      for (let i = 0; i < totalCells; i++) {
        if (cellPrefs[i] === 1) effectivePaintedCount++;
      }
    }
    // Apply manual fabric/color painted cells on top (works on both Blank Quilts and Photo Quilts)
    if (state.manualCells.size > 0) {
      state.manualCells.forEach((cellData, key) => {
        const comma = key.indexOf(",");
        const mc = Number(key.slice(0, comma));
        const mr = Number(key.slice(comma + 1));
        if (mc < 0 || mc >= cols || mr < 0 || mr >= rows) return;
        const idx = mr * cols + mc;
        const pA = Math.max(0, Math.min(K - 1, cellData.a));
        const wasHst = cellTypes[idx] !== 0;
        if (cellData.t === 1 || cellData.t === 2) {
          const pB = Math.max(0, Math.min(K - 1, cellData.b >= 0 ? cellData.b : pA));
          if (pA === pB) {
            cellTypes[idx] = 0;
            assignmentsA[idx] = pA;
            assignmentsB[idx] = -1;
            if (wasHst) hstCount--;
          } else {
            cellTypes[idx] = cellData.t;
            assignmentsA[idx] = pA;
            assignmentsB[idx] = pB;
            if (!wasHst) hstCount++;
          }
        } else {
          cellTypes[idx] = 0;
          assignmentsA[idx] = pA;
          assignmentsB[idx] = -1;
          if (wasHst) hstCount--;
        }
        effectivePaintedCount++;
      });
    }

    state.smoothableDiag = smoothableDiag;
    state.paintedCellsCount = effectivePaintedCount;

    const solidCounts = new Int32Array(K);
    const hstHalfCounts = new Int32Array(K);
    const pairCounts = new Int32Array(K * K);

    for (let i = 0; i < totalCells; i++) {
      const t = cellTypes[i];
      const pA = assignmentsA[i];
      if (t === 0) {
        solidCounts[pA]++;
      } else {
        const pB = assignmentsB[i];
        hstHalfCounts[pA]++;
        hstHalfCounts[pB]++;
        const u = Math.min(pA, pB);
        const v = Math.max(pA, pB);
        pairCounts[u * K + v]++;
      }
    }

    // 2-at-a-time HST piecing: 1 starter square of u + 1 starter square of v yields 2 finished u/v HSTs
    const hstStarterCounts = new Int32Array(K);
    for (let u = 0; u < K; u++) {
      for (let v = u; v < K; v++) {
        const cnt = pairCounts[u * K + v];
        if (cnt > 0) {
          const pairsNeeded = Math.ceil(cnt / 2);
          hstStarterCounts[u] += pairsNeeded;
          hstStarterCounts[v] += pairsNeeded;
        }
      }
    }

    const usageCounts = new Int32Array(K);
    for (let p = 0; p < K; p++) {
      usageCounts[p] = solidCounts[p] + hstHalfCounts[p];
    }

    state.hstCount = hstCount;
    state.cellTypes = cellTypes;
    state.gridAssignments = assignmentsA;
    state.gridAssignmentsB = assignmentsB;
    state.solidCounts = solidCounts;
    state.hstHalfCounts = hstHalfCounts;
    state.hstStarterCounts = hstStarterCounts;
    state.usageCounts = usageCounts;
  }

  // Deterministic 0..1 hash per quilt cell so natural fabric cuts stay stable across re-renders
  function cellHash(r, c, salt) {
    let h = (r * 374761393 + c * 668265263 + salt * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function getFabricDisplayName(color) {
    if (color && color.patternDataUrl) {
      return (color.patternName && color.patternName.trim()) || "Custom Print";
    }
    return getColorName(color.r, color.g, color.b);
  }

  function drawQuiltCellsToContext(
    ctx,
    cols,
    rows,
    squarePx,
    { grayscale = false, showSeams = false, cellW = squarePx, cellH = squarePx } = {}
  ) {
    const palette = state.palette;
    const cfg = getLayoutConfig();
    const isStaggered = cfg.stagger !== "none";
    const colorCss = palette.map((pal) => {
      if (grayscale) {
        const lum = Math.round(luminance(pal.r, pal.g, pal.b));
        return `rgb(${lum}, ${lum}, ${lum})`;
      }
      return `rgb(${pal.r}, ${pal.g}, ${pal.b})`;
    });

    // Build seamlessly mirror-tiled offscreen canvases for any swatch with a loaded fabric print.
    // Print size scales proportionally with grid density (24 / gridSpan) so sliding Chunky <-> Fine
    // keeps fabric motifs at a consistent physical size, while default 24 cols @ 1.0x shows the full swatch.
    const gridSpan = Math.max(4, Math.max(cols, rows));
    const cellTiles = grayscale
      ? null
      : palette.map((pal) => {
          const img = pal.patternImg;
          if (!img || !img.complete || img.naturalWidth <= 0) return null;
          const iw = img.naturalWidth;
          const ih = img.naturalHeight;
          const baseSide = Math.min(iw, ih);
          const scale = clampNumber(pal.patternScale, 0.4, 2.5, 1.0);
          const cutMode = pal.patternCutMode === "varied" ? "varied" : "repeat";
          const cropSide = Math.max(12, Math.min(baseSide * 3.0, (baseSide * (24 / gridSpan)) / scale));
          // Use an odd tile count >= 3 so the center tile is always the exact unflipped uploaded swatch
          const minTilesX = Math.max(3, Math.ceil(cropSide / iw) + 1);
          const minTilesY = Math.max(3, Math.ceil(cropSide / ih) + 1);
          const tilesX = minTilesX % 2 === 0 ? minTilesX + 1 : minTilesX;
          const tilesY = minTilesY % 2 === 0 ? minTilesY + 1 : minTilesY;
          const midX = Math.floor(tilesX / 2);
          const midY = Math.floor(tilesY / 2);
          const tile = document.createElement("canvas");
          tile.width = iw * tilesX;
          tile.height = ih * tilesY;
          const tctx = tile.getContext("2d");
          for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
              tctx.save();
              const flipX = Math.abs(tx - midX) % 2 === 1;
              const flipY = Math.abs(ty - midY) % 2 === 1;
              tctx.translate(tx * iw + (flipX ? iw : 0), ty * ih + (flipY ? ih : 0));
              tctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
              tctx.drawImage(img, 0, 0, iw, ih);
              tctx.restore();
            }
          }
          const maxSx = Math.max(0, tile.width - cropSide);
          const maxSy = Math.max(0, tile.height - cropSide);
          const centerSx = maxSx / 2;
          const centerSy = maxSy / 2;
          return { tile, maxSx, maxSy, centerSx, centerSy, cropSide, cutMode };
        });

    const drawPatternInBox = (pIdx, x, y, rw, rh, r, c, salt) => {
      const info = cellTiles ? cellTiles[pIdx] : null;
      if (!info) return false;
      const boxAspect = rw / Math.max(1, rh);
      const cropW = Math.min(info.tile.width, boxAspect >= 1 ? info.cropSide * boxAspect : info.cropSide);
      const cropH = Math.min(info.tile.height, boxAspect >= 1 ? info.cropSide : info.cropSide / boxAspect);
      const maxX = Math.max(0, info.tile.width - cropW);
      const maxY = Math.max(0, info.tile.height - cropH);
      const sx = info.cutMode === "varied" ? cellHash(r, c, salt + pIdx * 13) * maxX : maxX / 2;
      const sy = info.cutMode === "varied" ? cellHash(r, c, salt + 7 + pIdx * 29) * maxY : maxY / 2;
      ctx.drawImage(info.tile, sx, sy, cropW, cropH, x, y, rw, rh);
      return true;
    };

    const drawPatternInRect = (pIdx, x, y, r, c, salt) => drawPatternInBox(pIdx, x, y, squarePx, squarePx, r, c, salt);

    if (isStaggered) {
      const cells = state.layoutCells;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const x = Math.round(cell.x0 * cellW);
        const y = Math.round(cell.y0 * cellH);
        const x2 = Math.round(cell.x1 * cellW);
        const y2 = Math.round(cell.y1 * cellH);
        const rw = Math.max(1, x2 - x);
        const rh = Math.max(1, y2 - y);
        const pA = state.gridAssignments[i] ?? 0;
        if (!drawPatternInBox(pA, x, y, rw, rh, cell.r, cell.c, 1)) {
          ctx.fillStyle = colorCss[pA];
          ctx.fillRect(x, y, rw, rh);
        }
      }
      if (showSeams && Math.min(cellW, cellH) >= 6) {
        ctx.save();
        ctx.strokeStyle = grayscale ? "rgba(0, 0, 0, 0.16)" : "rgba(25, 22, 18, 0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          const x = Math.round(cell.x0 * cellW) + 0.5;
          const y = Math.round(cell.y0 * cellH) + 0.5;
          const x2 = Math.round(cell.x1 * cellW) + 0.5;
          const y2 = Math.round(cell.y1 * cellH) + 0.5;
          ctx.rect(x, y, Math.max(1, x2 - x), Math.max(1, y2 - y));
        }
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    for (let r = 0; r < rows; r++) {
      const y = r * squarePx;
      for (let c = 0; c < cols; c++) {
        const x = c * squarePx;
        const cellIdx = r * cols + c;
        const type = state.cellTypes[cellIdx];
        const pA = state.gridAssignments[cellIdx];
        if (type === 0) {
          if (!drawPatternInRect(pA, x, y, r, c, 1)) {
            ctx.fillStyle = colorCss[pA];
            ctx.fillRect(x, y, squarePx, squarePx);
          }
        } else if (type === 1) {
          // '/' diagonal: fill BR (pB) full rect first to prevent subpixel diagonal gap, then TL (pA) triangle
          const pB = state.gridAssignmentsB[cellIdx];
          if (!drawPatternInRect(pB, x, y, r, c, 2)) {
            ctx.fillStyle = colorCss[pB];
            ctx.fillRect(x, y, squarePx, squarePx);
          }
          if (cellTiles && cellTiles[pA]) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + squarePx, y);
            ctx.lineTo(x, y + squarePx);
            ctx.closePath();
            ctx.clip();
            drawPatternInRect(pA, x, y, r, c, 1);
            ctx.restore();
          } else {
            ctx.fillStyle = colorCss[pA];
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + squarePx, y);
            ctx.lineTo(x, y + squarePx);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          // '\' diagonal: fill TR (pB) full rect first, then BL (pA) triangle
          const pB = state.gridAssignmentsB[cellIdx];
          if (!drawPatternInRect(pB, x, y, r, c, 2)) {
            ctx.fillStyle = colorCss[pB];
            ctx.fillRect(x, y, squarePx, squarePx);
          }
          if (cellTiles && cellTiles[pA]) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + squarePx);
            ctx.lineTo(x + squarePx, y + squarePx);
            ctx.closePath();
            ctx.clip();
            drawPatternInRect(pA, x, y, r, c, 1);
            ctx.restore();
          } else {
            ctx.fillStyle = colorCss[pA];
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + squarePx);
            ctx.lineTo(x + squarePx, y + squarePx);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    if (showSeams && squarePx >= 6) {
      const canvasW = cols * squarePx;
      const canvasH = rows * squarePx;
      ctx.save();
      ctx.strokeStyle = grayscale ? "rgba(0, 0, 0, 0.14)" : "rgba(25, 22, 18, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < cols; c++) {
        const x = c * squarePx + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasH);
      }
      for (let r = 1; r < rows; r++) {
        const y = r * squarePx + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(canvasW, y);
      }
      if (state.hstCount > 0) {
        for (let r = 0; r < rows; r++) {
          const y = r * squarePx;
          for (let c = 0; c < cols; c++) {
            const type = state.cellTypes[r * cols + c];
            if (type === 1) {
              const x = c * squarePx;
              ctx.moveTo(x, y + squarePx);
              ctx.lineTo(x + squarePx, y);
            } else if (type === 2) {
              const x = c * squarePx;
              ctx.moveTo(x, y);
              ctx.lineTo(x + squarePx, y + squarePx);
            }
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function getCanvasUnitPixels(cols, rows, maxDim) {
    const cfg = getLayoutConfig();
    if (cfg.aspect >= 1) {
      const cellH = Math.max(5, Math.floor(maxDim / Math.max(cols * cfg.aspect, rows)));
      const cellW = Math.max(5, Math.round(cellH * cfg.aspect));
      return { cellW, cellH };
    }
    const cellW = Math.max(5, Math.floor(maxDim / Math.max(cols, rows / cfg.aspect)));
    const cellH = Math.max(5, Math.round(cellW / cfg.aspect));
    return { cellW, cellH };
  }

  function renderQuilt() {
    if (!state.image || state.palette.length === 0) return;

    const cols = state.cols;
    const rows = state.rows;

    // Pick a crisp display unit size so canvas stays sharp even for dense King-sized grids
    const maxDim = Math.max(cols, rows) > 120 ? 1200 : 960;
    const { cellW, cellH } = getCanvasUnitPixels(cols, rows, maxDim);
    const squarePx = Math.min(cellW, cellH);
    state.layoutCellW = cellW;
    state.layoutCellH = cellH;
    const canvasW = cols * cellW;
    const canvasH = rows * cellH;

    if (quiltCanvas.width !== canvasW || quiltCanvas.height !== canvasH) {
      quiltCanvas.width = canvasW;
      quiltCanvas.height = canvasH;
    }
    sizePreviewCanvas(canvasW, canvasH);

    assignGridCells();
    updateUnitBreakdownLabels();
    updateSwatchCounts();
    updatePaintToolbarUI();

    if (state.showingOriginal) {
      const { sx, sy, sw, sh } = getCroppedSourceRect();
      quiltCtx.drawImage(state.image, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
      drawRuleOfThirdsOverlay(quiltCtx, canvasW, canvasH);
      return;
    }

    drawQuiltCellsToContext(quiltCtx, cols, rows, squarePx, {
      grayscale: false,
      showSeams: state.showSeamLines,
      cellW,
      cellH,
    });
    drawRuleOfThirdsOverlay(quiltCtx, canvasW, canvasH);
    drawPaintCursorOverlay(squarePx);
  }

  function drawRuleOfThirdsOverlay(ctx, w, h) {
    if (!state.showThirdsOverlay || !w || !h) return;
    const x1 = w / 3;
    const x2 = (2 * w) / 3;
    const y1 = h / 3;
    const y2 = (2 * h) / 3;
    const scale = Math.max(1, Math.min(w, h) / 600);

    ctx.save();
    // Dual-stroke contrast: dark halo beneath crisp white guide lines so it reads on both light & dark fabrics
    const drawLines = () => {
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, h);
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, h);
      ctx.moveTo(0, y1);
      ctx.lineTo(w, y1);
      ctx.moveTo(0, y2);
      ctx.lineTo(w, y2);
      ctx.stroke();
    };

    ctx.lineCap = "butt";
    ctx.strokeStyle = "rgba(24, 21, 18, 0.45)";
    ctx.lineWidth = 3 * scale;
    drawLines();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
    ctx.lineWidth = 1.25 * scale;
    drawLines();

    // Subtle focal power-point rings at the 4 intersections
    const pts = [
      [x1, y1],
      [x2, y1],
      [x1, y2],
      [x2, y2],
    ];
    const r = 4.5 * scale;
    pts.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(24, 21, 18, 0.5)";
      ctx.lineWidth = 2.6 * scale;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 1.2 * scale;
      ctx.stroke();
    });
    ctx.restore();
  }

  function updateSwatchCounts() {
    const items = paletteGrid.querySelectorAll(".swatch-item");
    items.forEach((item, idx) => {
      const solidCnt = state.solidCounts[idx] ?? 0;
      const hstHalfCnt = state.hstHalfCounts[idx] ?? 0;
      const hstStarterCnt = state.hstStarterCounts[idx] ?? 0;
      const calc = calculateColorFabric(solidCnt, hstStarterCnt);
      const countEl = item.querySelector(".swatch-count");
      const fabricEl = item.querySelector(".swatch-fabric");
      if (countEl) {
        if (hstHalfCnt > 0 && solidCnt > 0) {
          countEl.textContent = `${solidCnt} sq · ${hstHalfCnt} △`;
        } else if (hstHalfCnt > 0) {
          countEl.textContent = `${hstHalfCnt} △ HST`;
        } else {
          countEl.textContent = `${solidCnt} sq`;
        }
      }
      if (fabricEl) {
        fabricEl.textContent = calc.formatted;
      }
      const isUsed = solidCnt > 0 || hstHalfCnt > 0;
      item.classList.toggle("is-unused", !isUsed);
      if (solidCnt > 0 || hstStarterCnt > 0) {
        const parts = [];
        if (solidCnt > 0) {
          parts.push(
            `${solidCnt} solid sq (${calc.strips} strip${calc.strips === 1 ? "" : "s"} @ ${formatMeasure(calc.cutSize, state.unit)})`
          );
        }
        if (hstStarterCnt > 0) {
          parts.push(
            `${hstHalfCnt} HST halves -> cut ${hstStarterCnt} starter sq (${calc.hstStrips} strip${calc.hstStrips === 1 ? "" : "s"} @ ${formatMeasure(calc.hstCutSize, state.unit)})`
          );
        }
        parts.push(`Est. ${calc.formatted}`);
        item.title = parts.join(" · ");
      } else {
        item.title = "0 pieces used";
      }
    });
  }

  // --- Fabric Print Swatch Helpers & Popover Editor ---
  let activeSwatchId = null;
  let pendingUploadSwatchId = null;

  function getActiveSwatchEntry(preferredId = activeSwatchId) {
    if (preferredId == null) return null;
    const idx = state.palette.findIndex((c) => c.id === preferredId);
    return idx >= 0 ? { color: state.palette[idx], idx } : null;
  }

  function cleanFabricFileName(fileName) {
    const base = String(fileName || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!base) return "Custom Print";
    return base
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ")
      .slice(0, 32);
  }

  function attachPatternImage(color, dataUrl, onReady) {
    if (!dataUrl) {
      color.patternImg = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (color.patternDataUrl === dataUrl) {
        color.patternImg = img;
        if (onReady) onReady();
      }
    };
    img.src = dataUrl;
  }

  function rehydratePalettePatterns() {
    let pending = 0;
    state.palette.forEach((color) => {
      if (color.patternDataUrl && (!color.patternImg || color.patternImg.src !== color.patternDataUrl)) {
        pending++;
        attachPatternImage(color, color.patternDataUrl, () => {
          renderQuilt();
        });
      }
    });
    return pending;
  }

  function loadFabricPatternFromFile(file, color, code) {
    if (!file || !color) return;
    const reader = new FileReader();
    reader.onload = () => {
      const srcImg = new Image();
      srcImg.onload = () => {
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(srcImg.naturalWidth, srcImg.naturalHeight));
        const rawW = Math.max(1, Math.round(srcImg.naturalWidth * scale));
        const rawH = Math.max(1, Math.round(srcImg.naturalHeight * scale));
        const rawC = document.createElement("canvas");
        rawC.width = rawW;
        rawC.height = rawH;
        const rawCtx = rawC.getContext("2d", { willReadFrequently: true });
        rawCtx.drawImage(srcImg, 0, 0, rawW, rawH);

        // Auto-trim transparent or uniform white studio margins from product swatch photos
        const rawData = rawCtx.getImageData(0, 0, rawW, rawH).data;
        const isBorderPixel = (idx) => {
          const a = rawData[idx + 3];
          if (a < 24) return true;
          return rawData[idx] >= 248 && rawData[idx + 1] >= 248 && rawData[idx + 2] >= 248;
        };
        const rowIsBorder = (y) => {
          let borderCnt = 0;
          for (let x = 0; x < rawW; x++) {
            if (isBorderPixel((y * rawW + x) * 4)) borderCnt++;
          }
          return borderCnt / rawW >= 0.96;
        };
        const colIsBorder = (x, y0, y1) => {
          let borderCnt = 0;
          const hSpan = Math.max(1, y1 - y0);
          for (let y = y0; y < y1; y++) {
            if (isBorderPixel((y * rawW + x) * 4)) borderCnt++;
          }
          return borderCnt / hSpan >= 0.96;
        };

        const maxTrimY = Math.floor(rawH * 0.22);
        const maxTrimX = Math.floor(rawW * 0.22);
        let top = 0;
        let bottom = rawH;
        let left = 0;
        let right = rawW;
        while (top < maxTrimY && rowIsBorder(top)) top++;
        while (bottom > rawH - maxTrimY && bottom - top > 16 && rowIsBorder(bottom - 1)) bottom--;
        while (left < maxTrimX && colIsBorder(left, top, bottom)) left++;
        while (right > rawW - maxTrimX && right - left > 16 && colIsBorder(right - 1, top, bottom)) right--;

        const w = Math.max(1, right - left);
        const h = Math.max(1, bottom - top);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(rawC, left, top, w, h, 0, 0, w, h);

        // Compute average RGB of the uploaded fabric image for optional re-matching
        const data = ctx.getImageData(0, 0, w, h).data;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        const n = w * h;
        for (let i = 0; i < data.length; i += 4) {
          sr += data[i];
          sg += data[i + 1];
          sb += data[i + 2];
        }
        const avgRgb = [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
        const dataUrl = c.toDataURL("image/jpeg", 0.86);

        color.patternDataUrl = dataUrl;
        color.patternName = cleanFabricFileName(file.name);
        color.patternAvgRgb = avgRgb;
        color.patternScale = color.patternScale || 1.0;

        attachPatternImage(color, dataUrl, () => {
          renderPaletteSwatches();
          renderQuilt();
          syncSwatchPopover();
          recordHistory(`Uploaded print for Fabric ${code} (${color.patternName})`);
        });
      };
      srcImg.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function closeSwatchPopover() {
    if (!swatchPopover) return;
    swatchPopover.hidden = true;
    activeSwatchId = null;
    paletteGrid.querySelectorAll(".swatch-item.is-editing").forEach((el) => el.classList.remove("is-editing"));
  }

  function syncSwatchPopover() {
    if (!swatchPopover || swatchPopover.hidden) return;
    const entry = getActiveSwatchEntry();
    if (!entry) {
      closeSwatchPopover();
      return;
    }
    const { color, idx } = entry;
    const code = getFabricCode(idx);
    const hex = rgbToHex(color.r, color.g, color.b);
    const hasPrint = Boolean(color.patternDataUrl);

    swatchPopoverTitle.textContent = `Fabric ${code}`;
    swatchPopoverColor.value = hex;
    swatchPopoverHex.textContent = hex.toUpperCase();

    swatchRemovePrintBtn.hidden = !hasPrint;
    swatchPrintPreviewRow.hidden = !hasPrint;
    swatchPrintScaleRow.hidden = !hasPrint;
    swatchUploadPrintLabel.textContent = hasPrint ? "Replace Fabric Image" : "Upload Fabric Image";

    if (hasPrint) {
      swatchPrintThumb.src = color.patternDataUrl;
      if (document.activeElement !== swatchPrintName) {
        swatchPrintName.value = color.patternName || "Custom Print";
      }
      const scaleVal = clampNumber(color.patternScale, 0.4, 2.5, 1.0);
      swatchPrintScale.value = String(scaleVal);
      swatchPrintScaleValue.textContent = `${scaleVal.toFixed(1)}×`;
      const cutMode = color.patternCutMode === "varied" ? "varied" : "repeat";
      swatchCutModeBtns.forEach((btn) => {
        const active = btn.dataset.cutMode === cutMode;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-checked", active ? "true" : "false");
      });
      swatchMatchAvgBtn.hidden = !Array.isArray(color.patternAvgRgb);
    }

    paletteGrid.querySelectorAll(".swatch-item").forEach((el) => {
      el.classList.toggle("is-editing", Number(el.dataset.id) === color.id);
    });
    renderSwatchLibrary(color);
  }

  function applyPhilipJacobsFabricToSwatch(fabric, color, code) {
    if (!fabric || !color) return;
    const dataUrl = getPhilipJacobsDataUrl(fabric);
    if (!dataUrl) return;
    color.patternDataUrl = dataUrl;
    color.patternName = fabric.name;
    color.patternAvgRgb = [...fabric.rgb];
    color.patternScale = color.patternScale || 1.0;
    color.patternCutMode = color.patternCutMode || "repeat";
    color.libraryId = fabric.id;
    attachPatternImage(color, dataUrl, () => {
      renderPaletteSwatches();
      renderQuilt();
      syncSwatchPopover();
      recordHistory(`Applied ${fabric.name} to Fabric ${code}`);
    });
  }

  let activeSwatchLibraryTab = "kona"; // "kona" | "pj"

  function applyKonaSolidToSwatch(entryRow, color, code) {
    if (!entryRow || !color) return;
    color.r = entryRow[1];
    color.g = entryRow[2];
    color.b = entryRow[3];
    color.patternDataUrl = null;
    color.patternImg = null;
    color.patternName = null;
    color.patternAvgRgb = null;
    color.libraryId = null;
    renderPaletteSwatches();
    renderQuilt();
    syncSwatchPopover();
    recordHistory(`Set Fabric ${code} to ${entryRow[4]}`);
  }

  function renderSwatchLibrary(activeColor) {
    if (!swatchLibraryGrid || !activeColor) return;
    const q = (swatchLibrarySearch ? swatchLibrarySearch.value : "").trim().toLowerCase();
    swatchLibraryGrid.innerHTML = "";

    if (activeSwatchLibraryTab === "kona") {
      if (swatchLibraryCaption) swatchLibraryCaption.textContent = "Closest Kona Solids";
      const sortedKona = NAMED_FABRIC_COLORS.filter(
        (row) =>
          !q ||
          row[0].toLowerCase().includes(q) ||
          row[4].toLowerCase().includes(q) ||
          row[5].toLowerCase().includes(q)
      ).sort((a, b) => {
        const da = colorDistanceSq(activeColor.r, activeColor.g, activeColor.b, a[1], a[2], a[3]);
        const db = colorDistanceSq(activeColor.r, activeColor.g, activeColor.b, b[1], b[2], b[3]);
        return da - db;
      });

      sortedKona.forEach((row) => {
        const shadeShort = row[4].replace(/^Kona\s+/i, "");
        const isExact =
          !activeColor.patternDataUrl &&
          activeColor.r === row[1] &&
          activeColor.g === row[2] &&
          activeColor.b === row[3];

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "swatch-library-item";
        if (isExact) btn.classList.add("is-selected");
        btn.title = `${row[4]} (${row[5]}) — click to apply`;
        btn.setAttribute("role", "option");

        const chip = document.createElement("span");
        chip.className = "swatch-library-chip";
        chip.style.backgroundColor = rgbToHex(row[1], row[2], row[3]);

        const lbl = document.createElement("span");
        lbl.className = "swatch-library-label";
        lbl.textContent = shadeShort;

        btn.addEventListener("click", () => {
          const entry = getActiveSwatchEntry();
          if (entry) applyKonaSolidToSwatch(row, entry.color, getFabricCode(entry.idx));
        });

        btn.appendChild(chip);
        btn.appendChild(lbl);
        swatchLibraryGrid.appendChild(btn);
      });
      return;
    }

    const catalogMap = {
      kaffe: { label: "Kaffe Fassett", list: KAFFE_FASSETT_FABRICS },
      brandon: { label: "Brandon Mably", list: BRANDON_MABLY_FABRICS },
      pj: { label: "Philip Jacobs", list: PHILIP_JACOBS_FABRICS },
    };
    const activeCat = catalogMap[activeSwatchLibraryTab] || catalogMap.pj;
    if (swatchLibraryCaption) swatchLibraryCaption.textContent = `Closest ${activeCat.label}`;
    const sorted = activeCat.list.filter((f) => !q || f.name.toLowerCase().includes(q)).sort((a, b) => {
      const da = colorDistanceSq(activeColor.r, activeColor.g, activeColor.b, a.rgb[0], a.rgb[1], a.rgb[2]);
      const db = colorDistanceSq(activeColor.r, activeColor.g, activeColor.b, b.rgb[0], b.rgb[1], b.rgb[2]);
      return da - db;
    });

    sorted.forEach((fabric) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-library-item";
      if (activeColor.patternName === fabric.name) btn.classList.add("is-selected");
      btn.title = `${activeCat.label}: ${fabric.name} — click to apply`;
      btn.setAttribute("role", "option");

      const img = document.createElement("img");
      img.className = "swatch-library-thumb";
      img.src = getPhilipJacobsDataUrl(fabric);
      img.alt = fabric.name;

      const lbl = document.createElement("span");
      lbl.className = "swatch-library-label";
      lbl.textContent = fabric.name;

      btn.addEventListener("click", () => {
        const entry = getActiveSwatchEntry();
        if (entry) {
          applyPhilipJacobsFabricToSwatch(fabric, entry.color, getFabricCode(entry.idx));
        }
      });

      btn.appendChild(img);
      btn.appendChild(lbl);
      swatchLibraryGrid.appendChild(btn);
    });
  }

  swatchLibraryTabs.forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const next = tabBtn.dataset.libTab;
      activeSwatchLibraryTab = next === "kaffe" || next === "brandon" || next === "pj" ? next : "kona";
      swatchLibraryTabs.forEach((b) => {
        const active = b.dataset.libTab === activeSwatchLibraryTab;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      const entry = getActiveSwatchEntry();
      if (entry) renderSwatchLibrary(entry.color);
    });
  });

  if (swatchLibrarySearch) {
    swatchLibrarySearch.addEventListener("input", () => {
      const entry = getActiveSwatchEntry();
      if (entry) renderSwatchLibrary(entry.color);
    });
  }

  function openSwatchPopover(color, anchorEl) {
    if (!swatchPopover || !color) return;
    if (activeSwatchId === color.id && !swatchPopover.hidden) {
      closeSwatchPopover();
      return;
    }
    closeHistoryPopover();
    closeHarmonyPopover();
    activeSwatchId = color.id;
    swatchPopover.hidden = false;
    syncSwatchPopover();

    // Position popover cleanly beside the swatch inside viewport bounds
    const rect = anchorEl.getBoundingClientRect();
    const popRect = swatchPopover.getBoundingClientRect();
    const margin = 12;
    let left = rect.right + 10;
    if (left + popRect.width > window.innerWidth - margin) {
      left = Math.max(margin, rect.left - popRect.width - 10);
    }
    if (left + popRect.width > window.innerWidth - margin) {
      left = Math.max(margin, (window.innerWidth - popRect.width) / 2);
    }
    let top = rect.top - 8;
    if (top + popRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - popRect.height - margin);
    }
    swatchPopover.style.left = `${Math.round(left)}px`;
    swatchPopover.style.top = `${Math.round(top)}px`;
  }

  if (swatchPopoverClose) {
    swatchPopoverClose.addEventListener("click", closeSwatchPopover);
  }
  if (swatchPopoverColor) {
    swatchPopoverColor.addEventListener("input", (e) => {
      const entry = getActiveSwatchEntry();
      if (!entry) return;
      const { color, idx } = entry;
      const code = getFabricCode(idx);
      const [r, g, b] = hexToRgb(e.target.value);
      color.r = r;
      color.g = g;
      color.b = b;
      // Picking a solid color switches a printed swatch back to that solid color immediately on the canvas
      if (color.patternDataUrl) {
        color.patternDataUrl = null;
        color.patternImg = null;
        color.patternName = null;
        color.patternAvgRgb = null;
        color.libraryId = null;
      }
      swatchPopoverHex.textContent = e.target.value.toUpperCase();
      syncSwatchPopover();
      renderPaletteSwatches();
      renderQuilt();
      recordHistory(`Changed Fabric ${code} to ${getFabricDisplayName(color)}`, `swatch-${color.id}`);
    });
  }
  if (swatchUploadPrintBtn && fabricPatternInput) {
    swatchUploadPrintBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pendingUploadSwatchId = activeSwatchId;
      fabricPatternInput.value = "";
      fabricPatternInput.click();
    });
    fabricPatternInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    fabricPatternInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      const targetId = activeSwatchId != null ? activeSwatchId : pendingUploadSwatchId;
      const entry = getActiveSwatchEntry(targetId);
      if (file && entry) {
        loadFabricPatternFromFile(file, entry.color, getFabricCode(entry.idx));
      }
      pendingUploadSwatchId = null;
      fabricPatternInput.value = "";
    });
  }
  if (swatchPrintScale) {
    swatchPrintScale.addEventListener("input", (e) => {
      const entry = getActiveSwatchEntry();
      if (!entry) return;
      const val = clampNumber(e.target.value, 0.4, 2.5, 1.0);
      entry.color.patternScale = val;
      swatchPrintScaleValue.textContent = `${val.toFixed(1)}×`;
      renderQuilt();
      recordHistory(`Print scale ${val.toFixed(1)}× on Fabric ${getFabricCode(entry.idx)}`, `scale-${entry.color.id}`);
    });
  }
  swatchCutModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = getActiveSwatchEntry();
      if (!entry) return;
      const nextMode = btn.dataset.cutMode === "varied" ? "varied" : "repeat";
      if ((entry.color.patternCutMode || "repeat") === nextMode) return;
      entry.color.patternCutMode = nextMode;
      syncSwatchPopover();
      renderQuilt();
      recordHistory(
        `Fabric ${getFabricCode(entry.idx)}: ${nextMode === "varied" ? "Varied cuts" : "Same per square"}`
      );
    });
  });
  if (swatchPrintName) {
    swatchPrintName.addEventListener("input", (e) => {
      const entry = getActiveSwatchEntry();
      if (!entry) return;
      entry.color.patternName = e.target.value.slice(0, 32);
      const itemEl = paletteGrid.querySelector(`.swatch-item[data-id="${entry.color.id}"] .swatch-hex`);
      if (itemEl) itemEl.textContent = getFabricDisplayName(entry.color);
      recordHistory(`Renamed Fabric ${getFabricCode(entry.idx)}`, `rename-swatch-${entry.color.id}`);
    });
  }
  if (swatchMatchAvgBtn) {
    swatchMatchAvgBtn.addEventListener("click", () => {
      const entry = getActiveSwatchEntry();
      if (!entry || !Array.isArray(entry.color.patternAvgRgb)) return;
      const [r, g, b] = entry.color.patternAvgRgb;
      entry.color.r = r;
      entry.color.g = g;
      entry.color.b = b;
      renderPaletteSwatches();
      renderQuilt();
      syncSwatchPopover();
      recordHistory(`Matched Fabric ${getFabricCode(entry.idx)} by print color`);
    });
  }
  if (swatchRemovePrintBtn) {
    swatchRemovePrintBtn.addEventListener("click", () => {
      const entry = getActiveSwatchEntry();
      if (!entry) return;
      const code = getFabricCode(entry.idx);
      entry.color.patternDataUrl = null;
      entry.color.patternImg = null;
      entry.color.patternName = null;
      entry.color.patternAvgRgb = null;
      entry.color.patternScale = 1.0;
      renderPaletteSwatches();
      renderQuilt();
      syncSwatchPopover();
      recordHistory(`Removed print from Fabric ${code}`);
    });
  }
  document.addEventListener("click", (e) => {
    if (!swatchPopover || swatchPopover.hidden) return;
    if (e.target === fabricPatternInput) return;
    if (swatchPopover.contains(e.target)) return;
    if (e.target.closest && e.target.closest(".swatch-item")) return;
    closeSwatchPopover();
  });

  function renderPaletteSwatches() {
    paletteGrid.innerHTML = "";
    const canDelete = state.palette.length > 1;
    paletteSizeValue.textContent = `${state.palette.length} ${state.palette.length === 1 ? "color" : "colors"}`;

    state.palette.forEach((color, idx) => {
      const hex = rgbToHex(color.r, color.g, color.b);
      const displayName = getFabricDisplayName(color);
      const code = getFabricCode(idx);
      const hasPrint = Boolean(color.patternDataUrl);

      const item = document.createElement("div");
      item.className = "swatch-item";
      if (activeSwatchId === color.id && swatchPopover && !swatchPopover.hidden) {
        item.classList.add("is-editing");
      }
      item.dataset.id = String(color.id);

      const colorWrap = document.createElement("button");
      colorWrap.type = "button";
      colorWrap.className = hasPrint ? "swatch-color-wrap has-pattern" : "swatch-color-wrap";
      colorWrap.style.backgroundColor = hex;
      if (hasPrint) {
        colorWrap.style.backgroundImage = `url("${color.patternDataUrl}")`;
      }
      colorWrap.title = `Edit Fabric ${code}: ${displayName} (color or fabric print)`;
      colorWrap.setAttribute("aria-label", `Edit Fabric ${code}: ${displayName}`);

      const chipCode = document.createElement("span");
      chipCode.className = "swatch-chip-code";
      chipCode.textContent = code;
      chipCode.style.color = luminance(color.r, color.g, color.b) > 145 ? "#1c1914" : "#ffffff";

      const info = document.createElement("div");
      info.className = "swatch-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "swatch-hex";
      nameSpan.textContent = displayName;

      const statsRow = document.createElement("div");
      statsRow.className = "swatch-stats-row";

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
      removeBtn.title = canDelete ? `Remove Fabric ${code} (${displayName}) from palette` : "At least 1 color required";
      removeBtn.setAttribute("aria-label", `Remove Fabric ${code} (${displayName})`);
      removeBtn.disabled = !canDelete;

      item.addEventListener("click", (e) => {
        if (e.target.closest && e.target.closest(".swatch-remove")) return;
        openSwatchPopover(color, item);
      });

      removeBtn.addEventListener("click", () => {
        if (state.palette.length <= 1) return;
        if (activeSwatchId === color.id) closeSwatchPopover();
        const removedIdx = state.palette.findIndex((c) => c.id === color.id);
        state.palette = state.palette.filter((c) => c.id !== color.id);
        if (removedIdx >= 0 && state.manualCells.size > 0) {
          const remap = (i) => (i === removedIdx ? 0 : i > removedIdx ? i - 1 : i);
          state.manualCells.forEach((v) => {
            v.a = Math.min(state.palette.length - 1, remap(v.a));
            if (v.b >= 0) v.b = Math.min(state.palette.length - 1, remap(v.b));
          });
        }
        if (state.paintFabricIdx >= state.palette.length) {
          state.paintFabricIdx = Math.max(0, state.palette.length - 1);
        }
        if (state.palette.length >= Number(paletteSizeSlider.min)) {
          paletteSizeSlider.value = String(state.palette.length);
        }
        renderPaletteSwatches();
        renderQuilt();
        recordHistory(`Removed Fabric ${code} (${displayName})`);
      });

      colorWrap.appendChild(chipCode);
      info.appendChild(nameSpan);
      info.appendChild(statsRow);
      item.appendChild(colorWrap);
      item.appendChild(info);
      item.appendChild(removeBtn);
      paletteGrid.appendChild(item);
    });
    renderPaintFabricStrip();
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
      state.paintMask.fill(0);
      state.manualCells.clear();
      state.activeMathPattern = "";
      state.activeMap = null;
      state.sourcePalette = null;
      syncMathPropsButton();
      state.gridLayout =
        restore && restore.settings && GRID_LAYOUTS[restore.settings.gridLayout] ? restore.settings.gridLayout : "grid";
      state.isBlankQuilt = Boolean(restore && restore.settings && restore.settings.isBlankQuilt);
      setPaintMode(false);
      syncGridLayoutUI();
      state.targetQuiltSize = null;
      if (quiltPresetSelect) quiltPresetSelect.value = "custom";

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
        state.sourcePalette = null;
        state.palette = extractPalette(state.samplePixels, targetColors);
      }

      dropStage.hidden = true;
      workspace.hidden = false;
      topbarActions.hidden = false;
      syncBlankQuiltUI();

      computeSquareAverages();
      renderPaletteSwatches();
      renderQuilt();

      if (restore) {
        initHistoryFromSaved(restore);
      } else {
        resetHistory("Loaded image");
      }
    };

    img.onerror = () => {
      if (onError) onError();
    };

    img.src = src;
  }

  function syncBlankQuiltUI() {
    const blank = Boolean(state.isBlankQuilt);
    if (importImageBtn) importImageBtn.hidden = !blank;
    if (cropBtn) cropBtn.hidden = blank;
    if (compareBtn) compareBtn.hidden = blank;
    if (resetPaletteBtn) resetPaletteBtn.hidden = blank;
    document.querySelectorAll('[data-photo-only="true"]').forEach((el) => {
      el.hidden = blank;
    });
  }

  function returnToStartScreen() {
    closeHistoryPopover();
    closeSwatchPopover();
    closeMathPropsPopover();
    closeHarmonyPopover();
    closeCropStage();
    setPaintMode(false);
    setPanMode(false);
    clearActiveDraft();
    workspace.hidden = true;
    topbarActions.hidden = true;
    dropStage.hidden = false;
    document.title = "Miriam's Quiltcaster";
  }

  function importImageIntoCurrentDesign(file) {
    clearError();
    if (!file || !file.type.startsWith("image/")) {
      showError("Please select a valid image file (PNG, JPG, WebP, or GIF).");
      return;
    }
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.objectUrl = url;
      state.fileName = file.name;
      state.isBlankQuilt = false;
      state.activeMathPattern = "";
      state.activeMap = null;
      state.sourcePalette = null;
      syncMathPropsButton();
      state.crop = { x: 0, y: 0, w: 1, h: 1 };
      state.paintMask.fill(0);
      if (getCurrentProjectTitle() === "Custom Quilt") {
        syncProjectTitle(derivePatternTitle(file.name));
      }
      closeCropStage();
      rebuildSampleBuffer();
      syncBlankQuiltUI();
      syncGridLayoutUI();
      computeSquareAverages();
      renderPaletteSwatches();
      renderQuilt();
      recordHistory(`Imported image (${derivePatternTitle(file.name)})`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showError("Could not decode that image file. Please try another one.");
    };
    img.src = url;
  }

  function startBlankQuilt() {
    clearError();
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 400;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f4efe6";
    ctx.fillRect(0, 0, 400, 400);
    const blankUrl = c.toDataURL("image/png");

    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.fileName = "custom-quilt.png";
      state.isBlankQuilt = true;
      state.crop = { x: 0, y: 0, w: 1, h: 1 };
      state.paintMask.fill(0);
      state.manualCells.clear();
      state.activeMathPattern = "";
      state.activeMap = null;
      state.sourcePalette = null;
      syncMathPropsButton();
      state.targetQuiltSize = null;
      if (quiltPresetSelect) quiltPresetSelect.value = "custom";
      syncProjectTitle("Custom Quilt");

      state.cols = syncSliderBoundsForCols(16);
      state.gridLayout = "grid";
      state.hstEnabled = false;
      if (hstToggle) hstToggle.checked = false;
      if (hstControls) hstControls.hidden = true;
      syncGridLayoutUI();

      // Curated all-solid starter palette (users can add designer prints from any swatch or Harmony)
      const starterPalette = [
        { id: state.nextColorId++, r: 244, g: 239, b: 230 }, // A: Warm Linen background
        { id: state.nextColorId++, r: 184, g: 77, b: 44 }, // B: Terracotta
        { id: state.nextColorId++, r: 58, g: 107, b: 124 }, // C: Denim Teal
        { id: state.nextColorId++, r: 214, g: 162, b: 64 }, // D: Ochre Gold
        { id: state.nextColorId++, r: 82, g: 112, b: 84 }, // E: Sage Forest
        { id: state.nextColorId++, r: 46, g: 52, b: 78 }, // F: Midnight Navy
        { id: state.nextColorId++, r: 122, g: 62, b: 92 }, // G: Mulberry Plum
        { id: state.nextColorId++, r: 216, g: 148, b: 136 }, // H: Dusty Rose
      ];
      state.palette = starterPalette;
      paletteSizeSlider.value = String(starterPalette.length);
      state.paintFabricIdx = 1; // Select Terracotta (B) so first click paints visibly over Linen (A)
      rehydratePalettePatterns();

      closeCropStage();
      rebuildSampleBuffer();

      dropStage.hidden = true;
      workspace.hidden = false;
      topbarActions.hidden = false;
      syncBlankQuiltUI();

      computeSquareAverages();
      renderPaletteSwatches();
      setPaintSize(1);
      setPaintMode(true, "color");
      resetHistory("Started blank quilt");
    };
    img.src = blankUrl;
  }

  // --- Save / Load Patterns ---

  const PATTERN_FORMAT = "miriams-quiltcaster-pattern";
  const PATTERN_VERSION = 1;

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  const MIN_COLS = 4;
  const DEFAULT_MAX_COLS = 80;
  const HARD_MAX_COLS = 240;

  // Dynamically expand (or restore) the Quilt Squares slider max so large quilts
  // with small finished squares (e.g. King 108" with 1" squares -> 108 cols) are never clipped.
  function syncSliderBoundsForCols(neededCols) {
    const clamped = Math.max(MIN_COLS, Math.min(HARD_MAX_COLS, Math.round(neededCols)));
    const nextMax = Math.max(DEFAULT_MAX_COLS, Math.min(HARD_MAX_COLS, Math.ceil(clamped / 10) * 10));
    squaresSlider.max = String(nextMax);
    squaresSlider.value = String(clamped);
    return clamped;
  }

  function encodePaintMaskRle() {
    const mask = state.paintMask;
    let hasAny = false;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) return null;
    const runs = [];
    let cur = mask[0];
    let len = 1;
    for (let i = 1; i < mask.length; i++) {
      if (mask[i] === cur) {
        len++;
      } else {
        runs.push(cur, len);
        cur = mask[i];
        len = 1;
      }
    }
    runs.push(cur, len);
    return runs;
  }

  function decodePaintMaskRle(runs) {
    state.paintMask.fill(0);
    if (!Array.isArray(runs) || runs.length < 2) return;
    let offset = 0;
    for (let i = 0; i + 1 < runs.length && offset < state.paintMask.length; i += 2) {
      const val = Math.max(0, Math.min(4, Number(runs[i]) || 0));
      const len = Math.max(0, Math.floor(Number(runs[i + 1]) || 0));
      const end = Math.min(state.paintMask.length, offset + len);
      state.paintMask.fill(val, offset, end);
      offset = end;
    }
  }

  function serializeManualCells() {
    if (!state.manualCells || state.manualCells.size === 0) return null;
    const out = [];
    state.manualCells.forEach((v, key) => {
      const comma = key.indexOf(",");
      const c = Number(key.slice(0, comma));
      const r = Number(key.slice(comma + 1));
      out.push([c, r, v.t || 0, v.a || 0, v.b != null ? v.b : -1]);
    });
    return out;
  }

  function deserializeManualCells(arr) {
    state.manualCells.clear();
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!Array.isArray(item) || item.length < 4) continue;
      const c = Math.floor(Number(item[0]));
      const r = Math.floor(Number(item[1]));
      const t = Math.max(0, Math.min(2, Math.floor(Number(item[2]) || 0)));
      const a = Math.max(0, Math.floor(Number(item[3]) || 0));
      const b = item.length >= 5 ? Math.floor(Number(item[4])) : -1;
      if (c >= 0 && r >= 0) {
        state.manualCells.set(`${c},${r}`, { t, a, b });
      }
    }
  }

  function setHstPlacementMode(mode) {
    const valid = mode === "ratio" ? "ratio" : "edges";
    state.hstMode = valid;
    hstModeBtns.forEach((btn) => {
      const active = btn.dataset.hstMode === valid;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    if (hstEdgePanel) hstEdgePanel.hidden = valid !== "edges";
    if (hstRatioPanel) hstRatioPanel.hidden = valid !== "ratio";
  }

  function setSeamLinesVisible(visible) {
    state.showSeamLines = Boolean(visible);
    if (seamLinesBtn) {
      seamLinesBtn.classList.toggle("is-toggled", state.showSeamLines);
      seamLinesBtn.setAttribute("aria-pressed", state.showSeamLines ? "true" : "false");
    }
  }

  function setThirdsOverlayVisible(visible) {
    state.showThirdsOverlay = Boolean(visible);
    if (thirdsOverlayBtn) {
      thirdsOverlayBtn.classList.toggle("is-toggled", state.showThirdsOverlay);
      thirdsOverlayBtn.setAttribute("aria-pressed", state.showThirdsOverlay ? "true" : "false");
    }
  }

  if (thirdsOverlayBtn) {
    thirdsOverlayBtn.addEventListener("click", () => {
      setThirdsOverlayVisible(!state.showThirdsOverlay);
      renderQuilt();
    });
  }

  function applyRestoredSettings(saved) {
    const s = saved.settings || {};

    // Grid columns
    state.cols = syncSliderBoundsForCols(clampNumber(s.cols, MIN_COLS, HARD_MAX_COLS, state.cols));

    // Seam lines & Half-Square Triangles
    setSeamLinesVisible(s.showSeamLines !== false);
    state.hstEnabled = Boolean(s.hstEnabled);
    setHstPlacementMode(s.hstMode === "ratio" ? "ratio" : "edges");
    state.hstEdgeSensitivity = Math.round(clampNumber(s.hstEdgeSensitivity, 5, 100, 55));
    state.hstRatio = Math.round(clampNumber(s.hstRatio, 0, 100, 35));
    if (hstToggle) hstToggle.checked = state.hstEnabled;
    if (hstControls) hstControls.hidden = !state.hstEnabled;
    if (hstEdgeSlider) hstEdgeSlider.value = String(state.hstEdgeSensitivity);
    if (hstRatioSlider) hstRatioSlider.value = String(state.hstRatio);
    decodePaintMaskRle(s.paintMaskRle);
    state.gridLayout = GRID_LAYOUTS[s.gridLayout] ? s.gridLayout : "grid";
    state.isBlankQuilt = Boolean(s.isBlankQuilt);
    deserializeManualCells(s.manualCells);
    syncGridLayoutUI();

    if (s.pageSize === "a4" || s.pageSize === "letter") {
      setPageSize(s.pageSize);
    }
    if (s.assemblyMode === "blocks" || s.assemblyMode === "rows") {
      setAssemblyMode(s.assemblyMode);
    }

    // Units & global region mode (US: in + Letter, Metric: cm + A4)
    // Backwards compatible with older .quilt files that only stored unit or pageSize
    const resolvedRegion =
      s.regionMode === "metric" || s.regionMode === "us"
        ? s.regionMode
        : s.unit === "cm" || (s.unit !== "in" && s.pageSize === "a4")
          ? "metric"
          : "us";
    const unit = resolvedRegion === "metric" ? "cm" : "in";
    state.unit = unit;
    state.finishedSquareSize = clampNumber(s.finishedSquareSize, 0.1, 100, unit === "in" ? 2.5 : 6.5);
    state.seamAllowance = clampNumber(s.seamAllowance, 0, 10, unit === "in" ? 0.25 : 0.6);
    finishedSizeInput.value = formatNumericInput(state.finishedSquareSize);
    seamAllowanceInput.value = formatNumericInput(state.seamAllowance);
    finishedSizeInput.step = unit === "cm" ? "0.5" : "0.25";
    seamAllowanceInput.step = unit === "cm" ? "0.1" : "0.125";
    syncRegionUI(unit);

    // Palette (exact colors + optional uploaded fabric prints)
    const savedPalette = Array.isArray(saved.palette) ? saved.palette : [];
    const savedPatterns = Array.isArray(saved.palettePatterns) ? saved.palettePatterns : [];
    const restored = savedPalette
      .filter((hex) => typeof hex === "string" && /^#?[0-9a-f]{6}$/i.test(hex))
      .slice(0, 24)
      .map((hex, idx) => {
        const [r, g, b] = hexToRgb(hex.startsWith("#") ? hex : `#${hex}`);
        const entry = { id: state.nextColorId++, r, g, b };
        const pat = savedPatterns[idx];
        if (pat && typeof pat === "object" && typeof pat.dataUrl === "string" && pat.dataUrl.startsWith("data:image/")) {
          entry.patternDataUrl = pat.dataUrl;
          entry.patternName = typeof pat.name === "string" ? pat.name.slice(0, 32) : "Custom Print";
          entry.patternAvgRgb =
            Array.isArray(pat.avgRgb) && pat.avgRgb.length === 3 ? pat.avgRgb.map((n) => Math.round(clampNumber(n, 0, 255, 128))) : null;
          entry.patternScale = clampNumber(pat.scale, 0.4, 2.5, 1.0);
          entry.patternCutMode = pat.cutMode === "varied" ? "varied" : "repeat";
        }
        return entry;
      });

    if (restored.length > 0) {
      state.palette = restored;
      rehydratePalettePatterns();
    } else {
      state.palette = extractPalette(state.samplePixels, Number(paletteSizeSlider.value));
    }

    const savedSourcePalette = Array.isArray(saved.sourcePalette)
      ? saved.sourcePalette
          .filter((hex) => typeof hex === "string" && /^#?[0-9a-f]{6}$/i.test(hex))
          .slice(0, 24)
          .map((hex) => {
            const [r, g, b] = hexToRgb(hex.startsWith("#") ? hex : `#${hex}`);
            return { r, g, b };
          })
      : null;
    state.sourcePalette =
      savedSourcePalette && savedSourcePalette.length === state.palette.length ? savedSourcePalette : null;

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

  // --- Persistent Undo / Redo History Stack ---

  const MAX_HISTORY = 60;
  let lastHistoryCoalesce = { key: null, time: 0 };

  function serializePalettePatterns() {
    if (!state.palette.some((c) => c.patternDataUrl)) return null;
    return state.palette.map((c) =>
      c.patternDataUrl
        ? {
            dataUrl: c.patternDataUrl,
            name: c.patternName || null,
            avgRgb: Array.isArray(c.patternAvgRgb) ? [...c.patternAvgRgb] : null,
            scale: clampNumber(c.patternScale, 0.4, 2.5, 1.0),
            cutMode: c.patternCutMode === "varied" ? "varied" : "repeat",
          }
        : null
    );
  }

  function sanitizePalettePatterns(rawPatterns) {
    if (!Array.isArray(rawPatterns)) return null;
    const out = rawPatterns.slice(0, 24).map((pat) => {
      if (!pat || typeof pat !== "object" || typeof pat.dataUrl !== "string" || !pat.dataUrl.startsWith("data:image/")) {
        return null;
      }
      return {
        dataUrl: pat.dataUrl,
        name: typeof pat.name === "string" ? pat.name.slice(0, 32) : "Custom Print",
        avgRgb:
          Array.isArray(pat.avgRgb) && pat.avgRgb.length === 3
            ? pat.avgRgb.map((n) => Math.round(clampNumber(n, 0, 255, 128)))
            : null,
        scale: clampNumber(pat.scale, 0.4, 2.5, 1.0),
        cutMode: pat.cutMode === "varied" ? "varied" : "repeat",
      };
    });
    return out.some(Boolean) ? out : null;
  }

  function captureSnapshot() {
    const palettePatterns = serializePalettePatterns();
    const manualCells = serializeManualCells();
    return {
      title: getCurrentProjectTitle(),
      cols: state.cols,
      gridLayout: state.gridLayout,
      showSeamLines: state.showSeamLines,
      hstEnabled: state.hstEnabled,
      hstMode: state.hstMode,
      hstEdgeSensitivity: state.hstEdgeSensitivity,
      hstRatio: state.hstRatio,
      paintMaskRle: encodePaintMaskRle(),
      isBlankQuilt: state.isBlankQuilt,
      ...(manualCells ? { manualCells } : {}),
      unit: state.unit,
      regionMode: state.unit === "cm" ? "metric" : "us",
      finishedSquareSize: state.finishedSquareSize,
      seamAllowance: state.seamAllowance,
      preset: quiltPresetSelect ? quiltPresetSelect.value : "custom",
      targetQuiltSize: state.targetQuiltSize ? { ...state.targetQuiltSize } : null,
      crop: { ...state.crop },
      palette: state.palette.map((c) => rgbToHex(c.r, c.g, c.b)),
      ...(state.sourcePalette && state.sourcePalette.length === state.palette.length
        ? { sourcePalette: state.sourcePalette.map((c) => rgbToHex(c.r, c.g, c.b)) }
        : {}),
      ...(palettePatterns ? { palettePatterns } : {}),
      assemblyMode: assemblyModeSelect ? assemblyModeSelect.value : "rows",
      pageSize: pageSizeSelect ? pageSizeSelect.value : "letter",
    };
  }

  function sanitizeSnapshot(raw) {
    if (!raw || typeof raw !== "object") return null;
    const resolvedRegion =
      raw.regionMode === "metric" || raw.regionMode === "us"
        ? raw.regionMode
        : raw.unit === "cm" || (raw.unit !== "in" && raw.pageSize === "a4")
          ? "metric"
          : "us";
    const unit = resolvedRegion === "metric" ? "cm" : "in";
    const rc = raw.crop && typeof raw.crop === "object" ? raw.crop : {};
    const cx = clampNumber(rc.x, 0, 0.95, 0);
    const cy = clampNumber(rc.y, 0, 0.95, 0);
    const cw = clampNumber(rc.w, 0.05, 1 - cx, 1 - cx);
    const ch = clampNumber(rc.h, 0.05, 1 - cy, 1 - cy);
    const palette = Array.isArray(raw.palette)
      ? raw.palette.filter((hex) => typeof hex === "string" && /^#?[0-9a-f]{6}$/i.test(hex)).slice(0, 24)
      : [];
    let targetQuiltSize = null;
    if (
      raw.targetQuiltSize &&
      typeof raw.targetQuiltSize === "object" &&
      Number.isFinite(Number(raw.targetQuiltSize.w)) &&
      Number.isFinite(Number(raw.targetQuiltSize.h))
    ) {
      targetQuiltSize = {
        w: Number(raw.targetQuiltSize.w),
        h: Number(raw.targetQuiltSize.h),
        label: typeof raw.targetQuiltSize.label === "string" ? raw.targetQuiltSize.label : null,
      };
    }
    return {
      title: typeof raw.title === "string" ? raw.title.slice(0, 60) : getCurrentProjectTitle(),
      cols: Math.round(clampNumber(raw.cols, MIN_COLS, HARD_MAX_COLS, state.cols)),
      gridLayout: GRID_LAYOUTS[raw.gridLayout] ? raw.gridLayout : "grid",
      showSeamLines: raw.showSeamLines !== false,
      hstEnabled: Boolean(raw.hstEnabled),
      hstMode: raw.hstMode === "ratio" ? "ratio" : "edges",
      hstEdgeSensitivity: Math.round(clampNumber(raw.hstEdgeSensitivity, 5, 100, 55)),
      hstRatio: Math.round(clampNumber(raw.hstRatio, 0, 100, 35)),
      paintMaskRle: Array.isArray(raw.paintMaskRle) ? raw.paintMaskRle : null,
      isBlankQuilt: Boolean(raw.isBlankQuilt),
      manualCells: Array.isArray(raw.manualCells) ? raw.manualCells : null,
      unit,
      finishedSquareSize: clampNumber(raw.finishedSquareSize, 0.1, 100, unit === "in" ? 2.5 : 6.5),
      seamAllowance: clampNumber(raw.seamAllowance, 0, 10, unit === "in" ? 0.25 : 0.6),
      preset: typeof raw.preset === "string" ? raw.preset : "custom",
      targetQuiltSize,
      crop: { x: cx, y: cy, w: cw, h: ch },
      palette,
      sourcePalette: Array.isArray(raw.sourcePalette)
        ? raw.sourcePalette.filter((hex) => typeof hex === "string" && /^#?[0-9a-f]{6}$/i.test(hex)).slice(0, 24)
        : null,
      palettePatterns: sanitizePalettePatterns(raw.palettePatterns),
      assemblyMode: raw.assemblyMode === "blocks" ? "blocks" : "rows",
      pageSize: raw.pageSize === "a4" ? "a4" : "letter",
    };
  }

  function restoreSnapshot(snap) {
    if (!state.image || !snap) return;
    state.isRestoringHistory = true;
    try {
      syncProjectTitle(snap.title);

      const cropChanged =
        Math.abs(state.crop.x - snap.crop.x) > 1e-5 ||
        Math.abs(state.crop.y - snap.crop.y) > 1e-5 ||
        Math.abs(state.crop.w - snap.crop.w) > 1e-5 ||
        Math.abs(state.crop.h - snap.crop.h) > 1e-5;
      state.crop = { ...snap.crop };
      if (cropChanged) {
        closeCropStage();
        rebuildSampleBuffer();
      } else {
        updateCropButtonBadge();
      }

      state.cols = syncSliderBoundsForCols(snap.cols);
      state.gridLayout = GRID_LAYOUTS[snap.gridLayout] ? snap.gridLayout : "grid";
      setSeamLinesVisible(snap.showSeamLines);
      state.hstEnabled = snap.hstEnabled;
      setHstPlacementMode(snap.hstMode);
      state.hstEdgeSensitivity = snap.hstEdgeSensitivity;
      state.hstRatio = snap.hstRatio;
      if (hstToggle) hstToggle.checked = state.hstEnabled;
      if (hstControls) hstControls.hidden = !state.hstEnabled;
      if (hstEdgeSlider) hstEdgeSlider.value = String(state.hstEdgeSensitivity);
      if (hstRatioSlider) hstRatioSlider.value = String(state.hstRatio);
      decodePaintMaskRle(snap.paintMaskRle);
      state.isBlankQuilt = Boolean(snap.isBlankQuilt);
      deserializeManualCells(snap.manualCells);
      syncBlankQuiltUI();
      syncGridLayoutUI();

      state.unit = snap.unit;
      state.finishedSquareSize = snap.finishedSquareSize;
      state.seamAllowance = snap.seamAllowance;
      state.targetQuiltSize = snap.targetQuiltSize ? { ...snap.targetQuiltSize } : null;
      if (quiltPresetSelect) quiltPresetSelect.value = snap.preset || "custom";

      finishedSizeInput.value = formatNumericInput(state.finishedSquareSize);
      seamAllowanceInput.value = formatNumericInput(state.seamAllowance);
      finishedSizeInput.step = state.unit === "cm" ? "0.5" : "0.25";
      seamAllowanceInput.step = state.unit === "cm" ? "0.1" : "0.125";
      syncRegionUI(state.unit);

      setAssemblyMode(snap.assemblyMode);

      if (snap.palette && snap.palette.length > 0) {
        const snapPatterns = Array.isArray(snap.palettePatterns) ? snap.palettePatterns : [];
        state.palette = snap.palette.map((hex, idx) => {
          const [r, g, b] = hexToRgb(hex.startsWith("#") ? hex : `#${hex}`);
          const entry = { id: state.nextColorId++, r, g, b };
          const pat = snapPatterns[idx];
          if (pat && pat.dataUrl) {
            entry.patternDataUrl = pat.dataUrl;
            entry.patternName = pat.name || "Custom Print";
            entry.patternAvgRgb = Array.isArray(pat.avgRgb) ? [...pat.avgRgb] : null;
            entry.patternScale = clampNumber(pat.scale, 0.4, 2.5, 1.0);
          entry.patternCutMode = pat.cutMode === "varied" ? "varied" : "repeat";
          }
          return entry;
        });
        rehydratePalettePatterns();
        paletteSizeSlider.value = String(
          clampNumber(state.palette.length, Number(paletteSizeSlider.min), Number(paletteSizeSlider.max), 8)
        );
      }

      if (Array.isArray(snap.sourcePalette) && snap.sourcePalette.length === state.palette.length) {
        state.sourcePalette = snap.sourcePalette.map((hex) => {
          const [r, g, b] = hexToRgb(hex.startsWith("#") ? hex : `#${hex}`);
          return { r, g, b };
        });
      } else {
        state.sourcePalette = null;
      }

      closeSwatchPopover();
      if (typeof syncHarmonyPopoverUI === "function" && harmonyPopover && !harmonyPopover.hidden) {
        syncHarmonyPopoverUI();
      }
      computeSquareAverages();
      renderPaletteSwatches();
      renderQuilt();
    } finally {
      state.isRestoringHistory = false;
    }
  }

  function resetHistory(initialLabel = "Loaded image") {
    lastHistoryCoalesce = { key: null, time: 0 };
    state.history = [{ label: initialLabel, ts: Date.now(), snapshot: captureSnapshot() }];
    state.historyIndex = 0;
    renderHistoryUI();
    scheduleDraftSave();
  }

  // Restores saved history from newer .quilt files, and gracefully initializes a 1-step
  // history for older .quilt files saved before undo/redo existed.
  function initHistoryFromSaved(saved) {
    lastHistoryCoalesce = { key: null, time: 0 };
    const rawList = Array.isArray(saved && saved.history) ? saved.history : [];
    const validEntries = [];
    for (const entry of rawList) {
      if (!entry || typeof entry !== "object") continue;
      const snap = sanitizeSnapshot(entry.snapshot);
      if (!snap) continue;
      validEntries.push({
        label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 80) : "Edit",
        ts: Number.isFinite(Number(entry.ts)) ? Number(entry.ts) : Date.now(),
        snapshot: snap,
      });
    }
    if (validEntries.length > 0) {
      state.history = validEntries.slice(-MAX_HISTORY);
      const savedIdx = Number(saved.historyIndex);
      state.historyIndex = Number.isInteger(savedIdx)
        ? Math.max(0, Math.min(state.history.length - 1, savedIdx))
        : state.history.length - 1;
      renderHistoryUI();
    } else {
      resetHistory("Opened saved pattern");
    }
  }

  function recordHistory(label, coalesceKey = null) {
    if (!state.image || state.isRestoringHistory) return;
    const snap = captureSnapshot();
    const snapJson = JSON.stringify(snap);

    if (state.historyIndex >= 0 && state.history[state.historyIndex]) {
      if (JSON.stringify(state.history[state.historyIndex].snapshot) === snapJson) {
        return;
      }
    }

    // Discard any undone future steps when a new edit branches off
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }

    const now = Date.now();
    const canCoalesce =
      coalesceKey &&
      lastHistoryCoalesce.key === coalesceKey &&
      now - lastHistoryCoalesce.time < 1200 &&
      state.historyIndex > 0;

    if (canCoalesce) {
      state.history[state.historyIndex] = { label, ts: now, snapshot: snap };
    } else {
      state.history.push({ label, ts: now, snapshot: snap });
      if (state.history.length > MAX_HISTORY) {
        state.history.shift();
      }
      state.historyIndex = state.history.length - 1;
    }

    lastHistoryCoalesce = { key: coalesceKey, time: now };
    renderHistoryUI();
    scheduleDraftSave();
  }

  function jumpToHistory(targetIndex) {
    if (targetIndex < 0 || targetIndex >= state.history.length || targetIndex === state.historyIndex) return;
    state.historyIndex = targetIndex;
    lastHistoryCoalesce = { key: null, time: 0 };
    restoreSnapshot(state.history[targetIndex].snapshot);
    renderHistoryUI();
    scheduleDraftSave();
  }

  function undo() {
    if (state.historyIndex > 0) {
      jumpToHistory(state.historyIndex - 1);
    }
  }

  function redo() {
    if (state.historyIndex >= 0 && state.historyIndex < state.history.length - 1) {
      jumpToHistory(state.historyIndex + 1);
    }
  }

  function closeHistoryPopover() {
    if (historyPopover) historyPopover.hidden = true;
    if (historyMenuBtn) historyMenuBtn.setAttribute("aria-expanded", "false");
  }

  function renderHistoryUI() {
    const canUndo = state.historyIndex > 0;
    const canRedo = state.historyIndex >= 0 && state.historyIndex < state.history.length - 1;

    if (undoBtn) {
      undoBtn.disabled = !canUndo;
      undoBtn.title = canUndo
        ? `Undo: ${state.history[state.historyIndex].label} (Cmd/Ctrl + Z)`
        : "Nothing to undo";
    }
    if (redoBtn) {
      redoBtn.disabled = !canRedo;
      redoBtn.title = canRedo
        ? `Redo: ${state.history[state.historyIndex + 1].label} (Cmd/Ctrl + Shift + Z)`
        : "Nothing to redo";
    }
    if (historyCount) {
      const total = state.history.length;
      historyCount.textContent = `${state.historyIndex + 1} / ${total}`;
    }
    if (historyList) {
      historyList.innerHTML = "";
      // Show newest actions at top of stack so users see their trail top-down
      for (let i = state.history.length - 1; i >= 0; i--) {
        const entry = state.history[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "history-item";
        btn.setAttribute("role", "option");
        if (i === state.historyIndex) {
          btn.classList.add("is-current");
          btn.setAttribute("aria-selected", "true");
        } else if (i > state.historyIndex) {
          btn.classList.add("is-future");
          btn.setAttribute("aria-selected", "false");
        } else {
          btn.setAttribute("aria-selected", "false");
        }

        const dot = document.createElement("span");
        dot.className = "history-dot";
        dot.setAttribute("aria-hidden", "true");

        const labelSpan = document.createElement("span");
        labelSpan.className = "history-item-label";
        labelSpan.textContent = entry.label;

        const idxSpan = document.createElement("span");
        idxSpan.className = "history-item-idx";
        idxSpan.textContent = `#${i + 1}`;

        btn.appendChild(dot);
        btn.appendChild(labelSpan);
        btn.appendChild(idxSpan);
        btn.addEventListener("click", () => {
          jumpToHistory(i);
          closeHistoryPopover();
        });
        historyList.appendChild(btn);
      }
    }
  }

  if (undoBtn) undoBtn.addEventListener("click", undo);
  if (redoBtn) redoBtn.addEventListener("click", redo);
  if (historyMenuBtn && historyPopover) {
    historyMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = historyPopover.hidden;
      historyPopover.hidden = !willOpen;
      historyMenuBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
      if (!historyPopover.hidden && !historyPopover.contains(e.target) && e.target !== historyMenuBtn) {
        closeHistoryPopover();
      }
    });
  }

  function savePattern() {
    if (!state.image) return;

    const currentTitle = getCurrentProjectTitle();

    const pattern = {
      format: PATTERN_FORMAT,
      version: PATTERN_VERSION,
      savedAt: new Date().toISOString(),
      name: state.fileName || "quilt",
      patternTitle: currentTitle,
      settings: {
        cols: state.cols,
        gridLayout: state.gridLayout,
        showSeamLines: state.showSeamLines,
        hstEnabled: state.hstEnabled,
        hstMode: state.hstMode,
        hstEdgeSensitivity: state.hstEdgeSensitivity,
        hstRatio: state.hstRatio,
        paintMaskRle: encodePaintMaskRle(),
        isBlankQuilt: state.isBlankQuilt,
        ...(serializeManualCells() ? { manualCells: serializeManualCells() } : {}),
        regionMode: state.unit === "cm" ? "metric" : "us",
        unit: state.unit,
        finishedSquareSize: state.finishedSquareSize,
        seamAllowance: state.seamAllowance,
        pageSize: pageSizeSelect.value,
        assemblyMode: assemblyModeSelect.value,
        crop: state.crop,
      },
      palette: state.palette.map((c) => rgbToHex(c.r, c.g, c.b)),
      ...(state.sourcePalette && state.sourcePalette.length === state.palette.length
        ? { sourcePalette: state.sourcePalette.map((c) => rgbToHex(c.r, c.g, c.b)) }
        : {}),
      ...(serializePalettePatterns() ? { palettePatterns: serializePalettePatterns() } : {}),
      history: state.history,
      historyIndex: state.historyIndex,
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
  newImageBtn.addEventListener("click", returnToStartScreen);

  if (importImageBtn && importImageInput) {
    importImageBtn.addEventListener("click", () => {
      importImageInput.value = "";
      importImageInput.click();
    });
    importImageInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) importImageIntoCurrentDesign(file);
      importImageInput.value = "";
    });
  }

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
    state.targetQuiltSize = null;
    if (quiltPresetSelect) quiltPresetSelect.value = "custom";
    computeSquareAverages();
    if (state.activeMathPattern) {
      applyMathPattern(state.activeMathPattern, { record: false });
    } else {
      renderQuilt();
    }
    if (!cropStage.hidden) {
      updateCropLockUI();
      renderCropCanvas();
    }
    recordHistory(`Grid: ${state.cols} × ${state.rows}`, "grid");
  });

  window.addEventListener("resize", () => {
    if (state.image && quiltCanvas.width > 0 && quiltCanvas.height > 0) {
      sizePreviewCanvas(quiltCanvas.width, quiltCanvas.height);
    }
  });

  if (seamLinesBtn) {
    seamLinesBtn.addEventListener("click", () => {
      setSeamLinesVisible(!state.showSeamLines);
      renderQuilt();
      recordHistory(state.showSeamLines ? "Show seam lines" : "Hide seam lines");
    });
  }

  if (hstToggle) {
    hstToggle.addEventListener("change", () => {
      state.hstEnabled = hstToggle.checked;
      if (hstControls) hstControls.hidden = !state.hstEnabled;
      updateQuiltDimensions();
      renderQuilt();
      recordHistory(state.hstEnabled ? "Enabled half-square triangles" : "Disabled half-square triangles");
    });
  }

  hstModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setHstPlacementMode(btn.dataset.hstMode);
      renderQuilt();
      recordHistory(
        state.hstMode === "edges" ? "HST mode: Edge Refinement" : "HST mode: Mix Ratio"
      );
    });
  });

  if (hstEdgeSlider) {
    hstEdgeSlider.addEventListener("input", () => {
      state.hstEdgeSensitivity = Number(hstEdgeSlider.value);
      renderQuilt();
      recordHistory(`Edge sensitivity: ${state.hstEdgeSensitivity}%`, "hst-edge");
    });
  }

  if (hstRatioSlider) {
    hstRatioSlider.addEventListener("input", () => {
      state.hstRatio = Number(hstRatioSlider.value);
      renderQuilt();
      recordHistory(`Triangle mix: ${state.hstRatio}%`, "hst-ratio");
    });
  }

  // Physical sizing & seam allowance controls.
  // Finished square size is treated as a fixed value unless it has to be changed.
  // When a target quilt size is active, editing finished square size adjusts Quilt Squares (cols × rows)
  // and expands the slider range automatically to preserve the specified quilt dimensions.
  finishedSizeInput.addEventListener("input", () => {
    const val = parseFloat(finishedSizeInput.value);
    if (!Number.isNaN(val) && val > 0) {
      state.finishedSquareSize = val;
      if (state.targetQuiltSize && state.image) {
        const idealCols = Math.round(state.targetQuiltSize.w / val);
        state.cols = syncSliderBoundsForCols(idealCols);
        computeSquareAverages(finishedSizeInput);
        renderQuilt();
        if (!cropStage.hidden) {
          updateCropLockUI();
          renderCropCanvas();
        }
      } else {
        if (quiltPresetSelect) quiltPresetSelect.value = "custom";
        updateQuiltDimensions(finishedSizeInput);
      }
      recordHistory(`Finished unit: ${formatMeasure(val, state.unit)}`, "finished-unit");
    }
  });

  // Reshapes the quilt (and live Crop Image frame when in crop mode) to match targetW × targetH.
  // Treats state.finishedSquareSize as fixed unless the required square count exceeds hard bounds,
  // dynamically expanding the Quilt Squares slider so large quilts with small squares fit exactly.
  function applyTargetQuiltSize(targetW, targetH, skipInputEl = null, label = null) {
    if (!state.image || !Number.isFinite(targetW) || !Number.isFinite(targetH)) return;
    if (targetW < 2 || targetH < 2) return;

    state.targetQuiltSize = { w: targetW, h: targetH, label };

    const imgAspect = state.image.naturalWidth / Math.max(1, state.image.naturalHeight);
    const targetAspect = targetW / targetH;
    const normRatio = targetAspect / imgAspect;
    let cropW = 1;
    let cropH = 1;
    if (normRatio <= 1) {
      cropW = Math.max(0.08, normRatio);
    } else {
      cropH = Math.max(0.08, 1 / normRatio);
    }

    const finished = Math.max(0.25, state.finishedSquareSize);
    const idealCols = Math.round(targetW / finished);
    const clampedCols = syncSliderBoundsForCols(idealCols);
    state.cols = clampedCols;

    if (idealCols < MIN_COLS || idealCols > HARD_MAX_COLS) {
      state.finishedSquareSize = Math.max(0.25, Math.round((targetW / clampedCols) * 100) / 100);
    }

    // If the user is currently in Crop Image mode, reflect and lock the crop frame live on the photo!
    if (!cropStage.hidden) {
      cropAspect = targetAspect;
      draftCrop = {
        x: (1 - cropW) / 2,
        y: (1 - cropH) / 2,
        w: cropW,
        h: cropH,
      };
      // Inset slightly when full-bleed so users have immediate room to drag/reposition
      fitDraftCropToAspect(targetAspect, 0.86);
      state.crop = { ...draftCrop };
      rebuildSampleBuffer();
      computeSquareAverages(skipInputEl);
      updateCropLockUI("quilt");
      renderCropCanvas();
      return;
    }

    state.crop = {
      x: (1 - cropW) / 2,
      y: (1 - cropH) / 2,
      w: cropW,
      h: cropH,
    };

    rebuildSampleBuffer();
    computeSquareAverages(skipInputEl);
    renderQuilt();
  }

  // Standard quilt size presets (Mini through King)
  if (quiltPresetSelect) {
    quiltPresetSelect.addEventListener("change", () => {
      const opt = quiltPresetSelect.selectedOptions[0];
      if (!opt || !state.image) return;
      if (opt.value === "custom") {
        state.targetQuiltSize = null;
        if (!cropStage.hidden) {
          setCropAspectButton("free");
          updateCropLockUI("free");
        }
        recordHistory("Size preset: Custom");
        return;
      }
      const wIn = parseFloat(opt.dataset.w);
      const hIn = parseFloat(opt.dataset.h);
      if (!Number.isFinite(wIn) || !Number.isFinite(hIn)) return;

      const scale = state.unit === "cm" ? 2.54 : 1;
      const presetName = opt.textContent.split("·")[0].split("(")[0].trim();
      applyTargetQuiltSize(wIn * scale, hIn * scale, null, presetName);
      recordHistory(`Size preset: ${presetName}`);
    });
  }

  // Direct finished quilt width/height editing reshapes the preview (or crop frame) and adjusts Quilt Squares
  if (quiltWidthInput) {
    quiltWidthInput.addEventListener("input", () => {
      const targetW = parseFloat(quiltWidthInput.value);
      const targetH = parseFloat(quiltHeightInput ? quiltHeightInput.value : "");
      if (!Number.isNaN(targetW) && targetW >= 2 && !Number.isNaN(targetH) && targetH >= 2) {
        if (quiltPresetSelect) quiltPresetSelect.value = "custom";
        applyTargetQuiltSize(targetW, targetH, quiltWidthInput, null);
        recordHistory(
          `Quilt size: ${formatMeasure(state.cols * state.finishedSquareSize, state.unit)} × ${formatMeasure(state.rows * state.finishedSquareSize, state.unit)}`,
          "quilt-size"
        );
      }
    });
    quiltWidthInput.addEventListener("blur", () => updateQuiltDimensions());
  }

  if (quiltHeightInput) {
    quiltHeightInput.addEventListener("input", () => {
      const targetW = parseFloat(quiltWidthInput ? quiltWidthInput.value : "");
      const targetH = parseFloat(quiltHeightInput.value);
      if (!Number.isNaN(targetW) && targetW >= 2 && !Number.isNaN(targetH) && targetH >= 2) {
        if (quiltPresetSelect) quiltPresetSelect.value = "custom";
        applyTargetQuiltSize(targetW, targetH, quiltHeightInput, null);
        recordHistory(
          `Quilt size: ${formatMeasure(state.cols * state.finishedSquareSize, state.unit)} × ${formatMeasure(state.rows * state.finishedSquareSize, state.unit)}`,
          "quilt-size"
        );
      }
    });
    quiltHeightInput.addEventListener("blur", () => updateQuiltDimensions());
  }

  seamAllowanceInput.addEventListener("input", () => {
    const val = parseFloat(seamAllowanceInput.value);
    if (!Number.isNaN(val) && val >= 0) {
      state.seamAllowance = val;
      updateQuiltDimensions(seamAllowanceInput);
      recordHistory(`Seam allowance: ${formatMeasure(val, state.unit)}`, "seam-allowance");
    }
  });

  regionBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setGlobalRegionMode(btn.dataset.region);
    });
  });

  paletteSizeSlider.addEventListener("input", () => {
    if (!state.samplePixels) return;
    const targetColors = Number(paletteSizeSlider.value);
    if (state.sourcePalette && !state.isBlankQuilt && !state.activeMathPattern) {
      state.sourcePalette = extractPalette(state.samplePixels, targetColors).map((c) => ({ r: c.r, g: c.g, b: c.b }));
      applyHarmonyFromControls({ record: true, coalesceKey: "palette-size", count: targetColors });
      return;
    }
    state.sourcePalette = null;
    state.palette = extractPalette(state.samplePixels, targetColors);
    renderPaletteSwatches();
    renderQuilt();
    if (harmonyPopover && !harmonyPopover.hidden) syncHarmonyPopoverUI();
    recordHistory(`Palette: ${targetColors} colors`, "palette-size");
  });

  resetPaletteBtn.addEventListener("click", () => {
    if (!state.samplePixels) return;
    const targetColors = Number(paletteSizeSlider.value);
    state.sourcePalette = null;
    state.palette = extractPalette(state.samplePixels, targetColors);
    renderPaletteSwatches();
    renderQuilt();
    if (harmonyPopover && !harmonyPopover.hidden) syncHarmonyPopoverUI();
    recordHistory("Re-extracted palette");
  });

  function addNewFabricAndEdit(anchorEl = null) {
    if (state.palette.length >= 24) return;
    const newColor = {
      id: state.nextColorId++,
      r: 245,
      g: 242,
      b: 235,
    };
    state.palette.push(newColor);
    state.paintFabricIdx = state.palette.length - 1;
    if (state.palette.length <= Number(paletteSizeSlider.max)) {
      paletteSizeSlider.value = String(state.palette.length);
    }
    renderPaletteSwatches();
    renderQuilt();
    recordHistory(`Added Fabric ${getFabricCode(state.palette.length - 1)}`);

    const newSwatchEl = paletteGrid.querySelector(`.swatch-item[data-id="${newColor.id}"]`);
    const targetAnchor = anchorEl && document.body.contains(anchorEl) ? anchorEl : newSwatchEl;
    if (targetAnchor) {
      openSwatchPopover(newColor, targetAnchor);
    }
  }

  addColorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addNewFabricAndEdit();
  });

  if (snapKonaBtn) {
    snapKonaBtn.addEventListener("click", () => {
      if (!state.palette || state.palette.length === 0) return;
      let changed = 0;
      state.palette.forEach((color) => {
        if (color.patternDataUrl) return; // Keep custom/Philip Jacobs patterned fabrics intact
        let best = NAMED_FABRIC_COLORS[0];
        let bestDist = Infinity;
        for (let i = 0; i < NAMED_FABRIC_COLORS.length; i++) {
          const row = NAMED_FABRIC_COLORS[i];
          const d = colorDistanceSq(color.r, color.g, color.b, row[1], row[2], row[3]);
          if (d < bestDist) {
            bestDist = d;
            best = row;
          }
        }
        if (color.r !== best[1] || color.g !== best[2] || color.b !== best[3]) {
          color.r = best[1];
          color.g = best[2];
          color.b = best[3];
          changed++;
        }
      });
      if (changed > 0) {
        renderPaletteSwatches();
        renderQuilt();
        syncSwatchPopover();
        recordHistory("Snapped palette to Kona Solids");
      }
    });
  }

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
      img.src = "icon-192-v3.png";
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

  function calculateFatQuarterFit(solidSquareCount, hstStarterSquareCount = 0) {
    const unit = state.unit;
    const cutSize = Math.max(0.1, state.finishedSquareSize) + 2 * Math.max(0, state.seamAllowance);
    const hstCutSize = getHstCutSize();
    // Standard Fat Quarter: 18" x 21" (45 cm x 52 cm)
    const fqW = unit === "in" ? 18 : 45;
    const fqH = unit === "in" ? 21 : 52;
    const perFq = Math.floor(fqW / cutSize) * Math.floor(fqH / cutSize);
    const fqSolidPerStrip = Math.max(1, Math.floor(fqH / cutSize));
    const fqHstPerStrip = Math.max(1, Math.floor(fqH / hstCutSize));
    const solidNeed = Math.ceil(solidSquareCount * (1 + FABRIC_BUFFER));
    const hstNeed = Math.ceil(hstStarterSquareCount * (1 + FABRIC_BUFFER));
    const fqSolidStrips = solidNeed > 0 && cutSize <= fqH ? Math.ceil(solidNeed / fqSolidPerStrip) : solidNeed > 0 ? 999 : 0;
    const fqHstStrips = hstNeed > 0 && hstCutSize <= fqH ? Math.ceil(hstNeed / fqHstPerStrip) : hstNeed > 0 ? 999 : 0;
    const neededLen = fqSolidStrips * cutSize + fqHstStrips * hstCutSize;
    const fitsOneFq = solidSquareCount + hstStarterSquareCount > 0 && neededLen <= fqW;
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

  function drawCodeBadge(doc, fonts, x, y, w, h, code, r, g, b, patternDataUrl = null) {
    if (patternDataUrl) {
      doc.addImage(patternDataUrl, "JPEG", x, y, w, h);
      doc.setDrawColor(120, 112, 102);
      doc.setLineWidth(0.008);
      doc.rect(x, y, w, h, "S");
      // High-contrast centered pill for the fabric letter code over printed fabrics
      const pillW = Math.min(w * 0.62, 0.2);
      const pillH = Math.min(h * 0.66, 0.16);
      doc.setFillColor(28, 25, 20);
      doc.roundedRect(x + (w - pillW) / 2, y + (h - pillH) / 2, pillW, pillH, 0.03, 0.03, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont(fonts.mono, "bold");
      doc.setFontSize(7.6);
      doc.text(code, x + w / 2, y + h * 0.66, { align: "center" });
      return;
    }
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
    const { cellW, cellH } = getCanvasUnitPixels(cols, rows, maxDim);
    const sq = Math.min(cellW, cellH);
    const off = document.createElement("canvas");
    off.width = cols * cellW;
    off.height = rows * cellH;
    const ctx = off.getContext("2d");

    drawQuiltCellsToContext(ctx, cols, rows, sq, {
      grayscale,
      showSeams: sq >= 6,
      cellW,
      cellH,
    });

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
      const hstCutSize = getHstCutSize();
      const hasHsts = state.hstEnabled && state.hstCount > 0;
      const solidCellsTotal = Math.max(0, cols * rows - (hasHsts ? state.hstCount : 0));
      const quiltW = cols * finished;
      const quiltH = rows * finished;
      const wof = getUsableWof(unit);

      const title = getCurrentProjectTitle();

      // Build active color list (skipping any palette colors with 0 assigned pieces)
      const activeColors = state.palette
        .map((color, idx) => {
          const count = state.usageCounts[idx] || 0;
          const solidCount = state.solidCounts[idx] || 0;
          const hstHalves = state.hstHalfCounts[idx] || 0;
          const hstStarters = state.hstStarterCounts[idx] || 0;
          const match = color.patternDataUrl
            ? {
                name: getFabricDisplayName(color),
                konaName: `${getFabricDisplayName(color)} (Print)`,
                bellaName: "Custom Fabric Print",
              }
            : getFabricCatalogMatch(color.r, color.g, color.b);
          const fq = calculateFatQuarterFit(solidCount, hstStarters);
          return {
            index: idx,
            code: getFabricCode(idx),
            name: match.name,
            match,
            patternDataUrl: color.patternDataUrl || null,
            fq,
            hex: rgbToHex(color.r, color.g, color.b).toUpperCase(),
            r: color.r,
            g: color.g,
            b: color.b,
            count,
            solidCount,
            hstHalves,
            hstStarters,
            fabric: calculateColorFabric(solidCount, hstStarters),
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
      const unitsSummary = hasHsts
        ? `${solidCellsTotal.toLocaleString()} Squares + ${state.hstCount.toLocaleString()} HSTs`
        : `${(cols * rows).toLocaleString()} Squares`;
      const subSummary = `Finished Quilt: ${formatPdfMeasure(quiltW, unit)} \u00d7 ${formatPdfMeasure(quiltH, unit)}   \u00b7   ${unitsSummary}   \u00b7   ${activeColors.length} Solid Fabrics`;
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
        ["FINISHED UNIT", `${formatPdfMeasure(finished, unit)} \u00d7 ${formatPdfMeasure(finished, unit)}`],
        [
          hasHsts ? "CUT SIZES (SQ / HST)" : "CUT SQUARE SIZE",
          hasHsts
            ? `${formatPdfMeasure(cutSize, unit)} sq \u00b7 ${formatPdfMeasure(hstCutSize, unit)} HST`
            : `${formatPdfMeasure(cutSize, unit)} \u00d7 ${formatPdfMeasure(cutSize, unit)}`,
        ],
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
            hasHsts
              ? `Cut ${formatPdfMeasure(cutSize, unit)} solid squares and ${formatPdfMeasure(hstCutSize, unit)} HST starter squares (2-at-a-time method: pair 2 starter squares RST, draw diagonal, sew ${formatPdfMeasure(seam, unit)} on both sides, cut on line & square up to ${formatPdfMeasure(cutSize, unit)}). Includes +10% buffer on ${formatPdfMeasure(wof, unit)} WOF.`
              : `Cut ${formatPdfMeasure(cutSize, unit)} \u00d7 ${formatPdfMeasure(cutSize, unit)} squares (includes ${formatPdfMeasure(seam, unit)} seam allowance). Yardage includes +10% safety buffer on ${formatPdfMeasure(wof, unit)} WOF.`,
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
        doc.text(hasHsts ? "CUT PIECES" : "SQUARES", margin + 3.75, curY + 0.18, { align: "right" });
        doc.text(hasHsts ? "WOF CUTTING STRIPS" : `CUTTING (${formatPdfMeasure(cutSize, unit)} STRIPS)`, margin + 3.92, curY + 0.18);
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

        drawCodeBadge(doc, fonts, margin + 0.08, curY + 0.09, 0.36, 0.24, c.code, c.r, c.g, c.b, c.patternDataUrl);

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
        doc.text(fitSingleLine(doc, c.name, 1.04), margin + 2.12, curY + 0.25);

        doc.setFont(fonts.mono, "bold");
        doc.setFontSize(hasHsts && c.hstStarters > 0 ? 7.6 : 8.6);
        const piecesTxt =
          hasHsts && c.hstStarters > 0 && c.solidCount > 0
            ? `${c.solidCount}sq+${c.hstStarters}H`
            : hasHsts && c.hstStarters > 0
              ? `${c.hstStarters} HST`
              : String(c.solidCount);
        doc.text(piecesTxt, margin + 3.75, curY + 0.25, { align: "right" });

        const cutColMaxW = contentW - 4.72;
        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(8.0);
        doc.setTextColor(70, 65, 58);
        let stripTxt;
        if (c.hstStarters > 0 && c.solidCount > 0) {
          stripTxt = `${c.fabric.strips}\u00d7${formatPdfMeasure(cutSize, unit)} + ${c.fabric.hstStrips}\u00d7${formatPdfMeasure(hstCutSize, unit)} WOF`;
        } else if (c.hstStarters > 0) {
          stripTxt = `${c.fabric.hstStrips}\u00d7${formatPdfMeasure(hstCutSize, unit)} HST strip${c.fabric.hstStrips === 1 ? "" : "s"} (${c.fabric.hstSquaresPerStrip}/strip)`;
        } else {
          stripTxt = `${c.fabric.strips} WOF strip${c.fabric.strips === 1 ? "" : "s"} (${c.fabric.squaresPerStrip}/strip)`;
        }
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
          subLabel:
            c.fabric.hstStrips > 0
              ? `${c.fabric.strips + c.fabric.hstStrips} total WOF strips`
              : `${c.fabric.strips} WOF strip${c.fabric.strips === 1 ? "" : "s"}`,
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

        drawCodeBadge(doc, fonts, margin + 0.08, shopY + 0.11, 0.38, 0.24, c.code, c.r, c.g, c.b, c.patternDataUrl);

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
              const cellIdx = globalRow * cols + globalCol;
              const cellType = state.cellTypes[cellIdx];
              const palIdx = state.gridAssignments[cellIdx];
              const pal = state.palette[palIdx];
              const code = codeByPaletteIndex.get(palIdx) || "?";
              const cx = gridX + c * cellSize;

              if (cellType === 0) {
                doc.setFillColor(pal.r, pal.g, pal.b);
                doc.setDrawColor(168, 160, 150);
                doc.setLineWidth(0.005);
                doc.rect(cx, ry, cellSize, cellSize, "FD");

                const isLight = luminance(pal.r, pal.g, pal.b) > 142;
                doc.setTextColor(isLight ? 25 : 255, isLight ? 22 : 255, isLight ? 18 : 255);
                doc.setFont(fonts.mono, "bold");
                doc.setFontSize(cellFont);
                doc.text(code, cx + cellSize / 2, ry + cellSize * 0.65, { align: "center" });
              } else {
                const palIdxB = state.gridAssignmentsB[cellIdx];
                const palB = state.palette[palIdxB] || pal;
                const codeB = codeByPaletteIndex.get(palIdxB) || "?";
                const hstFont = Math.min(6.4, Math.max(4.0, cellSize * 15));

                // Fill base rect with Half B, then overlay Half A triangle + diagonal seam
                doc.setFillColor(palB.r, palB.g, palB.b);
                doc.rect(cx, ry, cellSize, cellSize, "F");
                doc.setFillColor(pal.r, pal.g, pal.b);
                if (cellType === 1) {
                  // '/' diagonal: Half A = TL, Half B = BR
                  doc.triangle(cx, ry, cx + cellSize, ry, cx, ry + cellSize, "F");
                  doc.setDrawColor(150, 142, 130);
                  doc.setLineWidth(0.005);
                  doc.rect(cx, ry, cellSize, cellSize, "S");
                  doc.line(cx, ry + cellSize, cx + cellSize, ry);
                } else {
                  // '\' diagonal: Half A = BL, Half B = TR
                  doc.triangle(cx, ry, cx, ry + cellSize, cx + cellSize, ry + cellSize, "F");
                  doc.setDrawColor(150, 142, 130);
                  doc.setLineWidth(0.005);
                  doc.rect(cx, ry, cellSize, cellSize, "S");
                  doc.line(cx, ry, cx + cellSize, ry + cellSize);
                }

                doc.setFont(fonts.mono, "bold");
                doc.setFontSize(hstFont);
                const lightA = luminance(pal.r, pal.g, pal.b) > 142;
                const lightB = luminance(palB.r, palB.g, palB.b) > 142;
                if (cellType === 1) {
                  doc.setTextColor(lightA ? 25 : 255, lightA ? 22 : 255, lightA ? 18 : 255);
                  doc.text(code, cx + cellSize * 0.27, ry + cellSize * 0.37, { align: "center" });
                  doc.setTextColor(lightB ? 25 : 255, lightB ? 22 : 255, lightB ? 18 : 255);
                  doc.text(codeB, cx + cellSize * 0.73, ry + cellSize * 0.85, { align: "center" });
                } else {
                  doc.setTextColor(lightA ? 25 : 255, lightA ? 22 : 255, lightA ? 18 : 255);
                  doc.text(code, cx + cellSize * 0.27, ry + cellSize * 0.85, { align: "center" });
                  doc.setTextColor(lightB ? 25 : 255, lightB ? 22 : 255, lightB ? 18 : 255);
                  doc.text(codeB, cx + cellSize * 0.73, ry + cellSize * 0.37, { align: "center" });
                }
              }
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

      // Helper to encode a segment [cStart..cEnd) of row `r` into run-length items
      const encodeRowRuns = (r, cStart, cEnd) => {
        const runs = [];
        let prevKey = null;
        let curRun = null;
        for (let c = cStart; c < cEnd; c++) {
          const cellIdx = r * cols + c;
          const cellType = state.cellTypes[cellIdx];
          const pIdx = state.gridAssignments[cellIdx];
          const code = codeByPaletteIndex.get(pIdx) || "?";
          const pal = state.palette[pIdx];

          let key;
          let item;
          if (cellType === 0) {
            key = `S:${code}`;
            item = { count: 1, isHst: false, code, pal };
          } else {
            const pIdxB = state.gridAssignmentsB[cellIdx];
            const codeB = codeByPaletteIndex.get(pIdxB) || "?";
            const palB = state.palette[pIdxB] || pal;
            const sep = cellType === 1 ? "/" : "\\";
            const hstCode = `${code}${sep}${codeB}`;
            key = `H:${hstCode}`;
            item = { count: 1, isHst: true, diag: cellType, code: hstCode, pal, palB };
          }

          if (key === prevKey && curRun) {
            curRun.count++;
          } else {
            if (curRun) runs.push(curRun);
            prevKey = key;
            curRun = item;
          }
        }
        if (curRun) runs.push(curRun);
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
          if (run.isHst && run.palB) {
            // Split-color chip for Half-Square Triangle units (e.g. A/B or A\B)
            const halfW = w / 2;
            doc.setFillColor(pal.r, pal.g, pal.b);
            doc.rect(cx, cy, halfW, chipH, "F");
            doc.setFillColor(run.palB.r, run.palB.g, run.palB.b);
            doc.rect(cx + halfW, cy, halfW, chipH, "F");
            doc.setDrawColor(120, 112, 102);
            doc.setLineWidth(0.008);
            doc.rect(cx, cy, w, chipH, "S");

            // Crisp pill label pill-backing so text is legible across any two-tone split
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(cx + 0.04, cy + 0.03, w - 0.08, chipH - 0.06, 0.02, 0.02, "F");
            doc.setTextColor(34, 31, 26);
            doc.setFont(fonts.mono, "bold");
            doc.setFontSize(7.1);
            doc.text(txt, cx + w / 2, cy + 0.136, { align: "center" });
          } else {
            doc.setFillColor(pal.r, pal.g, pal.b);
            doc.setDrawColor(145, 137, 125);
            doc.setLineWidth(0.006);
            doc.roundedRect(cx, cy, w, chipH, 0.04, 0.04, "FD");

            const isLight = luminance(pal.r, pal.g, pal.b) > 145;
            doc.setTextColor(isLight ? 25 : 255, isLight ? 22 : 255, isLight ? 18 : 255);
            doc.setFont(fonts.mono, "bold");
            doc.setFontSize(7.4);
            doc.text(txt, cx + w / 2, cy + 0.138, { align: "center" });
          }
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

        drawCodeBadge(doc, fonts, tx + 0.08, ty + 0.3, 0.34, 0.22, c.code, c.r, c.g, c.b, c.patternDataUrl);

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(8.4);
        doc.setTextColor(34, 31, 26);
        doc.text(fitSingleLine(doc, c.name, fTagW - 0.72), tx + 0.5, ty + 0.42);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(7);
        doc.setTextColor(108, 100, 88);
        const tagCutSummary =
          c.hstStarters > 0 && c.solidCount > 0
            ? `${c.solidCount}\u00d7${formatPdfMeasure(cutSize, unit)} + ${c.hstStarters}\u00d7${formatPdfMeasure(hstCutSize, unit)} HST`
            : c.hstStarters > 0
              ? `${c.hstStarters}\u00d7${formatPdfMeasure(hstCutSize, unit)} HST sq`
              : `${c.solidCount} sq \u00b7 Cut ${formatPdfMeasure(cutSize, unit)}`;
        doc.text(fitSingleLine(doc, tagCutSummary, fTagW - 0.58), tx + 0.5, ty + 0.58);
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

  // Single-page printable Color Design Sheet PDF for early concept sharing & pin-up review
  async function exportDesignSheetPdf() {
    if (!state.image || state.palette.length === 0 || state.gridAssignments.length === 0) return;

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF export library is still loading or unavailable offline. Please check your connection and try again.");
      return;
    }

    if (exportSheetBtn) exportSheetBtn.disabled = true;
    const originalBtnHtml = exportSheetBtn ? exportSheetBtn.innerHTML : "";
    if (exportSheetBtn) exportSheetBtn.textContent = "Preparing Sheet...";

    try {
      const [fontData, brandIconDataUrl] = await Promise.all([loadPdfFonts(), loadPdfBrandIcon()]);
      const { jsPDF } = window.jspdf;
      const isA4 = pageSizeSelect.value === "a4";
      const doc = new jsPDF({ orientation: "portrait", unit: "in", format: isA4 ? "a4" : "letter" });
      doc.setLineHeightFactor(1.38);
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
      const hstCutSize = getHstCutSize();
      const hasHsts = state.hstEnabled && state.hstCount > 0;
      const solidCellsTotal = Math.max(0, cols * rows - (hasHsts ? state.hstCount : 0));
      const quiltW = cols * finished;
      const quiltH = rows * finished;

      const title = getCurrentProjectTitle();

      const activeColors = state.palette
        .map((color, idx) => {
          const count = state.usageCounts[idx] || 0;
          const solidCount = state.solidCounts[idx] || 0;
          const hstHalves = state.hstHalfCounts[idx] || 0;
          const hstStarters = state.hstStarterCounts[idx] || 0;
          const match = getFabricCatalogMatch(color.r, color.g, color.b);
          const fabric = calculateColorFabric(solidCount, hstStarters);
          return {
            code: getFabricCode(idx),
            name: color.patternDataUrl ? getFabricDisplayName(color) : match.name,
            konaName: color.patternDataUrl ? getFabricDisplayName(color) : match.konaName,
            patternDataUrl: color.patternDataUrl || null,
            r: color.r,
            g: color.g,
            b: color.b,
            count,
            solidCount,
            hstHalves,
            fabric,
          };
        })
        .filter((c) => c.count > 0);

      const totalTopLen = activeColors.reduce((acc, c) => acc + c.fabric.length * (1 + FABRIC_BUFFER), 0);
      const totalTopFormatted = formatPdfYardage(formatFabricAmount(totalTopLen, unit));

      // 1. Warm Editorial Header Band
      doc.setFillColor(246, 242, 235);
      doc.rect(0, 0, pageW, 1.56, "F");
      doc.setDrawColor(223, 214, 199);
      doc.setLineWidth(0.01);
      doc.line(0, 1.56, pageW, 1.56);

      if (brandIconDataUrl) {
        doc.addImage(brandIconDataUrl, "PNG", margin, 0.36, 0.38, 0.38);
      }
      const eyeX = brandIconDataUrl ? margin + 0.5 : margin;
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(7.6);
      doc.setTextColor(184, 77, 44);
      doc.text("MIRIAM'S QUILTCASTER  \u00b7  DESIGN PREVIEW SHEET", eyeX, 0.59);

      const dateStr = new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      doc.setFont(fonts.mono, "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(135, 127, 115);
      doc.text(dateStr, pageW - margin, 0.59, { align: "right" });

      doc.setFont(fonts.serif, "normal");
      doc.setFontSize(23);
      doc.setTextColor(34, 31, 26);
      doc.text(fitSingleLine(doc, title, contentW), margin, 1.05);

      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(9.2);
      doc.setTextColor(108, 100, 88);
      const pieceSummary = hasHsts
        ? `${solidCellsTotal.toLocaleString()} Squares + ${state.hstCount.toLocaleString()} HSTs`
        : `${(cols * rows).toLocaleString()} Squares`;
      const headerSub = `Finished Dimensions: ${formatPdfMeasure(quiltW, unit)} \u00d7 ${formatPdfMeasure(quiltH, unit)}   \u00b7   ${cols} \u00d7 ${rows} Grid (${pieceSummary})   \u00b7   ${activeColors.length} Solid Fabrics`;
      doc.text(fitSingleLine(doc, headerSub, contentW), margin, 1.32);

      // 2. Compute Bottom Palette Strip & 4-Stat Spec Bar Coordinates First so Hero Gets Max Space
      const swCols = activeColors.length <= 6 ? 3 : 4;
      const swRows = Math.max(1, Math.ceil(activeColors.length / swCols));
      const swRowH = swRows >= 5 ? 0.29 : 0.34;
      const swGapY = 0.06;
      const swGapX = 0.12;
      const paletteHeaderH = 0.22;
      const paletteBlockH = paletteHeaderH + swRows * swRowH + (swRows - 1) * swGapY;
      const footerTopY = pageH - 0.44;
      const paletteTopY = footerTopY - 0.14 - paletteBlockH;

      const specBarH = 0.62;
      const specBarY = paletteTopY - 0.18 - specBarH;

      // 3. Large Color Quilt Mockup with Architectural Top & Right Dimension Callouts
      const mockup = buildMockupDataUrl({ grayscale: false });
      const heroZoneTop = 1.72;
      const heroZoneBottom = specBarY - 0.16;
      const rulerTopSpace = 0.3;
      const rulerRightSpace = 0.56;
      const matPad = 0.11;

      const maxImgW = Math.max(1.5, contentW - rulerRightSpace - matPad * 2);
      const maxImgH = Math.max(1.5, heroZoneBottom - heroZoneTop - rulerTopSpace - matPad * 2);
      const aspect = mockup.width / Math.max(1, mockup.height);
      let drawW = maxImgW;
      let drawH = drawW / aspect;
      if (drawH > maxImgH) {
        drawH = maxImgH;
        drawW = drawH * aspect;
      }

      const totalVisualW = drawW + rulerRightSpace * 0.65;
      const imgX = margin + (contentW - totalVisualW) / 2;
      const imgY = heroZoneTop + rulerTopSpace + (maxImgH - drawH) / 2;

      // Crisp gallery mat frame
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(210, 200, 184);
      doc.setLineWidth(0.014);
      doc.roundedRect(imgX - matPad, imgY - matPad, drawW + matPad * 2, drawH + matPad * 2, 0.05, 0.05, "FD");
      doc.addImage(mockup.dataUrl, "PNG", imgX, imgY, drawW, drawH);

      // Architectural Top Width Dimension Ruler
      const wLabel = formatPdfMeasure(quiltW, unit);
      const topRulerY = imgY - matPad - 0.16;
      doc.setFont(fonts.mono, "bold");
      doc.setFontSize(8.2);
      const wPillW = Math.max(0.56, doc.getTextWidth(wLabel) + 0.22);
      const wPillH = 0.2;
      const wMidX = imgX + drawW / 2;

      doc.setDrawColor(145, 136, 124);
      doc.setLineWidth(0.009);
      doc.line(imgX, topRulerY - 0.045, imgX, topRulerY + 0.045);
      doc.line(imgX + drawW, topRulerY - 0.045, imgX + drawW, topRulerY + 0.045);
      if (drawW > wPillW + 0.14) {
        doc.line(imgX, topRulerY, wMidX - wPillW / 2 - 0.05, topRulerY);
        doc.line(wMidX + wPillW / 2 + 0.05, topRulerY, imgX + drawW, topRulerY);
      }
      doc.setFillColor(252, 250, 247);
      doc.setDrawColor(184, 77, 44);
      doc.setLineWidth(0.01);
      doc.roundedRect(wMidX - wPillW / 2, topRulerY - wPillH / 2, wPillW, wPillH, 0.1, 0.1, "FD");
      doc.setTextColor(34, 31, 26);
      doc.text(wLabel, wMidX, topRulerY + 0.038, { align: "center" });

      // Architectural Right Height Dimension Ruler
      const hLabel = formatPdfMeasure(quiltH, unit);
      const rightRulerX = imgX + drawW + matPad + 0.24;
      const hPillW = Math.max(0.54, doc.getTextWidth(hLabel) + 0.2);
      const hPillH = 0.2;
      const hMidY = imgY + drawH / 2;

      doc.setDrawColor(145, 136, 124);
      doc.setLineWidth(0.009);
      doc.line(rightRulerX - 0.045, imgY, rightRulerX + 0.045, imgY);
      doc.line(rightRulerX - 0.045, imgY + drawH, rightRulerX + 0.045, imgY + drawH);
      if (drawH > hPillH + 0.14) {
        doc.line(rightRulerX, imgY, rightRulerX, hMidY - hPillH / 2 - 0.05);
        doc.line(rightRulerX, hMidY + hPillH / 2 + 0.05, rightRulerX, imgY + drawH);
      }
      doc.setFillColor(252, 250, 247);
      doc.setDrawColor(184, 77, 44);
      doc.setLineWidth(0.01);
      doc.roundedRect(rightRulerX - hPillW / 2, hMidY - hPillH / 2, hPillW, hPillH, 0.1, 0.1, "FD");
      doc.setTextColor(34, 31, 26);
      doc.text(hLabel, rightRulerX, hMidY + 0.038, { align: "center" });

      // 4. Key Dimensions & Scope Bar (4 clean columns)
      doc.setFillColor(252, 250, 247);
      doc.setDrawColor(223, 214, 199);
      doc.setLineWidth(0.01);
      doc.roundedRect(margin, specBarY, contentW, specBarH, 0.06, 0.06, "FD");

      const specItems = [
        [
          "FINISHED QUILT SIZE",
          `${formatPdfMeasure(quiltW, unit)} \u00d7 ${formatPdfMeasure(quiltH, unit)}`,
          `Width \u00d7 Height`,
          true,
        ],
        [
          "PATCHWORK GRID",
          `${cols} \u00d7 ${rows} units`,
          hasHsts ? `${solidCellsTotal} sq \u00b7 ${state.hstCount} HST` : `${(cols * rows).toLocaleString()} squares`,
          false,
        ],
        [
          "FINISHED UNIT",
          `${formatPdfMeasure(finished, unit)} \u00d7 ${formatPdfMeasure(finished, unit)}`,
          hasHsts
            ? `Cut ${formatPdfMeasure(cutSize, unit)} / ${formatPdfMeasure(hstCutSize, unit)} HST`
            : `Cut ${formatPdfMeasure(cutSize, unit)} (${formatPdfMeasure(seam, unit)} seam)`,
          false,
        ],
        [
          "EST. TOP FABRIC",
          `~${totalTopFormatted}`,
          `${activeColors.length} solid fabric${activeColors.length === 1 ? "" : "s"}`,
          false,
        ],
      ];

      const sColW = contentW / 4;
      specItems.forEach(([lbl, mainVal, subVal, accent], idx) => {
        const sx = margin + idx * sColW + 0.14;
        if (idx > 0) {
          doc.setDrawColor(232, 225, 214);
          doc.setLineWidth(0.007);
          doc.line(margin + idx * sColW, specBarY + 0.1, margin + idx * sColW, specBarY + specBarH - 0.1);
        }
        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(135, 127, 115);
        doc.text(lbl, sx, specBarY + 0.19);

        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(9.6);
        doc.setTextColor(accent ? 184 : 34, accent ? 77 : 31, accent ? 44 : 26);
        doc.text(fitSingleLine(doc, mainVal, sColW - 0.22), sx, specBarY + 0.38);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(7.0);
        doc.setTextColor(108, 100, 88);
        doc.text(fitSingleLine(doc, subVal, sColW - 0.22), sx, specBarY + 0.52);
      });

      // 5. Color Story / Fabric Palette Swatch Strip
      doc.setFont(fonts.sans, "bold");
      doc.setFontSize(7.3);
      doc.setTextColor(92, 84, 73);
      doc.text("COLOR PALETTE & FABRIC OVERVIEW", margin, paletteTopY + 0.13);

      const swCellW = (contentW - swGapX * (swCols - 1)) / swCols;
      const swStartY = paletteTopY + paletteHeaderH;

      activeColors.forEach((c, idx) => {
        const col = idx % swCols;
        const row = Math.floor(idx / swCols);
        const cx = margin + col * (swCellW + swGapX);
        const cy = swStartY + row * (swRowH + swGapY);

        doc.setFillColor(250, 248, 244);
        doc.setDrawColor(225, 217, 204);
        doc.setLineWidth(0.007);
        doc.roundedRect(cx, cy, swCellW, swRowH, 0.04, 0.04, "FD");

        // Color swatch chip with letter badge
        const chipW = 0.34;
        const chipH = swRowH - 0.08;
        drawCodeBadge(doc, fonts, cx + 0.04, cy + 0.04, chipW, chipH, c.code, c.r, c.g, c.b, c.patternDataUrl);

        const textX = cx + chipW + 0.1;
        const maxTxtW = swCellW - chipW - 0.14;
        doc.setFont(fonts.sans, "bold");
        doc.setFontSize(7.6);
        doc.setTextColor(34, 31, 26);
        doc.text(fitSingleLine(doc, c.konaName, maxTxtW), textX, cy + swRowH * 0.43);

        doc.setFont(fonts.sans, "normal");
        doc.setFontSize(6.6);
        doc.setTextColor(108, 100, 88);
        const swMeta =
          c.hstHalves > 0 && c.solidCount > 0
            ? `${c.solidCount} sq \u00b7 ${c.hstHalves} HST \u00b7 ${formatPdfYardage(c.fabric.formatted)}`
            : c.hstHalves > 0
              ? `${c.hstHalves} HST \u00b7 ${formatPdfYardage(c.fabric.formatted)}`
              : `${c.solidCount} sq \u00b7 ${formatPdfYardage(c.fabric.formatted)}`;
        doc.text(fitSingleLine(doc, swMeta, maxTxtW), textX, cy + swRowH * 0.8);
      });

      // 6. Clean Single-Page Footer
      doc.setDrawColor(228, 221, 210);
      doc.setLineWidth(0.006);
      doc.line(margin, footerTopY, pageW - margin, footerTopY);

      if (brandIconDataUrl) {
        doc.addImage(brandIconDataUrl, "PNG", margin, pageH - 0.38, 0.15, 0.15);
      }
      doc.setFont(fonts.sans, "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(135, 127, 115);
      doc.text(
        "Miriam's Quiltcaster  \u00b7  Concept Design Sheet (export Full Booklet when ready to cut & sew)",
        brandIconDataUrl ? margin + 0.21 : margin,
        pageH - 0.27
      );
      doc.setFont(fonts.mono, "bold");
      doc.text(`${formatPdfMeasure(quiltW, unit)} \u00d7 ${formatPdfMeasure(quiltH, unit)}`, pageW - margin, pageH - 0.27, {
        align: "right",
      });

      const safeFile = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "quiltcaster";
      doc.save(`${safeFile}-design-sheet.pdf`);
    } finally {
      if (exportSheetBtn) {
        exportSheetBtn.disabled = false;
        exportSheetBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  if (exportSheetBtn) {
    exportSheetBtn.addEventListener("click", exportDesignSheetPdf);
  }
  exportPdfBtn.addEventListener("click", exportPdfPattern);
  assemblyModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setAssemblyMode(btn.dataset.assembly));
  });

  // Auto-detect default region mode from browser signals (IANA timezone + Intl locale + navigator.languages)
  function detectDefaultRegionMode() {
    const US_REGION_RE = /-(US|CA|MX|PH|PR|VI|GU|AS|MP|UM|LR|MM)(?:$|[-_])/i;
    const US_TZ_RE =
      /^(?:US\/|Pacific\/Honolulu$|America\/(?:New_York|Detroit|Kentucky\/|Indiana\/|Chicago|Menominee|North_Dakota\/|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Puerto_Rico|Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Mexico_City|Monterrey|Tijuana|Cancun)$)/;

    let intlLocale = "";
    let timeZone = "";
    try {
      const opts = Intl.DateTimeFormat().resolvedOptions();
      intlLocale = String(opts.locale || "");
      timeZone = String(opts.timeZone || "");
    } catch {
      // Ignore if Intl is unavailable
    }

    // 1. Timezone is the strongest physical-location signal (even if browser UI language is en-US)
    if (timeZone) {
      if (US_TZ_RE.test(timeZone)) return "us";
      if (/^(?:Europe|Asia|Australia|Africa|Antarctica|Indian)\//.test(timeZone)) return "metric";
      if (/^Pacific\//.test(timeZone) && timeZone !== "Pacific/Honolulu") return "metric";
      if (/^America\//.test(timeZone)) return "metric";
    }

    // 2. Fall back to Intl locale and navigator.languages / navigator.language
    const locales = [
      intlLocale,
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language || "",
    ].filter(Boolean);

    for (const loc of locales) {
      if (US_REGION_RE.test(loc)) return "us";
      if (/-[A-Z]{2}(?:$|[-_])/i.test(loc)) return "metric";
    }

    return "us";
  }

  // Global default: remember explicit user choice in localStorage, otherwise auto-detect from browser
  let initialRegion = null;
  try {
    const savedRegion = localStorage.getItem("quiltcaster-region");
    if (savedRegion === "us" || savedRegion === "metric") initialRegion = savedRegion;
  } catch {
    // Ignore storage restrictions
  }
  if (!initialRegion) {
    initialRegion = detectDefaultRegionMode();
  }
  setGlobalRegionMode(initialRegion, { convertValues: initialRegion === "metric", record: false, persist: false });

  // Save / open patterns
  savePatternBtn.addEventListener("click", savePattern);
  if (browseImageBtn) {
    browseImageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }
  if (blankQuiltBtn) {
    blankQuiltBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startBlankQuilt();
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

  // Keyboard shortcuts:
  //   Cmd/Ctrl + S (Save), Cmd/Ctrl + Z (Undo), Cmd/Ctrl + Shift + Z / Ctrl + Y (Redo)
  //   Drawing tools (when not typing): P (Paint mode), B (Fabric brush), / (/ HST), \ (\ HST),
  //   G or F (Flood fill), E (Reset / Background A), T (Auto Edge on photos),
  //   [ / ] (Brush size 1x1 / 3x3 / 5x5), 1-9 (Pick Fabric A-I), S (Toggle seams), Esc (Close popover / exit paint)
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : "";
    const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable;

    if (e.key === "Escape") {
      const hadPopover =
        (historyPopover && !historyPopover.hidden) ||
        (swatchPopover && !swatchPopover.hidden) ||
        (mathPropsPopover && !mathPropsPopover.hidden) ||
        (mathMenuPopover && !mathMenuPopover.hidden) ||
        (mapPopover && !mapPopover.hidden);
      closeHistoryPopover();
      closeSwatchPopover();
      closeMathPropsPopover();
      closeMathMenuPopover();
      closeMapPopover();
      if (!hadPopover && !isTyping) {
        if (state.paintMode) setPaintMode(false);
        if (state.panMode) setPanMode(false);
      }
      return;
    }
    if (!state.image) return;

    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod) {
      if (key === "s") {
        e.preventDefault();
        savePattern();
        return;
      }
      if (isTyping) return;
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
      return;
    }

    // Single-key drawing shortcuts (ignore when typing or holding Alt, or while crop modal is open)
    if (isTyping || e.altKey || (cropStage && !cropStage.hidden)) return;

    if (key === "p") {
      e.preventDefault();
      setPaintMode(!state.paintMode);
    } else if (key === "h") {
      e.preventDefault();
      setPanMode(!state.panMode);
    } else if (e.code === "Space" && !e.repeat && state.paintMode) {
      e.preventDefault();
      spaceTempPan = true;
      setPanMode(true);
    } else if (key === "b") {
      e.preventDefault();
      setPaintMode(true, "color");
    } else if (e.key === "/") {
      e.preventDefault();
      setPaintMode(true, "hst-slash");
    } else if (e.key === "\\") {
      e.preventDefault();
      setPaintMode(true, "hst-back");
    } else if (key === "g" || key === "f") {
      e.preventDefault();
      setPaintMode(true, "fill");
    } else if (key === "t" && !state.isBlankQuilt) {
      e.preventDefault();
      setPaintMode(true, "hst");
    } else if (key === "e") {
      e.preventDefault();
      if (state.isBlankQuilt) {
        state.paintFabricIdx = 0; // Background Fabric A as eraser on blank quilt
        setPaintMode(true, "color");
        renderPaintFabricStrip();
      } else {
        setPaintMode(true, "auto");
      }
    } else if (e.key === "[") {
      if (!state.paintMode) return;
      e.preventDefault();
      setPaintSize(state.paintSize === 5 ? 3 : 1);
    } else if (e.key === "]") {
      if (!state.paintMode) return;
      e.preventDefault();
      setPaintSize(state.paintSize === 1 ? 3 : 5);
    } else if (key === "s") {
      e.preventDefault();
      setSeamLinesVisible(!state.showSeamLines);
      renderQuilt();
      recordHistory(state.showSeamLines ? "Showed seam lines" : "Hid seam lines");
    } else if (/^[1-9]$/.test(e.key) && state.paintMode) {
      const idx = Number(e.key) - 1;
      if (idx < state.palette.length) {
        e.preventDefault();
        state.paintFabricIdx = idx;
        if (state.paintBrush === "hst" || state.paintBrush === "auto" || state.paintBrush === "square") {
          setPaintBrush("color");
        }
        renderPaintFabricStrip();
        updatePaintToolbarUI();
        redrawPreviewWithOverlayOnly();
      }
    }
  });

  // --- Interactive Non-Destructive Image Cropping ---

  // Inner canvas padding (px) around the photo so edge/corner handles are never clipped
  const CROP_PAD = 16;
  let draftCrop = { x: 0, y: 0, w: 1, h: 1 };
  let cropAspect = null; // null for free, or desired (pixelW / pixelH) ratio
  let cropDrag = null;
  let cropHoverMode = null; // Currently hovered handle or 'move'

  function formatTargetSizeBadge() {
    if (!state.targetQuiltSize) return "";
    const dims = `${formatMeasure(state.cols * state.finishedSquareSize, state.unit)} × ${formatMeasure(
      state.rows * state.finishedSquareSize,
      state.unit
    )}`;
    return state.targetQuiltSize.label ? `${state.targetQuiltSize.label} · ${dims}` : dims;
  }

  function updateCropLockUI(activeAspect = null) {
    const hasTarget = !!state.targetQuiltSize;
    if (cropQuiltSizeBtn) {
      cropQuiltSizeBtn.hidden = !hasTarget;
      cropQuiltSizeBtn.textContent =
        hasTarget && state.targetQuiltSize.label ? state.targetQuiltSize.label : "Quilt Size";
    }
    if (activeAspect !== null) {
      cropAspectBtns.forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.aspect === activeAspect);
      });
    }
    if (cropSubtitle) {
      const isQuiltLocked =
        hasTarget &&
        cropAspect !== null &&
        Math.abs(cropAspect - state.targetQuiltSize.w / state.targetQuiltSize.h) < 0.01;
      if (isQuiltLocked) {
        cropSubtitle.textContent = `Locked to ${formatTargetSizeBadge()} · drag to frame`;
      } else {
        cropSubtitle.textContent = "Drag handles or inside box to frame your quilt";
      }
    }
  }

  function setCropAspectButton(aspectStr) {
    if (aspectStr === "quilt" && state.targetQuiltSize && state.image) {
      const ratio = state.targetQuiltSize.w / state.targetQuiltSize.h;
      cropAspect = ratio;
      fitDraftCropToAspect(ratio, 0.86);
      updateCropLockUI("quilt");
      renderCropCanvas();
      return;
    }
    cropAspectBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.aspect === aspectStr);
    });
    if (aspectStr === "free") {
      cropAspect = null;
      updateCropLockUI("free");
      renderCropCanvas();
      return;
    }
    const ratio = parseFloat(aspectStr);
    if (!Number.isFinite(ratio) || !state.image) {
      cropAspect = null;
      updateCropLockUI("free");
      return;
    }
    cropAspect = ratio;
    // Cap preset selection to 78% of image so user can immediately reposition it in any direction
    fitDraftCropToAspect(ratio, 0.78);
    updateCropLockUI(aspectStr);
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

    if (state.targetQuiltSize) {
      cropAspect = state.targetQuiltSize.w / state.targetQuiltSize.h;
      fitDraftCropToAspect(cropAspect, isFullUnmodified ? 0.84 : 1);
      updateCropLockUI("quilt");
    } else {
      cropAspect = null;
      updateCropLockUI("free");
    }

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
    // If the user unlocked or changed the crop aspect ratio away from the specified quilt size,
    // clear the locked target size (while keeping finished square size fixed).
    if (state.targetQuiltSize) {
      const croppedW = state.crop.w * state.image.naturalWidth;
      const croppedH = Math.max(1, state.crop.h * state.image.naturalHeight);
      const actualAspect = croppedW / croppedH;
      const targetAspect = state.targetQuiltSize.w / state.targetQuiltSize.h;
      if (Math.abs(actualAspect - targetAspect) / targetAspect > 0.04) {
        state.targetQuiltSize = null;
        if (quiltPresetSelect) quiltPresetSelect.value = "custom";
      }
    }
    closeCropStage();
    rebuildSampleBuffer();

    if (cropReextractToggle.checked) {
      const targetColors = Number(paletteSizeSlider.value);
      state.palette = extractPalette(state.samplePixels, targetColors);
    }

    computeSquareAverages();
    renderPaletteSwatches();
    renderQuilt();
    recordHistory("Applied crop");
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

    // Live quilt dimension pill on the crop frame so users see exact dimensions while framing
    const cropRows = Math.max(1, Math.round((state.cols * bh) / Math.max(1, bw)));
    const liveW = state.cols * state.finishedSquareSize;
    const liveH = cropRows * state.finishedSquareSize;
    const dimLabel =
      state.targetQuiltSize &&
      cropAspect !== null &&
      Math.abs(cropAspect - state.targetQuiltSize.w / state.targetQuiltSize.h) < 0.01 &&
      state.targetQuiltSize.label
        ? `${state.targetQuiltSize.label} · ${formatMeasure(liveW, state.unit)} × ${formatMeasure(liveH, state.unit)}`
        : `${formatMeasure(liveW, state.unit)} × ${formatMeasure(liveH, state.unit)}`;
    cropCtx.save();
    cropCtx.font = "600 12px 'JetBrains Mono', ui-monospace, monospace";
    const textW = cropCtx.measureText(dimLabel).width;
    const pillW = textW + 18;
    const pillH = 22;
    const pillX = Math.max(CROP_PAD + 4, Math.min(cw - CROP_PAD - pillW - 4, bx + (bw - pillW) / 2));
    const pillY = by + 10 + pillH < by + bh - 24 ? by + 10 : Math.max(4, by - pillH - 6);
    cropCtx.fillStyle = "rgba(34, 31, 26, 0.84)";
    cropCtx.beginPath();
    if (cropCtx.roundRect) {
      cropCtx.roundRect(pillX, pillY, pillW, pillH, 11);
    } else {
      cropCtx.rect(pillX, pillY, pillW, pillH);
    }
    cropCtx.fill();
    cropCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    cropCtx.lineWidth = 1;
    cropCtx.stroke();
    cropCtx.fillStyle = "#ffffff";
    cropCtx.textAlign = "center";
    cropCtx.textBaseline = "middle";
    cropCtx.fillText(dimLabel, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
    cropCtx.restore();

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

  // --- Interactive Shape Painting (Brush Triangles / Squares onto Quilt Areas) ---

  let paintHoverCell = null; // { col, row } while hovering in paint mode
  let activePaintStroke = null; // { pointerId, startCol, startRow, lastCol, lastRow, initialPref, initialDiag, movedCell, lockAxis }
  let lastPaintedCell = null; // { col, row } anchor for Shift+Click straight lines
  let shiftHeld = false;

  function snapCellToStraightAxis(startCol, startRow, col, row, lockAxis) {
    const dx = col - startCol;
    const dy = row - startRow;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    let axis = lockAxis;
    if (!axis) {
      if (adx === 0 && ady === 0) return { col, row, axis: null };
      if (adx >= ady * 2) axis = "h";
      else if (ady >= adx * 2) axis = "v";
      else axis = dx * dy >= 0 ? "d1" : "d2";
    }
    let outCol = col;
    let outRow = row;
    if (axis === "h") {
      outRow = startRow;
    } else if (axis === "v") {
      outCol = startCol;
    } else if (axis === "d1") {
      const d = Math.round((dx + dy) / 2);
      outCol = startCol + d;
      outRow = startRow + d;
    } else if (axis === "d2") {
      const d = Math.round((dx - dy) / 2);
      outCol = startCol + d;
      outRow = startRow - d;
    }
    outCol = Math.max(0, Math.min(state.cols - 1, outCol));
    outRow = Math.max(0, Math.min(state.rows - 1, outRow));
    return { col: outCol, row: outRow, axis };
  }

  function renderPaintFabricStrip() {
    if (!paintFabricStrip) return;
    paintFabricStrip.innerHTML = "";
    if (state.paintFabricIdx >= state.palette.length) {
      state.paintFabricIdx = Math.max(0, state.palette.length - 1);
    }
    state.palette.forEach((color, idx) => {
      const code = getFabricCode(idx);
      const hex = rgbToHex(color.r, color.g, color.b);
      const displayName = getFabricDisplayName(color);
      const hasPrint = Boolean(color.patternDataUrl);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "paint-fabric-chip";
      if (hasPrint) btn.classList.add("has-pattern");
      if (idx === state.paintFabricIdx) btn.classList.add("is-active");
      btn.style.backgroundColor = hex;
      if (hasPrint) btn.style.backgroundImage = `url("${color.patternDataUrl}")`;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", idx === state.paintFabricIdx ? "true" : "false");
      btn.title =
        idx === state.paintFabricIdx
          ? `Fabric ${code}: ${displayName} — click again to change color or fabric`
          : `Paint with Fabric ${code}: ${displayName} (click twice to edit)`;
      const span = document.createElement("span");
      span.textContent = code;
      span.style.color = luminance(color.r, color.g, color.b) > 145 ? "#1c1914" : "#ffffff";
      btn.appendChild(span);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasActive = state.paintFabricIdx === idx;
        state.paintFabricIdx = idx;
        if (state.paintBrush === "hst" || state.paintBrush === "auto" || state.paintBrush === "square") {
          setPaintBrush("color");
        }
        renderPaintFabricStrip();
        updatePaintToolbarUI();
        redrawPreviewWithOverlayOnly();
        if (wasActive) {
          const freshChip = paintFabricStrip.querySelectorAll(".paint-fabric-chip")[idx] || btn;
          openSwatchPopover(color, freshChip);
        }
      });
      paintFabricStrip.appendChild(btn);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "paint-fabric-chip paint-fabric-add";
    addBtn.textContent = "+";
    addBtn.title = "Add a new fabric or color to palette";
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addNewFabricAndEdit(addBtn);
    });
    paintFabricStrip.appendChild(addBtn);
  }

  function updatePaintToolbarUI() {
    const isGeneratedPattern = Boolean(state.activeMathPattern);
    const hasPainted = !isGeneratedPattern && state.hasPaintedMask;
    const activeCount = isGeneratedPattern ? 0 : state.paintedCellsCount;
    if (paintToggleBtn) {
      paintToggleBtn.classList.toggle("is-painting", state.paintMode);
      paintToggleBtn.classList.toggle("is-cropped", !state.paintMode && hasPainted);
    }
    if (paintBtnLabel) {
      if (state.paintMode) {
        paintBtnLabel.textContent = "Painting";
      } else if (activeCount > 0) {
        paintBtnLabel.textContent = `Paint (${activeCount})`;
      } else {
        paintBtnLabel.textContent = "Paint";
      }
    }
    if (paintClearBtn) {
      paintClearBtn.hidden = !hasPainted;
      paintClearBtn.textContent = activeCount > 0 ? `Clear (${activeCount})` : "Clear";
    }
    if (paintStatusLabel) {
      const activeFab = state.palette[state.paintFabricIdx];
      const fabLabel = activeFab ? `Fabric ${getFabricCode(state.paintFabricIdx)} (${getFabricDisplayName(activeFab)})` : "";
      if (state.paintBrush === "color") {
        paintStatusLabel.textContent = `Painting ${fabLabel} · Hold Shift for straight lines`;
      } else if (state.paintBrush === "hst-slash" || state.paintBrush === "hst-back") {
        paintStatusLabel.textContent = `Painting ${state.paintBrush === "hst-slash" ? "/" : "\\"} HST with ${fabLabel} · Shift for lines`;
      } else if (state.paintBrush === "fill") {
        paintStatusLabel.textContent = `Click any region to fill with ${fabLabel}`;
      } else if (activeCount > 0) {
        paintStatusLabel.textContent = `${activeCount} custom cell${activeCount === 1 ? "" : "s"} · Shift for straight lines`;
      } else {
        paintStatusLabel.textContent = "Brush over stepped edges · Hold Shift for straight lines";
      }
    }
  }

  function setPaintBrush(mode) {
    const allowed = ["color", "hst-slash", "hst-back", "fill", "hst", "square", "auto"];
    const valid = allowed.includes(mode) ? mode : state.isBlankQuilt ? "color" : "hst";
    state.paintBrush = valid;
    paintBrushBtns.forEach((btn) => {
      const active = btn.dataset.paintBrush === valid;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    updatePaintToolbarUI();
    if (state.paintMode && state.image) {
      redrawPreviewWithOverlayOnly();
    }
  }

  function setPaintSize(size) {
    const n = Number(size);
    const valid = n === 1 || n === 5 ? n : 3;
    state.paintSize = valid;
    paintSizeBtns.forEach((btn) => {
      const active = Number(btn.dataset.paintSize) === valid;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    if (state.paintMode && state.image) {
      redrawPreviewWithOverlayOnly();
    }
  }

  function setPaintMode(enabled, initialBrush = null) {
    state.paintMode = Boolean(enabled);
    if (state.paintMode && state.panMode) {
      state.panMode = false;
      if (panToggleBtn) {
        panToggleBtn.classList.remove("is-panning");
        panToggleBtn.setAttribute("aria-pressed", "false");
      }
    }
    if (initialBrush) {
      setPaintBrush(initialBrush);
    } else if (state.paintMode && state.isBlankQuilt && (state.paintBrush === "hst" || state.paintBrush === "auto")) {
      setPaintBrush("color");
    }
    if (paintToolbar) {
      paintToolbar.hidden = !state.paintMode;
    }
    if (state.paintMode) {
      renderPaintFabricStrip();
    }
    quiltCanvas.classList.toggle("is-paintable", state.paintMode);
    syncCanvasDragCursor();
    if (!state.paintMode) {
      paintHoverCell = null;
      activePaintStroke = null;
      lastPaintedCell = null;
    }
    if (state.image && state.palette.length > 0) {
      // Re-run assignGridCells when entering paint mode so smoothableDiag is ready for live hover preview
      renderQuilt();
    } else {
      updatePaintToolbarUI();
    }
  }

  // --- Mathematical, Programmatic & Fractal Quilt Pattern Generators + Live Properties ---
  const MATH_PATTERN_SPECS = {
    "lone-star": {
      label: "Lone Star Radiant",
      params: [
        { key: "points", label: "Star points", type: "range", min: 4, max: 12, step: 2, def: 8, fmt: (v) => `${v}-pt` },
        { key: "rings", label: "Color bands", type: "range", min: 1, max: 5, step: 0.5, def: 2.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    monogram: {
      label: "Text & Initials Monogram",
      params: [
        { key: "text", label: "Text or initials", type: "text", def: "M", placeholder: "e.g. M, MH, MIRIAM", maxLength: 16 },
        {
          key: "font",
          label: "Lettering style",
          type: "select",
          def: "quilt-pixel",
          options: [
            { value: "quilt-pixel", label: "Quilt Block (5×7)" },
            { value: "arcade-8", label: "8-Bit Arcade Heavy (7×7)" },
            { value: "pixel-serif", label: "Heirloom Pixel Serif (6×7)" },
            { value: "stencil-pixel", label: "Quilt Stencil (6×7)" },
            { value: "tall-poster", label: "Tall Narrow Poster (4×7)" },
            { value: "sampler", label: "Cross-Stitch Mini (3×5)" },
            { value: "varsity", label: "Chunky Varsity Block" },
            { value: "sans", label: "Modern Geometric Sans" },
            { value: "serif", label: "Heirloom Serif (Fine Grid)" },
            { value: "script", label: "Flowing Italic Script" },
          ],
        },
        {
          key: "backdrop",
          label: "Quilt backdrop",
          type: "select",
          def: "frame",
          options: [
            { value: "frame", label: "Heirloom Border Frame" },
            { value: "solid", label: "Clean Solid Ground" },
            { value: "ombre", label: "Radiant Ombré Glow" },
            { value: "stripes", label: "Banded Quilt Stripes" },
          ],
        },
        { key: "size", label: "Letter size", type: "range", min: 0.4, max: 1.4, step: 0.05, def: 0.92, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "outline", label: "Outline / halo", type: "range", min: 0, max: 3, step: 0.5, def: 1.0, fmt: (v) => (v === 0 ? "Off" : `${v.toFixed(1)}×`) },
      ],
    },
    "tumbling-blocks": {
      label: "Tumbling Blocks (3D)",
      params: [
        { key: "density", label: "Cube density", type: "range", min: 2, max: 10, step: 1, def: 5, fmt: (v) => `${v}×` },
      ],
    },
    chevron: {
      label: "Chevron / Herringbone",
      params: [
        { key: "peaks", label: "Zigzag peaks", type: "range", min: 1, max: 8, step: 1, def: 3, fmt: (v) => `${v}` },
        { key: "bands", label: "Band repeat", type: "range", min: 1, max: 4, step: 0.5, def: 1.5, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    tartan: {
      label: "Woven Tartan Plaid",
      params: [
        { key: "density", label: "Stripe density", type: "range", min: 2, max: 10, step: 1, def: 4, fmt: (v) => `${v}×` },
        { key: "seed", label: "Weave pattern", type: "range", min: 1, max: 16, step: 1, def: 3, fmt: (v) => `#${v}` },
      ],
    },
    "topo-map": {
      label: "Topographic Contour Map",
      params: [
        { key: "terrain", label: "Terrain scale", type: "range", min: 1.5, max: 7.0, step: 0.5, def: 3.5, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "contours", label: "Contour bands", type: "range", min: 1, max: 3, step: 0.25, def: 1.25, fmt: (v) => `${v.toFixed(2)}×` },
        { key: "seed", label: "Island seed", type: "range", min: 1, max: 24, step: 1, def: 7, fmt: (v) => `#${v}` },
      ],
    },
    sunburst: {
      label: "Sunburst / Compass Rays",
      params: [
        { key: "rays", label: "Ray count", type: "range", min: 6, max: 28, step: 2, def: 14, fmt: (v) => `${v}` },
        { key: "rings", label: "Concentric rings", type: "range", min: 0, max: 6, step: 1, def: 2, fmt: (v) => `${v}` },
      ],
    },
    "william-morris": {
      label: "William Morris Trellis & Acanthus",
      params: [
        { key: "repeats", label: "Tile repeats", type: "range", min: 1, max: 4, step: 1, def: 2, fmt: (v) => `${v}×` },
        { key: "scroll", label: "Vine scroll", type: "range", min: 0.5, max: 2.0, step: 0.1, def: 1.1, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "blossom", label: "Rosette fullness", type: "range", min: 0.5, max: 1.6, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    "art-deco": {
      label: "Art Deco Sunburst Fan",
      params: [
        { key: "fans", label: "Fan columns", type: "range", min: 2, max: 6, step: 1, def: 3, fmt: (v) => `${v}` },
        { key: "rays", label: "Sunburst rays", type: "range", min: 5, max: 15, step: 2, def: 9, fmt: (v) => `${v}` },
        { key: "layers", label: "Arch tiers", type: "range", min: 1, max: 4, step: 1, def: 2, fmt: (v) => `${v}` },
      ],
    },
    "art-nouveau": {
      label: "Art Nouveau Whiplash",
      params: [
        { key: "flow", label: "Tendril flow", type: "range", min: 1, max: 5, step: 0.5, def: 2.5, fmt: (v) => `${v.toFixed(1)}` },
        { key: "whip", label: "Curve whip", type: "range", min: 0.5, max: 2.2, step: 0.1, def: 1.2, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "bands", label: "Stained glass", type: "range", min: 1, max: 4, step: 0.5, def: 2.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    seigaiha: {
      label: "Japanese Seigaiha Waves",
      params: [
        { key: "cols", label: "Wave columns", type: "range", min: 2, max: 8, step: 1, def: 4, fmt: (v) => `${v}` },
        { key: "rings", label: "Concentric rings", type: "range", min: 2, max: 6, step: 1, def: 4, fmt: (v) => `${v}` },
        { key: "depth", label: "Scallop depth", type: "range", min: 0.6, max: 1.4, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    "moroccan-zellige": {
      label: "Moroccan Zellige Star Tile",
      params: [
        { key: "repeats", label: "Tile repeats", type: "range", min: 1, max: 5, step: 1, def: 2, fmt: (v) => `${v}×` },
        { key: "sharpness", label: "Star points", type: "range", min: 0.4, max: 1.5, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "bands", label: "Border bands", type: "range", min: 1, max: 4, step: 0.5, def: 2.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    "bauhaus-grid": {
      label: "Bauhaus Geometric",
      params: [
        { key: "modules", label: "Module grid", type: "range", min: 2, max: 6, step: 1, def: 4, fmt: (v) => `${v}×${v}` },
        { key: "seed", label: "Composition", type: "range", min: 1, max: 20, step: 1, def: 5, fmt: (v) => `#${v}` },
      ],
    },
    "orchid-macro": {
      label: "Orchid Macro Close-Up",
      params: [
        { key: "zoom", label: "Bloom zoom", type: "range", min: 0.7, max: 2.0, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "veins", label: "Petal veins", type: "range", min: 0, max: 1, step: 0.1, def: 0.5, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "speckles", label: "Throat speckles", type: "range", min: 0, max: 1, step: 0.1, def: 0.6, fmt: (v) => `${Math.round(v * 100)}%` },
      ],
    },
    "dahlia-macro": {
      label: "Dahlia / Mum Macro",
      params: [
        { key: "petals", label: "Petals per ring", type: "range", min: 8, max: 24, step: 2, def: 14, fmt: (v) => `${v}` },
        { key: "layers", label: "Petal layers", type: "range", min: 3, max: 8, step: 1, def: 5, fmt: (v) => `${v}` },
        { key: "zoom", label: "Bloom zoom", type: "range", min: 0.7, max: 1.8, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    "peony-macro": {
      label: "Peony / Rose Close-Up",
      params: [
        { key: "ruffle", label: "Petal ruffle", type: "range", min: 1, max: 6, step: 1, def: 3, fmt: (v) => `${v}` },
        { key: "unfurl", label: "Spiral layers", type: "range", min: 2, max: 7, step: 1, def: 4, fmt: (v) => `${v}` },
        { key: "zoom", label: "Bloom zoom", type: "range", min: 0.7, max: 1.8, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    "sunflower-macro": {
      label: "Sunflower Phyllotaxis",
      params: [
        { key: "heart", label: "Seed heart size", type: "range", min: 0.25, max: 0.65, step: 0.05, def: 0.42, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "petals", label: "Outer petals", type: "range", min: 10, max: 28, step: 2, def: 18, fmt: (v) => `${v}` },
        { key: "zoom", label: "Bloom zoom", type: "range", min: 0.7, max: 1.8, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    mandelbrot: {
      label: "Mandelbrot Set",
      params: [
        { key: "zoom", label: "Zoom", type: "range", min: 0.6, max: 6, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "panX", label: "Center X", type: "range", min: -1.8, max: 0.5, step: 0.05, def: -0.65, fmt: (v) => v.toFixed(2) },
        { key: "panY", label: "Center Y", type: "range", min: -1.0, max: 1.0, step: 0.05, def: 0.0, fmt: (v) => v.toFixed(2) },
        { key: "cycles", label: "Color bands", type: "range", min: 1, max: 4, step: 0.25, def: 1.0, fmt: (v) => `${v.toFixed(2)}×` },
      ],
    },
    "burning-ship": {
      label: "Burning Ship Fractal",
      params: [
        { key: "zoom", label: "Zoom", type: "range", min: 0.6, max: 8, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "panX", label: "Center X", type: "range", min: -2.0, max: 0.6, step: 0.05, def: -0.45, fmt: (v) => v.toFixed(2) },
        { key: "panY", label: "Center Y", type: "range", min: -1.2, max: 0.8, step: 0.05, def: -0.45, fmt: (v) => v.toFixed(2) },
      ],
    },
    julia: {
      label: "Julia Set Spiral",
      params: [
        { key: "cr", label: "Real (c.r)", type: "range", min: -1.2, max: 0.5, step: 0.02, def: -0.72, fmt: (v) => v.toFixed(2) },
        { key: "ci", label: "Imag (c.i)", type: "range", min: -0.9, max: 0.9, step: 0.02, def: 0.19, fmt: (v) => v.toFixed(2) },
        { key: "zoom", label: "Zoom", type: "range", min: 0.6, max: 3.5, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    newton: {
      label: "Newton Symmetry Fractal",
      params: [
        { key: "order", label: "Symmetry petals", type: "range", min: 3, max: 8, step: 1, def: 3, fmt: (v) => `${v}-fold` },
        { key: "zoom", label: "Zoom", type: "range", min: 0.5, max: 4.0, step: 0.1, def: 1.0, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    "sierpinski-carpet": {
      label: "Sierpinski Carpet",
      params: [
        { key: "scale", label: "Recursion scale", type: "range", min: 1, max: 3, step: 1, def: 2, fmt: (v) => `3^${v + 1}` },
      ],
    },
    "sierpinski-triangle": {
      label: "Sierpinski Triangle",
      params: [
        { key: "bandDepth", label: "Color banding", type: "range", min: 1, max: 4, step: 1, def: 1, fmt: (v) => `${v}×` },
      ],
    },
    chladni: {
      label: "Chladni Acoustic Mandala",
      params: [
        { key: "n", label: "Mode N", type: "range", min: 1, max: 9, step: 1, def: 2, fmt: (v) => String(v) },
        { key: "m", label: "Mode M", type: "range", min: 1, max: 9, step: 1, def: 5, fmt: (v) => String(v) },
        { key: "mix", label: "Resonance mix", type: "range", min: -1, max: 1, step: 0.1, def: 1.0, fmt: (v) => v.toFixed(1) },
      ],
    },
    fire: {
      label: "Flame & Ember Fire Sim",
      params: [
        {
          key: "style",
          label: "Fire type",
          type: "select",
          def: "campfire",
          options: [
            { value: "campfire", label: "Campfire Hearth" },
            { value: "wildfire", label: "Roaring Wall of Fire" },
            { value: "phoenix", label: "Rising Ember Plume" },
          ],
        },
        { key: "intensity", label: "Flame height", type: "range", min: 0.35, max: 1.0, step: 0.05, def: 0.78, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "turbulence", label: "Turbulence", type: "range", min: 0.2, max: 1.5, step: 0.1, def: 0.85, fmt: (v) => `${v.toFixed(1)}×` },
        { key: "wind", label: "Wind drift", type: "range", min: -1.0, max: 1.0, step: 0.1, def: 0.0, fmt: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) },
        { key: "seed", label: "Ember seed", type: "range", min: 1, max: 24, step: 1, def: 7, fmt: (v) => `#${v}` },
      ],
    },
    turing: {
      label: "Reaction-Diffusion (Turing)",
      params: [
        {
          key: "preset",
          label: "Morphology",
          type: "select",
          def: "coral",
          options: [
            { value: "coral", label: "Coral Labyrinth" },
            { value: "spots", label: "Leopard Spots" },
            { value: "stripes", label: "Zebra Stripes" },
            { value: "mitosis", label: "Dividing Cells" },
          ],
        },
        { key: "steps", label: "Growth steps", type: "range", min: 80, max: 420, step: 20, def: 220, fmt: (v) => `${v}` },
        { key: "seed", label: "Seed", type: "range", min: 1, max: 20, step: 1, def: 3, fmt: (v) => `#${v}` },
      ],
    },
    interference: {
      label: "Moiré Wave Interference",
      params: [
        { key: "freq", label: "Wave frequency", type: "range", min: 6, max: 36, step: 2, def: 18, fmt: (v) => `${v}` },
        { key: "spread", label: "Source spread", type: "range", min: 0.08, max: 0.45, step: 0.02, def: 0.22, fmt: (v) => v.toFixed(2) },
      ],
    },
    voronoi: {
      label: "Voronoi Stained Glass",
      params: [
        { key: "sites", label: "Cell count", type: "range", min: 6, max: 48, step: 2, def: 20, fmt: (v) => `${v}` },
        { key: "seed", label: "Seed", type: "range", min: 1, max: 25, step: 1, def: 1, fmt: (v) => `#${v}` },
      ],
    },
    kaleidoscope: {
      label: "Kaleidoscope Medallion",
      params: [
        { key: "folds", label: "Mirror folds", type: "range", min: 4, max: 12, step: 2, def: 8, fmt: (v) => `${v}-fold` },
        { key: "detail", label: "Facet detail", type: "range", min: 1, max: 6, step: 1, def: 3, fmt: (v) => `${v}` },
        { key: "twist", label: "Mirror twist", type: "range", min: -3, max: 3, step: 0.25, def: 0, fmt: (v) => v.toFixed(2) },
        { key: "seed", label: "Pattern seed", type: "range", min: 1, max: 24, step: 1, def: 4, fmt: (v) => `#${v}` },
      ],
    },
    "kaleidoscope-hst": {
      label: "Kaleidoscope Star (HST)",
      params: [
        { key: "rings", label: "Star complexity", type: "range", min: 1, max: 5, step: 1, def: 3, fmt: (v) => `${v}` },
        { key: "seed", label: "Pattern seed", type: "range", min: 1, max: 24, step: 1, def: 5, fmt: (v) => `#${v}` },
      ],
    },
    "bargello-wave": {
      label: "Bargello Sine Wave",
      params: [
        { key: "freq", label: "Wave frequency", type: "range", min: 0.5, max: 4.0, step: 0.25, def: 1.25, fmt: (v) => `${v.toFixed(2)}×` },
        { key: "amp", label: "Wave height", type: "range", min: 0.05, max: 0.5, step: 0.05, def: 0.25, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "repeat", label: "Band repeat", type: "range", min: 0.6, max: 3.0, step: 0.2, def: 1.4, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
    "fibonacci-spiral": {
      label: "Fibonacci Golden Spiral",
      params: [
        { key: "arms", label: "Spiral arms", type: "range", min: 2, max: 13, step: 1, def: 5, fmt: (v) => `${v}` },
        { key: "twist", label: "Spiral twist", type: "range", min: 0.5, max: 5.0, step: 0.25, def: 2.25, fmt: (v) => v.toFixed(2) },
      ],
    },
    truchet: {
      label: "Truchet Labyrinth",
      params: [
        { key: "seed", label: "Weave variation", type: "range", min: 1, max: 16, step: 1, def: 3, fmt: (v) => `#${v}` },
        { key: "bands", label: "Color zones", type: "range", min: 1, max: 4, step: 1, def: 1, fmt: (v) => `${v}×` },
      ],
    },
    "log-cabin": {
      label: "Log Cabin Concentric",
      params: [
        { key: "ringWidth", label: "Ring width", type: "range", min: 1, max: 4, step: 1, def: 1, fmt: (v) => `${v} sq` },
      ],
    },
    "xor-mosaic": {
      label: "Bitwise XOR Mosaic",
      params: [
        { key: "mod", label: "Modulo", type: "range", min: 3, max: 23, step: 1, def: 9, fmt: (v) => `mod ${v}` },
        { key: "zoom", label: "Scale", type: "range", min: 1, max: 4, step: 1, def: 1, fmt: (v) => `${v}×` },
        {
          key: "mirror",
          label: "Symmetry",
          type: "select",
          def: "quad",
          options: [
            { value: "quad", label: "4-Way Quilt Medallion" },
            { value: "corner", label: "Corner Cascade" },
          ],
        },
      ],
    },
    "ulam-spiral": {
      label: "Ulam Prime Spiral",
      params: [
        { key: "start", label: "Start integer", type: "range", min: 1, max: 41, step: 1, def: 1, fmt: (v) => `${v}` },
        {
          key: "mode",
          label: "Coloring",
          type: "select",
          def: "primes",
          options: [
            { value: "primes", label: "Prime Diagonals" },
            { value: "divisors", label: "Divisor Richness" },
          ],
        },
      ],
    },
    "cellular-rule90": {
      label: "Wolfram Cellular Automaton",
      params: [
        {
          key: "rule",
          label: "Wolfram Rule",
          type: "select",
          def: "90",
          options: [
            { value: "90", label: "Rule 90 (Sierpinski Lace)" },
            { value: "30", label: "Rule 30 (Chaotic Cone)" },
            { value: "110", label: "Rule 110 (Turing Complete)" },
            { value: "150", label: "Rule 150 (Diamond Weave)" },
            { value: "184", label: "Rule 184 (Diagonal Flow)" },
          ],
        },
      ],
    },
    hilbert: {
      label: "Hilbert Space-Filling Curve",
      params: [
        { key: "cycles", label: "Color cycles", type: "range", min: 1, max: 4, step: 0.5, def: 1, fmt: (v) => `${v.toFixed(1)}×` },
      ],
    },
  };

  function getDefaultMathParams(patternId) {
    const spec = MATH_PATTERN_SPECS[patternId];
    const out = {};
    if (spec && Array.isArray(spec.params)) {
      spec.params.forEach((p) => {
        out[p.key] = p.def;
      });
    }
    return out;
  }

  function getMathParam(patternId, key) {
    if (state.mathParams && state.mathParams[key] !== undefined) return state.mathParams[key];
    const spec = MATH_PATTERN_SPECS[patternId];
    const defParam = spec?.params?.find((p) => p.key === key);
    return defParam ? defParam.def : 0;
  }

  function isPrimeNum(n) {
    if (n < 2) return false;
    if (n === 2 || n === 3) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    for (let i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
  }

  function countDivisorsNum(n) {
    if (n <= 1) return 1;
    let cnt = 0;
    const lim = Math.floor(Math.sqrt(n));
    for (let i = 1; i <= lim; i++) {
      if (n % i === 0) cnt += i * i === n ? 1 : 2;
    }
    return cnt;
  }

  // Exact integer value at (dx, dy) on an Ulam spiral starting at `start` in the center
  function ulamSpiralValue(dx, dy, start = 1) {
    const k = Math.max(Math.abs(dx), Math.abs(dy));
    if (k === 0) return start;
    const maxVal = (2 * k + 1) * (2 * k + 1);
    let offset = 0;
    if (dy === k) offset = k - dx;
    else if (dx === -k) offset = 2 * k + (k - dy);
    else if (dy === -k) offset = 4 * k + (dx + k);
    else offset = 6 * k + (dy + k);
    return start + (maxVal - 1 - offset);
  }

  // Compact Gray-Scott Reaction-Diffusion solver (returns Float32Array of B-chemical values 0..1)
  function computeTuringGrid(gw, gh, preset, steps, seedNum) {
    const presets = {
      coral: { f: 0.0545, k: 0.062 },
      spots: { f: 0.035, k: 0.065 },
      stripes: { f: 0.042, k: 0.059 },
      mitosis: { f: 0.028, k: 0.062 },
    };
    const { f, k } = presets[preset] || presets.coral;
    const N = gw * gh;
    let a = new Float32Array(N).fill(1);
    let b = new Float32Array(N);
    let nextA = new Float32Array(N);
    let nextB = new Float32Array(N);

    // Deterministic seeds
    let s = (seedNum * 2654435761) | 0;
    const rand = () => {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      return ((s >>> 0) % 10000) / 10000;
    };
    const patchCount = Math.max(6, Math.min(18, Math.round((gw * gh) / 90)));
    for (let p = 0; p < patchCount; p++) {
      const cx = Math.floor(rand() * gw);
      const cy = Math.floor(rand() * gh);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = (cx + dx + gw) % gw;
          const y = (cy + dy + gh) % gh;
          b[y * gw + x] = 1;
        }
      }
    }

    const dA = 1.0;
    const dB = 0.5;
    for (let step = 0; step < steps; step++) {
      for (let y = 0; y < gh; y++) {
        const yUp = ((y - 1 + gh) % gh) * gw;
        const yMid = y * gw;
        const yDn = ((y + 1) % gh) * gw;
        for (let x = 0; x < gw; x++) {
          const xL = (x - 1 + gw) % gw;
          const xR = (x + 1) % gw;
          const i = yMid + x;
          const ca = a[i];
          const cb = b[i];
          const lapA =
            a[yUp + x] * 0.2 +
            a[yDn + x] * 0.2 +
            a[yMid + xL] * 0.2 +
            a[yMid + xR] * 0.2 +
            a[yUp + xL] * 0.05 +
            a[yUp + xR] * 0.05 +
            a[yDn + xL] * 0.05 +
            a[yDn + xR] * 0.05 -
            ca;
          const lapB =
            b[yUp + x] * 0.2 +
            b[yDn + x] * 0.2 +
            b[yMid + xL] * 0.2 +
            b[yMid + xR] * 0.2 +
            b[yUp + xL] * 0.05 +
            b[yUp + xR] * 0.05 +
            b[yDn + xL] * 0.05 +
            b[yDn + xR] * 0.05 -
            cb;
          const abb = ca * cb * cb;
          nextA[i] = Math.max(0, Math.min(1, ca + (dA * lapA - abb + f * (1 - ca))));
          nextB[i] = Math.max(0, Math.min(1, cb + (dB * lapB + abb - (k + f) * cb)));
        }
      }
      const tmpA = a;
      a = nextA;
      nextA = tmpA;
      const tmpB = b;
      b = nextB;
      nextB = tmpB;
    }
    return b;
  }

  // Convert (x, y) in an n x n (power-of-2) grid to 1D Hilbert curve distance d
  function hilbertXy2d(n, x, y) {
    let d = 0;
    let rx;
    let ry;
    let cx = x;
    let cy = y;
    for (let s = n >> 1; s > 0; s >>= 1) {
      rx = (cx & s) > 0 ? 1 : 0;
      ry = (cy & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) {
          cx = s - 1 - cx;
          cy = s - 1 - cy;
        }
        const tmp = cx;
        cx = cy;
        cy = tmp;
      }
    }
    return d;
  }

  const MATH_PATTERN_CATEGORIES = [
    {
      label: "Map & Satellite",
      isMapCategory: true,
      items: [
        { id: "map:satellite", label: "Satellite Imagery…" },
        { id: "map:voyager", label: "Clean Street Map…" },
        { id: "map:topo", label: "Topographic Map…" },
        { id: "map:relief", label: "Shaded Terrain & Coast…" },
      ],
    },
    {
      label: "Classic & Modern Quilt",
      items: ["monogram", "lone-star", "tumbling-blocks", "chevron", "tartan", "topo-map", "sunburst"],
    },
    {
      label: "Heritage & Decorative",
      items: ["william-morris", "art-deco", "art-nouveau", "seigaiha", "moroccan-zellige", "bauhaus-grid"],
    },
    {
      label: "Botanical Close-Ups",
      items: ["orchid-macro", "dahlia-macro", "peony-macro", "sunflower-macro"],
    },
    {
      label: "Fractals",
      items: ["mandelbrot", "burning-ship", "julia", "newton", "sierpinski-carpet", "sierpinski-triangle"],
    },
    {
      label: "Physics & Organic",
      items: ["fire", "chladni", "turing", "interference", "voronoi"],
    },
    {
      label: "Quilt Math & Waves",
      items: ["kaleidoscope", "kaleidoscope-hst", "bargello-wave", "fibonacci-spiral", "truchet", "log-cabin"],
    },
    {
      label: "Algorithmic & Primes",
      items: ["xor-mosaic", "ulam-spiral", "cellular-rule90", "hilbert"],
    },
  ];

  function syncMathMenuLabel() {
    if (!mathMenuLabel) return;
    const spec = state.activeMathPattern ? MATH_PATTERN_SPECS[state.activeMathPattern] : null;
    mathMenuLabel.textContent = spec ? spec.label : "Generate";
    if (mathMenuBtn) mathMenuBtn.classList.toggle("has-pattern", Boolean(spec));
  }

  function closeMathMenuPopover() {
    if (!mathMenuPopover) return;
    mathMenuPopover.hidden = true;
    if (mathMenuBtn) mathMenuBtn.setAttribute("aria-expanded", "false");
  }

  function renderMathMenuPopover() {
    if (!mathMenuPopover) return;
    mathMenuPopover.innerHTML = "";
    MATH_PATTERN_CATEGORIES.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "math-cat-row";
      const hasActiveChild = cat.items.includes(state.activeMathPattern);
      if (hasActiveChild) row.classList.add("is-open");

      const catBtn = document.createElement("button");
      catBtn.type = "button";
      catBtn.className = "math-cat-btn";
      catBtn.innerHTML = `<span>${cat.label}</span><span class="math-cat-chevron" aria-hidden="true">▸</span>`;

      const sub = document.createElement("div");
      sub.className = "math-submenu";
      sub.setAttribute("role", "menu");

      cat.items.forEach((entryItem) => {
        const isMapItem = typeof entryItem === "object" && entryItem.id?.startsWith("map:");
        const id = isMapItem ? entryItem.id : entryItem;
        const label = isMapItem ? entryItem.label : MATH_PATTERN_SPECS[id]?.label;
        if (!label) return;
        const itemBtn = document.createElement("button");
        itemBtn.type = "button";
        itemBtn.className = "math-sub-btn";
        itemBtn.dataset.mathPattern = id;
        itemBtn.setAttribute("role", "menuitem");
        if (!isMapItem && state.activeMathPattern === id) itemBtn.classList.add("is-active");
        itemBtn.innerHTML = `<span>${label}</span>${!isMapItem && state.activeMathPattern === id ? '<span aria-hidden="true">✓</span>' : ""}`;
        itemBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeMathMenuPopover();
          if (isMapItem) {
            const styleId = id.slice(4);
            openMapPopover(styleId);
            return;
          }
          state.mathParams = getDefaultMathParams(id);
          state.mathTransform = { offsetX: 0, offsetY: 0, scale: 1.0, rotate: 0 };
          applyMathPattern(id, { record: true });
          if (id === "monogram" && mathPropsPopover && mathPropsPopover.hidden) {
            openMathPropsPopover();
          } else if (mathPropsPopover && !mathPropsPopover.hidden) {
            renderMathPropsControls();
          }
        });
        sub.appendChild(itemBtn);
      });

      const openRow = () => {
        mathMenuPopover.querySelectorAll(".math-cat-row.is-open").forEach((el) => {
          if (el !== row) el.classList.remove("is-open");
        });
        row.classList.add("is-open");
      };
      row.addEventListener("mouseenter", openRow);
      catBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (row.classList.contains("is-open")) {
          row.classList.remove("is-open");
        } else {
          openRow();
        }
      });

      row.appendChild(catBtn);
      row.appendChild(sub);
      mathMenuPopover.appendChild(row);
    });
  }

  function openMathMenuPopover() {
    if (!mathMenuPopover || !mathMenuBtn) return;
    if (!mathMenuPopover.hidden) {
      closeMathMenuPopover();
      return;
    }
    closeHistoryPopover();
    closeSwatchPopover();
    closeMathPropsPopover();
    renderMathMenuPopover();
    mathMenuPopover.hidden = false;
    mathMenuBtn.setAttribute("aria-expanded", "true");

    const rect = mathMenuBtn.getBoundingClientRect();
    const popRect = mathMenuPopover.getBoundingClientRect();
    const margin = 10;
    let left = rect.left;
    if (left + popRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popRect.width - margin);
    }
    let top = rect.bottom + 6;
    if (top + popRect.height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - popRect.height - 6);
    }
    mathMenuPopover.style.left = `${Math.round(left)}px`;
    mathMenuPopover.style.top = `${Math.round(top)}px`;
  }

  if (mathMenuBtn) {
    mathMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMathMenuPopover();
    });
  }
  document.addEventListener("click", (e) => {
    if (!mathMenuPopover || mathMenuPopover.hidden) return;
    if (mathMenuPopover.contains(e.target)) return;
    if (e.target === mathMenuBtn || (e.target.closest && e.target.closest("#math-menu-btn"))) return;
    closeMathMenuPopover();
  });

  function syncCanvasDragCursor() {
    if (!quiltCanvas) return;
    const canDrag =
      !state.paintMode &&
      !state.showingOriginal &&
      (state.panMode || Boolean(state.activeMathPattern || state.activeMap));
    quiltCanvas.classList.toggle("is-draggable", canDrag);
  }

  let spaceTempPan = false;
  function setPanMode(enabled) {
    const next = Boolean(enabled);
    if (next && state.paintMode) {
      setPaintMode(false);
    }
    state.panMode = next;
    if (panToggleBtn) {
      panToggleBtn.classList.toggle("is-panning", state.panMode);
      panToggleBtn.setAttribute("aria-pressed", state.panMode ? "true" : "false");
    }
    syncCanvasDragCursor();
  }

  if (panToggleBtn) {
    panToggleBtn.addEventListener("click", () => {
      if (!state.image) return;
      setPanMode(!state.panMode);
    });
  }

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" && spaceTempPan) {
      spaceTempPan = false;
      if (state.panMode) {
        setPaintMode(true);
      }
    }
  });

  function syncMathPropsButton() {
    syncMathMenuLabel();
    syncCanvasDragCursor();
    if (!mathPropsBtn) return;
    const hasActive = Boolean(
      (state.activeMathPattern && MATH_PATTERN_SPECS[state.activeMathPattern]) || state.activeMap
    );
    mathPropsBtn.hidden = !hasActive;
    const isOpen =
      (mathPropsPopover && !mathPropsPopover.hidden) || (mapPopover && !mapPopover.hidden);
    mathPropsBtn.classList.toggle("is-open", hasActive && isOpen);
  }

  function closeMathPropsPopover() {
    if (!mathPropsPopover) return;
    mathPropsPopover.hidden = true;
    syncMathPropsButton();
  }

  function renderMathPropsControls() {
    if (!mathPropsBody || !state.activeMathPattern) return;
    const spec = MATH_PATTERN_SPECS[state.activeMathPattern];
    if (!spec) return;
    if (mathPropsTitle) mathPropsTitle.textContent = spec.label;
    if (mathReversePalette) mathReversePalette.checked = Boolean(state.mathReversePalette);

    mathPropsBody.innerHTML = "";
    spec.params.forEach((p) => {
      const wrap = document.createElement("div");
      wrap.className = "math-prop-control";

      const head = document.createElement("div");
      head.className = "math-prop-head";
      const lbl = document.createElement("label");
      lbl.textContent = p.label;
      head.appendChild(lbl);

      const curVal = getMathParam(state.activeMathPattern, p.key);

      if (p.type === "text") {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "map-location-input";
        inp.value = String(curVal ?? "");
        if (p.placeholder) inp.placeholder = p.placeholder;
        if (p.maxLength) inp.maxLength = p.maxLength;
        inp.autocomplete = "off";
        inp.addEventListener("input", () => {
          state.mathParams[p.key] = inp.value;
          applyMathPattern(state.activeMathPattern, { record: true, coalesceKey: `math-${p.key}` });
        });
        wrap.appendChild(head);
        wrap.appendChild(inp);
      } else if (p.type === "select") {
        const sel = document.createElement("select");
        sel.className = "math-prop-select";
        p.options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          if (String(curVal) === String(opt.value)) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", () => {
          state.mathParams[p.key] = sel.value;
          applyMathPattern(state.activeMathPattern, { record: true, coalesceKey: `math-${p.key}` });
        });
        wrap.appendChild(head);
        wrap.appendChild(sel);
      } else {
        const valSpan = document.createElement("span");
        valSpan.className = "control-value";
        valSpan.textContent = p.fmt ? p.fmt(Number(curVal)) : String(curVal);
        head.appendChild(valSpan);

        const inp = document.createElement("input");
        inp.type = "range";
        inp.min = String(p.min);
        inp.max = String(p.max);
        inp.step = String(p.step);
        inp.value = String(curVal);
        inp.addEventListener("input", () => {
          const num = Number(inp.value);
          state.mathParams[p.key] = num;
          valSpan.textContent = p.fmt ? p.fmt(num) : String(num);
          applyMathPattern(state.activeMathPattern, { record: true, coalesceKey: `math-${p.key}` });
        });
        wrap.appendChild(head);
        wrap.appendChild(inp);
      }
      mathPropsBody.appendChild(wrap);
    });

    // Universal Position, Scale & Rotation controls (apply to EVERY generated pattern!)
    const div = document.createElement("div");
    div.className = "math-props-divider";
    div.textContent = "Position & Transform";
    mathPropsBody.appendChild(div);

    const tGrid = document.createElement("div");
    tGrid.className = "math-transform-grid";
    const tSpecs = [
      { key: "offsetX", label: "Move X", min: -0.75, max: 0.75, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: "offsetY", label: "Move Y", min: -0.75, max: 0.75, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: "scale", label: "Scale", min: 0.4, max: 2.5, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
      { key: "rotate", label: "Rotate", min: -180, max: 180, step: 5, fmt: (v) => `${Math.round(v)}°` },
    ];
    tSpecs.forEach((tp) => {
      const cell = document.createElement("div");
      cell.className = "math-prop-control";
      const head = document.createElement("div");
      head.className = "math-prop-head";
      const lbl = document.createElement("label");
      lbl.textContent = tp.label;
      const valSpan = document.createElement("span");
      valSpan.className = "control-value";
      const cur = Number(state.mathTransform[tp.key]) || (tp.key === "scale" ? 1 : 0);
      valSpan.textContent = tp.fmt(cur);
      head.appendChild(lbl);
      head.appendChild(valSpan);

      const inp = document.createElement("input");
      inp.type = "range";
      inp.min = String(tp.min);
      inp.max = String(tp.max);
      inp.step = String(tp.step);
      inp.value = String(cur);
      inp.addEventListener("input", () => {
        const num = Number(inp.value);
        state.mathTransform[tp.key] = num;
        valSpan.textContent = tp.fmt(num);
        applyMathPattern(state.activeMathPattern, { record: true, coalesceKey: `math-t-${tp.key}` });
      });
      cell.appendChild(head);
      cell.appendChild(inp);
      tGrid.appendChild(cell);
    });
    mathPropsBody.appendChild(tGrid);
  }

  function openMathPropsPopover() {
    if (!mathPropsPopover || !state.activeMathPattern) return;
    if (!mathPropsPopover.hidden) {
      closeMathPropsPopover();
      return;
    }
    closeHistoryPopover();
    closeSwatchPopover();
    renderMathPropsControls();
    mathPropsPopover.hidden = false;
    syncMathPropsButton();

    const anchor = mathPropsBtn || mathMenuBtn;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const popRect = mathPropsPopover.getBoundingClientRect();
      const margin = 12;
      let left = rect.left;
      if (left + popRect.width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - popRect.width - margin);
      }
      let top = rect.bottom + 8;
      if (top + popRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - popRect.height - 8);
      }
      mathPropsPopover.style.left = `${Math.round(left)}px`;
      mathPropsPopover.style.top = `${Math.round(top)}px`;
    }
  }

  if (mathPropsBtn) {
    mathPropsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.activeMap && !state.activeMathPattern) {
        if (mapPopover && !mapPopover.hidden) closeMapPopover();
        else openMapPopover(state.activeMap.style);
        syncMathPropsButton();
        return;
      }
      openMathPropsPopover();
    });
  }
  if (mathPropsClose) {
    mathPropsClose.addEventListener("click", closeMathPropsPopover);
  }
  if (mathReversePalette) {
    mathReversePalette.addEventListener("change", () => {
      state.mathReversePalette = mathReversePalette.checked;
      if (state.activeMathPattern) {
        applyMathPattern(state.activeMathPattern, { record: true, coalesceKey: "math-rev" });
      }
    });
  }
  if (mathPropsReset) {
    mathPropsReset.addEventListener("click", () => {
      if (!state.activeMathPattern) return;
      state.mathParams = getDefaultMathParams(state.activeMathPattern);
      state.mathTransform = { offsetX: 0, offsetY: 0, scale: 1.0, rotate: 0 };
      state.mathReversePalette = false;
      renderMathPropsControls();
      applyMathPattern(state.activeMathPattern, { record: true });
    });
  }
  document.addEventListener("click", (e) => {
    if (!mathPropsPopover || mathPropsPopover.hidden) return;
    if (mathPropsPopover.contains(e.target)) return;
    if (e.target === mathPropsBtn || (e.target.closest && e.target.closest("#math-props-btn"))) return;
    closeMathPropsPopover();
  });

  function applyMathPattern(patternId, { record = true, coalesceKey = null } = {}) {
    const spec = MATH_PATTERN_SPECS[patternId];
    if (!patternId || !spec || !state.image || state.palette.length === 0) return;

    const K = state.palette.length;
    const lumOrder = state.palette
      .map((c, idx) => ({ idx, lum: luminance(c.r, c.g, c.b) }))
      .sort((a, b) => a.lum - b.lum)
      .map((o) => o.idx);
    if (state.mathReversePalette) lumOrder.reverse();

    const pickGrad = (t) => {
      const clamped = Math.max(0, Math.min(0.999999, t));
      return lumOrder[Math.floor(clamped * K)];
    };
    const pickCycle = (n) => lumOrder[((Math.floor(n) % K) + K) % K];

    state.activeMathPattern = patternId;
    state.activeMap = null;
    state.sourcePalette = null;
    state.isBlankQuilt = true;
    state.paintMask.fill(0);
    state.manualCells.clear();
    syncBlankQuiltUI();
    syncGridLayoutUI();
    syncMathPropsButton();

    const cols = state.cols;
    const rows = state.rows;
    const cfg = getLayoutConfig();
    const isSquareGrid = cfg.stagger === "none";
    if (!state.layoutCells || state.layoutCells.length === 0) {
      state.layoutCells = buildLayoutCells(cols, rows, cfg.id);
    }
    const cells = state.layoutCells;

    // Precompute Wolfram elementary cellular automaton rows with 2x overscan for seamless Hand panning
    let caGrid = null;
    let caCols = 0;
    let caRows = 0;
    if (patternId === "cellular-rule90") {
      const ruleNum = Math.max(0, Math.min(255, Number(getMathParam(patternId, "rule")) || 90));
      caCols = Math.max(32, cols * 2);
      caRows = Math.max(32, rows * 2);
      caGrid = Array.from({ length: caRows }, () => new Uint8Array(caCols));
      caGrid[0][Math.floor(caCols / 2)] = 1;
      if (ruleNum === 184) {
        for (let c = 0; c < caCols; c++) caGrid[0][c] = (c * 7 + 3) % 3 === 0 ? 1 : 0;
      }
      for (let r = 1; r < caRows; r++) {
        for (let c = 0; c < caCols; c++) {
          const left = caGrid[r - 1][(c - 1 + caCols) % caCols];
          const mid = caGrid[r - 1][c];
          const right = caGrid[r - 1][(c + 1) % caCols];
          const bits = (left << 2) | (mid << 1) | right;
          caGrid[r][c] = (ruleNum >> bits) & 1;
        }
      }
    }

    // Precompute Turing Reaction-Diffusion grid if needed
    let turingData = null;
    let turingW = 0;
    let turingH = 0;
    if (patternId === "turing") {
      turingW = Math.max(20, Math.min(52, cols));
      turingH = Math.max(20, Math.min(52, rows));
      const preset = String(getMathParam(patternId, "preset") || "coral");
      const steps = Math.round(Number(getMathParam(patternId, "steps")) || 220);
      const seed = Math.round(Number(getMathParam(patternId, "seed")) || 3);
      turingData = computeTuringGrid(turingW, turingH, preset, steps, seed);
    }

    // Precompute Cellular Buoyancy + Heat-Diffusion Fire Simulation on a 2x overscanned buffer
    // covering nx, ny in [-0.5 .. 1.5] so Hand repositioning has generous spare room around all edges!
    let fireData = null;
    let fireW = 0;
    let fireH = 0;
    if (patternId === "fire") {
      fireW = Math.max(48, Math.min(96, cols * 2));
      fireH = Math.max(48, Math.min(96, rows * 2));
      const fireStyle = String(getMathParam(patternId, "style") || "campfire");
      const intensity = clampNumber(Number(getMathParam(patternId, "intensity")), 0.35, 1.0, 0.78);
      const turbulence = clampNumber(Number(getMathParam(patternId, "turbulence")), 0.2, 1.5, 0.85);
      const wind = clampNumber(Number(getMathParam(patternId, "wind")), -1.0, 1.0, 0.0);
      const fireSeed = Math.round(Number(getMathParam(patternId, "seed")) || 7);

      let rng = (fireSeed * 1664525 + 1013904223) >>> 0;
      const nextRand = () => {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        return rng / 4294967296;
      };

      let grid = new Float32Array(fireW * fireH);
      let next = new Float32Array(fireW * fireH);
      const simSteps = Math.max(56, Math.round(fireH * 1.4));
      const baseCool = (1.16 - intensity) * 0.072;
      const hearthRow = Math.round(fireH * 0.76); // Aligns bottom of quilt (ny=1.0) with the glowing hearth

      for (let step = 0; step < simSteps; step++) {
        // 1. Energize hearth fuel bed + deep glowing coal bed below for downward panning
        for (let x = 0; x < fireW; x++) {
          const u = ((x + 0.5) / fireW) * 2 - 0.5; // -0.5..1.5 (visible quilt is 0..1)
          const dxCenter = (u - 0.5) * 2;
          let fuel = 0;
          if (fireStyle === "wildfire") {
            fuel = 0.8 + nextRand() * 0.22;
          } else if (fireStyle === "phoenix") {
            const core = Math.exp(-dxCenter * dxCenter * 3.8);
            fuel = core * (0.85 + nextRand() * 0.24) + (nextRand() < 0.08 ? 0.42 : 0);
          } else {
            const dome = Math.max(0, 1 - dxCenter * dxCenter * 0.85);
            fuel = Math.pow(dome, 0.65) * (0.82 + nextRand() * 0.24);
          }
          for (let r = hearthRow; r < fireH; r++) {
            const depthFade = 1 - ((r - hearthRow) / Math.max(1, fireH - hearthRow)) * 0.35;
            grid[r * fireW + x] = Math.min(1, fuel * depthFade);
          }
        }

        // 2. Buoyancy advection + turbulent flicker + radiative cooling upward from hearthRow
        for (let y = 0; y < hearthRow; y++) {
          const yNorm = 1 - y / Math.max(1, hearthRow);
          const rowBelow = Math.min(fireH - 1, y + 1);
          const rowBelow2 = Math.min(fireH - 1, y + 2);
          for (let x = 0; x < fireW; x++) {
            const swirl =
              Math.sin((y * 0.28 + step * 0.25 + fireSeed) * 1.12) *
              Math.cos((x * 0.24 - step * 0.17) * 1.05);
            const drift = wind * 0.9 + swirl * turbulence * 0.85 + (nextRand() - 0.5) * turbulence * 0.7;
            const sx = Math.max(0, Math.min(fireW - 1, Math.round(x - drift)));
            const sxL = Math.max(0, sx - 1);
            const sxR = Math.min(fireW - 1, sx + 1);

            const avgHeat =
              grid[rowBelow * fireW + sx] * 0.42 +
              grid[rowBelow * fireW + sxL] * 0.19 +
              grid[rowBelow * fireW + sxR] * 0.19 +
              grid[rowBelow2 * fireW + sx] * 0.2;

            const u = ((x + 0.5) / fireW) * 2 - 0.5;
            const edgeCool =
              fireStyle === "wildfire"
                ? 0
                : Math.pow(Math.abs((u - 0.5) * 2), 2) * (fireStyle === "phoenix" ? 0.055 : 0.03);
            const flickerCool = baseCool * (0.45 + nextRand() * 1.15) * (0.68 + yNorm * 0.6) + edgeCool;
            let val = Math.max(0, avgHeat - flickerCool);
            if (val > 0.05 && val < 0.35 && nextRand() < 0.015 * turbulence) {
              val = Math.min(1, val + 0.28);
            }
            next[y * fireW + x] = val;
          }
        }
        for (let r = hearthRow; r < fireH; r++) {
          for (let x = 0; x < fireW; x++) {
            next[r * fireW + x] = grid[r * fireW + x];
          }
        }
        const tmp = grid;
        grid = next;
        next = tmp;
      }
      fireData = grid;
    }

    // Precompute Golden-Ratio Voronoi seeds if needed
    let voronoiSeeds = null;
    if (patternId === "voronoi") {
      const seedCount = Math.max(6, Math.min(48, Math.round(Number(getMathParam(patternId, "sites")) || 20)));
      const seedShift = (Number(getMathParam(patternId, "seed")) || 1) * 0.137;
      const phi = 0.61803398875;
      voronoiSeeds = [];
      for (let i = 0; i < seedCount; i++) {
        const sx = ((i * phi + seedShift) % 1 + 1) % 1;
        const sy = ((i + 0.5) / seedCount + seedShift * 0.37) % 1;
        voronoiSeeds.push({ x: sx, y: sy, pal: lumOrder[i % K] });
      }
    }

    let hilbertN = 1;
    while (hilbertN < Math.max(cols, rows)) hilbertN <<= 1;

    // Smooth 2D value-noise helper for Topographic Contour Map
    const hash2 = (ix, iy, seedVal) => {
      let h = (ix * 374761393 + iy * 668265263 + seedVal * 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const smoothNoise2D = (px, py, seedVal) => {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      const a = hash2(ix, iy, seedVal);
      const b = hash2(ix + 1, iy, seedVal);
      const c = hash2(ix, iy + 1, seedVal);
      const d = hash2(ix + 1, iy + 1, seedVal);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };

    // Hand-crafted low-res quilt-block pixel fonts (5x7 Quilt Block & 3x5 Cross-Stitch Sampler)
    const PIXEL_FONT_5X7 = {
      A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
      B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
      C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
      D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
      E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
      F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
      G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
      H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
      I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
      J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
      K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
      L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
      M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
      N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
      O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
      P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
      Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
      R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
      S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
      T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
      U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
      V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
      W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
      X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
      Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
      Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
      0: ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
      1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
      2: ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
      3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
      4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
      5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
      6: ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
      7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
      8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
      9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
      "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
      "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
      "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
      "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
      ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
      "♥": ["01010", "11111", "11111", "11111", "01110", "00100", "00000"],
      " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    };

    const PIXEL_FONT_3X5 = {
      A: ["010", "101", "111", "101", "101"],
      B: ["110", "101", "110", "101", "110"],
      C: ["011", "100", "100", "100", "011"],
      D: ["110", "101", "101", "101", "110"],
      E: ["111", "100", "110", "100", "111"],
      F: ["111", "100", "110", "100", "100"],
      G: ["011", "100", "101", "101", "011"],
      H: ["101", "101", "111", "101", "101"],
      I: ["111", "010", "010", "010", "111"],
      J: ["001", "001", "001", "101", "010"],
      K: ["101", "101", "110", "101", "101"],
      L: ["100", "100", "100", "100", "111"],
      M: ["101", "111", "111", "101", "101"],
      N: ["111", "101", "101", "101", "101"],
      O: ["010", "101", "101", "101", "010"],
      P: ["110", "101", "110", "100", "100"],
      Q: ["010", "101", "101", "111", "011"],
      R: ["110", "101", "110", "101", "101"],
      S: ["011", "100", "010", "001", "110"],
      T: ["111", "010", "010", "010", "010"],
      U: ["101", "101", "101", "101", "111"],
      V: ["101", "101", "101", "101", "010"],
      W: ["101", "101", "111", "111", "101"],
      X: ["101", "101", "010", "101", "101"],
      Y: ["101", "101", "010", "010", "010"],
      Z: ["111", "001", "010", "100", "111"],
      0: ["111", "101", "101", "101", "111"],
      1: ["010", "110", "010", "010", "111"],
      2: ["110", "001", "010", "100", "111"],
      3: ["110", "001", "010", "001", "110"],
      4: ["101", "101", "111", "001", "001"],
      5: ["111", "100", "110", "001", "110"],
      6: ["011", "100", "111", "101", "111"],
      7: ["111", "001", "010", "010", "010"],
      8: ["111", "101", "111", "101", "111"],
      9: ["111", "101", "111", "001", "110"],
      "&": ["010", "101", "010", "101", "011"],
      "!": ["010", "010", "010", "000", "010"],
      "-": ["000", "000", "111", "000", "000"],
      ".": ["000", "000", "000", "000", "010"],
      " ": ["000", "000", "000", "000", "000"],
    };

    // 7x7 8-Bit Arcade Heavy (Press Start 2P / retro coin-op double-thick stems)
    const PIXEL_FONT_ARCADE_7X7 = {
      A: ["0011100", "0110110", "1100011", "1111111", "1100011", "1100011", "1100011"],
      B: ["1111110", "1100011", "1100011", "1111110", "1100011", "1100011", "1111110"],
      C: ["0111110", "1100011", "1100000", "1100000", "1100000", "1100011", "0111110"],
      D: ["1111100", "1100110", "1100011", "1100011", "1100011", "1100110", "1111100"],
      E: ["1111111", "1100000", "1100000", "1111110", "1100000", "1100000", "1111111"],
      F: ["1111111", "1100000", "1100000", "1111110", "1100000", "1100000", "1100000"],
      G: ["0111110", "1100011", "1100000", "1101111", "1100011", "1100011", "0111110"],
      H: ["1100011", "1100011", "1100011", "1111111", "1100011", "1100011", "1100011"],
      I: ["0111110", "0011100", "0011100", "0011100", "0011100", "0011100", "0111110"],
      J: ["0011111", "0000110", "0000110", "0000110", "1100110", "1100110", "0111100"],
      K: ["1100011", "1100110", "1101100", "1111000", "1101100", "1100110", "1100011"],
      L: ["1100000", "1100000", "1100000", "1100000", "1100000", "1100000", "1111111"],
      M: ["1100011", "1110111", "1111111", "1101011", "1100011", "1100011", "1100011"],
      N: ["1100011", "1110011", "1111011", "1101111", "1100111", "1100011", "1100011"],
      O: ["0111110", "1100011", "1100011", "1100011", "1100011", "1100011", "0111110"],
      P: ["1111110", "1100011", "1100011", "1111110", "1100000", "1100000", "1100000"],
      Q: ["0111110", "1100011", "1100011", "1100011", "1101011", "1100110", "0111101"],
      R: ["1111110", "1100011", "1100011", "1111110", "1101100", "1100110", "1100011"],
      S: ["0111110", "1100011", "1100000", "0111110", "0000011", "1100011", "0111110"],
      T: ["1111111", "0011100", "0011100", "0011100", "0011100", "0011100", "0011100"],
      U: ["1100011", "1100011", "1100011", "1100011", "1100011", "1100011", "0111110"],
      V: ["1100011", "1100011", "1100011", "1100011", "0110110", "0011100", "0001000"],
      W: ["1100011", "1100011", "1100011", "1101011", "1111111", "1110111", "1100011"],
      X: ["1100011", "0110110", "0011100", "0011100", "0110110", "1100011", "1100011"],
      Y: ["1100011", "0110110", "0011100", "0011100", "0011100", "0011100", "0011100"],
      Z: ["1111111", "0000110", "0001100", "0011000", "0110000", "1100000", "1111111"],
      0: ["0111110", "1100111", "1101011", "1110011", "1100011", "1100011", "0111110"],
      1: ["0011100", "0111100", "0011100", "0011100", "0011100", "0011100", "0111110"],
      2: ["0111110", "1100011", "0000110", "0011100", "0110000", "1100000", "1111111"],
      3: ["0111110", "1100011", "0000011", "0011110", "0000011", "1100011", "0111110"],
      4: ["0001110", "0011110", "0110110", "1100110", "1111111", "0000110", "0000110"],
      5: ["1111111", "1100000", "1111110", "0000011", "0000011", "1100011", "0111110"],
      6: ["0111110", "1100000", "1111110", "1100011", "1100011", "1100011", "0111110"],
      7: ["1111111", "0000011", "0000110", "0001100", "0011000", "0011000", "0011000"],
      8: ["0111110", "1100011", "1100011", "0111110", "1100011", "1100011", "0111110"],
      9: ["0111110", "1100011", "1100011", "0111111", "0000011", "0000110", "0111100"],
      "&": ["0111000", "1101100", "0111000", "1110110", "1100110", "1101100", "0111011"],
      "!": ["0011100", "0011100", "0011100", "0011100", "0000000", "0011100", "0011100"],
      "-": ["0000000", "0000000", "0000000", "1111111", "0000000", "0000000", "0000000"],
      ".": ["0000000", "0000000", "0000000", "0000000", "0000000", "0011000", "0011000"],
      "♥": ["0110110", "1111111", "1111111", "1111111", "0111110", "0011100", "0001000"],
      " ": ["0000000", "0000000", "0000000", "0000000", "0000000", "0000000", "0000000"],
    };

    // 6x7 Heirloom Pixel Serif (needlepoint slab feet & refined terminals)
    const PIXEL_FONT_SERIF_6X7 = {
      A: ["001100", "010010", "010010", "011110", "010010", "010010", "111011"],
      B: ["111110", "010001", "010001", "011110", "010001", "010001", "111110"],
      C: ["011111", "100001", "100000", "100000", "100000", "100001", "011110"],
      D: ["111100", "010010", "010001", "010001", "010001", "010010", "111100"],
      E: ["111111", "010001", "010000", "011110", "010000", "010001", "111111"],
      F: ["111111", "010001", "010000", "011110", "010000", "010000", "111000"],
      G: ["011111", "100001", "100000", "100111", "100010", "100010", "011110"],
      H: ["111011", "010010", "010010", "011110", "010010", "010010", "111011"],
      I: ["011110", "001100", "001100", "001100", "001100", "001100", "011110"],
      J: ["001111", "000100", "000100", "000100", "100100", "100100", "011000"],
      K: ["111011", "010010", "010100", "011000", "010100", "010010", "111011"],
      L: ["111000", "010000", "010000", "010000", "010000", "010001", "111111"],
      M: ["110011", "011110", "010110", "010010", "010010", "010010", "111011"],
      N: ["110011", "011010", "010110", "010010", "010010", "010010", "111010"],
      O: ["011110", "100001", "100001", "100001", "100001", "100001", "011110"],
      P: ["111110", "010001", "010001", "011110", "010000", "010000", "111000"],
      Q: ["011110", "100001", "100001", "100001", "100101", "100010", "011101"],
      R: ["111110", "010001", "010001", "011110", "010100", "010010", "111011"],
      S: ["011111", "100001", "100000", "011110", "000001", "100001", "111110"],
      T: ["111111", "101101", "001100", "001100", "001100", "001100", "011110"],
      U: ["111011", "010010", "010010", "010010", "010010", "010010", "001100"],
      V: ["111011", "010010", "010010", "010010", "010010", "001100", "001100"],
      W: ["111011", "010010", "010010", "010110", "010110", "011110", "010010"],
      X: ["111011", "010010", "001100", "001100", "001100", "010010", "111011"],
      Y: ["111011", "010010", "010010", "001100", "001100", "001100", "011110"],
      Z: ["111111", "100010", "000100", "001000", "010000", "100001", "111111"],
      0: ["011110", "100011", "100101", "101001", "110001", "100001", "011110"],
      1: ["001100", "011100", "001100", "001100", "001100", "001100", "011110"],
      2: ["011110", "100001", "000010", "001100", "010000", "100001", "111111"],
      3: ["011110", "100001", "000001", "001110", "000001", "100001", "011110"],
      4: ["000110", "001010", "010010", "100010", "111111", "000010", "000111"],
      5: ["111111", "100000", "111110", "000001", "000001", "100001", "011110"],
      6: ["011110", "100000", "111110", "100001", "100001", "100001", "011110"],
      7: ["111111", "100001", "000010", "000100", "001000", "001000", "011100"],
      8: ["011110", "100001", "100001", "011110", "100001", "100001", "011110"],
      9: ["011110", "100001", "100001", "011111", "000001", "000010", "011100"],
      "&": ["011100", "100100", "011000", "101010", "100100", "100110", "011001"],
      "!": ["001100", "001100", "001100", "001100", "000000", "001100", "001100"],
      "-": ["000000", "000000", "000000", "111111", "000000", "000000", "000000"],
      ".": ["000000", "000000", "000000", "000000", "000000", "001100", "001100"],
      " ": ["000000", "000000", "000000", "000000", "000000", "000000", "000000"],
    };

    // 6x7 Quilt Stencil (crisp 1-square negative-space stencil bridges!)
    const PIXEL_FONT_STENCIL_6X7 = {
      A: ["011010", "110011", "110011", "110111", "110011", "110011", "110011"],
      B: ["110110", "110011", "110011", "110110", "110011", "110011", "110110"],
      C: ["011111", "110000", "110000", "000000", "110000", "110000", "011111"],
      D: ["110110", "110011", "110011", "110011", "110011", "110011", "110110"],
      E: ["110111", "110000", "110000", "110110", "110000", "110000", "110111"],
      F: ["110111", "110000", "110000", "110110", "110000", "110000", "110000"],
      G: ["011111", "110000", "110000", "110011", "110011", "110011", "011111"],
      H: ["110011", "110011", "110011", "001100", "110011", "110011", "110011"],
      I: ["110011", "001100", "001100", "001100", "001100", "001100", "110011"],
      J: ["000111", "000011", "000011", "000011", "110011", "110011", "011110"],
      K: ["110011", "110110", "110100", "110100", "110110", "110011", "110011"],
      L: ["110000", "110000", "110000", "110000", "110000", "110000", "110111"],
      M: ["110011", "110011", "111111", "110011", "110011", "110011", "110011"],
      N: ["110011", "111011", "111011", "110111", "110111", "110011", "110011"],
      O: ["011010", "110011", "110011", "110011", "110011", "110011", "011010"],
      P: ["110110", "110011", "110011", "110110", "110000", "110000", "110000"],
      Q: ["011010", "110011", "110011", "110011", "110111", "110011", "011001"],
      R: ["110110", "110011", "110011", "110110", "110110", "110011", "110011"],
      S: ["011111", "110000", "110000", "011010", "000011", "000011", "111110"],
      T: ["110011", "001100", "001100", "001100", "001100", "001100", "001100"],
      U: ["110011", "110011", "110011", "110011", "110011", "110011", "011010"],
      V: ["110011", "110011", "110011", "110011", "011010", "001100", "001100"],
      W: ["110011", "110011", "110011", "110011", "111111", "110011", "110011"],
      X: ["110011", "110011", "011010", "001100", "011010", "110011", "110011"],
      Y: ["110011", "110011", "011010", "001100", "001100", "001100", "001100"],
      Z: ["111111", "000011", "000110", "001100", "011000", "110000", "111111"],
      0: ["011010", "110011", "110011", "110011", "110011", "110011", "011010"],
      1: ["001100", "011100", "001100", "001100", "001100", "001100", "110011"],
      2: ["111110", "000011", "000011", "011110", "110000", "110000", "110111"],
      3: ["111110", "000011", "000011", "011110", "000011", "000011", "111110"],
      4: ["110011", "110011", "110011", "110111", "000011", "000011", "000011"],
      5: ["110111", "110000", "110000", "110110", "000011", "000011", "111110"],
      6: ["011111", "110000", "110000", "110110", "110011", "110011", "011010"],
      7: ["110111", "000011", "000011", "000110", "001100", "001100", "001100"],
      8: ["011010", "110011", "110011", "011010", "110011", "110011", "011010"],
      9: ["011010", "110011", "110011", "011111", "000011", "000011", "111110"],
      "&": ["011000", "110110", "011000", "110011", "110011", "110110", "011011"],
      "!": ["001100", "001100", "001100", "001100", "000000", "001100", "001100"],
      "-": ["000000", "000000", "000000", "110111", "000000", "000000", "000000"],
      ".": ["000000", "000000", "000000", "000000", "000000", "001100", "001100"],
      " ": ["000000", "000000", "000000", "000000", "000000", "000000", "000000"],
    };

    // 4x7 Tall Narrow Poster (VCR OSD / condensed barn-quilt poster lettering)
    const PIXEL_FONT_TALL_4X7 = {
      A: ["0110", "1001", "1001", "1111", "1001", "1001", "1001"],
      B: ["1110", "1001", "1001", "1110", "1001", "1001", "1110"],
      C: ["0111", "1000", "1000", "1000", "1000", "1000", "0111"],
      D: ["1110", "1001", "1001", "1001", "1001", "1001", "1110"],
      E: ["1111", "1000", "1000", "1110", "1000", "1000", "1111"],
      F: ["1111", "1000", "1000", "1110", "1000", "1000", "1000"],
      G: ["0111", "1000", "1000", "1011", "1001", "1001", "0111"],
      H: ["1001", "1001", "1001", "1111", "1001", "1001", "1001"],
      I: ["1110", "0100", "0100", "0100", "0100", "0100", "1110"],
      J: ["0011", "0001", "0001", "0001", "1001", "1001", "0110"],
      K: ["1001", "1001", "1010", "1100", "1010", "1001", "1001"],
      L: ["1000", "1000", "1000", "1000", "1000", "1000", "1111"],
      M: ["1001", "1111", "1111", "1001", "1001", "1001", "1001"],
      N: ["1001", "1101", "1101", "1011", "1011", "1001", "1001"],
      O: ["0110", "1001", "1001", "1001", "1001", "1001", "0110"],
      P: ["1110", "1001", "1001", "1110", "1000", "1000", "1000"],
      Q: ["0110", "1001", "1001", "1001", "1011", "1001", "0111"],
      R: ["1110", "1001", "1001", "1110", "1010", "1001", "1001"],
      S: ["0111", "1000", "1000", "0110", "0001", "0001", "1110"],
      T: ["1111", "0110", "0110", "0110", "0110", "0110", "0110"],
      U: ["1001", "1001", "1001", "1001", "1001", "1001", "0110"],
      V: ["1001", "1001", "1001", "1001", "1001", "0110", "0110"],
      W: ["1001", "1001", "1001", "1001", "1111", "1111", "1001"],
      X: ["1001", "1001", "0110", "0110", "0110", "1001", "1001"],
      Y: ["1001", "1001", "1001", "0110", "0110", "0110", "0110"],
      Z: ["1111", "0001", "0010", "0100", "1000", "1000", "1111"],
      0: ["0110", "1001", "1011", "1011", "1101", "1001", "0110"],
      1: ["0100", "1100", "0100", "0100", "0100", "0100", "1110"],
      2: ["1110", "0001", "0001", "0110", "1000", "1000", "1111"],
      3: ["1110", "0001", "0001", "0110", "0001", "0001", "1110"],
      4: ["1001", "1001", "1001", "1111", "0001", "0001", "0001"],
      5: ["1111", "1000", "1000", "1110", "0001", "0001", "1110"],
      6: ["0111", "1000", "1000", "1110", "1001", "1001", "0110"],
      7: ["1111", "0001", "0001", "0010", "0100", "0100", "0100"],
      8: ["0110", "1001", "1001", "0110", "1001", "1001", "0110"],
      9: ["0110", "1001", "1001", "0111", "0001", "0001", "1110"],
      "&": ["0110", "1001", "0110", "1010", "1001", "1010", "0101"],
      "!": ["0100", "0100", "0100", "0100", "0100", "0000", "0100"],
      "-": ["0000", "0000", "0000", "1111", "0000", "0000", "0000"],
      ".": ["0000", "0000", "0000", "0000", "0000", "0100", "0100"],
      " ": ["0000", "0000", "0000", "0000", "0000", "0000", "0000"],
    };

    const BITMAP_FONT_CATALOG = {
      "quilt-pixel": { glyphs: PIXEL_FONT_5X7, w: 5, h: 7 },
      sampler: { glyphs: PIXEL_FONT_3X5, w: 3, h: 5 },
      "arcade-8": { glyphs: PIXEL_FONT_ARCADE_7X7, w: 7, h: 7 },
      "pixel-serif": { glyphs: PIXEL_FONT_SERIF_6X7, w: 6, h: 7 },
      "stencil-pixel": { glyphs: PIXEL_FONT_STENCIL_6X7, w: 6, h: 7 },
      "tall-poster": { glyphs: PIXEL_FONT_TALL_4X7, w: 4, h: 7 },
    };

    // Precompute 2x overscanned offscreen Text & Initials Monogram mask (covering nx, ny in [-0.5 .. 1.5])
    let monogramPixels = null;
    const monogramSize = 512;
    if (patternId === "monogram") {
      const rawText = String(getMathParam(patternId, "text") ?? "M").trim() || "M";
      const fontStyle = String(getMathParam(patternId, "font") || "quilt-pixel");
      const sizeScale = clampNumber(Number(getMathParam(patternId, "size")), 0.4, 1.4, 0.92);
      const outlineMult = clampNumber(Number(getMathParam(patternId, "outline")), 0, 3, 1.0);

      const mc = document.createElement("canvas");
      mc.width = monogramSize;
      mc.height = monogramSize;
      const mctx = mc.getContext("2d", { willReadFrequently: true });
      mctx.clearRect(0, 0, monogramSize, monogramSize);

      const lines = rawText.split("/").map((s) => s.trim()).filter(Boolean);
      const safeLines = lines.length > 0 ? lines.slice(0, 2) : ["M"];

      const bitmapSpec = BITMAP_FONT_CATALOG[fontStyle];
      if (bitmapSpec) {
        // Crisp hand-crafted pixel/quilt-block rendering — razor-sharp even on chunky low-res grids!
        const glyphSet = bitmapSpec.glyphs;
        const gW = bitmapSpec.w;
        const gH = bitmapSpec.h;
        const charGap = 1;
        const lineGapUnits = 2;
        const upperLines = safeLines.map((ln) => ln.toUpperCase());
        const maxChars = Math.max(1, ...upperLines.map((ln) => ln.length));
        const totalUnitsW = maxChars * gW + Math.max(0, maxChars - 1) * charGap;
        const totalUnitsH = upperLines.length * gH + Math.max(0, upperLines.length - 1) * lineGapUnits;

        const targetSpan = 216 * sizeScale;
        const unitPx = Math.min(targetSpan / totalUnitsW, targetSpan / totalUnitsH);
        const totalPxH = totalUnitsH * unitPx;
        const topY = monogramSize * 0.5 - totalPxH * 0.5;
        const padPx = outlineMult > 0 ? Math.max(2, unitPx * 0.65 * outlineMult) : 0;

        const drawGlyphBlocks = (fillColor, expand) => {
          mctx.fillStyle = fillColor;
          upperLines.forEach((ln, li) => {
            const lineUnitsW = ln.length * gW + Math.max(0, ln.length - 1) * charGap;
            const startX = monogramSize * 0.5 - (lineUnitsW * unitPx) * 0.5;
            const y0 = topY + li * (gH + lineGapUnits) * unitPx;
            for (let ci = 0; ci < ln.length; ci++) {
              const ch = ln[ci];
              const glyph = glyphSet[ch] || glyphSet[" "];
              const gx0 = startX + ci * (gW + charGap) * unitPx;
              for (let r = 0; r < gH; r++) {
                const rowStr = glyph[r];
                for (let c = 0; c < gW; c++) {
                  if (rowStr[c] === "1") {
                    mctx.fillRect(
                      gx0 + c * unitPx - expand,
                      y0 + r * unitPx - expand,
                      unitPx + expand * 2,
                      unitPx + expand * 2
                    );
                  }
                }
              }
            }
          });
        };

        if (padPx > 0) drawGlyphBlocks("rgb(255, 0, 0)", padPx);
        drawGlyphBlocks("rgb(0, 255, 0)", 0.5);
      } else {
        const fontMap = {
          varsity: '900 {px}px "Arial Black", Impact, "Plus Jakarta Sans", sans-serif',
          sans: '800 {px}px "Plus Jakarta Sans", -apple-system, sans-serif',
          serif: '400 {px}px "DM Serif Display", Georgia, serif',
          script: 'italic 400 {px}px "DM Serif Display", Georgia, serif',
        };
        const fontTpl = fontMap[fontStyle] || fontMap.varsity;
        const boxSpan = 216 * sizeScale;
        let fontPx = Math.round((safeLines.length > 1 ? 104 : 186) * sizeScale);
        mctx.font = fontTpl.replace("{px}", String(fontPx));
        let maxW = 1;
        safeLines.forEach((ln) => {
          maxW = Math.max(maxW, mctx.measureText(ln).width);
        });
        if (maxW > boxSpan) {
          fontPx = Math.max(24, Math.floor(fontPx * (boxSpan / maxW)));
          mctx.font = fontTpl.replace("{px}", String(fontPx));
        }
        mctx.textAlign = "center";
        mctx.textBaseline = "middle";
        const lineGap = fontPx * 1.04;
        const startY = monogramSize * 0.5 - ((safeLines.length - 1) * lineGap) * 0.5;

        // Red channel = outer halo/outline, Green channel = crisp filled letter body
        if (outlineMult > 0) {
          mctx.lineJoin = "round";
          mctx.lineCap = "round";
          mctx.strokeStyle = "rgb(255, 0, 0)";
          mctx.lineWidth = Math.max(8, fontPx * (fontStyle === "varsity" ? 0.18 : 0.14) * outlineMult);
          safeLines.forEach((ln, idx) => mctx.strokeText(ln, monogramSize * 0.5, startY + idx * lineGap));
        }
        mctx.fillStyle = "rgb(0, 255, 0)";
        safeLines.forEach((ln, idx) => mctx.fillText(ln, monogramSize * 0.5, startY + idx * lineGap));
        if (fontStyle === "varsity") {
          // Slight bold thickening so varsity stems stay crisp on low-res grids
          mctx.strokeStyle = "rgb(0, 255, 0)";
          mctx.lineWidth = Math.max(3, fontPx * 0.045);
          safeLines.forEach((ln, idx) => mctx.strokeText(ln, monogramSize * 0.5, startY + idx * lineGap));
        }
      }
      monogramPixels = mctx.getImageData(0, 0, monogramSize, monogramSize).data;
    }

    const tOffX = Number(state.mathTransform?.offsetX) || 0;
    const tOffY = Number(state.mathTransform?.offsetY) || 0;
    const tScale = Math.max(0.25, Number(state.mathTransform?.scale) || 1.0);
    const tRotRad = ((Number(state.mathTransform?.rotate) || 0) * Math.PI) / 180;
    const cosR = Math.cos(-tRotRad);
    const sinR = Math.sin(-tRotRad);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cx = (cell.x0 + cell.x1) * 0.5;
      const cy = (cell.y0 + cell.y1) * 0.5;
      const rawNx = cx / Math.max(1, cols);
      const rawNy = cy / Math.max(1, rows);
      // Apply universal pan, scale & rotation around quilt center
      const dtx = (rawNx - 0.5 - tOffX) / tScale;
      const dty = (rawNy - 0.5 - tOffY) / tScale;
      const nx = 0.5 + dtx * cosR - dty * sinR;
      const ny = 0.5 + dtx * sinR + dty * cosR;
      const key = `${cell.c},${cell.r}`;

      if (patternId === "monogram") {
        const backdrop = String(getMathParam(patternId, "backdrop") || "frame");
        const mx = Math.floor(((nx + 0.5) / 2) * monogramSize);
        const my = Math.floor(((ny + 0.5) / 2) * monogramSize);
        let isLetter = false;
        let isOutline = false;
        if (monogramPixels && mx >= 0 && mx < monogramSize && my >= 0 && my < monogramSize) {
          // 3x3 supersampled check keeps stems unbroken on chunky low-res grids & diagonal rotations
          const step = Math.max(1, Math.round(monogramSize / (Math.max(cols, rows) * 5)));
          let gSum = 0;
          let rSum = 0;
          let cnt = 0;
          for (let oy = -step; oy <= step; oy += step) {
            const sy = my + oy;
            if (sy < 0 || sy >= monogramSize) continue;
            for (let ox = -step; ox <= step; ox += step) {
              const sx = mx + ox;
              if (sx < 0 || sx >= monogramSize) continue;
              const pIdx = (sy * monogramSize + sx) * 4;
              rSum += monogramPixels[pIdx];
              gSum += monogramPixels[pIdx + 1];
              cnt++;
            }
          }
          if (cnt > 0) {
            isLetter = gSum / cnt > 95;
            isOutline = !isLetter && rSum / cnt > 85;
          }
        }
        if (isLetter) {
          state.manualCells.set(key, { t: 0, a: lumOrder[0], b: -1 });
        } else if (isOutline) {
          const outlineIdx = K >= 3 ? lumOrder[Math.min(K - 2, Math.max(1, Math.floor(K * 0.38)))] : lumOrder[0];
          state.manualCells.set(key, { t: 0, a: outlineIdx, b: -1 });
        } else if (backdrop === "ombre") {
          const d = Math.hypot(rawNx - 0.5, rawNy - 0.5) * 1.45;
          const norm = Math.max(0.28, Math.min(1, 1 - d * 0.65));
          state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
        } else if (backdrop === "stripes") {
          const bandIdx = Math.floor(rawNy * Math.max(6, Math.min(14, K * 2))) % Math.max(1, K - 1);
          state.manualCells.set(key, { t: 0, a: lumOrder[Math.min(K - 1, Math.max(1, K - 1 - (bandIdx % Math.max(1, K - 2))))], b: -1 });
        } else if (backdrop === "frame") {
          const edge = Math.min(rawNx, 1 - rawNx, rawNy, 1 - rawNy);
          if (edge < 0.075) {
            state.manualCells.set(key, { t: 0, a: lumOrder[Math.min(K - 1, Math.max(1, Math.floor(K * 0.28)))], b: -1 });
          } else if (edge < 0.115) {
            state.manualCells.set(key, { t: 0, a: lumOrder[Math.min(K - 1, Math.max(1, Math.floor(K * 0.65)))], b: -1 });
          } else {
            state.manualCells.set(key, { t: 0, a: lumOrder[K - 1], b: -1 });
          }
        } else {
          state.manualCells.set(key, { t: 0, a: lumOrder[K - 1], b: -1 });
        }
      } else if (patternId === "lone-star") {
        const pts = Math.max(4, Math.round(Number(getMathParam(patternId, "points")) || 8));
        const rings = Number(getMathParam(patternId, "rings")) || 2.0;
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const r = Math.hypot(dx, dy) * 2.0;
        const theta = Math.atan2(dy, dx);
        const sector = (Math.PI * 2) / pts;
        let localA = ((theta % sector) + sector) % sector;
        if (localA > sector * 0.5) localA = sector - localA;
        // Star diamond distance: points extend to r=1, valleys dip inward
        const starDist = r * (Math.cos(localA) + Math.sin(localA) * 1.45);
        if (starDist <= 1.02) {
          const band = (starDist * rings) % 1;
          state.manualCells.set(key, { t: 0, a: pickGrad(band), b: -1 });
        } else {
          state.manualCells.set(key, { t: 0, a: lumOrder[K - 1], b: -1 });
        }
      } else if (patternId === "tumbling-blocks") {
        // 3D isometric cube illusion (top, left-dark, right-mid faces)
        const density = Math.max(2, Number(getMathParam(patternId, "density")) || 5);
        const px = nx * density;
        const py = ny * density * 1.1547; // 2/sqrt(3) isometric ratio
        const u = px + py * 0.5;
        const v = py * 0.5 - px;
        const fu = ((u % 1) + 1) % 1;
        const fv = ((v % 1) + 1) % 1;
        const iu = Math.floor(u);
        const iv = Math.floor(v);
        const cubeBand = ((iu + iv) % Math.max(1, Math.floor(K / 3)) + Math.max(1, Math.floor(K / 3))) % Math.max(1, Math.floor(K / 3));
        let faceTone;
        if (fu + fv < 1) {
          faceTone = 0.88 - cubeBand * 0.1; // Top lit face
        } else if (fu > fv) {
          faceTone = 0.5 - cubeBand * 0.08; // Right midtone face
        } else {
          faceTone = 0.12 + cubeBand * 0.08; // Left shadow face
        }
        state.manualCells.set(key, { t: 0, a: pickGrad(Math.max(0, Math.min(1, faceTone))), b: -1 });
      } else if (patternId === "chevron") {
        const peaks = Math.max(1, Number(getMathParam(patternId, "peaks")) || 3);
        const bands = Number(getMathParam(patternId, "bands")) || 1.5;
        const zig = Math.abs((((nx * peaks * 2) % 2) + 2) % 2 - 1); // 0..1..0 triangle wave
        const val = ((ny * bands + zig * 0.38) % 1 + 1) % 1;
        state.manualCells.set(key, { t: 0, a: pickGrad(val), b: -1 });
      } else if (patternId === "tartan") {
        const density = Math.max(2, Number(getMathParam(patternId, "density")) || 4);
        const seed = Math.max(1, Math.round(Number(getMathParam(patternId, "seed")) || 3));
        const wx = Math.floor((((nx * density * 8) % 16) + 16) % 16);
        const wy = Math.floor((((ny * density * 8) % 16) + 16) % 16);
        const stripeVal = (idx) => {
          const m = (idx + seed) % 16;
          if (m < 5) return 0.1;
          if (m === 5 || m === 15) return 0.92;
          if (m < 10) return 0.48;
          if (m === 10 || m === 11) return 0.72;
          return 0.28;
        };
        const warp = stripeVal(wx);
        const weft = stripeVal(wy);
        // Classic 2x2 twill weave alternation
        const twill = (cell.c + cell.r) % 2 === 0 ? warp * 0.65 + weft * 0.35 : warp * 0.35 + weft * 0.65;
        state.manualCells.set(key, { t: 0, a: pickGrad(twill), b: -1 });
      } else if (patternId === "topo-map") {
        const terrain = Number(getMathParam(patternId, "terrain")) || 3.5;
        const contours = Number(getMathParam(patternId, "contours")) || 1.25;
        const seed = Math.round(Number(getMathParam(patternId, "seed")) || 7);
        const e1 = smoothNoise2D(nx * terrain, ny * terrain, seed);
        const e2 = smoothNoise2D(nx * terrain * 2.1, ny * terrain * 2.1, seed + 19) * 0.45;
        const e3 = smoothNoise2D(nx * terrain * 4.3, ny * terrain * 4.3, seed + 47) * 0.2;
        const elev = (e1 + e2 + e3) / 1.65;
        const band = (elev * contours) % 1;
        state.manualCells.set(key, { t: 0, a: pickGrad(band), b: -1 });
      } else if (patternId === "sunburst") {
        const rays = Math.max(6, Math.round(Number(getMathParam(patternId, "rays")) || 14));
        const rings = Math.max(0, Math.round(Number(getMathParam(patternId, "rings")) || 2));
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        const rayIdx = Math.floor(((theta / (Math.PI * 2) + 1) * rays)) % rays;
        const ringIdx = rings > 0 ? Math.floor(r * (rings + 1) * 1.4) : 0;
        const idx = rayIdx + ringIdx * 2;
        state.manualCells.set(key, { t: 0, a: pickCycle(idx), b: -1 });
      } else if (patternId === "orchid-macro") {
        // Bilaterally symmetric Phalaenopsis/Cattleya orchid macro close-up
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        const veinAmt = Number(getMathParam(patternId, "veins"));
        const speckAmt = Number(getMathParam(patternId, "speckles"));
        const x = ((nx - 0.5) * 2.1) / zoom; // -1..1
        const y = ((ny - 0.52) * 2.1) / zoom; // slightly lowered center for dorsal sepal
        const ax = Math.abs(x);

        // Helper for rotated elliptical petal distance (<= 1 inside petal)
        const ellipseDist = (px, py, cx0, cy0, rx, ry, rot) => {
          const dx0 = px - cx0;
          const dy0 = py - cy0;
          const cr = Math.cos(rot);
          const sr = Math.sin(rot);
          const u = (dx0 * cr + dy0 * sr) / rx;
          const v = (-dx0 * sr + dy0 * cr) / ry;
          return Math.hypot(u, v);
        };

        // 1. Dorsal sepal (top center) & 2 lower lateral sepals
        const dDorsal = ellipseDist(ax, y, 0, -0.44, 0.34, 0.52, 0);
        const dLowerSepal = ellipseDist(ax, y, 0.3, 0.46, 0.28, 0.46, -0.48);
        // 2. Two broad sweeping lateral wing petals
        const dWing = ellipseDist(ax, y, 0.48, -0.06, 0.56, 0.42, 0.22);
        // 3. Sculpted central lip (labellum) + golden throat column
        const dLip = ellipseDist(ax, y, 0, 0.22, 0.22, 0.32, 0);
        const dColumn = Math.hypot(ax / 0.14, (y - 0.04) / 0.14);

        const rCenter = Math.hypot(x, y);
        const ang = Math.atan2(y, x);
        const veins = Math.sin(ang * 18) * 0.5 + 0.5;
        const speck = cellHash(cell.r, cell.c, 91);

        let tone = 0.06; // Deep background foliage shadow
        if (dColumn < 1.0) {
          // Bright luminous orchid heart/column
          tone = 0.96 - dColumn * 0.16;
        } else if (dLip < 1.0) {
          // Sculpted contrasting lip with speckled throat
          const throat = 1.0 - dLip;
          tone = 0.22 + throat * 0.36;
          if (speck < (Number.isFinite(speckAmt) ? speckAmt : 0.6) * 0.35 && dLip < 0.78) {
            tone = 0.05;
          }
        } else if (dWing < 1.0) {
          // Broad lateral wing petals with radial gradient + subtle venation
          const base = 0.88 - dWing * 0.36;
          const vDrop = (Number.isFinite(veinAmt) ? veinAmt : 0.5) * 0.18 * veins * (1 - dWing * 0.4);
          tone = Math.max(0.28, Math.min(0.95, base - vDrop));
        } else if (dDorsal < 1.0 || dLowerSepal < 1.0) {
          const dS = Math.min(dDorsal, dLowerSepal);
          const base = 0.76 - dS * 0.34;
          const vDrop = (Number.isFinite(veinAmt) ? veinAmt : 0.5) * 0.14 * veins;
          tone = Math.max(0.2, Math.min(0.88, base - vDrop));
        } else {
          // Soft dark botanical vignette around the macro bloom
          tone = Math.max(0.02, 0.16 - rCenter * 0.08);
        }
        state.manualCells.set(key, { t: 0, a: pickGrad(tone), b: -1 });
      } else if (patternId === "dahlia-macro") {
        // Concentric layered dahlia / chrysanthemum petals radiating from golden heart
        const petals = Math.max(8, Math.round(Number(getMathParam(patternId, "petals")) || 14));
        const layers = Math.max(3, Math.round(Number(getMathParam(patternId, "layers")) || 5));
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        const dx = ((nx - 0.5) * 2.0) / zoom;
        const dy = ((ny - 0.5) * 2.0) / zoom;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        if (r < 0.16) {
          // Warm central florets
          const heart = 0.92 - (r / 0.16) * 0.25 + Math.sin(theta * 12) * 0.06;
          state.manualCells.set(key, { t: 0, a: pickGrad(heart), b: -1 });
        } else {
          const ringF = r * layers;
          const ringIdx = Math.floor(ringF);
          const ringFrac = ringF - ringIdx;
          // Stagger alternate petal rings by half a petal width
          const phase = theta * petals + (ringIdx % 2) * Math.PI;
          const petalWave = Math.pow(Math.cos(phase) * 0.5 + 0.5, 0.75);
          // Pointed petal silhouette shading + depth darkening toward outer edge
          const shading = petalWave * 0.52 + (1 - ringFrac) * 0.26 + Math.max(0, 1 - r * 0.65) * 0.22;
          state.manualCells.set(key, { t: 0, a: pickGrad(shading), b: -1 });
        }
      } else if (patternId === "peony-macro") {
        // Soft, ruffled rose/peony macro petals unfurling in a logarithmic spiral
        const ruffle = Math.max(1, Number(getMathParam(patternId, "ruffle")) || 3);
        const unfurl = Math.max(2, Number(getMathParam(patternId, "unfurl")) || 4);
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        const dx = ((nx - 0.5) * 2.0) / zoom;
        const dy = ((ny - 0.5) * 2.0) / zoom;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        const spiral = Math.log(r + 0.08) * unfurl + theta / (Math.PI * 2);
        const ruffleWave = Math.sin(theta * (ruffle * 2 + 3) + r * 5.0) * 0.16;
        const petalEdge = ((spiral + ruffleWave + 10) % 1);
        // Deep rose-heart shadow transitioning to luminous ruffled petal tips
        const cupLight = Math.pow(petalEdge, 0.85) * 0.68 + Math.min(1, r * 0.75) * 0.32;
        state.manualCells.set(key, { t: 0, a: pickGrad(cupLight), b: -1 });
      } else if (patternId === "sunflower-macro") {
        // Golden-angle sunflower seed head + dramatic radiating outer petals
        const heartR = Number(getMathParam(patternId, "heart")) || 0.42;
        const petals = Math.max(10, Math.round(Number(getMathParam(patternId, "petals")) || 18));
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        const dx = ((nx - 0.5) * 2.0) / zoom;
        const dy = ((ny - 0.5) * 2.0) / zoom;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        if (r <= heartR) {
          // Cross-spiral Fibonacci seed texture inside the dark center disc
          const s1 = Math.sin(r * 34 + theta * 13);
          const s2 = Math.sin(r * 34 - theta * 21);
          const seedTex = (s1 * s2) * 0.14 + 0.16 + (r / heartR) * 0.18;
          state.manualCells.set(key, { t: 0, a: pickGrad(seedTex), b: -1 });
        } else {
          // Radiating double layer of sunflower petals
          const pOuter = Math.pow(Math.abs(Math.cos(theta * petals * 0.5)), 0.65);
          const pInner = Math.pow(Math.abs(Math.sin(theta * petals * 0.5)), 0.65);
          const petalReach = heartR + 0.15 + Math.max(pOuter * 0.58, pInner * 0.46);
          if (r <= petalReach) {
            const distAlong = (r - heartR) / Math.max(0.05, petalReach - heartR);
            const tone = 0.94 - distAlong * 0.32 - (1 - Math.max(pOuter, pInner)) * 0.18;
            state.manualCells.set(key, { t: 0, a: pickGrad(tone), b: -1 });
          } else {
            state.manualCells.set(key, { t: 0, a: lumOrder[0], b: -1 });
          }
        }
      } else if (patternId === "mandelbrot") {
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        const panX = Number(getMathParam(patternId, "panX"));
        const panY = Number(getMathParam(patternId, "panY"));
        const cycles = Number(getMathParam(patternId, "cycles")) || 1.0;
        const cr = (Number.isFinite(panX) ? panX : -0.65) + ((nx - 0.5) * 2.85) / zoom;
        const ci = (Number.isFinite(panY) ? panY : 0.0) + ((ny - 0.5) * 2.5) / zoom;
        let zr = 0;
        let zi = 0;
        const maxIter = 56;
        let iter = 0;
        while (zr * zr + zi * zi <= 4 && iter < maxIter) {
          const nr = zr * zr - zi * zi + cr;
          zi = 2 * zr * zi + ci;
          zr = nr;
          iter++;
        }
        const palIdx =
          iter === maxIter ? lumOrder[0] : lumOrder[1 + (Math.floor(iter * cycles) % Math.max(1, K - 1))];
        state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
      } else if (patternId === "burning-ship") {
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        const panX = Number(getMathParam(patternId, "panX"));
        const panY = Number(getMathParam(patternId, "panY"));
        const cr = (Number.isFinite(panX) ? panX : -0.45) + ((nx - 0.5) * 3.2) / zoom;
        const ci = (Number.isFinite(panY) ? panY : -0.45) + ((ny - 0.5) * 2.8) / zoom;
        let zr = 0;
        let zi = 0;
        const maxIter = 52;
        let iter = 0;
        while (zr * zr + zi * zi <= 4 && iter < maxIter) {
          const ar = Math.abs(zr);
          const ai = Math.abs(zi);
          const nr = ar * ar - ai * ai + cr;
          zi = 2 * ar * ai + ci;
          zr = nr;
          iter++;
        }
        const palIdx = iter === maxIter ? lumOrder[0] : lumOrder[1 + (iter % Math.max(1, K - 1))];
        state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
      } else if (patternId === "julia") {
        const cr = Number(getMathParam(patternId, "cr"));
        const ci = Number(getMathParam(patternId, "ci"));
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        let zr = ((nx - 0.5) * 3.1) / zoom;
        let zi = ((ny - 0.5) * 2.5) / zoom;
        const maxIter = 52;
        let iter = 0;
        while (zr * zr + zi * zi <= 4 && iter < maxIter) {
          const nr = zr * zr - zi * zi + (Number.isFinite(cr) ? cr : -0.72);
          zi = 2 * zr * zi + (Number.isFinite(ci) ? ci : 0.19);
          zr = nr;
          iter++;
        }
        const palIdx = iter === maxIter ? lumOrder[0] : pickGrad(Math.sqrt(iter / maxIter));
        state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
      } else if (patternId === "newton") {
        const order = Math.max(3, Math.min(8, Math.round(Number(getMathParam(patternId, "order")) || 3)));
        const zoom = Number(getMathParam(patternId, "zoom")) || 1.0;
        let zr = ((nx - 0.5) * 3.0) / zoom;
        let zi = ((ny - 0.5) * 3.0) / zoom;
        if (Math.abs(zr) < 1e-4 && Math.abs(zi) < 1e-4) zr = 1e-3;
        for (let it = 0; it < 24; it++) {
          // Compute z^(n-1) and z^n in polar form
          const r = Math.hypot(zr, zi);
          if (r < 1e-6) break;
          const th = Math.atan2(zi, zr);
          const rn1 = Math.pow(r, order - 1);
          const rn = rn1 * r;
          const fR = rn * Math.cos(order * th) - 1;
          const fI = rn * Math.sin(order * th);
          const dfR = order * rn1 * Math.cos((order - 1) * th);
          const dfI = order * rn1 * Math.sin((order - 1) * th);
          const denom = dfR * dfR + dfI * dfI + 1e-9;
          zr -= (fR * dfR + fI * dfI) / denom;
          zi -= (fI * dfR - fR * dfI) / denom;
        }
        const angle = (Math.atan2(zi, zr) + Math.PI) / (Math.PI * 2);
        const rootIdx = Math.floor(angle * order) % order;
        state.manualCells.set(key, { t: 0, a: pickCycle(rootIdx), b: -1 });
      } else if (patternId === "sierpinski-carpet") {
        const sc = Math.max(1, Math.min(3, Math.round(Number(getMathParam(patternId, "scale")) || 2)));
        const dim = Math.pow(3, sc + 1);
        let x = Math.floor(nx * dim);
        let y = Math.floor(ny * dim);
        let holeLevel = 0;
        let level = 1;
        while (x > 0 || y > 0) {
          if (x % 3 === 1 && y % 3 === 1) {
            holeLevel = level;
            break;
          }
          x = Math.floor(x / 3);
          y = Math.floor(y / 3);
          level++;
        }
        const palIdx =
          holeLevel === 0 ? lumOrder[0] : lumOrder[Math.min(K - 1, K - 1 - ((holeLevel - 1) % Math.max(1, K - 1)))];
        state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
      } else if (patternId === "sierpinski-triangle") {
        const bandDepth = Math.max(1, Math.round(Number(getMathParam(patternId, "bandDepth")) || 1));
        const sc = Math.abs(Math.floor(nx * cols));
        const sr = Math.abs(Math.floor(ny * rows));
        const filled = (sc & sr) === 0;
        if (isSquareGrid && K >= 2) {
          const depth = Math.floor(Math.log2(Math.max(1, sr + 1)) * bandDepth);
          const accent = lumOrder[depth % Math.max(1, K - 1)];
          const bg = lumOrder[K - 1];
          if (filled) {
            const rightFilled = ((sc + 1) & sr) === 0;
            state.manualCells.set(key, !rightFilled ? { t: 2, a: accent, b: bg } : { t: 0, a: accent, b: -1 });
          } else {
            state.manualCells.set(key, { t: 0, a: bg, b: -1 });
          }
        } else {
          const palIdx = filled ? pickCycle(Math.floor(sr / 2) * bandDepth) : lumOrder[K - 1];
          state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
        }
      } else if (patternId === "chladni") {
        const nMode = Number(getMathParam(patternId, "n")) || 2;
        const mMode = Number(getMathParam(patternId, "m")) || 5;
        const mix = Number(getMathParam(patternId, "mix"));
        const x = nx * 2 - 1;
        const y = ny * 2 - 1;
        const val =
          Math.cos(nMode * Math.PI * x) * Math.cos(mMode * Math.PI * y) +
          (Number.isFinite(mix) ? mix : 1) * Math.cos(mMode * Math.PI * x) * Math.cos(nMode * Math.PI * y);
        const norm = Math.min(1, Math.abs(val) / (1 + Math.abs(Number.isFinite(mix) ? mix : 1) + 1e-4));
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "turing") {
        const twx = ((nx % 1) + 1) % 1;
        const twy = ((ny % 1) + 1) % 1;
        const tx = Math.min(turingW - 1, Math.floor(twx * turingW));
        const ty = Math.min(turingH - 1, Math.floor(twy * turingH));
        const v = turingData[ty * turingW + tx];
        const norm = Math.max(0, Math.min(1, v * 2.4));
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "fire") {
        const fx = Math.max(0, Math.min(fireW - 1, Math.floor(((nx + 0.5) / 2) * fireW)));
        const fy = Math.max(0, Math.min(fireH - 1, Math.floor(((ny + 0.5) / 2) * fireH)));
        const heat = fireData ? fireData[fy * fireW + fx] : 0;
        // Gamma curve emphasizes luminous flame tongues & embers while keeping cool smoke dark
        const norm = Math.max(0, Math.min(1, Math.pow(heat, 0.78)));
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "william-morris") {
        // Arts & Crafts mirrored S-curve acanthus vines + diamond trellis + rosette blossoms
        const rep = Math.max(1, Number(getMathParam(patternId, "repeats")) || 2);
        const scroll = Number(getMathParam(patternId, "scroll")) || 1.1;
        const blossom = Number(getMathParam(patternId, "blossom")) || 1.0;
        const u = ((nx * rep) % 1 + 1) % 1;
        const v = ((ny * rep) % 1 + 1) % 1;
        const mu = Math.abs(u - 0.5) * 2; // Bilateral wallpaper mirror 0..1
        const mv = Math.abs(v - 0.5) * 2;
        // Intertwining S-curve stems
        const vine1 = Math.abs(mu - (0.48 + 0.34 * Math.sin(v * Math.PI * 2 * scroll)));
        const vine2 = Math.abs(mu - (0.48 - 0.34 * Math.sin(v * Math.PI * 2 * scroll)));
        const stem = Math.min(vine1, vine2);
        // Acanthus scalloped leaf fronds branching off the vine
        const frond = 0.5 + 0.5 * Math.sin((mu * 5.2 - v * 4.0) * Math.PI) * Math.cos((mv * 3.5 + u * 2.0) * Math.PI);
        // Rosette medallions at tile center (0.5, 0.5) & corners (0, 0)
        const dCenter = Math.hypot(u - 0.5, v - 0.5);
        const aCenter = Math.atan2(v - 0.5, u - 0.5);
        const rosetteCenter = dCenter - (0.16 + 0.045 * Math.cos(aCenter * 8)) * blossom;
        const dCorner = Math.hypot(Math.min(u, 1 - u), Math.min(v, 1 - v));
        const aCorner = Math.atan2(Math.min(v, 1 - v), Math.min(u, 1 - u));
        const rosetteCorner = dCorner - (0.14 + 0.04 * Math.cos(aCorner * 8)) * blossom;
        let norm;
        if (rosetteCenter < 0 || rosetteCorner < 0) {
          const rVal = rosetteCenter < 0 ? dCenter / (0.22 * blossom) : dCorner / (0.2 * blossom);
          norm = 0.72 + (1 - Math.min(1, rVal)) * 0.28; // Luminous blossom highlight
        } else if (stem < 0.095) {
          norm = 0.42 + (1 - stem / 0.095) * 0.22; // Intertwining acanthus vine
        } else {
          norm = 0.06 + frond * 0.34; // Rich foliage & deep Arts & Crafts ground
        }
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "art-deco") {
        // 1920s Chrysler / Gatsby overlapping scalloped sunburst fans in staggered half-drop rows
        const fans = Math.max(2, Number(getMathParam(patternId, "fans")) || 3);
        const rays = Math.max(5, Number(getMathParam(patternId, "rays")) || 9);
        const layers = Math.max(1, Number(getMathParam(patternId, "layers")) || 2);
        const gx = nx * fans;
        const gy = ny * fans * 1.15;
        // Check overlapping fan arches from current & lower half-drop rows (front-to-back)
        let norm = 0.1;
        for (let rowOff = 1; rowOff >= -1; rowOff--) {
          const rIdx = Math.floor(gy) + rowOff;
          const xShift = (rIdx & 1) ? 0.5 : 0;
          const cIdx = Math.floor(gx - xShift);
          for (let colOff = 0; colOff <= 1; colOff++) {
            const cx = cIdx + colOff + xShift;
            const cy = rIdx + 0.85;
            const dx = gx - cx;
            const dy = cy - gy; // Positive upward from fan base
            const dist = Math.hypot(dx, dy);
            if (dy >= -0.05 && dist <= 0.72) {
              const ang = Math.atan2(dx, Math.max(0.001, dy)); // -PI/2..PI/2
              const rayWave = Math.cos(ang * rays * 2);
              const archRing = Math.abs(((dist / 0.72) * layers) % 1 - 0.5) * 2;
              const isRim = dist > 0.64 || archRing > 0.82;
              norm = isRim ? 0.92 : rayWave > 0 ? 0.62 + (1 - dist / 0.72) * 0.25 : 0.16 + (dist / 0.72) * 0.25;
            }
          }
        }
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "art-nouveau") {
        // Flowing asymmetrical whiplash tendrils & stained-glass organic ribbons
        const flow = Number(getMathParam(patternId, "flow")) || 2.5;
        const whip = Number(getMathParam(patternId, "whip")) || 1.2;
        const bands = Number(getMathParam(patternId, "bands")) || 2.0;
        const x = nx * 2 - 1;
        const y = ny * 2 - 1;
        // Sinuous whiplash coordinate warp
        const wx = x + 0.35 * whip * Math.sin(y * Math.PI * flow + 0.4 * Math.cos(x * Math.PI * 1.5));
        const wy = y + 0.35 * whip * Math.cos(x * Math.PI * flow * 0.85 - 0.35 * Math.sin(y * Math.PI * 1.8));
        const stream = Math.sin(wx * Math.PI * bands) * Math.cos(wy * Math.PI * bands * 0.75);
        const leadLine = Math.abs(Math.sin((wx * 1.6 + wy * 1.2) * Math.PI * bands));
        const norm = leadLine < 0.12 ? 0.06 : Math.max(0.14, Math.min(1, stream * 0.45 + 0.55));
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "seigaiha") {
        // Classic Japanese Edo Seigaiha concentric overlapping ocean waves
        const wCols = Math.max(2, Number(getMathParam(patternId, "cols")) || 4);
        const wRings = Math.max(2, Number(getMathParam(patternId, "rings")) || 4);
        const depth = Number(getMathParam(patternId, "depth")) || 1.0;
        const gx = nx * wCols;
        const gy = ny * wCols * 1.55 / depth;
        let norm = 0.2;
        for (let rowOff = 2; rowOff >= -1; rowOff--) {
          const rIdx = Math.floor(gy) + rowOff;
          const xShift = (rIdx & 1) ? 0.5 : 0;
          const cIdx = Math.floor(gx - xShift);
          for (let colOff = 0; colOff <= 1; colOff++) {
            const cx = cIdx + colOff + xShift;
            const cy = rIdx + 0.5;
            const d = Math.hypot(gx - cx, (gy - cy) * 0.65);
            if (d <= 0.62) {
              const band = Math.floor((d / 0.62) * wRings * 2);
              const tRing = (band % (wRings * 2)) / Math.max(1, wRings * 2 - 1);
              norm = (band & 1) ? 0.78 + tRing * 0.2 : 0.12 + tRing * 0.48;
            }
          }
        }
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "moroccan-zellige") {
        // Interlocking 8-point Khatam star & cross Islamic geometric tessellation
        const rep = Math.max(1, Number(getMathParam(patternId, "repeats")) || 2);
        const sharp = Number(getMathParam(patternId, "sharpness")) || 1.0;
        const bands = Number(getMathParam(patternId, "bands")) || 2.0;
        const u = (((nx * rep) % 1 + 1) % 1) * 2 - 1; // -1..1
        const v = (((ny * rep) % 1 + 1) % 1) * 2 - 1;
        // 8-fold dihedral symmetry fold
        const ax = Math.abs(u);
        const ay = Math.abs(v);
        const dMax = Math.max(ax, ay);
        const dRot = (ax + ay) * 0.70710678;
        // Khatam 8-point star = union of axis-aligned square & 45-deg rotated square
        const starDist = Math.min(dMax, dRot) * sharp;
        const outerCross = Math.max(dMax, dRot);
        const strap = Math.abs(((starDist * bands * 2.2) % 1) - 0.5) * 2;
        let norm;
        if (starDist < 0.42) {
          norm = strap > 0.78 ? 0.94 : 0.58 + (1 - starDist / 0.42) * 0.28;
        } else if (outerCross > 0.96) {
          norm = 0.85;
        } else {
          norm = strap > 0.8 ? 0.88 : 0.12 + ((starDist - 0.42) / 0.6) * 0.35;
        }
        state.manualCells.set(key, { t: 0, a: pickGrad(Math.max(0, Math.min(1, norm))), b: -1 });
      } else if (patternId === "bauhaus-grid") {
        // Modernist Bauhaus module grid: quarter-circles, diagonals, split bars & Albers squares
        const mods = Math.max(2, Math.round(Number(getMathParam(patternId, "modules")) || 4));
        const seed = Math.round(Number(getMathParam(patternId, "seed")) || 5);
        const gx = nx * mods;
        const gy = ny * mods;
        const mx = Math.floor(gx);
        const my = Math.floor(gy);
        const lx = gx - mx; // 0..1 inside module
        const ly = gy - my;
        const h1 = hash2(mx, my, seed);
        const h2 = hash2(mx + 19, my + 37, seed);
        const h3 = hash2(mx + 53, my + 11, seed);
        const shapeType = Math.floor(h1 * 5); // 0: quarter-circle, 1: half-circle, 2: nested Albers, 3: diagonal split, 4: full circle
        const cA = lumOrder[Math.floor(h2 * K) % K];
        const cB = lumOrder[(Math.floor(h2 * K) + 1 + Math.floor(h3 * Math.max(1, K - 1))) % K];
        let inShape = false;
        if (shapeType === 0) {
          const corner = Math.floor(h3 * 4);
          const cx = corner === 1 || corner === 2 ? 1 : 0;
          const cy = corner >= 2 ? 1 : 0;
          inShape = Math.hypot(lx - cx, ly - cy) <= 1.0;
        } else if (shapeType === 1) {
          inShape = h3 < 0.5 ? Math.hypot(lx - 0.5, ly) <= 0.5 : Math.hypot(lx, ly - 0.5) <= 0.5;
        } else if (shapeType === 2) {
          inShape = Math.abs(lx - 0.5) < 0.27 && Math.abs(ly - 0.5) < 0.27;
        } else if (shapeType === 3) {
          inShape = h3 < 0.5 ? lx + ly < 1.0 : lx > ly;
        } else {
          inShape = Math.hypot(lx - 0.5, ly - 0.5) <= 0.42;
        }
        state.manualCells.set(key, { t: 0, a: inShape ? cA : cB, b: -1 });
      } else if (patternId === "kaleidoscope") {
        // N-fold dihedral mirror symmetry (D_n): fold angle into [0, PI/folds] mirrored wedge
        const folds = Math.max(4, Math.round(Number(getMathParam(patternId, "folds")) || 8));
        const detail = Math.max(1, Number(getMathParam(patternId, "detail")) || 3);
        const twist = Number(getMathParam(patternId, "twist")) || 0;
        const seed = Number(getMathParam(patternId, "seed")) || 4;
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const r = Math.hypot(dx, dy) * 2.0; // 0 at center, ~1.41 at corners
        let theta = Math.atan2(dy, dx) + r * twist;
        const sector = (Math.PI * 2) / folds;
        theta = ((theta % sector) + sector) % sector;
        if (theta > sector * 0.5) theta = sector - theta; // Mirror reflection!
        const wx = r * Math.cos(theta);
        const wy = r * Math.sin(theta);
        // Layered faceted kaleidoscope interference inside the mirrored wedge
        const f1 = Math.sin(wx * Math.PI * detail + seed * 1.13);
        const f2 = Math.cos(wy * Math.PI * (detail + 1.5) - seed * 0.77);
        const f3 = Math.sin((r * detail * 2.2 - theta * folds * 0.5) * Math.PI + seed * 0.51);
        const norm = (f1 * 0.4 + f2 * 0.35 + f3 * 0.25) * 0.5 + 0.5;
        state.manualCells.set(key, { t: 0, a: pickGrad(norm), b: -1 });
      } else if (patternId === "kaleidoscope-hst") {
        // 8-way dihedral symmetry (D_4) heirloom kaleidoscope star with diagonal HSTs
        const rings = Math.max(1, Number(getMathParam(patternId, "rings")) || 3);
        const seed = Math.max(1, Math.round(Number(getMathParam(patternId, "seed")) || 5));
        const dx = (nx - 0.5) * cols;
        const dy = (ny - 0.5) * rows;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        // Fold into fundamental octant (u >= v >= 0) for crisp 8-way mirror symmetry
        const u = Math.max(ax, ay) / Math.max(1, Math.max(cols, rows) * 0.5);
        const v = Math.min(ax, ay) / Math.max(1, Math.max(cols, rows) * 0.5);
        const octVal =
          Math.sin(u * Math.PI * rings + seed * 0.9) * 0.45 +
          Math.cos((u - v) * Math.PI * (rings + 1) + seed * 1.3) * 0.35 +
          Math.sin((u + v) * Math.PI * rings * 0.8 + seed * 0.4) * 0.2;
        const norm = octVal * 0.5 + 0.5;
        const pA = pickGrad(norm);
        const pB = pickGrad((norm + 0.38) % 1);
        if (isSquareGrid && K >= 2) {
          // Mirror HST diagonal across all 4 quadrants so star points radiate symmetrically
          const sameSign = (dx >= 0) === (dy >= 0);
          const diag = sameSign ? 2 : 1; // '\' in TL/BR quadrants, '/' in TR/BL quadrants
          const isHstBand = Math.floor((u + v) * (rings * 2 + 2) + seed) % 2 === 0;
          if (isHstBand && pA !== pB) {
            // Keep inner/outer halves consistently oriented across quadrants
            const swap = dy < 0;
            state.manualCells.set(key, { t: diag, a: swap ? pB : pA, b: swap ? pA : pB });
          } else {
            state.manualCells.set(key, { t: 0, a: pA, b: -1 });
          }
        } else {
          state.manualCells.set(key, { t: 0, a: pA, b: -1 });
        }
      } else if (patternId === "bargello-wave") {
        const freq = Number(getMathParam(patternId, "freq")) || 1.25;
        const amp = Number(getMathParam(patternId, "amp")) || 0.25;
        const repeat = Number(getMathParam(patternId, "repeat")) || 1.4;
        const wave = Math.sin(nx * Math.PI * 2 * freq) * amp + Math.cos(nx * Math.PI * 4 * freq) * (amp * 0.28);
        const band = ((ny + wave) * K * repeat + K * 10) % K;
        state.manualCells.set(key, { t: 0, a: lumOrder[Math.floor(band) % K], b: -1 });
      } else if (patternId === "fibonacci-spiral") {
        const arms = Math.max(2, Math.round(Number(getMathParam(patternId, "arms")) || 5));
        const twist = Number(getMathParam(patternId, "twist")) || 2.25;
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const rad = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const spiral = (angle / (Math.PI * 2) + 0.5) * arms + Math.log(rad + 0.04) * twist;
        const idx = Math.floor((spiral + 100) * (K / 2.2));
        state.manualCells.set(key, { t: 0, a: pickCycle(idx), b: -1 });
      } else if (patternId === "truchet") {
        const seed = Math.max(1, Math.round(Number(getMathParam(patternId, "seed")) || 3));
        const bands = Math.max(1, Math.round(Number(getMathParam(patternId, "bands")) || 1));
        const tc = Math.floor(nx * cols);
        const tr = Math.floor(ny * rows);
        const diag = (((tc ^ tr) + Math.floor((tc * seed + tr) / (seed + 1))) & 1) === 0 ? 1 : 2;
        const band = Math.abs(Math.floor(((nx + ny) * 0.5) * bands * Math.max(1, K - 1)));
        const pA = lumOrder[band % Math.max(1, K - 1)];
        const pB = lumOrder[K - 1 - (band % Math.max(1, K - 1))];
        if (isSquareGrid && K >= 2) {
          state.manualCells.set(key, { t: diag, a: pA, b: pB });
        } else {
          state.manualCells.set(key, { t: 0, a: diag === 1 ? pA : pB, b: -1 });
        }
      } else if (patternId === "log-cabin") {
        const ringW = Math.max(1, Math.round(Number(getMathParam(patternId, "ringWidth")) || 1));
        const dx = (nx - 0.5) * cols;
        const dy = (ny - 0.5) * rows;
        const ring = Math.floor(Math.max(Math.abs(dx), Math.abs(dy)) / ringW);
        const isLightHalf = dx + dy >= 0;
        const halfK = Math.max(1, Math.floor(K / 2));
        const palIdx = isLightHalf
          ? lumOrder[Math.min(K - 1, halfK + (ring % Math.max(1, K - halfK)))]
          : lumOrder[ring % halfK];
        state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
      } else if (patternId === "xor-mosaic") {
        const mod = Math.max(3, Math.round(Number(getMathParam(patternId, "mod")) || 9));
        const zoom = Math.max(1, Math.round(Number(getMathParam(patternId, "zoom")) || 1));
        const mirror = String(getMathParam(patternId, "mirror") || "quad");
        const ux = mirror === "quad" ? Math.floor(Math.abs((nx - 0.5) * cols) * zoom) : Math.abs(Math.floor(nx * cols * zoom));
        const uy = mirror === "quad" ? Math.floor(Math.abs((ny - 0.5) * rows) * zoom) : Math.abs(Math.floor(ny * rows * zoom));
        const v = (ux ^ uy) % mod;
        state.manualCells.set(key, { t: 0, a: pickGrad(v / Math.max(1, mod - 1)), b: -1 });
      } else if (patternId === "ulam-spiral") {
        const startInt = Math.max(1, Math.round(Number(getMathParam(patternId, "start")) || 1));
        const mode = String(getMathParam(patternId, "mode") || "primes");
        const dx = Math.round((nx - 0.5) * cols);
        const dy = Math.round((ny - 0.5) * rows);
        const val = ulamSpiralValue(dx, dy, startInt);
        let palIdx;
        if (mode === "divisors") {
          const divs = countDivisorsNum(val);
          palIdx = pickGrad(Math.min(1, (divs - 1) / 10));
        } else {
          palIdx = isPrimeNum(val)
            ? lumOrder[0]
            : lumOrder[Math.min(K - 1, 1 + (Math.max(Math.abs(dx), Math.abs(dy)) % Math.max(1, K - 1)))];
        }
        state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
      } else if (patternId === "hilbert") {
        const cycles = Number(getMathParam(patternId, "cycles")) || 1;
        const hwx = ((nx % 1) + 1) % 1;
        const hwy = ((ny % 1) + 1) % 1;
        const hx = Math.min(hilbertN - 1, Math.floor(hwx * hilbertN));
        const hy = Math.min(hilbertN - 1, Math.floor(hwy * hilbertN));
        const d = hilbertXy2d(hilbertN, hx, hy);
        const normD = ((d / Math.max(1, hilbertN * hilbertN - 1)) * cycles) % 1;
        state.manualCells.set(key, { t: 0, a: pickGrad(normD), b: -1 });
      } else if (patternId === "cellular-rule90") {
        const rr = Math.max(0, Math.min(caRows - 1, Math.floor(ny * rows)));
        const cc = ((Math.floor((nx + 0.5) * cols) % caCols) + caCols) % caCols;
        const alive = caGrid[rr][cc] === 1;
        const palIdx = alive ? lumOrder[Math.floor((rr / Math.max(1, caRows)) * Math.max(1, K - 1))] : lumOrder[K - 1];
        state.manualCells.set(key, { t: 0, a: palIdx, b: -1 });
      } else if (patternId === "interference") {
        const freq = Number(getMathParam(patternId, "freq")) || 18;
        const spread = Number(getMathParam(patternId, "spread")) || 0.22;
        const d1 = Math.hypot(nx - (0.5 - spread), ny - (0.5 - spread * 0.7)) * freq;
        const d2 = Math.hypot(nx - (0.5 + spread), ny - (0.5 + spread * 0.7)) * freq;
        const wave = (Math.sin(d1) + Math.sin(d2)) * 0.25 + 0.5;
        state.manualCells.set(key, { t: 0, a: pickGrad(wave), b: -1 });
      } else if (patternId === "voronoi") {
        const vwx = ((nx % 1) + 1) % 1;
        const vwy = ((ny % 1) + 1) % 1;
        let bestD = Infinity;
        let bestPal = lumOrder[0];
        for (let s = 0; s < voronoiSeeds.length; s++) {
          const sd = voronoiSeeds[s];
          let ddx = Math.abs(vwx - sd.x);
          let ddy = Math.abs(vwy - sd.y);
          if (ddx > 0.5) ddx = 1 - ddx;
          if (ddy > 0.5) ddy = 1 - ddy;
          const d = ddx * ddx + ddy * ddy;
          if (d < bestD) {
            bestD = d;
            bestPal = sd.pal;
          }
        }
        state.manualCells.set(key, { t: 0, a: bestPal, b: -1 });
      }
    }

    renderQuilt();
    if (record) {
      recordHistory(`Generated ${spec.label}`, coalesceKey);
    }
  }

  // --- Color-Wheel Harmony Math, Swatch Mapper & Shuffle Engine ---
  function hslToRgb(hDeg, sPct, lPct) {
    const h = (((hDeg % 360) + 360) % 360) / 360;
    const s = Math.max(0, Math.min(1, sPct / 100));
    const l = Math.max(0, Math.min(1, lPct / 100));
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    return [Math.round(hue2rgb(h + 1 / 3) * 255), Math.round(hue2rgb(h) * 255), Math.round(hue2rgb(h - 1 / 3) * 255)];
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, Math.round(l * 100)];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return [Math.round(h * 60) % 360, Math.round(s * 100), Math.round(l * 100)];
  }

  const HARMONY_RULES = [
    {
      id: "analogous",
      label: "Analogous",
      formula: "±16° · ±32°",
      getHueOffset: (i, K) => (K <= 1 ? 0 : ((i / (K - 1)) - 0.5) * 64),
    },
    {
      id: "complementary",
      label: "Complementary",
      formula: "0° · 180°",
      getHueOffset: (i) => [0, 10, 180, 190][i % 4],
    },
    {
      id: "split-comp",
      label: "Split-Complementary",
      formula: "0° · 150° · 210°",
      getHueOffset: (i) => [0, 150, 210][i % 3],
    },
    {
      id: "triadic",
      label: "Triadic",
      formula: "0° · 120° · 240°",
      getHueOffset: (i) => [0, 120, 240][i % 3],
    },
    {
      id: "tetradic",
      label: "Tetradic Square",
      formula: "0° · 90° · 180° · 270°",
      getHueOffset: (i) => [0, 90, 180, 270][i % 4],
    },
    {
      id: "golden",
      label: "Golden Angle φ",
      formula: "i × 137.508°",
      getHueOffset: (i) => (i * 137.507764) % 360,
    },
    {
      id: "double-comp",
      label: "Double-Complementary",
      formula: "0° · 30° · 180° · 210°",
      getHueOffset: (i) => [0, 30, 180, 210][i % 4],
    },
    {
      id: "monochrome",
      label: "Monochrome Value",
      formula: "±6° value ladder",
      getHueOffset: (i, K) => (K <= 1 ? 0 : ((i / (K - 1)) - 0.5) * 12),
    },
  ];

  const HARMONY_RULE_MAP = Object.fromEntries(HARMONY_RULES.map((r) => [r.id, r]));

  const HARMONY_LIBRARY_LABELS = {
    mixed: "Kona + Prints",
    kona: "Kona Solids",
    kaffe: "Kaffe Fassett",
    brandon: "Brandon Mably",
    pj: "Philip Jacobs",
    prints: "Designer Prints",
    pure: "Pure Math RGB",
  };

  function getPrintPoolForLibrary(library) {
    if (library === "kaffe") return KAFFE_FASSETT_FABRICS;
    if (library === "brandon") return BRANDON_MABLY_FABRICS;
    if (library === "pj") return PHILIP_JACOBS_FABRICS;
    return [...KAFFE_FASSETT_FABRICS, ...BRANDON_MABLY_FABRICS, ...PHILIP_JACOBS_FABRICS];
  }

  function pickClosestPrint(tr, tg, tb, pool, usedPrints) {
    let best = null;
    let bestDist = Infinity;
    for (let j = 0; j < pool.length; j++) {
      const f = pool[j];
      if (usedPrints.has(f.id)) continue;
      const d = colorDistanceSq(tr, tg, tb, f.rgb[0], f.rgb[1], f.rgb[2]);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    if (!best && pool.length > 0) {
      // Fallback if K > pool.length
      for (let j = 0; j < pool.length; j++) {
        const f = pool[j];
        const d = colorDistanceSq(tr, tg, tb, f.rgb[0], f.rgb[1], f.rgb[2]);
        if (d < bestDist) {
          bestDist = d;
          best = f;
        }
      }
    }
    return best;
  }

  function pickClosestKona(tr, tg, tb, usedKona) {
    let best = NAMED_FABRIC_COLORS[0];
    let bestDist = Infinity;
    for (let j = 0; j < NAMED_FABRIC_COLORS.length; j++) {
      const row = NAMED_FABRIC_COLORS[j];
      if (usedKona.has(row[5])) continue;
      const d = colorDistanceSq(tr, tg, tb, row[1], row[2], row[3]);
      if (d < bestDist) {
        bestDist = d;
        best = row;
      }
    }
    return best;
  }

  // Builds a K-fabric mathematically derived palette using color-wheel geometry + perceptual value staircase,
  // mapped onto the chosen real fabric swatch catalog (Kona Solids, Kaffe Fassett, Brandon Mably, Philip Jacobs, Mixed, or Pure Math).
  function generateHarmoniousPalette(count = state.palette.length || 8, options = {}) {
    const K = Math.max(2, Math.min(16, count));
    const rule =
      (options.ruleId && HARMONY_RULE_MAP[options.ruleId]) ||
      HARMONY_RULES[Math.floor(Math.random() * HARMONY_RULES.length)];
    const baseHue = Number.isFinite(options.baseHue) ? ((options.baseHue % 360) + 360) % 360 : Math.floor(Math.random() * 360);
    const baseSat = Number.isFinite(options.saturation) ? clampNumber(options.saturation, 18, 92, 62) : 46 + Math.random() * 28;
    const contrast = Number.isFinite(options.contrast) ? clampNumber(options.contrast, 30, 86, 74) : 74;
    const library = options.library || (options.includePrints === true ? "mixed" : "kona");
    const reverseValues = Boolean(options.reverseValues);

    const lowL = Math.max(12, 53 - contrast / 2);
    const highL = Math.min(93, 53 + contrast / 2);

    const printPool = getPrintPoolForLibrary(library);
    const usedKona = new Set();
    const usedPrints = new Set();
    const printSlots = new Set();
    if (library === "mixed" && K >= 4) {
      const printCount = Math.min(3, Math.max(1, Math.floor(K / 3)));
      for (let p = 0; p < printCount; p++) {
        const slot = Math.min(K - 2, Math.max(1, Math.round(((p + 1) / (printCount + 1)) * (K - 1))));
        printSlots.add(slot);
      }
    }

    const entries = [];
    for (let i = 0; i < K; i++) {
      const t = K === 1 ? 0.5 : i / (K - 1);
      const lightness = lowL + t * (highL - lowL);
      // Subtle perceptual hue-temperature shift: darks lean slightly cool, highlights slightly warm
      const tempShift = (t - 0.5) * 12;
      const hueOffset = rule.getHueOffset(i, K);
      const hue = baseHue + hueOffset + tempShift;
      const sat = t < 0.1 || t > 0.9 ? Math.max(16, baseSat * 0.55) : baseSat;
      const [tr, tg, tb] = hslToRgb(hue, sat, lightness);
      const mathTarget = [tr, tg, tb];

      let swatch = null;
      const forcePrint = library === "kaffe" || library === "brandon" || library === "pj" || library === "prints";
      if (forcePrint || (library === "mixed" && printSlots.has(i))) {
        const bestPrint = pickClosestPrint(tr, tg, tb, printPool, usedPrints);
        if (bestPrint) {
          usedPrints.add(bestPrint.id);
          swatch = {
            id: state.nextColorId++,
            r: bestPrint.rgb[0],
            g: bestPrint.rgb[1],
            b: bestPrint.rgb[2],
            patternDataUrl: getPhilipJacobsDataUrl(bestPrint),
            patternName: bestPrint.name,
            patternAvgRgb: [...bestPrint.rgb],
            patternScale: 1.0,
            patternCutMode: "repeat",
            libraryId: bestPrint.id,
          };
        }
      }

      if (!swatch) {
        if (library === "pure") {
          swatch = { id: state.nextColorId++, r: tr, g: tg, b: tb };
        } else {
          const bestKona = pickClosestKona(tr, tg, tb, usedKona);
          usedKona.add(bestKona[5]);
          swatch = {
            id: state.nextColorId++,
            r: bestKona[1],
            g: bestKona[2],
            b: bestKona[3],
          };
        }
      }

      entries.push({ swatch, mathTarget });
    }

    // Order mapped swatches by perceptual luminance so slot 0..K-1 aligns dark->light (or reversed)
    // with the quilt's tonal structure!
    entries.sort((a, b) => {
      const la = luminance(a.swatch.r, a.swatch.g, a.swatch.b);
      const lb = luminance(b.swatch.r, b.swatch.g, b.swatch.b);
      return reverseValues ? lb - la : la - lb;
    });

    return {
      palette: entries.map((e) => e.swatch),
      mathTargets: entries.map((e) => e.mathTarget),
      ruleLabel: rule.label,
      ruleId: rule.id,
      baseHue: Math.round(baseHue),
      saturation: Math.round(baseSat),
      contrast: Math.round(contrast),
      library,
    };
  }

  // Widely acclaimed curated color palettes (Fine Art, Cinema, Design, Cartography & Modern Quilting)
  const CURATED_COLOR_PALETTES = [
    {
      id: "pnw",
      name: "Pacific Northwest",
      tag: "Quilting · Coastal",
      colors: ["#274029", "#4A525A", "#7A7570", "#8FA8B2", "#B5C2C6", "#DCE5E8"],
    },
    {
      id: "desert-autumn",
      name: "Desert Autumn",
      tag: "Quilting · Warm",
      colors: ["#6B2F23", "#C05C46", "#D66E34", "#C99738", "#8D9B83", "#E0A896", "#F7EFE6"],
    },
    {
      id: "nordic-minimal",
      name: "Nordic Minimalist",
      tag: "Quilting · Hygge",
      colors: ["#23302B", "#333739", "#5D707A", "#8FA8B2", "#D7CBC0", "#F4F4F2"],
    },
    {
      id: "sanzo-wada",
      name: "Sanzo Wada · Shōwa",
      tag: "1930s Japan",
      colors: ["#2B2B2B", "#4B6B64", "#C65D3B", "#D9A74A", "#F9C1CE", "#F4EFEA"],
    },
    {
      id: "grand-budapest",
      name: "Grand Budapest",
      tag: "Wes Anderson",
      colors: ["#4A2B5E", "#8B5FBF", "#F4A8B9", "#FFBDD8", "#F9D1BC", "#A4D8FF"],
    },
    {
      id: "darjeeling",
      name: "Darjeeling Limited",
      tag: "Wes Anderson",
      colors: ["#005F54", "#00A08A", "#C82828", "#F98400", "#F2AD00", "#5BBCD6", "#FBF6EC"],
    },
    {
      id: "bauhaus",
      name: "Bauhaus Primary",
      tag: "Modernist Art",
      colors: ["#141414", "#1E3878", "#C8302A", "#E8C018", "#CCC4AE", "#F7F6F2"],
    },
    {
      id: "starry-night",
      name: "Van Gogh · Starry Night",
      tag: "Fine Art",
      colors: ["#101B2D", "#1E3F73", "#3367A8", "#7C9EC3", "#D4AF37", "#FADA5E"],
    },
    {
      id: "water-lilies",
      name: "Monet · Water Lilies",
      tag: "Impressionism",
      colors: ["#382F2E", "#87594F", "#6E8F6B", "#6BA89E", "#A9BFCB", "#E7B7C6"],
    },
    {
      id: "nord-arctic",
      name: "Nord Arctic",
      tag: "Design Classic",
      colors: ["#2E3440", "#434C5E", "#5E81AC", "#88C0D0", "#BF616A", "#A3BE8C", "#EBCB8B", "#ECEFF4"],
    },
    {
      id: "viridis",
      name: "Viridis",
      tag: "Perceptual Math",
      colors: ["#440154", "#3B528B", "#21918C", "#5EC962", "#FDE725"],
    },
    {
      id: "inferno",
      name: "Inferno Flame",
      tag: "Perceptual Fire",
      colors: ["#0B0614", "#420A68", "#932667", "#DD513A", "#FCA50A", "#FCFFA4"],
    },
    {
      id: "plasma",
      name: "Plasma Radiant",
      tag: "Perceptual Math",
      colors: ["#0D0887", "#6A00A8", "#B12A90", "#E16462", "#FCA636", "#F0F921"],
    },
    {
      id: "desert-nordic",
      name: "Desert × Nordic",
      tag: "Modern Quilt",
      colors: ["#51555A", "#A24D39", "#C2D05C", "#E8C8BE", "#FBF8F2"],
    },
  ];

  const CURATED_PALETTE_MAP = Object.fromEntries(CURATED_COLOR_PALETTES.map((p) => [p.id, p]));

  function generateCuratedPalette(curatedId, count = state.palette.length || 8, options = {}) {
    const K = Math.max(2, Math.min(16, count));
    const preset = CURATED_PALETTE_MAP[curatedId] || CURATED_COLOR_PALETTES[0];
    const library = options.library || "kona";
    const reverseValues = Boolean(options.reverseValues);

    // Sort preset stops darkest -> lightest so resampling preserves smooth tonal contrast
    const baseStops = preset.colors
      .map((hex) => hexToRgb(hex))
      .sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));

    // Resample baseStops smoothly to exact K target RGBs
    const targets = [];
    for (let i = 0; i < K; i++) {
      const pos = K === 1 ? 0 : (i / (K - 1)) * (baseStops.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.min(baseStops.length - 1, Math.ceil(pos));
      const frac = pos - lo;
      const r = Math.round(baseStops[lo][0] + (baseStops[hi][0] - baseStops[lo][0]) * frac);
      const g = Math.round(baseStops[lo][1] + (baseStops[hi][1] - baseStops[lo][1]) * frac);
      const b = Math.round(baseStops[lo][2] + (baseStops[hi][2] - baseStops[lo][2]) * frac);
      targets.push([r, g, b]);
    }

    const printPool = getPrintPoolForLibrary(library);
    const usedKona = new Set();
    const usedPrints = new Set();
    const printSlots = new Set();
    if (library === "mixed" && K >= 4) {
      const printCount = Math.min(3, Math.max(1, Math.floor(K / 3)));
      for (let p = 0; p < printCount; p++) {
        const slot = Math.min(K - 2, Math.max(1, Math.round(((p + 1) / (printCount + 1)) * (K - 1))));
        printSlots.add(slot);
      }
    }

    const entries = targets.map((mathTarget, i) => {
      const [tr, tg, tb] = mathTarget;
      let swatch = null;
      const forcePrint = library === "kaffe" || library === "brandon" || library === "pj" || library === "prints";
      if (forcePrint || (library === "mixed" && printSlots.has(i))) {
        const bestPrint = pickClosestPrint(tr, tg, tb, printPool, usedPrints);
        if (bestPrint) {
          usedPrints.add(bestPrint.id);
          swatch = {
            id: state.nextColorId++,
            r: bestPrint.rgb[0],
            g: bestPrint.rgb[1],
            b: bestPrint.rgb[2],
            patternDataUrl: getPhilipJacobsDataUrl(bestPrint),
            patternName: bestPrint.name,
            patternAvgRgb: [...bestPrint.rgb],
            patternScale: 1.0,
            patternCutMode: "repeat",
            libraryId: bestPrint.id,
          };
        }
      }
      if (!swatch) {
        if (library === "pure") {
          swatch = { id: state.nextColorId++, r: tr, g: tg, b: tb };
        } else {
          const bestKona = pickClosestKona(tr, tg, tb, usedKona);
          usedKona.add(bestKona[5]);
          swatch = { id: state.nextColorId++, r: bestKona[1], g: bestKona[2], b: bestKona[3] };
        }
      }
      return { swatch, mathTarget };
    });

    entries.sort((a, b) => {
      const la = luminance(a.swatch.r, a.swatch.g, a.swatch.b);
      const lb = luminance(b.swatch.r, b.swatch.g, b.swatch.b);
      return reverseValues ? lb - la : la - lb;
    });

    return {
      palette: entries.map((e) => e.swatch),
      mathTargets: entries.map((e) => e.mathTarget),
      ruleLabel: preset.name,
      library,
    };
  }

  function renderCuratedPaletteList() {
    if (!harmonyCuratedList) return;
    harmonyCuratedList.innerHTML = "";
    CURATED_COLOR_PALETTES.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "harmony-curated-card";
      if (state.harmonyConfig.tab === "curated" && state.harmonyConfig.curatedId === preset.id) {
        btn.classList.add("is-active");
      }
      btn.setAttribute("role", "option");

      const meta = document.createElement("div");
      meta.className = "harmony-curated-meta";
      const nameSpan = document.createElement("span");
      nameSpan.className = "harmony-curated-name";
      nameSpan.textContent = preset.name;
      const tagSpan = document.createElement("span");
      tagSpan.className = "harmony-curated-tag";
      tagSpan.textContent = preset.tag;
      meta.appendChild(nameSpan);
      meta.appendChild(tagSpan);

      const bar = document.createElement("div");
      bar.className = "harmony-curated-bar";
      preset.colors.forEach((hex) => {
        const seg = document.createElement("span");
        seg.style.backgroundColor = hex;
        bar.appendChild(seg);
      });

      btn.appendChild(meta);
      btn.appendChild(bar);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.harmonyConfig.tab = "curated";
        state.harmonyConfig.curatedId = preset.id;
        applyHarmonyFromControls({ record: true });
      });
      harmonyCuratedList.appendChild(btn);
    });
  }

  function ensureSourcePaletteForSwap(targetCount) {
    if (state.isBlankQuilt || state.activeMathPattern || !state.samplePixels) {
      return null;
    }
    if (state.sourcePalette && state.sourcePalette.length === targetCount) {
      return state.sourcePalette;
    }
    // Capture the original image's luminance-sorted clusters so swapping fabrics keeps every contour & HST
    const extracted = extractPalette(state.samplePixels, targetCount);
    state.sourcePalette = extracted.map((c) => ({ r: c.r, g: c.g, b: c.b }));
    return state.sourcePalette;
  }

  function renderHarmonyPreviewStrip() {
    if (!harmonyPreviewStrip) return;
    harmonyPreviewStrip.innerHTML = "";
    const targets = state.harmonyConfig.lastMathTargets || [];
    state.palette.forEach((color, idx) => {
      const cell = document.createElement("div");
      cell.className = "harmony-preview-cell";
      const target = targets[idx] || [color.r, color.g, color.b];
      const code = getFabricCode(idx);
      const swatchName = getFabricDisplayName(color);
      cell.title = `${code}: Math ${rgbToHex(target[0], target[1], target[2]).toUpperCase()} → ${swatchName}`;

      const mathBar = document.createElement("div");
      mathBar.className = "harmony-preview-math";
      mathBar.style.backgroundColor = `rgb(${target[0]}, ${target[1]}, ${target[2]})`;

      const sw = document.createElement("div");
      sw.className = "harmony-preview-swatch";
      sw.textContent = code;
      const isLight = luminance(color.r, color.g, color.b) > 155;
      sw.style.color = isLight ? "#221f1a" : "#ffffff";
      if (isLight) sw.style.textShadow = "0 1px 2px rgba(255,255,255,0.65)";
      if (color.patternDataUrl) {
        sw.style.backgroundImage = `url("${color.patternDataUrl}")`;
      } else {
        sw.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
      }

      cell.appendChild(mathBar);
      cell.appendChild(sw);
      harmonyPreviewStrip.appendChild(cell);
    });
  }

  function syncHarmonyPopoverUI() {
    const cfg = state.harmonyConfig;
    const isCurated = cfg.tab === "curated";
    harmonyTabBtns.forEach((btn) => {
      const active = btn.dataset.harmonyTab === (isCurated ? "curated" : "math");
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (harmonyMathPanel) harmonyMathPanel.hidden = isCurated;
    if (harmonyCuratedPanel) harmonyCuratedPanel.hidden = !isCurated;
    if (isCurated) renderCuratedPaletteList();

    const rule = HARMONY_RULE_MAP[cfg.rule] || HARMONY_RULES[0];
    if (harmonyFormulaHint) harmonyFormulaHint.textContent = rule.formula;
    harmonyRuleBtns.forEach((btn) => {
      const active = btn.dataset.harmonyRule === cfg.rule;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
    if (harmonyHueSlider) harmonyHueSlider.value = String(Math.round(cfg.baseHue));
    if (harmonyHueValue) harmonyHueValue.textContent = `${Math.round(cfg.baseHue)}°`;
    if (harmonyHueDot) {
      const [hr, hg, hb] = hslToRgb(cfg.baseHue, Math.max(55, cfg.saturation), 50);
      harmonyHueDot.style.backgroundColor = `rgb(${hr}, ${hg}, ${hb})`;
    }
    if (harmonySatSlider) harmonySatSlider.value = String(Math.round(cfg.saturation));
    if (harmonySatValue) harmonySatValue.textContent = `${Math.round(cfg.saturation)}%`;
    if (harmonyContrastSlider) harmonyContrastSlider.value = String(Math.round(cfg.contrast));
    if (harmonyContrastValue) harmonyContrastValue.textContent = `${Math.round(cfg.contrast)}%`;
    if (harmonyLibrarySelect) harmonyLibrarySelect.value = cfg.library;
    if (harmonyPreserveSlots) harmonyPreserveSlots.checked = Boolean(cfg.preserveSlots);
    if (harmonyReverseValues) harmonyReverseValues.checked = Boolean(cfg.reverseValues);
    if (harmonyMapNote) harmonyMapNote.textContent = cfg.reverseValues ? "Light → Dark" : "Dark → Light";

    const isPhotoOrMap = !state.isBlankQuilt && !state.activeMathPattern;
    if (harmonyPreserveWrap) harmonyPreserveWrap.hidden = !isPhotoOrMap;
    if (harmonyRestoreBtn) harmonyRestoreBtn.hidden = !(isPhotoOrMap && state.sourcePalette);

    renderHarmonyPreviewStrip();
  }

  function applyHarmonyFromControls({ record = true, coalesceKey = null, count = null } = {}) {
    if (!state.image) return;
    const cfg = state.harmonyConfig;
    const K = count || state.palette.length || 8;
    const isPhotoOrMap = !state.isBlankQuilt && !state.activeMathPattern;

    if (isPhotoOrMap && cfg.preserveSlots) {
      ensureSourcePaletteForSwap(K);
    } else if (isPhotoOrMap && !cfg.preserveSlots) {
      state.sourcePalette = null;
    }

    const res =
      cfg.tab === "curated"
        ? generateCuratedPalette(cfg.curatedId, K, {
            library: cfg.library,
            reverseValues: cfg.reverseValues,
          })
        : generateHarmoniousPalette(K, {
            ruleId: cfg.rule,
            baseHue: cfg.baseHue,
            saturation: cfg.saturation,
            contrast: cfg.contrast,
            library: cfg.library,
            reverseValues: cfg.reverseValues,
          });

    cfg.lastMathTargets = res.mathTargets;
    state.palette = res.palette;
    rehydratePalettePatterns();
    renderPaletteSwatches();

    if (state.activeMathPattern) {
      applyMathPattern(state.activeMathPattern, { record: false });
    } else {
      renderQuilt();
    }

    syncHarmonyPopoverUI();
    if (record) {
      const libLabel = HARMONY_LIBRARY_LABELS[cfg.library] || "Swatches";
      recordHistory(`Harmony: ${res.ruleLabel} (${libLabel})`, coalesceKey);
    }
  }

  function closeHarmonyPopover() {
    if (!harmonyPopover) return;
    harmonyPopover.hidden = true;
    if (harmonyPaletteBtn) {
      harmonyPaletteBtn.classList.remove("is-active");
      harmonyPaletteBtn.setAttribute("aria-expanded", "false");
    }
  }

  function openHarmonyPopover() {
    if (!harmonyPopover || !harmonyPaletteBtn || !state.image) return;
    if (!harmonyPopover.hidden) {
      closeHarmonyPopover();
      return;
    }
    closeHistoryPopover();
    closeSwatchPopover();
    closeMathMenuPopover();
    closeMathPropsPopover();
    closeMapPopover();

    // Seed base hue gently from the current quilt's midtone swatch if we haven't generated targets yet
    if ((!state.harmonyConfig.lastMathTargets || state.harmonyConfig.lastMathTargets.length !== state.palette.length) && state.palette.length > 0) {
      const mid = state.palette[Math.floor(state.palette.length / 2)];
      const [h, s] = rgbToHsl(mid.r, mid.g, mid.b);
      if (s > 10) state.harmonyConfig.baseHue = h;
    }

    harmonyPopover.hidden = false;
    harmonyPaletteBtn.classList.add("is-active");
    harmonyPaletteBtn.setAttribute("aria-expanded", "true");
    syncHarmonyPopoverUI();

    const rect = harmonyPaletteBtn.getBoundingClientRect();
    const popRect = harmonyPopover.getBoundingClientRect();
    const margin = 12;
    let left = rect.right + 10;
    if (left + popRect.width > window.innerWidth - margin) {
      left = Math.max(margin, rect.left - popRect.width - 10);
    }
    if (left + popRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popRect.width - margin);
    }
    let top = rect.top - 120;
    if (top + popRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - popRect.height - margin);
    }
    if (top < margin) top = margin;
    harmonyPopover.style.left = `${Math.round(left)}px`;
    harmonyPopover.style.top = `${Math.round(top)}px`;
  }

  function shuffleQuiltDesign() {
    if (!state.image) return;
    closeHistoryPopover();
    closeSwatchPopover();
    closeMathMenuPopover();
    closeHarmonyPopover();
    state.sourcePalette = null;

    // 1. Pick a fresh harmonious palette (preserving current palette size, or 6-10 fabrics)
    const targetCount = Math.max(5, Math.min(10, state.palette.length || 8));
    const res = generateHarmoniousPalette(targetCount, { library: state.harmonyConfig.library || "kona" });
    state.harmonyConfig.rule = res.ruleId;
    state.harmonyConfig.baseHue = res.baseHue;
    state.harmonyConfig.saturation = res.saturation;
    state.harmonyConfig.lastMathTargets = res.mathTargets;
    state.palette = res.palette;
    if (paletteSizeSlider) paletteSizeSlider.value = String(res.palette.length);
    rehydratePalettePatterns();

    // 2. Pick a different random pattern from all 30 generators
    const allIds = Object.keys(MATH_PATTERN_SPECS);
    const pool = allIds.filter((id) => id !== state.activeMathPattern);
    const nextId = pool[Math.floor(Math.random() * pool.length)] || allIds[0];

    // 3. Gently randomize that pattern's parameters within tasteful ranges
    const spec = MATH_PATTERN_SPECS[nextId];
    const params = getDefaultMathParams(nextId);
    if (spec && Array.isArray(spec.params)) {
      spec.params.forEach((p) => {
        if (p.type === "select" && Array.isArray(p.options) && p.options.length > 0) {
          params[p.key] = p.options[Math.floor(Math.random() * p.options.length)].value;
        } else if (p.type === "range" && p.key !== "panX" && p.key !== "panY") {
          const steps = Math.max(1, Math.round((p.max - p.min) / p.step));
          if (p.key === "zoom") {
            params[p.key] = Math.round((0.85 + Math.random() * 0.65) * 10) / 10;
          } else {
            const pick = Math.floor(Math.random() * (steps + 1));
            params[p.key] = Number((p.min + pick * p.step).toFixed(3));
          }
        }
      });
    }
    state.mathParams = params;
    state.mathTransform = { offsetX: 0, offsetY: 0, scale: 1.0, rotate: 0 };
    state.mathReversePalette = Math.random() < 0.35;

    if (state.cols < 20) {
      state.cols = syncSliderBoundsForCols(28);
      computeSquareAverages();
    }

    renderPaletteSwatches();
    applyMathPattern(nextId, { record: false });
    if (mathPropsPopover && !mathPropsPopover.hidden) {
      renderMathPropsControls();
    }
    recordHistory(`Shuffled: ${spec.label} (${res.ruleLabel})`);
  }

  if (shuffleQuiltBtn) {
    shuffleQuiltBtn.addEventListener("click", shuffleQuiltDesign);
  }

  if (harmonyPaletteBtn) {
    harmonyPaletteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openHarmonyPopover();
    });
  }

  if (harmonyPopoverClose) {
    harmonyPopoverClose.addEventListener("click", closeHarmonyPopover);
  }

  harmonyTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextTab = btn.dataset.harmonyTab === "curated" ? "curated" : "math";
      state.harmonyConfig.tab = nextTab;
      syncHarmonyPopoverUI();
    });
  });

  harmonyRuleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextRule = btn.dataset.harmonyRule;
      if (!HARMONY_RULE_MAP[nextRule]) return;
      state.harmonyConfig.tab = "math";
      state.harmonyConfig.rule = nextRule;
      applyHarmonyFromControls({ record: true, coalesceKey: "harmony-rule" });
    });
  });

  if (harmonyHueSlider) {
    harmonyHueSlider.addEventListener("input", () => {
      state.harmonyConfig.baseHue = Number(harmonyHueSlider.value);
      applyHarmonyFromControls({ record: true, coalesceKey: "harmony-hue" });
    });
  }

  if (harmonySatSlider) {
    harmonySatSlider.addEventListener("input", () => {
      state.harmonyConfig.saturation = Number(harmonySatSlider.value);
      applyHarmonyFromControls({ record: true, coalesceKey: "harmony-sat" });
    });
  }

  if (harmonyContrastSlider) {
    harmonyContrastSlider.addEventListener("input", () => {
      state.harmonyConfig.contrast = Number(harmonyContrastSlider.value);
      applyHarmonyFromControls({ record: true, coalesceKey: "harmony-contrast" });
    });
  }

  if (harmonyLibrarySelect) {
    harmonyLibrarySelect.addEventListener("change", () => {
      state.harmonyConfig.library = harmonyLibrarySelect.value || "kona";
      applyHarmonyFromControls({ record: true });
    });
  }

  function snapCurrentPaletteToLibrary(library = state.harmonyConfig.library || "kona") {
    if (!state.image || !state.palette || state.palette.length === 0) return;
    const K = state.palette.length;
    const isPhotoOrMap = !state.isBlankQuilt && !state.activeMathPattern;
    if (isPhotoOrMap && state.harmonyConfig.preserveSlots) {
      ensureSourcePaletteForSwap(K);
    }

    const targets = state.palette.map((c) => [c.r, c.g, c.b]);
    const printPool = getPrintPoolForLibrary(library);
    const usedKona = new Set();
    const usedPrints = new Set();
    const printSlots = new Set();
    if (library === "mixed" && K >= 4) {
      const printCount = Math.min(3, Math.max(1, Math.floor(K / 3)));
      for (let p = 0; p < printCount; p++) {
        const slot = Math.min(K - 2, Math.max(1, Math.round(((p + 1) / (printCount + 1)) * (K - 1))));
        printSlots.add(slot);
      }
    }

    const nextPalette = targets.map(([tr, tg, tb], i) => {
      const forcePrint = library === "kaffe" || library === "brandon" || library === "pj" || library === "prints";
      if (forcePrint || (library === "mixed" && printSlots.has(i))) {
        const bestPrint = pickClosestPrint(tr, tg, tb, printPool, usedPrints);
        if (bestPrint) {
          usedPrints.add(bestPrint.id);
          return {
            id: state.nextColorId++,
            r: bestPrint.rgb[0],
            g: bestPrint.rgb[1],
            b: bestPrint.rgb[2],
            patternDataUrl: getPhilipJacobsDataUrl(bestPrint),
            patternName: bestPrint.name,
            patternAvgRgb: [...bestPrint.rgb],
            patternScale: 1.0,
            patternCutMode: "repeat",
            libraryId: bestPrint.id,
          };
        }
      }
      if (library === "pure") {
        return { id: state.nextColorId++, r: tr, g: tg, b: tb };
      }
      const bestKona = pickClosestKona(tr, tg, tb, usedKona);
      usedKona.add(bestKona[5]);
      return { id: state.nextColorId++, r: bestKona[1], g: bestKona[2], b: bestKona[3] };
    });

    state.harmonyConfig.lastMathTargets = targets;
    state.palette = nextPalette;
    rehydratePalettePatterns();
    renderPaletteSwatches();
    if (state.activeMathPattern) {
      applyMathPattern(state.activeMathPattern, { record: false });
    } else {
      renderQuilt();
    }
    syncSwatchPopover();
    syncHarmonyPopoverUI();
    const libLabel = library === "pure" ? "Solid Colors" : HARMONY_LIBRARY_LABELS[library] || "Fabric Catalog";
    recordHistory(`Snapped palette to ${libLabel}`);
  }

  if (harmonySnapCurrentBtn) {
    harmonySnapCurrentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      snapCurrentPaletteToLibrary(harmonyLibrarySelect ? harmonyLibrarySelect.value : state.harmonyConfig.library);
    });
  }

  if (harmonyPreserveSlots) {
    harmonyPreserveSlots.addEventListener("change", () => {
      state.harmonyConfig.preserveSlots = harmonyPreserveSlots.checked;
      applyHarmonyFromControls({ record: true });
    });
  }

  if (harmonyReverseValues) {
    harmonyReverseValues.addEventListener("change", () => {
      state.harmonyConfig.reverseValues = harmonyReverseValues.checked;
      applyHarmonyFromControls({ record: true });
    });
  }

  if (harmonyRollBtn) {
    harmonyRollBtn.addEventListener("click", () => {
      if (state.harmonyConfig.tab === "curated") {
        const others = CURATED_COLOR_PALETTES.filter((p) => p.id !== state.harmonyConfig.curatedId);
        const picked = others[Math.floor(Math.random() * others.length)] || CURATED_COLOR_PALETTES[0];
        state.harmonyConfig.curatedId = picked.id;
        applyHarmonyFromControls({ record: true });
        return;
      }
      const otherRules = HARMONY_RULES.filter((r) => r.id !== state.harmonyConfig.rule);
      const picked = otherRules[Math.floor(Math.random() * otherRules.length)] || HARMONY_RULES[0];
      state.harmonyConfig.rule = picked.id;
      state.harmonyConfig.baseHue = Math.floor(Math.random() * 360);
      state.harmonyConfig.saturation = Math.round(46 + Math.random() * 32);
      applyHarmonyFromControls({ record: true });
    });
  }

  if (harmonyRestoreBtn) {
    harmonyRestoreBtn.addEventListener("click", () => {
      if (!state.samplePixels) return;
      const targetColors = state.palette.length || Number(paletteSizeSlider.value) || 8;
      state.sourcePalette = null;
      state.harmonyConfig.lastMathTargets = [];
      state.palette = extractPalette(state.samplePixels, targetColors);
      renderPaletteSwatches();
      renderQuilt();
      syncHarmonyPopoverUI();
      recordHistory("Restored original photo palette");
    });
  }

  document.addEventListener("click", (e) => {
    if (!harmonyPopover || harmonyPopover.hidden) return;
    if (harmonyPopover.contains(e.target) || (harmonyPaletteBtn && harmonyPaletteBtn.contains(e.target))) return;
    closeHarmonyPopover();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && harmonyPopover && !harmonyPopover.hidden) {
      closeHarmonyPopover();
    }
  });

  // --- Map & Satellite Quilt Generator (Nominatim Geocoding + CORS Tile Stitcher) ---
  const MAP_KNOWN_COORDS = {
    "samish island, wa": { lat: 48.5795, lon: -122.5364, label: "Samish Island, WA" },
    "venice, italy": { lat: 45.4371, lon: 12.3326, label: "Venice, Italy" },
    "grand canyon, az": { lat: 36.1069, lon: -112.1129, label: "Grand Canyon, AZ" },
    "mount rainier, wa": { lat: 46.8523, lon: -121.7603, label: "Mount Rainier, WA" },
  };

  function getMapTileUrl(style, z, x, y) {
    if (style === "voyager") {
      return `https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}.png`;
    }
    if (style === "topo") {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`;
    }
    if (style === "relief") {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/${z}/${y}/${x}`;
    }
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }

  function latLonToFracTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const latRad = (lat * Math.PI) / 180;
    const fx = ((lon + 180) / 360) * n;
    const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    return { fx, fy, n };
  }

  function fracTileToLatLon(fx, fy, zoom) {
    const n = Math.pow(2, zoom);
    const lon = (fx / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * fy) / n)));
    const lat = (latRad * 180) / Math.PI;
    return { lat: Math.max(-85, Math.min(85, lat)), lon: ((lon + 180) % 360 + 360) % 360 - 180 };
  }

  function setMapStatus(msg, isError = false) {
    if (!mapStatus) return;
    mapStatus.textContent = msg || "";
    mapStatus.hidden = !msg;
    mapStatus.classList.toggle("is-error", Boolean(isError));
  }

  function closeMapPopover() {
    if (!mapPopover) return;
    mapPopover.hidden = true;
  }

  function openMapPopover(initialStyle = null) {
    if (!mapPopover) return;
    closeHistoryPopover();
    closeSwatchPopover();
    closeMathPropsPopover();
    closeMathMenuPopover();
    if (initialStyle && mapStyleSelect) {
      mapStyleSelect.value = initialStyle;
    }
    setMapStatus("");
    mapPopover.hidden = false;

    const anchor = mathMenuBtn || previewToolbar;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const popRect = mapPopover.getBoundingClientRect();
      const margin = 12;
      let left = rect.left;
      if (left + popRect.width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - popRect.width - margin);
      }
      let top = rect.bottom + 8;
      if (top + popRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - popRect.height - margin);
      }
      mapPopover.style.left = `${Math.round(left)}px`;
      mapPopover.style.top = `${Math.round(top)}px`;
    }
    if (mapLocationInput) {
      mapLocationInput.focus();
      mapLocationInput.select();
    }
  }

  async function geocodeLocation(query) {
    const clean = String(query || "").trim();
    if (!clean) throw new Error("Please enter a location.");

    // Direct lat, lon input (e.g., "48.58, -122.54")
    const coordMatch = clean.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = Number(coordMatch[1]);
      const lon = Number(coordMatch[2]);
      if (lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
        return { lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
      }
    }

    const known = MAP_KNOWN_COORDS[clean.toLowerCase()];
    if (known) return known;

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Location lookup failed. Try entering lat, lon coordinates.");
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Could not find "${clean}". Try adding a state or country.`);
    }
    const first = rows[0];
    const shortName = String(first.display_name || clean).split(",").slice(0, 2).join(",").trim();
    return { lat: Number(first.lat), lon: Number(first.lon), label: shortName || clean };
  }

  function loadTileImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Map tile failed to load"));
      img.src = url;
    });
  }

  async function loadMapAtCoords(loc, style, zoom, extractColors, { record = true, closeDialog = true } = {}) {
    if (mapLoadBtn) mapLoadBtn.disabled = true;
    try {
      setMapStatus("Loading map tiles…");
      const z = Math.max(6, Math.min(16, Math.round(Number(zoom) || 13)));
      const { fx, fy, n } = latLonToFracTile(loc.lat, loc.lon, z);
      const centerTileX = Math.floor(fx);
      const centerTileY = Math.floor(fy);

      // Stitch a 3x3 grid of 256px tiles and crop a centered 512x512 square around (lat, lon)
      const stitch = document.createElement("canvas");
      stitch.width = 768;
      stitch.height = 768;
      const sctx = stitch.getContext("2d");

      const jobs = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = ((centerTileX + dx) % n + n) % n;
          const ty = Math.max(0, Math.min(n - 1, centerTileY + dy));
          const url = getMapTileUrl(style, z, tx, ty);
          jobs.push(
            loadTileImage(url).then((tileImg) => {
              sctx.drawImage(tileImg, (dx + 1) * 256, (dy + 1) * 256, 256, 256);
            })
          );
        }
      }
      await Promise.all(jobs);

      const offsetPxX = Math.round((fx - centerTileX) * 256);
      const offsetPxY = Math.round((fy - centerTileY) * 256);
      const cropX = Math.max(0, Math.min(256, 256 + offsetPxX - 256));
      const cropY = Math.max(0, Math.min(256, 256 + offsetPxY - 256));

      const out = document.createElement("canvas");
      out.width = 512;
      out.height = 512;
      out.getContext("2d").drawImage(stitch, cropX, cropY, 512, 512, 0, 0, 512, 512);
      const mapDataUrl = out.toDataURL("image/jpeg", 0.92);

      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          state.image = img;
          state.fileName = `${loc.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;
          state.isBlankQuilt = false;
          state.activeMathPattern = "";
          state.activeMap = {
            lat: loc.lat,
            lon: loc.lon,
            zoom: z,
            style,
            label: loc.label,
            extractColors: Boolean(extractColors),
            stitchCanvas: stitch,
            cropX,
            cropY,
          };
          state.crop = { x: 0, y: 0, w: 1, h: 1 };
          state.paintMask.fill(0);
          state.manualCells.clear();
          syncProjectTitle(loc.label);
          closeCropStage();
          rebuildSampleBuffer();
          if (extractColors) {
            const targetColors = Number(paletteSizeSlider.value) || 8;
            state.sourcePalette = null;
            state.palette = extractPalette(state.samplePixels, targetColors);
          }
          if (state.cols < 20) {
            state.cols = syncSliderBoundsForCols(28);
          }
          syncBlankQuiltUI();
          syncGridLayoutUI();
          syncMathPropsButton();
          computeSquareAverages();
          renderPaletteSwatches();
          renderQuilt();
          if (record) {
            const styleNames = { satellite: "Satellite", voyager: "Map", topo: "Topo Map", relief: "Terrain" };
            recordHistory(`Map (${styleNames[style] || "Satellite"}): ${loc.label}`);
          }
          resolve();
        };
        img.onerror = () => reject(new Error("Could not render stitched map image"));
        img.src = mapDataUrl;
      });

      setMapStatus("");
      if (closeDialog) closeMapPopover();
    } catch (err) {
      setMapStatus(err?.message || "Could not load map tiles.", true);
    } finally {
      if (mapLoadBtn) mapLoadBtn.disabled = false;
    }
  }

  async function generateMapQuilt(query, style, zoom, extractColors) {
    if (mapLoadBtn) mapLoadBtn.disabled = true;
    try {
      setMapStatus("Finding location…");
      const loc = await geocodeLocation(query);
      await loadMapAtCoords(loc, style, zoom, extractColors, { record: true, closeDialog: true });
    } catch (err) {
      setMapStatus(err?.message || "Could not load map tiles.", true);
      if (mapLoadBtn) mapLoadBtn.disabled = false;
    }
  }

  // --- Direct Canvas Drag-to-Frame for Both Satellite/Map Quilts & Mathematical/Fractal Patterns ---
  let activeCanvasPan = null;

  function renderMapCropPreview(mapInfo, previewCropX, previewCropY) {
    if (!mapInfo || !mapInfo.stitchCanvas) return;
    const clampedX = Math.max(0, Math.min(256, Math.round(previewCropX)));
    const clampedY = Math.max(0, Math.min(256, Math.round(previewCropY)));
    const maxSample = 400;
    const offscreen = document.createElement("canvas");
    offscreen.width = maxSample;
    offscreen.height = maxSample;
    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    offCtx.drawImage(mapInfo.stitchCanvas, clampedX, clampedY, 512, 512, 0, 0, maxSample, maxSample);
    state.sampleWidth = maxSample;
    state.sampleHeight = maxSample;
    state.samplePixels = offCtx.getImageData(0, 0, maxSample, maxSample).data;
    computeSquareAverages();
    renderQuilt();
  }

  quiltCanvas.addEventListener("pointerdown", (e) => {
    if (state.paintMode || !state.image || state.showingOriginal) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    let panMode = null;
    if (state.activeMap) {
      panMode = "map";
    } else if (state.activeMathPattern) {
      panMode = "math";
    } else if (state.panMode && state.isBlankQuilt && state.manualCells.size > 0) {
      panMode = "painted";
    } else if (state.panMode && !state.isBlankQuilt && (state.crop.w < 0.999 || state.crop.h < 0.999)) {
      panMode = "crop";
    }
    if (!panMode) return;

    const rect = quiltCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    e.preventDefault();
    try {
      quiltCanvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    quiltCanvas.classList.add("is-dragging");
    activeCanvasPan = {
      pointerId: e.pointerId,
      mode: panMode,
      startX: e.clientX,
      startY: e.clientY,
      rectW: rect.width,
      rectH: rect.height,
      origOffX: Number(state.mathTransform?.offsetX) || 0,
      origOffY: Number(state.mathTransform?.offsetY) || 0,
      origCropX: state.activeMap ? state.activeMap.cropX : state.crop.x,
      origCropY: state.activeMap ? state.activeMap.cropY : state.crop.y,
      origManualCells:
        panMode === "painted"
          ? Array.from(state.manualCells.entries()).map(([k, v]) => {
              const [c, r] = k.split(",").map(Number);
              return { c, r, v: { ...v } };
            })
          : null,
      lastShiftCol: 0,
      lastShiftRow: 0,
      moved: false,
    };
  });

  quiltCanvas.addEventListener("pointermove", (e) => {
    if (!activeCanvasPan || e.pointerId !== activeCanvasPan.pointerId) return;
    const dx = e.clientX - activeCanvasPan.startX;
    const dy = e.clientY - activeCanvasPan.startY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !activeCanvasPan.moved) return;
    activeCanvasPan.moved = true;
    e.preventDefault();

    if (activeCanvasPan.mode === "math" && state.activeMathPattern) {
      const nextX = Math.max(-0.75, Math.min(0.75, activeCanvasPan.origOffX + dx / activeCanvasPan.rectW));
      const nextY = Math.max(-0.75, Math.min(0.75, activeCanvasPan.origOffY + dy / activeCanvasPan.rectH));
      state.mathTransform.offsetX = Number(nextX.toFixed(3));
      state.mathTransform.offsetY = Number(nextY.toFixed(3));
      applyMathPattern(state.activeMathPattern, { record: false });
      if (mathPropsPopover && !mathPropsPopover.hidden) {
        renderMathPropsControls();
      }
    } else if (activeCanvasPan.mode === "map" && state.activeMap) {
      const tileDx = (dx / activeCanvasPan.rectW) * 512;
      const tileDy = (dy / activeCanvasPan.rectH) * 512;
      renderMapCropPreview(state.activeMap, activeCanvasPan.origCropX - tileDx, activeCanvasPan.origCropY - tileDy);
    } else if (activeCanvasPan.mode === "painted" && activeCanvasPan.origManualCells) {
      const dCol = Math.round((dx / activeCanvasPan.rectW) * state.cols);
      const dRow = Math.round((dy / activeCanvasPan.rectH) * state.rows);
      if (dCol === activeCanvasPan.lastShiftCol && dRow === activeCanvasPan.lastShiftRow) return;
      activeCanvasPan.lastShiftCol = dCol;
      activeCanvasPan.lastShiftRow = dRow;
      state.manualCells.clear();
      for (let i = 0; i < activeCanvasPan.origManualCells.length; i++) {
        const entry = activeCanvasPan.origManualCells[i];
        const nc = entry.c + dCol;
        const nr = entry.r + dRow;
        if (nc >= 0 && nc < state.cols && nr >= 0 && nr < state.rows) {
          state.manualCells.set(`${nc},${nr}`, { ...entry.v });
        }
      }
      renderQuilt();
    } else if (activeCanvasPan.mode === "crop") {
      const maxX = Math.max(0, 1 - state.crop.w);
      const maxY = Math.max(0, 1 - state.crop.h);
      const nextX = Math.max(0, Math.min(maxX, activeCanvasPan.origCropX - (dx / activeCanvasPan.rectW) * state.crop.w));
      const nextY = Math.max(0, Math.min(maxY, activeCanvasPan.origCropY - (dy / activeCanvasPan.rectH) * state.crop.h));
      state.crop.x = nextX;
      state.crop.y = nextY;
      rebuildSampleBuffer();
      computeSquareAverages();
      renderQuilt();
    }
  });

  const finishCanvasPan = (e) => {
    if (!activeCanvasPan) return;
    if (e && typeof e.pointerId === "number" && e.pointerId !== activeCanvasPan.pointerId) return;
    const pan = activeCanvasPan;
    activeCanvasPan = null;
    quiltCanvas.classList.remove("is-dragging");
    if (!pan.moved) return;

    const dx = (e ? e.clientX : pan.startX) - pan.startX;
    const dy = (e ? e.clientY : pan.startY) - pan.startY;

    if (pan.mode === "math" && state.activeMathPattern) {
      const spec = MATH_PATTERN_SPECS[state.activeMathPattern];
      recordHistory(`Repositioned ${spec ? spec.label : "pattern"}`, "math-pan");
    } else if (pan.mode === "map" && state.activeMap) {
      const mapInfo = state.activeMap;
      const deltaTilesX = ((dx / pan.rectW) * 512) / 256;
      const deltaTilesY = ((dy / pan.rectH) * 512) / 256;
      const { fx, fy } = latLonToFracTile(mapInfo.lat, mapInfo.lon, mapInfo.zoom);
      const nextCoords = fracTileToLatLon(fx - deltaTilesX, fy - deltaTilesY, mapInfo.zoom);
      loadMapAtCoords(
        { lat: nextCoords.lat, lon: nextCoords.lon, label: mapInfo.label },
        mapInfo.style,
        mapInfo.zoom,
        false, // Keep current palette while reframing!
        { record: true, closeDialog: false }
      );
    } else if (pan.mode === "painted") {
      if (pan.lastShiftCol !== 0 || pan.lastShiftRow !== 0) {
        recordHistory("Repositioned painted design");
      }
    } else if (pan.mode === "crop") {
      updateCropButtonBadge();
      recordHistory("Repositioned photo crop");
    }
  };

  quiltCanvas.addEventListener("pointerup", finishCanvasPan);
  quiltCanvas.addEventListener("pointercancel", finishCanvasPan);

  if (mapPopoverClose) {
    mapPopoverClose.addEventListener("click", closeMapPopover);
  }
  if (mapZoomSlider && mapZoomValue) {
    mapZoomSlider.addEventListener("input", () => {
      mapZoomValue.textContent = mapZoomSlider.value;
    });
  }
  mapQuickChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (mapLocationInput) mapLocationInput.value = chip.dataset.mapLoc || "";
      if (mapZoomSlider && chip.dataset.mapZoom) {
        mapZoomSlider.value = chip.dataset.mapZoom;
        if (mapZoomValue) mapZoomValue.textContent = chip.dataset.mapZoom;
      }
    });
  });
  if (mapForm) {
    mapForm.addEventListener("submit", (e) => {
      e.preventDefault();
      generateMapQuilt(
        mapLocationInput ? mapLocationInput.value : "",
        mapStyleSelect ? mapStyleSelect.value : "satellite",
        mapZoomSlider ? mapZoomSlider.value : 13,
        mapExtractPalette ? mapExtractPalette.checked : true
      );
    });
  }
  document.addEventListener("click", (e) => {
    if (!mapPopover || mapPopover.hidden) return;
    if (mapPopover.contains(e.target)) return;
    if (e.target === mathMenuBtn || (e.target.closest && e.target.closest("#math-menu-btn"))) return;
    closeMapPopover();
  });

  if (gridLayoutSelect) {
    gridLayoutSelect.addEventListener("change", () => {
      const nextLayout = GRID_LAYOUTS[gridLayoutSelect.value] ? gridLayoutSelect.value : "grid";
      if (nextLayout === state.gridLayout) return;
      state.gridLayout = nextLayout;
      syncGridLayoutUI();
      if (state.image) {
        computeSquareAverages();
        if (state.activeMathPattern) {
          applyMathPattern(state.activeMathPattern, { record: false });
        } else {
          renderQuilt();
        }
        recordHistory(`Layout: ${getLayoutConfig(nextLayout).label}`);
      }
    });
  }

  function redrawPreviewWithOverlayOnly() {
    if (!state.image || state.palette.length === 0 || state.showingOriginal) return;
    const cols = state.cols;
    const rows = state.rows;
    const cellW = state.layoutCellW || Math.round(quiltCanvas.width / Math.max(1, cols));
    const cellH = state.layoutCellH || Math.round(quiltCanvas.height / Math.max(1, rows));
    const squarePx = Math.min(cellW, cellH);
    drawQuiltCellsToContext(quiltCtx, cols, rows, squarePx, {
      grayscale: false,
      showSeams: state.showSeamLines,
      cellW,
      cellH,
    });
    drawPaintCursorOverlay(squarePx);
  }

  function drawPaintCursorOverlay(squarePx) {
    if (!state.paintMode || !paintHoverCell || squarePx <= 0) return;
    const cfg = getLayoutConfig();
    if (cfg.stagger !== "none" && state.layoutCells.length > 0) {
      const cellW = state.layoutCellW || squarePx;
      const cellH = state.layoutCellH || squarePx;
      const hovered =
        paintHoverCell.cellIdx != null
          ? state.layoutCells[paintHoverCell.cellIdx]
          : state.layoutCells.find((item) => item.c === paintHoverCell.col && item.r === paintHoverCell.row);
      if (!hovered) return;
      const bx = Math.round(hovered.x0 * cellW);
      const by = Math.round(hovered.y0 * cellH);
      const bw = Math.max(2, Math.round(hovered.x1 * cellW) - bx);
      const bh = Math.max(2, Math.round(hovered.y1 * cellH) - by);
      quiltCtx.save();
      quiltCtx.fillStyle = "rgba(184, 77, 44, 0.18)";
      quiltCtx.fillRect(bx, by, bw, bh);
      quiltCtx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      quiltCtx.lineWidth = 3;
      quiltCtx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      quiltCtx.strokeStyle = "#b84d2c";
      quiltCtx.lineWidth = 1.6;
      quiltCtx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      quiltCtx.restore();
      return;
    }
    const cols = state.cols;
    const rows = state.rows;
    const half = Math.floor(state.paintSize / 2);
    const c0 = Math.max(0, paintHoverCell.col - half);
    const c1 = Math.min(cols - 1, paintHoverCell.col + half);
    const r0 = Math.max(0, paintHoverCell.row - half);
    const r1 = Math.min(rows - 1, paintHoverCell.row + half);

    const bx = c0 * squarePx;
    const by = r0 * squarePx;
    const bw = (c1 - c0 + 1) * squarePx;
    const bh = (r1 - r0 + 1) * squarePx;

    quiltCtx.save();
    if (state.paintBrush === "hst") {
      // Light footprint wash + highlight ONLY the cells inside the brush where triangles actually smooth an edge!
      quiltCtx.fillStyle = "rgba(184, 77, 44, 0.08)";
      quiltCtx.fillRect(bx, by, bw, bh);

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const diag = state.smoothableDiag[r * cols + c] || 0;
          if (diag > 0) {
            const cx = c * squarePx;
            const cy = r * squarePx;
            quiltCtx.fillStyle = "rgba(184, 77, 44, 0.28)";
            quiltCtx.fillRect(cx, cy, squarePx, squarePx);
            if (squarePx >= 8) {
              quiltCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
              quiltCtx.lineWidth = 1.5;
              quiltCtx.beginPath();
              if (diag === 1) {
                quiltCtx.moveTo(cx + 1.5, cy + squarePx - 1.5);
                quiltCtx.lineTo(cx + squarePx - 1.5, cy + 1.5);
              } else {
                quiltCtx.moveTo(cx + 1.5, cy + 1.5);
                quiltCtx.lineTo(cx + squarePx - 1.5, cy + squarePx - 1.5);
              }
              quiltCtx.stroke();
            }
          }
        }
      }
    } else {
      quiltCtx.fillStyle =
        state.paintBrush === "square" ? "rgba(58, 107, 124, 0.18)" : "rgba(34, 31, 26, 0.14)";
      quiltCtx.fillRect(bx, by, bw, bh);
    }

    // Crisp dual-stroke brush outline (white halo + terracotta/slate inner border)
    quiltCtx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    quiltCtx.lineWidth = 3;
    quiltCtx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    quiltCtx.strokeStyle =
      state.paintBrush === "hst" ? "#b84d2c" : state.paintBrush === "square" ? "#3a6b7c" : "#46413a";
    quiltCtx.lineWidth = 1.6;
    quiltCtx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    // Shift+Click straight-line preview from lastPaintedCell to hovered cell
    if (shiftHeld && lastPaintedCell && !activePaintStroke && state.paintBrush !== "fill") {
      const x0 = (lastPaintedCell.col + 0.5) * squarePx;
      const y0 = (lastPaintedCell.row + 0.5) * squarePx;
      const x1 = (paintHoverCell.col + 0.5) * squarePx;
      const y1 = (paintHoverCell.row + 0.5) * squarePx;
      quiltCtx.save();
      quiltCtx.setLineDash([6, 4]);
      quiltCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      quiltCtx.lineWidth = 3.2;
      quiltCtx.beginPath();
      quiltCtx.moveTo(x0, y0);
      quiltCtx.lineTo(x1, y1);
      quiltCtx.stroke();
      quiltCtx.strokeStyle = "#b84d2c";
      quiltCtx.lineWidth = 1.6;
      quiltCtx.beginPath();
      quiltCtx.moveTo(x0, y0);
      quiltCtx.lineTo(x1, y1);
      quiltCtx.stroke();
      quiltCtx.restore();
    }
    quiltCtx.restore();
  }

  function clientToQuiltCell(clientX, clientY) {
    const rect = quiltCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    const gx = fx * state.cols;
    const gy = fy * state.rows;
    const cfg = getLayoutConfig();
    if (cfg.stagger !== "none" && state.layoutCells.length > 0) {
      const cellIdx = lookupLayoutCellIndex(gx, gy, state.cols, state.rows, cfg.id);
      const cell = state.layoutCells[cellIdx];
      if (!cell) return null;
      return {
        col: cell.c,
        row: cell.r,
        cellIdx,
        localX: (gx - cell.x0) / Math.max(1e-4, cell.x1 - cell.x0),
        localY: (gy - cell.y0) / Math.max(1e-4, cell.y1 - cell.y0),
      };
    }
    const col = Math.max(0, Math.min(state.cols - 1, Math.floor(gx)));
    const row = Math.max(0, Math.min(state.rows - 1, Math.floor(gy)));
    return { col, row, cellIdx: row * state.cols + col, localX: gx - col, localY: gy - row };
  }

  function ensureHstEnabledForTrianglePaint() {
    if (!state.hstEnabled) {
      state.hstEnabled = true;
      setHstPlacementMode("ratio");
      state.hstRatio = 0;
      if (hstToggle) hstToggle.checked = true;
      if (hstControls) hstControls.hidden = false;
      if (hstRatioSlider) hstRatioSlider.value = "0";
      updateQuiltDimensions();
    }
  }

  function applyFloodFill(startCol, startRow) {
    const cols = state.cols;
    const rows = state.rows;
    const cfg = getLayoutConfig();
    const targetIdx = Math.max(0, Math.min(state.palette.length - 1, state.paintFabricIdx));

    if (cfg.stagger !== "none" && state.layoutCells.length > 0) {
      const cells = state.layoutCells;
      const startCell = cells.find((item) => item.c === startCol && item.r === startRow);
      if (!startCell) return false;
      const startA = state.gridAssignments[startCell.idx] ?? 0;
      if (startA === targetIdx) return false;

      const visited = new Uint8Array(cells.length);
      const queue = [startCell];
      visited[startCell.idx] = 1;
      let changed = false;

      while (queue.length > 0) {
        const cur = queue.shift();
        if ((state.gridAssignments[cur.idx] ?? 0) !== startA) continue;
        state.manualCells.set(`${cur.c},${cur.r}`, { t: 0, a: targetIdx, b: -1 });
        changed = true;
        // Find geometrically touching neighbor tiles (shared edge of non-zero length)
        for (let i = 0; i < cells.length; i++) {
          if (visited[i]) continue;
          const nb = cells[i];
          const touchX = Math.abs(nb.x0 - cur.x1) < 1e-4 || Math.abs(cur.x0 - nb.x1) < 1e-4;
          const overlapY = Math.min(cur.y1, nb.y1) - Math.max(cur.y0, nb.y0) > 1e-4;
          const touchY = Math.abs(nb.y0 - cur.y1) < 1e-4 || Math.abs(cur.y0 - nb.y1) < 1e-4;
          const overlapX = Math.min(cur.x1, nb.x1) - Math.max(cur.x0, nb.x0) > 1e-4;
          if ((touchX && overlapY) || (touchY && overlapX)) {
            visited[i] = 1;
            queue.push(nb);
          }
        }
      }
      return changed;
    }

    const startCellIdx = startRow * cols + startCol;
    const startType = state.cellTypes[startCellIdx] || 0;
    const startA = state.gridAssignments[startCellIdx] ?? 0;
    const startB = state.gridAssignmentsB[startCellIdx] ?? -1;
    if (startType === 0 && startA === targetIdx) return false;

    const visited = new Uint8Array(cols * rows);
    const queue = [[startCol, startRow]];
    visited[startCellIdx] = 1;
    let changed = false;

    while (queue.length > 0) {
      const [c, r] = queue.shift();
      const idx = r * cols + c;
      if ((state.cellTypes[idx] || 0) !== startType || state.gridAssignments[idx] !== startA || state.gridAssignmentsB[idx] !== startB) {
        continue;
      }
      state.manualCells.set(`${c},${r}`, { t: 0, a: targetIdx, b: -1 });
      changed = true;
      const neighbors = [
        [c + 1, r],
        [c - 1, r],
        [c, r + 1],
        [c, r - 1],
      ];
      for (let k = 0; k < neighbors.length; k++) {
        const [nc, nr] = neighbors[k];
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const nIdx = nr * cols + nc;
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          queue.push([nc, nr]);
        }
      }
    }
    return changed;
  }

  function applyBrushDab(centerCol, centerRow, localX = 0.25, localY = 0.25) {
    const cols = state.cols;
    const rows = state.rows;
    const brush = state.paintBrush;

    if (brush === "fill") {
      return applyFloodFill(centerCol, centerRow);
    }

    if (brush === "color" || brush === "hst-slash" || brush === "hst-back") {
      const pIdx = Math.max(0, Math.min(state.palette.length - 1, state.paintFabricIdx));
      const cfg = getLayoutConfig();
      if (cfg.stagger !== "none") {
        const key = `${centerCol},${centerRow}`;
        const prev = state.manualCells.get(key);
        if (!prev || prev.t !== 0 || prev.a !== pIdx) {
          state.manualCells.set(key, { t: 0, a: pIdx, b: -1 });
          return true;
        }
        return false;
      }
      const half = brush === "color" ? Math.floor(state.paintSize / 2) : 0;
      let changed = false;
      for (let r = centerRow - half; r <= centerRow + half; r++) {
        for (let c = centerCol - half; c <= centerCol + half; c++) {
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
          const key = `${c},${r}`;
          const cellIdx = r * cols + c;
          if (brush === "color") {
            const prev = state.manualCells.get(key);
            if (!prev || prev.t !== 0 || prev.a !== pIdx) {
              state.manualCells.set(key, { t: 0, a: pIdx, b: -1 });
              changed = true;
            }
          } else {
            const diagType = brush === "hst-slash" ? 1 : 2;
            // Determine which half of the square was clicked:
            // '/' (type 1): TL is localX + localY < 1 (Half A), BR is >= 1 (Half B)
            // '\' (type 2): BL is localY > localX (Half A), TR is <= localX (Half B)
            const isHalfA = diagType === 1 ? localX + localY < 1 : localY > localX;
            const curType = state.cellTypes[cellIdx] || 0;
            const curA = state.gridAssignments[cellIdx] ?? 0;
            const curB = curType !== 0 && state.gridAssignmentsB[cellIdx] >= 0 ? state.gridAssignmentsB[cellIdx] : curA;
            const nextA = isHalfA ? pIdx : curA;
            const nextB = isHalfA ? curB : pIdx;
            state.manualCells.set(key, { t: diagType, a: nextA, b: nextB });
            changed = true;
          }
        }
      }
      return changed;
    }

    const half = Math.floor(state.paintSize / 2);
    const prefVal = brush === "hst" ? 2 : brush === "square" ? 1 : 0;
    let changed = false;
    for (let r = centerRow - half; r <= centerRow + half; r++) {
      for (let c = centerCol - half; c <= centerCol + half; c++) {
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        if (brush === "auto") {
          if (state.manualCells.delete(`${c},${r}`)) changed = true;
        }
        // When painting with △ Smooth Edges, only mark cells where an HST actually smooths an edge
        if (prefVal === 2 && state.smoothableDiag.length === cols * rows && state.smoothableDiag[r * cols + c] === 0) {
          continue;
        }
        if (writeCellPaintPref(c, r, cols, rows, prefVal)) {
          changed = true;
        }
      }
    }
    if (changed && prefVal === 2) {
      ensureHstEnabledForTrianglePaint();
    }
    return changed;
  }

  function applyBrushSegment(c0, r0, c1, r1, localX = 0.25, localY = 0.25) {
    let changed = false;
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
    if (steps === 0) {
      return applyBrushDab(c0, r0, localX, localY);
    }
    for (let s = 0; s <= steps; s++) {
      const col = Math.round(c0 + ((c1 - c0) * s) / steps);
      const row = Math.round(r0 + ((r1 - r0) * s) / steps);
      if (applyBrushDab(col, row, localX, localY)) changed = true;
    }
    return changed;
  }

  quiltCanvas.addEventListener("pointerdown", (e) => {
    if (!state.paintMode || !state.image || state.showingOriginal) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const cell = clientToQuiltCell(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    try {
      quiltCanvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic event without active pointer
    }
    shiftHeld = Boolean(e.shiftKey);
    paintHoverCell = cell;
    const cellIdx = cell.row * state.cols + cell.col;
    const initialPref = sampleCellPaintPref(cell.col, cell.row, state.cols, state.rows);
    const initialDiag = state.cellTypes[cellIdx] || 0;
    activePaintStroke = {
      pointerId: e.pointerId,
      startCol: cell.col,
      startRow: cell.row,
      lastCol: cell.col,
      lastRow: cell.row,
      initialPref,
      initialDiag,
      movedCell: false,
      lockAxis: null,
    };
    // Shift+Click draws a straight line from the previous painted cell to this cell
    let changed = false;
    if (e.shiftKey && lastPaintedCell && state.paintBrush !== "fill") {
      changed = applyBrushSegment(
        lastPaintedCell.col,
        lastPaintedCell.row,
        cell.col,
        cell.row,
        cell.localX,
        cell.localY
      );
      activePaintStroke.movedCell = true;
    } else {
      changed = applyBrushDab(cell.col, cell.row, cell.localX, cell.localY);
    }
    lastPaintedCell = { col: cell.col, row: cell.row };
    if (changed) {
      renderQuilt();
    } else {
      redrawPreviewWithOverlayOnly();
    }
  });

  quiltCanvas.addEventListener("pointermove", (e) => {
    if (!state.paintMode || !state.image) return;
    shiftHeld = Boolean(e.shiftKey);
    const cell = clientToQuiltCell(e.clientX, e.clientY);
    if (!activePaintStroke) {
      if (
        (cell && (!paintHoverCell || cell.col !== paintHoverCell.col || cell.row !== paintHoverCell.row)) ||
        (!cell && paintHoverCell)
      ) {
        paintHoverCell = cell;
        redrawPreviewWithOverlayOnly();
      }
      return;
    }
    if (e.pointerId !== activePaintStroke.pointerId || !cell) return;
    if (state.paintBrush === "fill") return;
    e.preventDefault();

    // Hold Shift while dragging to lock to a straight horizontal, vertical, or 45° diagonal line
    let targetCol = cell.col;
    let targetRow = cell.row;
    if (e.shiftKey) {
      const snapped = snapCellToStraightAxis(
        activePaintStroke.startCol,
        activePaintStroke.startRow,
        cell.col,
        cell.row,
        activePaintStroke.lockAxis
      );
      targetCol = snapped.col;
      targetRow = snapped.row;
      if (snapped.axis) activePaintStroke.lockAxis = snapped.axis;
    } else {
      activePaintStroke.lockAxis = null;
    }

    paintHoverCell = { ...cell, col: targetCol, row: targetRow };
    if (targetCol !== activePaintStroke.lastCol || targetRow !== activePaintStroke.lastRow) {
      activePaintStroke.movedCell = true;
      const changed = applyBrushSegment(
        activePaintStroke.lastCol,
        activePaintStroke.lastRow,
        targetCol,
        targetRow,
        cell.localX,
        cell.localY
      );
      activePaintStroke.lastCol = targetCol;
      activePaintStroke.lastRow = targetRow;
      lastPaintedCell = { col: targetCol, row: targetRow };
      if (changed) {
        renderQuilt();
      } else {
        redrawPreviewWithOverlayOnly();
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift" && !shiftHeld) {
      shiftHeld = true;
      if (state.paintMode && paintHoverCell) redrawPreviewWithOverlayOnly();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift" && shiftHeld) {
      shiftHeld = false;
      if (state.paintMode && paintHoverCell) redrawPreviewWithOverlayOnly();
    }
  });

  const finishPaintStroke = (e) => {
    if (!activePaintStroke) return;
    if (e && typeof e.pointerId === "number" && e.pointerId !== activePaintStroke.pointerId) return;
    const stroke = activePaintStroke;
    activePaintStroke = null;

    // Single-cell tap with 1×1 △ brush on an already-HST cell flips its '/' <-> '\' diagonal!
    if (
      !stroke.movedCell &&
      state.paintBrush === "hst" &&
      state.paintSize === 1 &&
      stroke.initialPref >= 2 &&
      stroke.initialDiag >= 1
    ) {
      const flippedPref = stroke.initialDiag === 1 ? 4 : 3;
      writeCellPaintPref(stroke.startCol, stroke.startRow, state.cols, state.rows, flippedPref);
      renderQuilt();
      recordHistory("Flipped △ diagonal");
      return;
    }

    const activeFab = state.palette[state.paintFabricIdx];
    const fabCode = activeFab ? getFabricCode(state.paintFabricIdx) : "";
    const paintLabel =
      state.paintBrush === "color"
        ? `Painted Fabric ${fabCode}`
        : state.paintBrush === "hst-slash"
          ? `Painted / HST (Fabric ${fabCode})`
          : state.paintBrush === "hst-back"
            ? `Painted \\ HST (Fabric ${fabCode})`
            : state.paintBrush === "fill"
              ? `Flood filled Fabric ${fabCode}`
              : state.paintBrush === "hst"
                ? "Triangle Paint stroke"
                : state.paintBrush === "square"
                  ? "Painted □ Squares"
                  : "Reset painted cells";
    recordHistory(paintLabel);
  };

  quiltCanvas.addEventListener("pointerup", finishPaintStroke);
  quiltCanvas.addEventListener("pointercancel", finishPaintStroke);
  quiltCanvas.addEventListener("pointerleave", () => {
    if (!state.paintMode || activePaintStroke) return;
    if (paintHoverCell) {
      paintHoverCell = null;
      redrawPreviewWithOverlayOnly();
    }
  });

  if (paintToggleBtn) {
    paintToggleBtn.addEventListener("click", () => {
      setPaintMode(!state.paintMode);
    });
  }
  if (paintDoneBtn) {
    paintDoneBtn.addEventListener("click", () => setPaintMode(false));
  }
  if (paintClearBtn) {
    paintClearBtn.addEventListener("click", () => {
      state.paintMask.fill(0);
      state.manualCells.clear();
      state.activeMathPattern = "";
      state.activeMap = null;
      state.sourcePalette = null;
      syncMathPropsButton();
      closeMathPropsPopover();
      syncMathPropsButton();
      renderQuilt();
      recordHistory("Cleared painted areas");
    });
  }
  paintBrushBtns.forEach((btn) => {
    btn.addEventListener("click", () => setPaintBrush(btn.dataset.paintBrush));
  });
  paintSizeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setPaintSize(btn.dataset.paintSize));
  });

  cropBtn.addEventListener("click", () => {
    if (state.paintMode) setPaintMode(false);
    openCropStage();
  });
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

  // --- In-App Changelog Modal (preserves active quilt edits!) ---
  const openChangelogBtn = document.getElementById("open-changelog-btn");
  const changelogModal = document.getElementById("changelog-modal");
  const changelogModalBackdrop = document.getElementById("changelog-modal-backdrop");
  const changelogModalClose = document.getElementById("changelog-modal-close");
  const changelogModalBody = document.getElementById("changelog-modal-body");
  let changelogLoaded = false;

  function closeChangelogModal() {
    if (changelogModal) changelogModal.hidden = true;
  }

  async function openChangelogModal() {
    if (!changelogModal) return;
    changelogModal.hidden = false;
    if (changelogLoaded || !changelogModalBody) return;
    try {
      const res = await fetch(`changelog.html?v=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to load changelog");
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const list = doc.querySelector(".release-list");
      if (list) {
        changelogModalBody.innerHTML = "";
        changelogModalBody.appendChild(list);
        changelogLoaded = true;
      } else {
        changelogModalBody.innerHTML = '<p class="changelog-loading">Could not load release history.</p>';
      }
    } catch {
      changelogModalBody.innerHTML =
        '<p class="changelog-loading">Could not load changelog inline. <a href="changelog.html" target="_blank" rel="noopener" class="footer-link">Open in new tab</a></p>';
    }
  }

  if (openChangelogBtn) {
    openChangelogBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openChangelogModal();
    });
  }
  if (changelogModalClose) changelogModalClose.addEventListener("click", closeChangelogModal);
  if (changelogModalBackdrop) changelogModalBackdrop.addEventListener("click", closeChangelogModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && changelogModal && !changelogModal.hidden) {
      closeChangelogModal();
    }
  });

  // --- Automatic Local Draft Persistence (IndexedDB) so refreshes never lose edits ---
  const DRAFT_DB_NAME = "quiltcaster_studio_db";
  const DRAFT_STORE = "drafts";
  const DRAFT_KEY = "active_quilt";
  let draftSaveTimer = null;

  function openDraftDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DRAFT_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          db.createObjectStore(DRAFT_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function buildDraftPayload() {
    if (!state.image) return null;
    const currentTitle = getCurrentProjectTitle();
    return {
      format: PATTERN_FORMAT,
      version: PATTERN_VERSION,
      savedAt: new Date().toISOString(),
      name: state.fileName || "quilt",
      patternTitle: currentTitle,
      settings: {
        cols: state.cols,
        gridLayout: state.gridLayout,
        showSeamLines: state.showSeamLines,
        hstEnabled: state.hstEnabled,
        hstMode: state.hstMode,
        hstEdgeSensitivity: state.hstEdgeSensitivity,
        hstRatio: state.hstRatio,
        paintMaskRle: encodePaintMaskRle(),
        isBlankQuilt: state.isBlankQuilt,
        ...(serializeManualCells() ? { manualCells: serializeManualCells() } : {}),
        regionMode: state.unit === "cm" ? "metric" : "us",
        unit: state.unit,
        finishedSquareSize: state.finishedSquareSize,
        seamAllowance: state.seamAllowance,
        pageSize: pageSizeSelect.value,
        assemblyMode: assemblyModeSelect.value,
        crop: state.crop,
      },
      palette: state.palette.map((c) => rgbToHex(c.r, c.g, c.b)),
      ...(state.sourcePalette && state.sourcePalette.length === state.palette.length
        ? { sourcePalette: state.sourcePalette.map((c) => rgbToHex(c.r, c.g, c.b)) }
        : {}),
      ...(serializePalettePatterns() ? { palettePatterns: serializePalettePatterns() } : {}),
      activeMathPattern: state.activeMathPattern || "",
      mathParams: state.mathParams ? { ...state.mathParams } : {},
      mathTransform: state.mathTransform ? { ...state.mathTransform } : { offsetX: 0, offsetY: 0, scale: 1.0, rotate: 0 },
      mathReversePalette: Boolean(state.mathReversePalette),
      history: state.history,
      historyIndex: state.historyIndex,
      image: getImageDataUrlForSave(),
    };
  }

  function scheduleDraftSave() {
    if (!state.image) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(async () => {
      try {
        const payload = buildDraftPayload();
        if (!payload || !payload.image) return;
        const db = await openDraftDb();
        const tx = db.transaction(DRAFT_STORE, "readwrite");
        tx.objectStore(DRAFT_STORE).put(payload, DRAFT_KEY);
      } catch {
        // Ignore storage quota or private browsing errors
      }
    }, 450);
  }

  function clearActiveDraft() {
    clearTimeout(draftSaveTimer);
    openDraftDb()
      .then((db) => {
        const tx = db.transaction(DRAFT_STORE, "readwrite");
        tx.objectStore(DRAFT_STORE).delete(DRAFT_KEY);
      })
      .catch(() => {});
  }

  async function restoreActiveDraftOnLoad() {
    try {
      const db = await openDraftDb();
      const draft = await new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE, "readonly");
        const req = tx.objectStore(DRAFT_STORE).get(DRAFT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (!draft || !draft.image || typeof draft.image !== "string") return;
      if (state.image) return; // User already loaded something
      loadImageFromSrc(draft.image, draft.name || "quilt.png", {
        restore: draft,
        onError: () => clearActiveDraft(),
      });
      if (draft.activeMathPattern && MATH_PATTERN_SPECS[draft.activeMathPattern]) {
        state.activeMathPattern = draft.activeMathPattern;
        state.mathParams = draft.mathParams || getDefaultMathParams(draft.activeMathPattern);
        state.mathTransform = draft.mathTransform || { offsetX: 0, offsetY: 0, scale: 1.0, rotate: 0 };
        state.mathReversePalette = Boolean(draft.mathReversePalette);
        syncMathPropsButton();
      }
    } catch {
      // Ignore IndexedDB errors
    }
  }

  restoreActiveDraftOnLoad();
})();
