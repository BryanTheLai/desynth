import './style.css';
import {
  createIcons,
  Upload,
  Download,
  Sliders,
  ShieldCheck,
  ArrowUpRight,
  ChevronsLeftRight,
  Image as ImageIcon,
  RotateCcw,
  Check,
  Info,
  Camera,
  Cpu,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  Video,
  Play,
  Pause,
  Film
} from 'lucide';
import { processImage, loadImageFromFile, CAMERA_PRESETS } from './desynthEngine.js';
import { processVideo, loadVideoFromFile } from './desynthVideoEngine.js';

// Icons bundle for Lucide
const ICONS = {
  Upload,
  Download,
  Sliders,
  ShieldCheck,
  ArrowUpRight,
  ChevronsLeftRight,
  ImageIcon,
  RotateCcw,
  Check,
  Info,
  Camera,
  Cpu,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  Video,
  Play,
  Pause,
  Film
};

// Global App State
const state = {
  fileType: null, // 'image' | 'video'
  originalFile: null,
  originalDataUrl: null,
  originalImage: null,
  originalVideo: null,
  processedResult: null,
  isProcessing: false,
  progressPercent: 0,
  splitPosition: 50, // in percent
  isDragging: false,
  isAccordionOpen: false,
  isVideoPlaying: true,
  settings: {
    cameraPreset: 'sony_a7iv',
    grainAmount: 2, // Default to ultra-subtle sub-perceptual (0-8)
    applyVignette: false,
    applyChromaticAberration: false,
    disruptLatents: true,
    targetFps: 30
  }
};

const appEl = document.querySelector('#app');

/**
 * Format bytes into human readable KB / MB
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Render the App UI
 */
function renderApp() {
  appEl.innerHTML = `
    <!-- Top Navigation Bar -->
    <header class="navbar">
      <div class="brand-lockup">
        <span class="brand-logo">DESYNTH</span>
        <a href="https://stackifier.com" target="_blank" rel="noopener noreferrer" class="brand-by" title="Built by Stackifier">
          <span>by Stackifier</span>
          <i data-lucide="arrow-up-right" style="width: 12px; height: 12px;"></i>
        </a>
      </div>

      <div class="nav-right">
        <div class="badge-privacy">
          <i data-lucide="shield-check" style="width: 13px; height: 13px;"></i>
          <span>100% Client-Side</span>
        </div>
      </div>
    </header>

    <!-- Main Container -->
    <main class="main-container">
      ${!state.originalFile ? renderHeroAndDropzone() : renderWorkspace()}
    </main>

    <!-- Minimal Footer -->
    <footer class="footer">
      <div>
        <span>DESYNTH — Zero server upload. Lossless client-side media forensics.</span>
      </div>
      <div>
        <a href="https://stackifier.com" target="_blank" rel="noopener noreferrer" class="footer-link">
          stackifier.com
        </a>
      </div>
    </footer>
  `;

  // Render Lucide Icons
  createIcons({ icons: ICONS });

  // Attach Event Listeners
  attachEventListeners();
}

/**
 * Initial Hero and Dropzone UI
 */
function renderHeroAndDropzone() {
  return `
    <div class="hero-header">
      <h1>De-synthesize AI media.</h1>
      <p>Strip C2PA provenance, disrupt latent diffusion harmonics, and inject authentic camera signatures for images & videos with 100% crystal-clear visual quality.</p>
    </div>

    <div class="dropzone-card" id="dropzone">
      <input type="file" id="file-input" class="file-input-hidden" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" />
      
      <div class="dropzone-icon-box">
        <i data-lucide="upload" style="width: 24px; height: 24px;"></i>
      </div>

      <div class="dropzone-text">
        <h3>Drop an AI image or video here</h3>
        <p>Supports JPG, PNG, WebP, MP4, WebM, MOV</p>
      </div>

      <div class="dropzone-badges">
        <span class="badge-tag">No Server Upload</span>
        <span class="badge-tag">C2PA Stripped</span>
        <span class="badge-tag">Lossless Fidelity</span>
        <span class="badge-tag">Hardware EXIF</span>
      </div>
    </div>
  `;
}

/**
 * Active Workspace / Comparison UI
 */
