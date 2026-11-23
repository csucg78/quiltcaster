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
  const cutSquareValue = document.getElementById("cut-square-value");
  const finishedQuiltValue = document.getElementById("finished-quilt-value");
  const wofNote = document.getElementById("wof-note");
  const previewDimensions = document.getElementById("preview-dimensions");

  const paletteSizeSlider = document.getElementById("palette-size-slider");
  const paletteSizeValue = document.getElementById("palette-size-value");
  const paletteGrid = document.getElementById("palette-grid");
  const addColorBtn = document.getElementById("add-color-btn");
  const resetPaletteBtn = document.getElementById("reset-palette-btn");

  const compareBtn = document.getElementById("compare-btn");
  const exportPdfBtn = document.getElementById("export-pdf-btn");
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
  const canvasFrame = document.getElementById("canvas-frame");
  const dropOverlay = document.getElementById("drop-overlay");
  const quiltCanvas = document.getElementById("quilt-canvas");
  const quiltCtx = quiltCanvas.getContext("2d");

  // Application state
  const state = {
    image: null,
    objectUrl: null,
    fileName: "",
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

  function updateQuiltDimensions() {
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
    finishedQuiltValue.textContent = quiltText;

    wofNote.textContent =
      unit === "in"
        ? `Fabric estimates: 42" usable WOF, +10% extra for squaring up & mistakes`
        : `Fabric estimates: 106 cm usable WOF, +10% extra for squaring up & mistakes`;

    previewDimensions.textContent = `Finished: ${quiltText} · Cut squares: ${cutText}`;
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
      quiltCtx.drawImage(state.image, 0, 0, canvasW, canvasH);
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
      const code = getFabricCode(idx);

      const item = document.createElement("div");
      item.className = "swatch-item";
      item.dataset.id = String(color.id);

      const colorWrap = document.createElement("label");
      colorWrap.className = "swatch-color-wrap";
      colorWrap.title = `Change Fabric ${code} (${hex.toUpperCase()})`;

      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = hex;
      picker.setAttribute("aria-label", `Edit Fabric ${code} (${hex.toUpperCase()})`);

      const info = document.createElement("div");
      info.className = "swatch-info";

      const headerRow = document.createElement("div");
      headerRow.className = "swatch-header-row";

      const codeBadge = document.createElement("span");
      codeBadge.className = "swatch-code";
      codeBadge.textContent = code;

      const hexSpan = document.createElement("span");
      hexSpan.className = "swatch-hex";
      hexSpan.textContent = hex;

      headerRow.appendChild(codeBadge);
      headerRow.appendChild(hexSpan);

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
      removeBtn.title = canDelete ? `Remove Fabric ${code} from palette` : "At least 1 color required";
      removeBtn.setAttribute("aria-label", `Remove Fabric ${code} (${hex.toUpperCase()})`);
      removeBtn.disabled = !canDelete;

      picker.addEventListener("input", (e) => {
        const newHex = e.target.value;
        const [r, g, b] = hexToRgb(newHex);
        color.r = r;
        color.g = g;
        color.b = b;
        hexSpan.textContent = newHex;
        colorWrap.title = `Change Fabric ${code} (${newHex.toUpperCase()})`;
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

  // Loads an image from a URL/data URL. If `restore` is provided, applies saved
  // settings and palette instead of extracting a fresh palette.
  function loadImageFromSrc(src, name, { objectUrl = null, restore = null, onError } = {}) {
    const img = new Image();

    img.onload = () => {
      state.image = img;
      state.objectUrl = objectUrl;
      state.fileName = name;
      fileNameLabel.textContent = name;

      // Build cached downsampled buffer (max 400px on longest side)
      const maxSample = 400;
      const scale = Math.min(1, maxSample / Math.max(img.naturalWidth, img.naturalHeight));
      const sw = Math.max(1, Math.round(img.naturalWidth * scale));
      const sh = Math.max(1, Math.round(img.naturalHeight * scale));

      const offscreen = document.createElement("canvas");
      offscreen.width = sw;
      offscreen.height = sh;
      const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
      offCtx.drawImage(img, 0, 0, sw, sh);

      state.sampleWidth = sw;
      state.sampleHeight = sh;
      state.samplePixels = offCtx.getImageData(0, 0, sw, sh).data;

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

    const pattern = {
      format: PATTERN_FORMAT,
      version: PATTERN_VERSION,
      savedAt: new Date().toISOString(),
      name: state.fileName || "quilt",
      settings: {
        cols: state.cols,
        showSeamLines: state.showSeamLines,
        unit: state.unit,
        finishedSquareSize: state.finishedSquareSize,
        seamAllowance: state.seamAllowance,
        pageSize: pageSizeSelect.value,
      },
      palette: state.palette.map((c) => rgbToHex(c.r, c.g, c.b)),
      image: getImageDataUrlForSave(),
    };

    const blob = new Blob([JSON.stringify(pattern)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const baseName = (state.fileName || "quilt").replace(/\.[^.]+$/, "");
    const safeName = baseName.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "quilt";

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
      updateQuiltDimensions();
    }
  });

  seamAllowanceInput.addEventListener("input", () => {
    const val = parseFloat(seamAllowanceInput.value);
    if (!Number.isNaN(val) && val >= 0) {
      state.seamAllowance = val;
      updateQuiltDimensions();
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

  // --- Printable PDF Pattern Export ---

  function drawPressArrow(doc, x, y, width, pointRight) {
    doc.setDrawColor(90, 82, 72);
    doc.setLineWidth(0.012);
    const x1 = x;
    const x2 = x + width;
    doc.line(x1, y, x2, y);
    const head = 0.04;
    if (pointRight) {
      doc.line(x2, y, x2 - head, y - head * 0.65);
      doc.line(x2, y, x2 - head, y + head * 0.65);
    } else {
      doc.line(x1, y, x1 + head, y - head * 0.65);
      doc.line(x1, y, x1 + head, y + head * 0.65);
    }
  }

  function buildMockupDataUrl() {
    const cols = state.cols;
    const rows = state.rows;
    const maxDim = 900;
    const sq = Math.max(8, Math.floor(maxDim / Math.max(cols, rows)));
    const off = document.createElement("canvas");
    off.width = cols * sq;
    off.height = rows * sq;
    const ctx = off.getContext("2d");

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pal = state.palette[state.gridAssignments[r * cols + c]];
        ctx.fillStyle = `rgb(${pal.r}, ${pal.g}, ${pal.b})`;
        ctx.fillRect(c * sq, r * sq, sq, sq);
      }
    }

    if (sq >= 6) {
      ctx.strokeStyle = "rgba(25, 22, 18, 0.14)";
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

  function exportPdfPattern() {
    if (!state.image || state.palette.length === 0 || state.gridAssignments.length === 0) return;

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF export library is still loading or unavailable offline. Please check your connection and try again.");
      return;
    }

    exportPdfBtn.disabled = true;
    const originalBtnHtml = exportPdfBtn.innerHTML;
    exportPdfBtn.textContent = "Generating PDF...";

    // Yield briefly so button state paints
    setTimeout(() => {
      try {
        const { jsPDF } = window.jspdf;
        const isA4 = pageSizeSelect.value === "a4";
        const doc = new jsPDF({ orientation: "portrait", unit: "in", format: isA4 ? "a4" : "letter" });
        const pageW = isA4 ? 8.27 : 8.5;
        const pageH = isA4 ? 11.69 : 11.0;
        const margin = 0.5;
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
        const baseName = (state.fileName || "quiltcaster-pattern").replace(/\.[^.]+$/, "");
        const title = baseName.replace(/[-_]+/g, " ").trim() || "Miriam's Quiltcaster Pattern";

        // Build active color list (keeping same A, B, C... codes shown in UI)
        const activeColors = state.palette
          .map((color, idx) => ({
            index: idx,
            code: getFabricCode(idx),
            hex: rgbToHex(color.r, color.g, color.b).toUpperCase(),
            r: color.r,
            g: color.g,
            b: color.b,
            count: state.usageCounts[idx] || 0,
            fabric: calculateColorFabric(state.usageCounts[idx] || 0),
          }))
          .filter((c) => c.count > 0);

        const codeByPaletteIndex = new Map();
        state.palette.forEach((_, idx) => {
          codeByPaletteIndex.set(idx, getFabricCode(idx));
        });

        // ================= PAGE 1: COVER & SUMMARY =================
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(34, 31, 26);
        doc.text("Miriam's Quiltcaster Pattern", margin, 0.85);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(108, 100, 88);
        doc.text(title, margin, 1.12);

        // Summary stats box
        const boxY = 1.32;
        const boxH = 1.05;
        doc.setFillColor(246, 242, 235);
        doc.setDrawColor(215, 206, 191);
        doc.setLineWidth(0.012);
        doc.roundedRect(margin, boxY, contentW, boxH, 0.08, 0.08, "FD");

        const stats = [
          ["Finished Quilt", `${formatMeasure(quiltW, unit)} x ${formatMeasure(quiltH, unit)}`],
          ["Grid Size", `${cols} cols x ${rows} rows (${(cols * rows).toLocaleString()} sq)`],
          ["Finished Square", `${formatMeasure(finished, unit)} x ${formatMeasure(finished, unit)}`],
          ["Cut Square Size", `${formatMeasure(cutSize, unit)} x ${formatMeasure(cutSize, unit)}`],
          ["Seam Allowance", formatMeasure(seam, unit)],
          ["Active Fabrics", `${activeColors.length} colors (${formatMeasure(wof, unit)} WOF)`],
        ];

        const colStep = contentW / 3;
        stats.forEach(([label, val], i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = margin + 0.18 + col * colStep;
          const y = boxY + 0.28 + row * 0.48;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(108, 100, 88);
          doc.text(label.toUpperCase(), x, y);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(34, 31, 26);
          doc.text(val, x, y + 0.19);
        });

        // Test square = actual cut square size (doubles as print-scale check and cutting template).
        // Falls back to a 1" / 2 cm square if the cut size is too big to fit on the cover.
        const cutSizeIn = unit === "in" ? cutSize : cutSize / 2.54;
        const finishedIn = unit === "in" ? finished : finished / 2.54;
        const maxTestSquare = 4;
        const useCutSquare = cutSizeIn <= maxTestSquare;
        const fallbackSize = unit === "in" ? 1 : 2 / 2.54;
        const tsSize = useCutSquare ? cutSizeIn : fallbackSize;
        const tsExpected = useCutSquare
          ? `${formatMeasure(cutSize, unit)} x ${formatMeasure(cutSize, unit)}`
          : unit === "in" ? '1" x 1"' : "2 cm x 2 cm";

        // Quilt mockup centered in remaining space (leave room for the test square)
        const mockup = buildMockupDataUrl();
        const availTop = boxY + boxH + 0.3;
        const availH = pageH - availTop - (tsSize + 0.95);
        const availW = contentW;
        const imgAspect = mockup.width / mockup.height;
        let drawW = availW;
        let drawH = drawW / imgAspect;
        if (drawH > availH) {
          drawH = availH;
          drawW = drawH * imgAspect;
        }
        const imgX = margin + (availW - drawW) / 2;
        const imgY = availTop + (availH - drawH) / 2;

        doc.setDrawColor(200, 187, 166);
        doc.setLineWidth(0.015);
        doc.rect(imgX - 0.03, imgY - 0.03, drawW + 0.06, drawH + 0.06);
        doc.addImage(mockup.dataUrl, "PNG", imgX, imgY, drawW, drawH);

        const tsY = pageH - 0.6 - tsSize;
        doc.setDrawColor(34, 31, 26);
        doc.setLineWidth(0.012);
        doc.rect(margin, tsY, tsSize, tsSize, "S");

        // Dashed inner line shows the finished size (seam allowance outside it)
        if (useCutSquare && seam > 0) {
          const inset = (cutSizeIn - finishedIn) / 2;
          doc.setDrawColor(150, 140, 128);
          doc.setLineDashPattern([0.05, 0.04], 0);
          doc.rect(margin + inset, tsY + inset, finishedIn, finishedIn, "S");
          doc.setLineDashPattern([], 0);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(Math.min(9, Math.max(6, tsSize * 7)));
        doc.setTextColor(34, 31, 26);
        doc.text(useCutSquare ? "Cut square" : "Test square", margin + tsSize / 2, tsY + tsSize / 2 - 0.02, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.text(tsExpected, margin + tsSize / 2, tsY + tsSize / 2 + 0.14, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(70, 65, 58);
        const scaleNote = doc.splitTextToSize(
          (useCutSquare
            ? `This square is your actual cut size: it should measure exactly ${tsExpected}. The dashed line shows the finished ${formatMeasure(finished, unit)} square; the gap is the ${formatMeasure(seam, unit)} seam allowance. `
            : `This test square should measure exactly ${tsExpected}. `) +
            `Print at 100% / "Actual size" (turn OFF "Fit to page") and measure before cutting. Paper: ${isA4 ? "A4" : "US Letter"}. Fabric amounts include +10% extra for squaring up and mistakes; pre-wash fabric before cutting if you normally do.`,
          contentW - tsSize - 0.3
        );
        doc.text(scaleNote, margin + tsSize + 0.3, tsY + 0.15);

        // ================= PAGE 2: COLOR KEY & WOF CUTTING CHART =================
        doc.addPage();
        let curY = 0.8;

        const drawCuttingHeader = () => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.setTextColor(34, 31, 26);
          doc.text("Fabric Requirements & WOF Cutting Chart", margin, curY);
          curY += 0.22;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(108, 100, 88);
          doc.text(
            `Cut ${formatMeasure(cutSize, unit)} x ${formatMeasure(cutSize, unit)} squares (includes ${formatMeasure(seam, unit)} seam allowance on all sides). Based on ${formatMeasure(wof, unit)} usable WOF.`,
            margin,
            curY
          );
          curY += 0.28;

          // Table header bar
          doc.setFillColor(239, 233, 223);
          doc.rect(margin, curY, contentW, 0.3, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(34, 31, 26);
          doc.text("Code", margin + 0.1, curY + 0.2);
          doc.text("Swatch", margin + 0.65, curY + 0.2);
          doc.text("Tape Fabric", margin + 1.35, curY + 0.2);
          doc.text("Hex", margin + 2.55, curY + 0.2);
          doc.text("Squares", margin + 3.55, curY + 0.2);
          doc.text(`WOF Strips (${formatMeasure(cutSize, unit)})`, margin + 4.45, curY + 0.2);
          doc.text("Est. Fabric", margin + 6.45, curY + 0.2);
          curY += 0.34;
        };

        drawCuttingHeader();

        const rowH = 0.42;
        activeColors.forEach((c) => {
          if (curY + rowH > pageH - 1.35) {
            doc.addPage();
            curY = 0.8;
            drawCuttingHeader();
          }

          // Code
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(34, 31, 26);
          doc.text(c.code, margin + 0.16, curY + 0.26);

          // Printed color swatch
          doc.setFillColor(c.r, c.g, c.b);
          doc.setDrawColor(140, 130, 120);
          doc.setLineWidth(0.008);
          doc.rect(margin + 0.65, curY + 0.07, 0.45, 0.28, "FD");

          // Blank box to tape actual fabric swatch
          doc.setDrawColor(180, 172, 160);
          doc.setLineDashPattern([0.04, 0.03], 0);
          doc.rect(margin + 1.35, curY + 0.05, 0.95, 0.32, "S");
          doc.setLineDashPattern([], 0);

          // Hex
          doc.setFont("courier", "normal");
          doc.setFontSize(9);
          doc.setTextColor(70, 65, 58);
          doc.text(c.hex, margin + 2.55, curY + 0.26);

          // Squares
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(34, 31, 26);
          doc.text(String(c.count), margin + 3.55, curY + 0.26);

          // WOF Strips
          const stripLabel = `${c.fabric.strips} strip${c.fabric.strips === 1 ? "" : "s"} (${c.fabric.squaresPerStrip}/strip)`;
          doc.text(stripLabel, margin + 4.45, curY + 0.26);

          // Estimated Fabric
          doc.setFont("helvetica", "bold");
          doc.setTextColor(184, 77, 44);
          doc.text(c.fabric.formatted, margin + 6.45, curY + 0.26);

          // Bottom divider
          doc.setDrawColor(232, 226, 216);
          doc.setLineWidth(0.006);
          doc.line(margin, curY + rowH, margin + contentW, curY + rowH);
          curY += rowH;
        });

        // Backing & Binding box
        const extras = calculateBackingAndBinding();
        if (curY + 1.15 > pageH - 0.65) {
          doc.addPage();
          curY = 0.8;
        } else {
          curY += 0.28;
        }

        doc.setFillColor(246, 242, 235);
        doc.setDrawColor(215, 206, 191);
        doc.setLineWidth(0.01);
        doc.roundedRect(margin, curY, contentW, 0.92, 0.06, 0.06, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(34, 31, 26);
        doc.text("Backing & Binding Estimates", margin + 0.16, curY + 0.26);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(70, 65, 58);
        doc.text(
          `Binding: ${extras.bindingAmount} (${extras.bindingStrips} WOF strips cut at ${formatMeasure(extras.bindingStripW, unit)} wide, includes corner allowance)`,
          margin + 0.16,
          curY + 0.52
        );
        doc.text(
          `Backing: ${extras.backingAmount} (${extras.backingPanels} WOF panel${extras.backingPanels === 1 ? "" : "s"} wide, includes +${unit === "in" ? '8"' : "20 cm"} quilting margin)`,
          margin + 0.16,
          curY + 0.74
        );

        // ================= PAGE 3+: ANNOTATED LAYOUT GRID MAP =================
        const maxColsPerPage = 20;
        const maxRowsPerPage = 26;
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
            doc.setFont("helvetica", "bold");
            doc.setFontSize(15);
            doc.setTextColor(34, 31, 26);
            const sectionTitle =
              totalSections > 1
                ? `Quilt Layout Map - Section ${sectionNum} of ${totalSections}`
                : "Quilt Layout Grid Map";
            doc.text(sectionTitle, margin, 0.78);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(108, 100, 88);
            doc.text(
              `Columns ${cStart + 1}-${cEnd}, Rows ${rStart + 1}-${rEnd}  |  Letters match Fabric Key  |  Right-side arrows show alternating pressing direction`,
              margin,
              1.0
            );

            // Grid layout area
            const labelLeftW = 0.42;
            const arrowRightW = 0.32;
            const labelTopH = 0.26;
            const gridAreaW = contentW - labelLeftW - arrowRightW;
            const gridAreaH = pageH - 1.25 - labelTopH - 0.65;

            const cellSize = Math.min(0.45, gridAreaW / subCols, gridAreaH / subRows);
            const gridW = subCols * cellSize;
            const gridH = subRows * cellSize;
            const gridX = margin + labelLeftW + (gridAreaW - gridW) / 2;
            const gridY = 1.22 + labelTopH;

            // Column numbers
            const headerFont = Math.min(8, Math.max(5.5, cellSize * 22));
            doc.setFont("helvetica", "bold");
            doc.setFontSize(headerFont);
            doc.setTextColor(90, 82, 72);
            for (let c = 0; c < subCols; c++) {
              const cx = gridX + (c + 0.5) * cellSize;
              doc.text(String(cStart + c + 1), cx, gridY - 0.08, { align: "center" });
            }

            // Cells & row numbers & pressing arrows
            const cellFont = Math.min(9.5, Math.max(5.5, cellSize * 26));
            for (let r = 0; r < subRows; r++) {
              const globalRow = rStart + r;
              const ry = gridY + r * cellSize;

              // Row label on left
              doc.setFont("helvetica", "bold");
              doc.setFontSize(headerFont);
              doc.setTextColor(90, 82, 72);
              doc.text(`R${globalRow + 1}`, gridX - 0.07, ry + cellSize * 0.64, { align: "right" });

              // Alternating pressing direction arrow on right (odd rows left, even rows right)
              const pointRight = globalRow % 2 === 1;
              drawPressArrow(doc, gridX + gridW + 0.08, ry + cellSize * 0.5, 0.18, pointRight);

              for (let c = 0; c < subCols; c++) {
                const globalCol = cStart + c;
                const palIdx = state.gridAssignments[globalRow * cols + globalCol];
                const pal = state.palette[palIdx];
                const code = codeByPaletteIndex.get(palIdx) || "?";
                const cx = gridX + c * cellSize;

                doc.setFillColor(pal.r, pal.g, pal.b);
                doc.setDrawColor(160, 155, 148);
                doc.setLineWidth(0.005);
                doc.rect(cx, ry, cellSize, cellSize, "FD");

                const isLight = luminance(pal.r, pal.g, pal.b) > 140;
                doc.setTextColor(isLight ? 25 : 255, isLight ? 22 : 255, isLight ? 18 : 255);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(cellFont);
                doc.text(code, cx + cellSize / 2, ry + cellSize * 0.64, { align: "center" });
              }
            }

            // Bold 5x5 guide lines for effortless counting
            doc.setDrawColor(40, 36, 30);
            doc.setLineWidth(0.018);
            doc.rect(gridX, gridY, gridW, gridH, "S");
            doc.setLineWidth(0.014);
            for (let c = 1; c < subCols; c++) {
              if ((cStart + c) % 5 === 0) {
                const x = gridX + c * cellSize;
                doc.line(x, gridY, x, gridY + gridH);
              }
            }
            for (let r = 1; r < subRows; r++) {
              if ((rStart + r) % 5 === 0) {
                const y = gridY + r * cellSize;
                doc.line(gridX, y, gridX + gridW, y);
              }
            }
          }
        }

        // ================= FINAL PAGE(S): ROW-BY-ROW ASSEMBLY CHECKLIST =================
        doc.addPage();
        let ay = 0.8;

        const drawAssemblyHeader = (isContinuation) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(15);
          doc.setTextColor(34, 31, 26);
          doc.text(
            isContinuation ? "Row-by-Row Assembly Checklist (cont.)" : "Row-by-Row Assembly & Pressing Guide",
            margin,
            ay
          );
          ay += 0.24;

          if (!isContinuation) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.8);
            doc.setTextColor(70, 65, 58);
            const notes = [
              `1. Cut all ${formatMeasure(cutSize, unit)} squares and keep a separate labeled stack or bag for each Fabric Code (A, B, C...).`,
              "2. Lay out one row at a time on a design wall or floor, checking it against the Layout Map.",
              "3. Row stacks: pick up each row left-to-right and pin a numbered label to the first square so rows never get mixed up.",
              `4. Sew each row left-to-right with an accurate ${formatMeasure(seam, unit)} seam (chain piecing pairs saves time).`,
              "5. Press odd rows to the LEFT and even rows to the RIGHT so seams nest when joining rows; pin at every intersection.",
              "6. Join rows in order, top to bottom. Runs like 4A (4 squares of A in a row) can be strip-pieced to save time.",
            ];
            notes.forEach((line) => {
              const wrappedNote = doc.splitTextToSize(line, contentW);
              doc.text(wrappedNote, margin, ay);
              ay += 0.17 * wrappedNote.length + 0.03;
            });
            ay += 0.14;
          }
        };

        drawAssemblyHeader(false);

        for (let r = 0; r < rows; r++) {
          // Run-length encode row
          const runs = [];
          let prevCode = null;
          let runLen = 0;
          for (let c = 0; c < cols; c++) {
            const code = codeByPaletteIndex.get(state.gridAssignments[r * cols + c]) || "?";
            if (code === prevCode) {
              runLen++;
            } else {
              if (prevCode !== null) runs.push(`${runLen}${prevCode}`);
              prevCode = code;
              runLen = 1;
            }
          }
          if (prevCode !== null) runs.push(`${runLen}${prevCode}`);

          const pressDir = r % 2 === 0 ? "press L" : "press R";
          const prefix = `Row ${r + 1} (${pressDir}): `;
          const seqText = runs.join(", ");
          const wrapped = doc.splitTextToSize(prefix + seqText, contentW - 0.32);
          const blockH = wrapped.length * 0.17 + 0.1;

          if (ay + blockH > pageH - 0.65) {
            doc.addPage();
            ay = 0.8;
            drawAssemblyHeader(true);
          }

          // Checkbox
          doc.setDrawColor(140, 132, 120);
          doc.setLineWidth(0.01);
          doc.rect(margin, ay - 0.11, 0.13, 0.13, "S");

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.8);
          doc.setTextColor(34, 31, 26);
          doc.text(wrapped, margin + 0.22, ay);
          ay += blockH;
        }

        // Add subtle page numbers to every page
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(135, 127, 115);
          doc.text("Generated with Miriam's Quiltcaster", margin, pageH - 0.32);
          doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 0.32, { align: "right" });
        }

        const safeFile = baseName.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "quiltcaster";
        doc.save(`${safeFile}-quilt-pattern.pdf`);
      } finally {
        exportPdfBtn.disabled = false;
        exportPdfBtn.innerHTML = originalBtnHtml;
      }
    }, 20);
  }

  exportPdfBtn.addEventListener("click", exportPdfPattern);

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
