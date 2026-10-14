/* Original, dependency-free contour extraction and portable drawing formats. */
(function (root) {
  'use strict';
  const SAMPLE_COUNT = 8192;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const finitePoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const safeName = value => String(value || 'Custom outline').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) || 'Custom outline';
  const escapeXml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

  function signedArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    return area / 2;
  }

  function cleanRing(points) {
    const ring = [];
    for (const p of points) if (!ring.length || p[0] !== ring.at(-1)[0] || p[1] !== ring.at(-1)[1]) ring.push([p[0], p[1]]);
    if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    if (ring.length < 3 || Math.abs(signedArea(ring)) < 1e-12) throw new Error('A closed outline with an area is required.');
    return ring;
  }

  function resample(points, count = SAMPLE_COUNT) {
    const ring = cleanRing(points), distances = [0];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      distances.push(distances.at(-1) + Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
    const samples = []; let edge = 0;
    for (let i = 0; i < count; i++) {
      const d = distances.at(-1) * i / count;
      while (edge < ring.length - 1 && distances[edge + 1] < d) edge++;
      const a = ring[edge], b = ring[(edge + 1) % ring.length];
      const t = (d - distances[edge]) / (distances[edge + 1] - distances[edge]);
      samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return samples;
  }

  function normalizeRings(input) {
    const rings = input.map(cleanRing).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const scale = Math.max(maxX - minX, maxY - minY), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    if (!Number.isFinite(scale) || scale < 1e-10) throw new Error('The outline is too small to draw.');
    return rings.map(ring => {
      const result = ring.map(([x, y]) => [(x - cx) / scale, (y - cy) / scale]);
      result.push([...result[0]]); return result;
    });
  }

  function imageMask(rgba, width, height, threshold = 128, polarity = 'auto') {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3 || width > 512 || height > 512 || rgba.length !== width * height * 4) throw new Error('Invalid image pixels.');
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 254 || !['auto', 'dark', 'light'].includes(polarity)) throw new Error('Invalid contour settings.');
    let transparent = 0, opaque = 0, border = 0, borderCount = 0;
    for (let i = 0; i < width * height; i++) {
      const alpha = rgba[i * 4 + 3];
      if (alpha < 16) transparent++; if (alpha > 128) opaque++;
      const x = i % width, y = Math.floor(i / width);
      // The decoder adds a one-pixel transparent margin; inspect inside it.
      if ((x === 1 || x === width - 2 || y === 1 || y === height - 2) && alpha > 128) {
        border += .2126 * rgba[i * 4] + .7152 * rgba[i * 4 + 1] + .0722 * rgba[i * 4 + 2]; borderCount++;
      }
    }
    // Ignore the decoder's transparent one-pixel frame for alpha detection.
    const margin = width * 2 + (height - 2) * 2;
    const alphaMode = transparent - margin > width * height * .03 && opaque >= 16;
    const light = polarity === 'light' || (polarity === 'auto' && borderCount > 0 && border / borderCount < 128);
    const mask = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x, a = rgba[i * 4 + 3] / 255;
      const luminance = (.2126 * rgba[i * 4] + .7152 * rgba[i * 4 + 1] + .0722 * rgba[i * 4 + 2]) * a + 255 * (1 - a);
      mask[i] = alphaMode ? rgba[i * 4 + 3] >= threshold : a > 0 && (light ? luminance > threshold : luminance < threshold);
    }
    return { mask, alphaMode, polarity: light ? 'light' : 'dark' };
  }

  function largestComponent(mask, width, height) {
    const labels = new Int32Array(mask.length), queue = new Int32Array(mask.length);
    let label = 0, largest = 0, largestSize = 0, significant = 0;
    for (let seed = 0; seed < mask.length; seed++) {
      if (!mask[seed] || labels[seed]) continue;
      label++; let head = 0, tail = 1; queue[0] = seed; labels[seed] = label;
      while (head < tail) {
        const p = queue[head++], x = p % width, y = Math.floor(p / width);
        const neighbors = [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, y > 0 ? p - width : -1, y + 1 < height ? p + width : -1];
        for (const q of neighbors) if (q >= 0 && mask[q] && !labels[q]) { labels[q] = label; queue[tail++] = q; }
      }
      if (tail >= 16) significant++;
      if (tail > largestSize) { largestSize = tail; largest = label; }
    }
    if (largestSize < 16) throw new Error('No clear silhouette found. Try a simple shape with space around it, or adjust the threshold.');
    const result = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) result[i] = labels[i] === largest ? 1 : 0;
    return { mask: result, pixels: largestSize, components: significant };
  }

  function boundaryRings(mask, width, height) {
    const edges = [], outgoing = new Map(), stride = width + 1;
    function edge(x, y, nx, ny, direction) {
      const item = { from: y * stride + x, to: ny * stride + nx, direction, used: false };
      edges.push(item); if (!outgoing.has(item.from)) outgoing.set(item.from, []); outgoing.get(item.from).push(item);
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x; if (!mask[i]) continue;
      if (y === 0 || !mask[i - width]) edge(x, y, x + 1, y, 0);
      if (x + 1 === width || !mask[i + 1]) edge(x + 1, y, x + 1, y + 1, 1);
      if (y + 1 === height || !mask[i + width]) edge(x + 1, y + 1, x, y + 1, 2);
      if (x === 0 || !mask[i - 1]) edge(x, y + 1, x, y, 3);
    }
    if (edges.length > 150000) throw new Error('This image has too much fine texture. Try a simpler silhouette.');
    const rings = [];
    for (const start of edges) {
      if (start.used) continue;
      const ring = []; let current = start, closed = false;
      for (let guard = 0; guard <= edges.length; guard++) {
        current.used = true; ring.push([current.from % stride, Math.floor(current.from / stride)]);
        if (current.to === start.from) { closed = true; break; }
        const candidates = (outgoing.get(current.to) || []).filter(q => !q.used);
        // Keep foreground on the right, resolving diagonal vertex contacts.
        const priority = direction => [1, 0, 3, 2].indexOf((direction - current.direction + 4) % 4);
        candidates.sort((a, b) => priority(a.direction) - priority(b.direction));
        if (!candidates.length) break; current = candidates[0];
      }
      if (!closed) throw new Error('The silhouette boundary could not be closed.');
      const simplified = ring.filter((p, i) => {
        const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      });
      if (simplified.length >= 3 && Math.abs(signedArea(simplified)) >= 1) rings.push(simplified);
    }
    if (!rings.length || rings.length > 128) throw new Error('Use a silhouette with fewer small holes or details.');
    return rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  }

  function smoothRing(ring) {
    // Subdivide before smoothing so long straight edges keep their corners.
    const dense = [], result = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], steps = Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])));
      for (let j = 0; j < steps; j++) dense.push([a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps]);
    }
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i], b = dense[(i + 1) % dense.length];
      result.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    return result.filter((p,i)=>{const a=result[(i+result.length-1)%result.length],b=result[(i+1)%result.length];return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-10});
  }

  function extractContour(rgba, width, height, options = {}) {
    const binary = imageMask(rgba, width, height, options.threshold ?? 128, options.polarity ?? 'auto');
    const component = largestComponent(binary.mask, width, height);
    const rings = normalizeRings(boundaryRings(component.mask, width, height).map(smoothRing));
    if (rings.some(r=>r.length>50000)||rings.reduce((n,r)=>n+r.length,0)>100000) throw new Error('This outline has too many points. Try a simpler silhouette.');
    return { samples: resample(rings[0]), rings, name: safeName(options.name), kind: 'image', source: 'Local image contour',
      extraction: { width, height, alphaMode: binary.alphaMode, polarity: binary.polarity, threshold: options.threshold ?? 128, foregroundPixels: component.pixels, ignoredComponents: Math.max(0, component.components - 1), referenceHoles: rings.length - 1 } };
  }

  function validatePoints(points, maxCount, maxAbs) {
    if (!Array.isArray(points) || points.length < 3 || points.length > maxCount || !points.every(p => finitePoint(p) && p.every(v => Math.abs(v) <= maxAbs))) throw new Error('Invalid or excessive outline coordinates.');
    return points.map(p => [p[0], p[1]]);
  }

  function parseProject(text) {
    if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) throw new Error('Use a JSON file smaller than 10 MB.');
    let data; try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('This JSON does not contain a drawing.');
    if (data.format === 'fourier-portrait') {
      if (data.version !== 1) throw new Error('This drawing version is not supported.');
      const samples = validatePoints(data.drawing?.samples, SAMPLE_COUNT, 4);
      if (samples.length !== SAMPLE_COUNT || !Array.isArray(data.drawing.rings) || !data.drawing.rings.length || data.drawing.rings.length > 128) throw new Error('A project must contain 8,192 samples and valid reference outlines.');
      const rings = data.drawing.rings.map(r => validatePoints(r, 50000, 4));
      if (rings.reduce((n, r) => n + r.length, 0) > 100000) throw new Error('Too many reference outline points.');
      cleanRing(samples); rings.forEach(cleanRing);
      const settings = data.settings || {};
      if (!Number.isInteger(settings.harmonics) || settings.harmonics < 2 || settings.harmonics > 4095 || !Number.isFinite(settings.speed) || settings.speed < .25 || settings.speed > 2 || !Number.isFinite(settings.progress) || settings.progress < 0 || settings.progress > 1) throw new Error('This project contains invalid drawing settings.');
      return { boundary: { samples, rings, name: safeName(data.source?.name), kind: 'json', source: 'Imported JSON project' }, settings: {
        count: settings.harmonics, speed: settings.speed, progress: settings.progress, circles: settings.circles !== false, guide: settings.guide !== false, progressive: settings.progressive === true, playing: false, cycle: 1 } };
    }
    // Interoperable path-only files, including arrays of {x,y} coordinates.
    if (Array.isArray(data.path)) {
      const points = validatePoints(data.path.map(p => Array.isArray(p) ? p : [p?.x, p?.y]), 50000, 1e6);
      const rings = normalizeRings([points]);
      return { boundary: { samples: resample(rings[0]), rings, name: safeName(data.name || 'Imported path'), kind: 'json', source: 'Imported JSON path' }, settings: null };
    }
    throw new Error('Choose a Fourier Portrait project or a JSON object containing a path array.');
  }

  function buildProject(boundary, state, traceX, traceY, rms) {
    return JSON.stringify({ format: 'fourier-portrait', version: 1,
      source: { name: safeName(boundary.name || 'Bangladesh'), kind: boundary.kind || 'bangladesh', credit: boundary.source },
      drawing: { samples: boundary.samples, rings: boundary.rings },
      settings: { harmonics: state.count, speed: state.speed, progress: state.progress, circles: state.circles, guide: state.guide, progressive: state.progressive },
      reconstruction: { scope: 'selected-harmonics-full-cycle', sampleCount: traceX.length, normalizedRmsPercent: rms, path: Array.from(traceX, (x, i) => [x, traceY[i]]) }
    });
  }

  function buildSvg(boundary, state, traceX, traceY, rms) {
    if (!traceX.length || traceX.length !== traceY.length) throw new Error('The reconstruction is not ready.');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < traceX.length; i++) { minX = Math.min(minX, traceX[i]); maxX = Math.max(maxX, traceX[i]); minY = Math.min(minY, traceY[i]); maxY = Math.max(maxY, traceY[i]); }
    for (const ring of boundary.rings.slice(1)) for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const scale = 1000, pad = 65, width = Math.max(900,Math.ceil((maxX - minX) * scale + pad * 2)), height = Math.ceil((maxY - minY) * scale + pad * 2 + 100);
    const offsetX=(width-(maxX-minX)*scale)/2;
    const point = (x, y) => `${((x - minX) * scale + offsetX).toFixed(3)},${((y - minY) * scale + pad + 60).toFixed(3)}`;
    let path = '';
    for (let i = 0; i < traceX.length; i++) path += `${i ? ' L' : 'M'}${point(traceX[i], traceY[i])}`;
    path += ' Z';
    const references = boundary.rings.slice(1).map(r => `<path data-role="reference-outline" d="${r.map(([x,y],i)=>(i?'L':'M')+point(x,y)).join(' ')} Z" fill="none" stroke="#7545b8" stroke-width="1.6"/>`).join('');
    const title = escapeXml(boundary.name || 'Bangladesh');
    const titleSize=Math.min(30,(width-pad*2)/(Math.max(1,(boundary.name||'Bangladesh').length)*.7));
    const metadata = escapeXml(JSON.stringify({ format: 'fourier-portrait-svg', version: 1, harmonics: state.count, normalizedRmsPercent: rms, scope: 'full selected-N reconstruction; secondary paths are reference outlines' }));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${title} — Fourier portrait, N=${state.count}</title><metadata>${metadata}</metadata><rect width="100%" height="100%" fill="#fff"/><text x="${pad}" y="45" font-family="Georgia,serif" font-size="${titleSize.toFixed(2)}" fill="#17151d">${title}</text><path data-role="fourier-reconstruction" d="${path}" fill="none" stroke="#bc2444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${references}<text x="${pad}" y="${height-24}" font-family="monospace" font-size="12" fill="#716a7a">N=${state.count} · normalized RMS ${rms.toPrecision(7)}% · full reconstructed outline</text></svg>`;
  }

  root.DrawingTools = { SAMPLE_COUNT, MAX_FILE_BYTES, safeName, escapeXml, signedArea, resample, normalizeRings, imageMask, largestComponent, boundaryRings, extractContour, parseProject, buildProject, buildSvg };
  if (typeof module !== 'undefined') module.exports = root.DrawingTools;
})(typeof window !== 'undefined' ? window : globalThis);
