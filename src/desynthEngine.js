import piexif from 'piexifjs';

/**
 * Camera Hardware EXIF Presets
 */
export const CAMERA_PRESETS = {
  sony_a7iv: {
    id: 'sony_a7iv',
    name: 'Sony Alpha 7 IV',
    lens: 'FE 85mm F1.4 GM',
    make: 'SONY',
    model: 'ILCE-7M4',
    software: 'ILCE-7M4 v2.01',
    focalLength: [850, 10],
    focalLength35: 85,
    fNumber: [18, 10], // f/1.8
    exposureTime: [1, 250], // 1/250s
    iso: 400
  },
  canon_r5: {
    id: 'canon_r5',
    name: 'Canon EOS R5',
    lens: 'RF 50mm F1.2 L USM',
    make: 'Canon',
    model: 'Canon EOS R5',
    software: 'Firmware Version 1.9.0',
    focalLength: [500, 10],
    focalLength35: 50,
    fNumber: [14, 10], // f/1.4
    exposureTime: [1, 320], // 1/320s
    iso: 200
  },
  fuji_xt5: {
    id: 'fuji_xt5',
    name: 'Fujifilm X-T5',
    lens: 'XF 33mm F1.4 R LM WR',
    make: 'FUJIFILM',
    model: 'X-T5',
    software: 'Digital Camera X-T5 Ver.2.10',
    focalLength: [330, 10],
    focalLength35: 50,
    fNumber: [20, 10], // f/2.0
    exposureTime: [1, 250],
    iso: 320
  },
  leica_q3: {
    id: 'leica_q3',
    name: 'Leica Q3',
    lens: 'Summilux 28mm f/1.7 ASPH.',
    make: 'LEICA CAMERA AG',
    model: 'LEICA Q3',
    software: 'Leica Q3 v2.0.1',
    focalLength: [280, 10],
    focalLength35: 28,
    fNumber: [17, 10], // f/1.7
    exposureTime: [1, 500],
    iso: 100
  }
};

/**
 * Load image file into an HTMLImageElement
 */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Client-Side De-Detection Image Processing Pipeline
 */
