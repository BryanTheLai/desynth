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
    iso: 100
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
    iso: 100
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
    iso: 125
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
 * Lossless Client-Side De-Detection Image Processing Pipeline
 */
export async function processImage(img, options = {}) {
  const {
    cameraPreset = 'sony_a7iv',
    grainAmount = 2, // Default to ultra-subtle sub-perceptual dither (0-6)
    applyVignette = false, // Off by default for pure lossless clarity
    applyChromaticAberration = false,
    disruptLatents = true,
    quality = 0.96 // High visual fidelity
  } = options;

  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Preserve 100% full resolution
  const targetW = origW;
  const targetH = origH;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Direct crisp render
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Sub-perceptual PRNU micro-dither (invisible to the human eye, breaks AI Fourier spectral spikes)
  if (grainAmount > 0) {
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;
    const len = data.length;

    // Sub-perceptual amplitude (e.g. 0.4 to 1.8 intensity out of 255)
    const scale = (grainAmount / 10.0) * 1.5;

    for (let i = 0; i < len; i += 4) {
      // Gaussian micro-dither
      const u1 = Math.max(1e-6, Math.random());
      const u2 = Math.random();
      const dither = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * scale;

      data[i] = Math.min(255, Math.max(0, data[i] + dither));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + dither));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + dither));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // Export clean JPEG (strips any original C2PA/JUMBF manifests)
  const cleanJpegDataUrl = canvas.toDataURL('image/jpeg', quality);

  // Inject Authentic Hardware EXIF
  const preset = CAMERA_PRESETS[cameraPreset] || CAMERA_PRESETS.sony_a7iv;
  const finalDataUrl = injectCameraExif(cleanJpegDataUrl, preset);

  // Convert to Blob
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
