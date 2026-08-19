/**
 * DESYNTH — Client-Side Video De-Detection Engine
 * Processes MP4, WebM, MOV frame-by-frame using Canvas + MediaRecorder
 */

export function loadVideoFromFile(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => {
      resolve({ video, url, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
  });
}

/**
 * Process video client-side:
 * - Dynamic temporal sensor grain (new noise matrix per frame)
 * - 0.25° micro-rotation & 2% crop to disrupt latent spatial lattice
 * - Natural optical lens vignetting
 * - Metadata container stripping & re-encoding via MediaRecorder
 */
export async function processVideo(videoEl, options = {}, onProgress = () => {}) {
  const {
    grainAmount = 14,
    applyVignette = true,
    disruptLatents = true,
    targetFps = 30
  } = options;

  const origW = videoEl.videoWidth || 1280;
  const origH = videoEl.videoHeight || 720;

  // Canvas setup
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const targetW = disruptLatents ? Math.round(origW * 0.98) : origW;
  const targetH = disruptLatents ? Math.round(origH * 0.98) : origH;

  canvas.width = targetW;
  canvas.height = targetH;

  const centerX = targetW / 2;
  const centerY = targetH / 2;
  const maxRadiusSq = centerX * centerX + centerY * centerY;

  // Determine optimal supported MIME type
  const mimeTypes = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  let chosenMime = '';
  for (const mime of mimeTypes) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      chosenMime = mime;
      break;
    }
  }

  if (!chosenMime) {
    chosenMime = 'video/webm';
  }

  const stream = canvas.captureStream(targetFps);
  const recorder = new MediaRecorder(stream, {
    mimeType: chosenMime,
    videoBitsPerSecond: 8000000 // 8 Mbps high quality
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // Pre-generate Gaussian noise pool
  const noisePool = new Float32Array(8192);
  for (let i = 0; i < 8192; i++) {
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    noisePool[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: chosenMime });
      const dataUrl = URL.createObjectURL(blob);
      resolve({
        dataUrl,
        blob,
        origW,
        origH,
        targetW,
        targetH,
        sizeBytes: blob.size,
        mimeType: chosenMime,
        extension: chosenMime.includes('mp4') ? 'mp4' : 'webm'
      });
    };

    recorder.onerror = (err) => reject(err);

    recorder.start(100); // 100ms timeslices

    const totalDuration = videoEl.duration || 5;
    videoEl.currentTime = 0;
    videoEl.muted = true;

    let noiseOffset = 0;

    const renderFrame = () => {
      ctx.save();
      if (disruptLatents) {
        ctx.translate(targetW / 2, targetH / 2);
        ctx.rotate((0.25 * Math.PI) / 180);
        ctx.scale(1.02, 1.02);
        ctx.drawImage(videoEl, -targetW / 2, -targetH / 2, targetW, targetH);
      } else {
        ctx.drawImage(videoEl, 0, 0, targetW, targetH);
      }
      ctx.restore();

      // Pixel-level dynamic temporal grain & optical vignette
      if (grainAmount > 0 || applyVignette) {
        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const data = imgData.data;
        const len = data.length;

        // Shift noise offset every frame for authentic temporal PRNU motion
        noiseOffset = (noiseOffset + 137) & 8191;
        let pIndex = noiseOffset;

        for (let y = 0; y < targetH; y += 2) { // 2x2 block acceleration for smooth video rendering
          const dy = y - centerY;
          const dySq = dy * dy;

          for (let x = 0; x < targetW; x += 2) {
            const idx = (y * targetW + x) * 4;
            const dx = x - centerX;
            const distSq = dx * dx + dySq;

            const vignette = applyVignette ? (1.0 - 0.10 * (distSq / maxRadiusSq)) : 1.0;

            pIndex = (pIndex + 1) & 8191;
            const g = noisePool[pIndex] * (grainAmount * 0.85);

            // Apply to 2x2 block
            for (let by = 0; by < 2 && y + by < targetH; by++) {
              for (let bx = 0; bx < 2 && x + bx < targetW; bx++) {
                const bIdx = ((y + by) * targetW + (x + bx)) * 4;
                data[bIdx] = Math.min(255, Math.max(0, data[bIdx] * vignette + g));
                data[bIdx + 1] = Math.min(255, Math.max(0, data[bIdx + 1] * vignette + g));
                data[bIdx + 2] = Math.min(255, Math.max(0, data[bIdx + 2] * vignette + g));
              }
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      const progress = Math.min(99, Math.round((videoEl.currentTime / totalDuration) * 100));
      onProgress(progress);
    };

    videoEl.onplay = () => {
      const interval = 1000 / targetFps;
      const intervalId = setInterval(() => {
        if (videoEl.paused || videoEl.ended) {
          clearInterval(intervalId);
          renderFrame();
          setTimeout(() => {
            if (recorder.state !== 'inactive') recorder.stop();
          }, 300);
          return;
        }
        renderFrame();
      }, interval);
    };

    videoEl.onended = () => {
      onProgress(100);
    };

    videoEl.play().catch((err) => {
      console.warn('Playback error, stepping manually:', err);
      // Fallback manual frame stepper
      let cur = 0;
      const step = 1 / targetFps;
      const stepLoop = () => {
        if (cur >= totalDuration) {
          onProgress(100);
          recorder.stop();
          return;
        }
        videoEl.currentTime = cur;
        renderFrame();
        cur += step;
        setTimeout(stepLoop, 20);
      };
      stepLoop();
    });
  });
}