function renderWorkspace() {
  const file = state.originalFile;
  const res = state.processedResult;
  const fileName = file ? file.name : 'media_file';
  const origSize = file ? formatBytes(file.size) : '';
  const newSize = res ? formatBytes(res.sizeBytes) : '';
  const isVideo = state.fileType === 'video';
  const preset = CAMERA_PRESETS[state.settings.cameraPreset] || CAMERA_PRESETS.sony_a7iv;

  return `
    <div class="workspace-card">
      <!-- File Details & Action Bar -->
      <div class="workspace-header">
        <div class="file-info-group">
          <div class="file-icon">
            <i data-lucide="${isVideo ? 'video' : 'image-icon'}" style="width: 20px; height: 20px;"></i>
          </div>
          <div class="file-details">
            <span class="file-name-text" title="${fileName}">${fileName}</span>
            <div class="file-meta-text">
              <span>${res ? `${res.origW}×${res.origH}` : ''}</span>
              <span>•</span>
              <span>${origSize}</span>
              ${res ? `<span>→</span> <span>${newSize}</span>` : ''}
              ${isVideo ? `<span>•</span> <span class="badge-tag" style="padding: 1px 5px;">VIDEO</span>` : ''}
            </div>
          </div>
        </div>

        <div class="workspace-actions">
          <button class="btn btn-secondary btn-sm" id="btn-reset" title="Process another file">
            <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i>
            <span>New</span>
          </button>
          
          <button class="btn btn-primary btn-sm" id="btn-download" ${state.isProcessing ? 'disabled' : ''} title="Download clean media">
            <i data-lucide="download" style="width: 14px; height: 14px;"></i>
            <span>Download Clean ${isVideo ? (res ? res.extension.toUpperCase() : 'Video') : 'JPG'}</span>
          </button>
        </div>
      </div>

      <!-- Processing Progress Bar (For Video) -->
      ${state.isProcessing ? `
        <div class="processing-banner">
          <div class="processing-info">
            <span>De-synthesizing ${isVideo ? 'video frames losslessly' : 'image pixels'}...</span>
            <span class="font-mono">${state.progressPercent}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width: ${state.progressPercent}%;"></div>
          </div>
        </div>
      ` : ''}

      <!-- Before / After Split Slider -->
      <div class="comparison-wrapper" id="comparison-slider" style="--split-pos: ${state.splitPosition}%;">
        <div class="comparison-container">
          <!-- Background: Original AI Media -->
          ${isVideo ? `
            <video id="video-orig" src="${state.originalDataUrl}" class="comp-img" autoplay loop muted playsinline></video>
          ` : `
            <img src="${state.originalDataUrl}" class="comp-img" alt="Original AI Image" />
          `}
          
          <!-- Foreground: Processed Authentic Media (Clipped to Right) -->
          ${res ? (isVideo ? `
            <video id="video-proc" src="${res.dataUrl}" class="comp-img comp-img-processed" autoplay loop muted playsinline></video>
          ` : `
            <img src="${res.dataUrl}" class="comp-img comp-img-processed" alt="Desynthesized Image" />
          `) : ''}

          <!-- Floating Badges -->
          <div class="comp-label comp-label-left">Original (AI)</div>
          <div class="comp-label comp-label-right">Desynthesized</div>

          <!-- Interactive Handle -->
          <div class="slider-handle-line"></div>
          <div class="slider-handle-button" id="slider-handle">
            <i data-lucide="chevrons-left-right" style="width: 16px; height: 16px;"></i>
          </div>
        </div>
      </div>

      <!-- Video Controls (if video) -->
      ${isVideo && res ? `
        <div class="video-playback-bar">
          <button class="btn btn-secondary btn-sm" id="btn-toggle-play">
            <i data-lucide="${state.isVideoPlaying ? 'pause' : 'play'}" style="width: 14px; height: 14px;"></i>
            <span>${state.isVideoPlaying ? 'Pause Sync' : 'Play Sync'}</span>
          </button>
          <span class="file-meta-text">Synchronized Dual-Stream Playback</span>
        </div>
      ` : ''}

      <!-- Verified Forensic Specs Panel -->
      <div class="specs-grid">
        <div class="spec-box">
          <span class="spec-box-label">Camera Profile</span>
          <span class="spec-box-value">${preset.name}</span>
        </div>
        <div class="spec-box">
          <span class="spec-box-label">Optical Signature</span>
          <span class="spec-box-value">${preset.lens}</span>
        </div>
        <div class="spec-box">
          <span class="spec-box-label">Micro-Dither</span>
          <span class="spec-box-value">${state.settings.grainAmount === 0 ? 'Pure Lossless' : 'Sub-Perceptual'}</span>
        </div>
        <div class="spec-box">
          <span class="spec-box-label">C2PA Manifest</span>
          <span class="spec-box-value" style="color: var(--accent-green);">Purged (0 bytes)</span>
        </div>
      </div>

      <!-- Collapsible Advanced Settings -->
      <div class="advanced-accordion">
        <button class="accordion-trigger ${state.isAccordionOpen ? 'is-open' : ''}" id="accordion-toggle">
          <div class="accordion-title-box">
            <i data-lucide="sliders-horizontal" style="width: 15px; height: 15px;"></i>
            <span>Advanced Settings & Tuning</span>
          </div>
          <i data-lucide="chevron-down" class="accordion-chevron" style="width: 15px; height: 15px;"></i>
        </button>

        <div class="accordion-content ${state.isAccordionOpen ? 'is-open' : ''}" id="accordion-body">
          <div class="settings-grid">
            <div class="setting-item">
              <label for="camera-select">Hardware Profile</label>
              <select id="camera-select" class="select-input">
                <option value="sony_a7iv" ${state.settings.cameraPreset === 'sony_a7iv' ? 'selected' : ''}>Sony Alpha 7 IV (85mm f/1.4)</option>
                <option value="canon_r5" ${state.settings.cameraPreset === 'canon_r5' ? 'selected' : ''}>Canon EOS R5 (50mm f/1.2)</option>
                <option value="fuji_xt5" ${state.settings.cameraPreset === 'fuji_xt5' ? 'selected' : ''}>Fujifilm X-T5 (33mm f/1.4)</option>
                <option value="leica_q3" ${state.settings.cameraPreset === 'leica_q3' ? 'selected' : ''}>Leica Q3 (28mm f/1.7)</option>
              </select>
            </div>

            <div class="setting-item">
              <label for="grain-range">Micro-Dither Level: <span id="grain-val">${state.settings.grainAmount}</span> (0 = Pure Lossless)</label>
              <input type="range" id="grain-range" class="range-input" min="0" max="8" step="1" value="${state.settings.grainAmount}" />
            </div>

            <div class="setting-item">
              <label>Optical Physics</label>
              <div class="toggle-group">
                <input type="checkbox" id="toggle-vignette" ${state.settings.applyVignette ? 'checked' : ''} />
                <label for="toggle-vignette" class="toggle-label">Lens Vignette (-0.1 EV)</label>
              </div>
              <div class="toggle-group">
                <input type="checkbox" id="toggle-ca" ${state.settings.applyChromaticAberration ? 'checked' : ''} />
                <label for="toggle-ca" class="toggle-label">Lateral Chromatic Aberration</label>
              </div>
            </div>
          </div>

          <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" id="btn-reprocess">
              <i data-lucide="rotate-ccw" style="width: 13px; height: 13px;"></i>
              <span>Re-apply Filters</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Process the loaded image or video
 */
async function runProcessing() {
  if (!state.originalFile) return;

  state.isProcessing = true;
  state.progressPercent = 0;
  renderApp();

  try {
    if (state.fileType === 'video') {
      const result = await processVideo(state.originalVideo, {
        file: state.originalFile
      }, (prog) => {
        state.progressPercent = prog;
        const fill = document.querySelector('.progress-bar-fill');
        const text = document.querySelector('.processing-info .font-mono');
        if (fill) fill.style.width = `${prog}%`;
        if (text) text.textContent = `${prog}%`;
      });
      state.processedResult = result;
    } else {
      const result = await processImage(state.originalImage, {
        cameraPreset: state.settings.cameraPreset,
        grainAmount: Number(state.settings.grainAmount),
        applyVignette: state.settings.applyVignette,
        applyChromaticAberration: state.settings.applyChromaticAberration,
        disruptLatents: state.settings.disruptLatents
      });
      state.processedResult = result;
    }
  } catch (err) {
    console.error('Processing failed:', err);
    alert('An error occurred during media processing.');
  } finally {
    state.isProcessing = false;
    renderApp();
  }
}

/**
 * Handle File Selection (Image or Video)
 */
async function handleFile(file) {
  if (!file) return;

  const isImg = file.type.startsWith('image/');
  const isVid = file.type.startsWith('video/');

  if (!isImg && !isVid) {
    alert('Please select a valid image (JPG, PNG, WebP) or video (MP4, WebM, MOV).');
    return;
  }

  state.originalFile = file;
  state.fileType = isVid ? 'video' : 'image';
  state.splitPosition = 50;
  state.isProcessing = true;
  renderApp();

  try {
    if (isVid) {
      const { video, url } = await loadVideoFromFile(file);
      state.originalVideo = video;
      state.originalDataUrl = url;
    } else {
      const img = await loadImageFromFile(file);
      state.originalImage = img;
      state.originalDataUrl = img.src;
    }
    await runProcessing();
  } catch (err) {
    console.error('Failed to load media file:', err);
    alert('Failed to load the selected file.');
    state.isProcessing = false;
    renderApp();
  }
}

/**
 * Trigger clean file download
 */
function downloadCleanFile() {
  if (!state.processedResult || !state.processedResult.blob) return;

  const originalName = state.originalFile ? state.originalFile.name : 'media';
  const dotIndex = originalName.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
  const ext = state.fileType === 'video' ? (state.processedResult.extension || 'mp4') : 'jpg';
  const downloadName = `${baseName}-authentic.${ext}`;

  const url = URL.createObjectURL(state.processedResult.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Attach UI and Slider Drag Event Listeners
 */
function attachEventListeners() {
  // Dropzone handling
  const dropzone = document.querySelector('#dropzone');
  const fileInput = document.querySelector('#file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-active');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  // Action buttons
  const btnDownload = document.querySelector('#btn-download');
  if (btnDownload) {
    btnDownload.addEventListener('click', downloadCleanFile);
  }

  const btnReset = document.querySelector('#btn-reset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (state.originalDataUrl && state.fileType === 'video') {
        URL.revokeObjectURL(state.originalDataUrl);
      }
      state.originalFile = null;
      state.fileType = null;
      state.originalImage = null;
      state.originalVideo = null;
      state.originalDataUrl = null;
      state.processedResult = null;
      renderApp();
    });
  }

  // Video Synchronized Play/Pause
  const btnTogglePlay = document.querySelector('#btn-toggle-play');
  if (btnTogglePlay) {
    btnTogglePlay.addEventListener('click', () => {
      const vOrig = document.querySelector('#video-orig');
      const vProc = document.querySelector('#video-proc');
      if (vOrig && vProc) {
        if (state.isVideoPlaying) {
          vOrig.pause();
          vProc.pause();
          state.isVideoPlaying = false;
        } else {
          vProc.currentTime = vOrig.currentTime;
          vOrig.play();
          vProc.play();
          state.isVideoPlaying = true;
        }
        renderApp();
      }
    });
  }

  // Accordion Toggle
  const accordionToggle = document.querySelector('#accordion-toggle');
  if (accordionToggle) {
    accordionToggle.addEventListener('click', () => {
      state.isAccordionOpen = !state.isAccordionOpen;
      renderApp();
    });
  }

  // Settings Controls
  const cameraSelect = document.querySelector('#camera-select');
  if (cameraSelect) {
    cameraSelect.addEventListener('change', (e) => {
      state.settings.cameraPreset = e.target.value;
    });
  }

  const grainRange = document.querySelector('#grain-range');
  const grainVal = document.querySelector('#grain-val');
  if (grainRange && grainVal) {
    grainRange.addEventListener('input', (e) => {
      grainVal.textContent = e.target.value;
      state.settings.grainAmount = Number(e.target.value);
    });
  }

  const toggleVignette = document.querySelector('#toggle-vignette');
  if (toggleVignette) {
    toggleVignette.addEventListener('change', (e) => {
      state.settings.applyVignette = e.target.checked;
    });
  }

  const toggleCA = document.querySelector('#toggle-ca');
  if (toggleCA) {
    toggleCA.addEventListener('change', (e) => {
      state.settings.applyChromaticAberration = e.target.checked;
    });
  }

  const btnReprocess = document.querySelector('#btn-reprocess');
  if (btnReprocess) {
    btnReprocess.addEventListener('click', runProcessing);
  }

  // Before / After Split Slider Handling (Mouse & Touch)
  const slider = document.querySelector('#comparison-slider');
  if (slider) {
    const updateSliderPos = (clientX) => {
      const rect = slider.getBoundingClientRect();
      const x = clientX - rect.left;
      let pos = (x / rect.width) * 100;
      pos = Math.max(0, Math.min(100, pos));
      state.splitPosition = pos;
      slider.style.setProperty('--split-pos', `${pos}%`);
    };

    const onPointerDown = (e) => {
      state.isDragging = true;
      updateSliderPos(e.clientX || (e.touches && e.touches[0].clientX));
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!state.isDragging) return;
      updateSliderPos(e.clientX || (e.touches && e.touches[0].clientX));
    };

    const onPointerUp = () => {
      state.isDragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    slider.addEventListener('pointerdown', onPointerDown);
  }
}

// Initial render
renderApp();
