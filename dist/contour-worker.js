/* Image pixels remain on the device; this worker has no network requests. */
importScripts('drawing-tools.js');
self.onmessage = event => {
  const { pixels, width, height, options } = event.data;
  try { self.postMessage({ boundary: DrawingTools.extractContour(new Uint8ClampedArray(pixels), width, height, options) }); }
  catch (error) { self.postMessage({ error: error.message || 'Could not extract this outline.' }); }
};