export async function processImage(img, options = {}) {
  const {
    cameraPreset = 'sony_a7iv',
    grainAmount = 14, // 0 to 40
    applyVignette = true,
    applyChromaticAberration = true,
    disruptLatents = true,
    quality = 0.92
  } = options;

  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Step 1: Canvas setup with slight geometric shift to disrupt Fourier harmonics
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let targetW = origW;
  let targetH = origH;

  if (disruptLatents) {
    // Non-integer scale to destroy phase-locked latent diffusion grid
    targetW = Math.round(origW * 0.975);
    targetH = Math.round(origH * 0.975);
  }

  canvas.width = targetW;
  canvas.height = targetH;

  ctx.save();
  if (disruptLatents) {
    // Subtle 0.3° rotation & 2% border crop
    ctx.translate(targetW / 2, targetH / 2);
    ctx.rotate((0.32 * Math.PI) / 180);
    ctx.scale(1.025, 1.025);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
  } else {
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }
  ctx.restore();

  // Step 2: Pixel-level physical transformations
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;
  const len = data.length;

  const centerX = targetW / 2;
  const centerY = targetH / 2;
  const maxRadiusSq = centerX * centerX + centerY * centerY;

  // Create temporary buffer for chromatic aberration shift
  let srcR, srcB;
  if (applyChromaticAberration) {
    srcR = new Uint8Array(targetW * targetH);
    srcB = new Uint8Array(targetW * targetH);
    for (let i = 0, p = 0; i < len; i += 4, p++) {
      srcR[p] = data[i];
      srcB[p] = data[i + 2];
    }
  }

  // Precompute pseudo-random Poisson/Gaussian noise lookup
  const noiseLookup = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) {
    // Box-Muller transform for true Gaussian distribution
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    noiseLookup[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
  let noiseIdx = 0;

  for (let y = 0; y < targetH; y++) {
    const dy = y - centerY;
    const dySq = dy * dy;

    for (let x = 0; x < targetW; x++) {
      const idx = (y * targetW + x) * 4;
      const dx = x - centerX;
      const distSq = dx * dx + dySq;

      // 1. Natural Lens Vignetting (-0.2 EV at corners)
      let vignetteMult = 1.0;
      if (applyVignette) {
        vignetteMult = 1.0 - 0.12 * (distSq / maxRadiusSq);
      }

      // 2. Lateral Chromatic Aberration (0.4px sub-pixel radial shift at perimeter)
      let rVal = data[idx];
      let bVal = data[idx + 2];

      if (applyChromaticAberration && srcR && srcB) {
        const factor = 0.001 * (distSq / maxRadiusSq);
        const shiftX = Math.round(dx * factor);
        const shiftY = Math.round(dy * factor);

        const rX = Math.min(targetW - 1, Math.max(0, x + shiftX));
        const rY = Math.min(targetH - 1, Math.max(0, y + shiftY));
        const bX = Math.min(targetW - 1, Math.max(0, x - shiftX));
        const bY = Math.min(targetH - 1, Math.max(0, y - shiftY));

        rVal = srcR[rY * targetW + rX];
        bVal = srcB[bY * targetW + bX];
      }

      let gVal = data[idx + 1];

      // 3. Authentic PRNU / Sensor Grain Injection
      if (grainAmount > 0) {
        const lum = (0.299 * rVal + 0.587 * gVal + 0.114 * bVal) / 255.0;
        // Midtones receive most grain; deep blacks and clipped whites receive less
        const midtoneWeight = Math.sin(lum * Math.PI);

        noiseIdx = (noiseIdx + 1) & 4095;
        const gLuma = noiseLookup[noiseIdx] * grainAmount * midtoneWeight;

        noiseIdx = (noiseIdx + 7) & 4095;
        const gChroma = noiseLookup[noiseIdx] * (grainAmount * 0.45);

        rVal = Math.min(255, Math.max(0, rVal * vignetteMult + gLuma + gChroma));
        gVal = Math.min(255, Math.max(0, gVal * vignetteMult + gLuma));
        bVal = Math.min(255, Math.max(0, bVal * vignetteMult + gLuma - gChroma));
      } else if (applyVignette) {
        rVal = Math.min(255, Math.max(0, rVal * vignetteMult));
        gVal = Math.min(255, Math.max(0, gVal * vignetteMult));
        bVal = Math.min(255, Math.max(0, bVal * vignetteMult));
      }

      data[idx] = rVal;
      data[idx + 1] = gVal;
      data[idx + 2] = bVal;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Step 3: Export clean JPEG from canvas (purging any original C2PA/JUMBF metadata)
  const cleanJpegDataUrl = canvas.toDataURL('image/jpeg', quality);

  // Step 4: Inject Authentic Hardware EXIF
  const preset = CAMERA_PRESETS[cameraPreset] || CAMERA_PRESETS.sony_a7iv;
  const finalDataUrl = injectCameraExif(cleanJpegDataUrl, preset);

  // Convert to Blob for easy download
  const blob = dataUrlToBlob(finalDataUrl);

  return {
    dataUrl: finalDataUrl,
    blob,
    origW,
    origH,
    targetW,
    targetH,
    preset,
    sizeBytes: blob.size
  };
}

/**
 * Build & Inject Genuine Camera EXIF tags using piexifjs
 */
function injectCameraExif(jpegDataUrl, preset) {
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}:${pad2(now.getMonth() + 1)}:${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const zeroth = {
      [piexif.ImageIFD.Make]: preset.make,
      [piexif.ImageIFD.Model]: preset.model,
      [piexif.ImageIFD.Software]: preset.software,
      [piexif.ImageIFD.DateTime]: dateStr,
      [piexif.ImageIFD.Orientation]: 1,
      [piexif.ImageIFD.XResolution]: [300, 1],
      [piexif.ImageIFD.YResolution]: [300, 1],
      [piexif.ImageIFD.ResolutionUnit]: 2
    };

    const exif = {
      [piexif.ExifIFD.DateTimeOriginal]: dateStr,
      [piexif.ExifIFD.DateTimeDigitized]: dateStr,
      [piexif.ExifIFD.ExposureTime]: preset.exposureTime,
      [piexif.ExifIFD.FNumber]: preset.fNumber,
      [piexif.ExifIFD.ISOSpeedRatings]: preset.iso,
      [piexif.ExifIFD.FocalLength]: preset.focalLength,
      [piexif.ExifIFD.FocalLengthIn35mmFilm]: preset.focalLength35,
      [piexif.ExifIFD.LensModel]: preset.lens,
      [piexif.ExifIFD.ColorSpace]: 1, // sRGB
      [piexif.ExifIFD.WhiteBalance]: 0, // Auto
      [piexif.ExifIFD.MeteringMode]: 5, // Multi-segment
      [piexif.ExifIFD.ExposureProgram]: 1, // Manual
      [piexif.ExifIFD.SensitivityType]: 2,
      [piexif.ExifIFD.RecommendedExposureIndex]: preset.iso,
      [piexif.ExifIFD.SceneCaptureType]: 0,
      [piexif.ExifIFD.ExifVersion]: '0232'
    };

    const exifObj = { '0th': zeroth, Exif: exif, GPS: {}, '1st': {}, thumbnail: null };
    const exifBytes = piexif.dump(exifObj);
    return piexif.insert(exifBytes, jpegDataUrl);
  } catch (err) {
    console.warn('EXIF injection fallback:', err);
    return jpegDataUrl;
  }
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
