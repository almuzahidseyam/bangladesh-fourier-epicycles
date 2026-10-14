# Bangladesh — A Fourier Portrait

An interactive portrait of Bangladesh in **red, black, white, and purple**, drawn with actual Fourier epicycles. The horizontal coordinate comes from the **X circles on the bottom axis**; the vertical coordinate comes from the **Y circles on the left axis**. Their projected endpoints meet on the map. The circles stay outside the map throughout their rotations.

**[Live demo](https://almuzahidseyam.github.io/bangladesh-fourier-epicycles/)** · **[RMS analysis](rms-analysis.json)**

![Bangladesh drawn with Fourier epicycles](assets/portrait.png)

## Explore

- **N = 2–4095** harmonics per axis; default N=1024, with 128 / 1024 / 4095 presets.
- Enter N directly and press **Apply** or **Enter**. Whole numbers and powers such as `2^10` are accepted. Invalid values show an explanation and leave the applied N unchanged.
- A red mainland border and purple coastal islands sit on white, with black editorial headers and purple controls.
- X and Y epicycles occupy separate axes with a guaranteed gap from the map.
- **Focus on map** enlarges the border without the circles. Switch back with **Show axes**.
- Play / pause, restart, 0.25×–2× speed, and a timeline to inspect any position.
- Progressive detail doubles N each cycle until 4095.
- A logarithmic RMS convergence chart and **Find minimum RMS** button.
- High-resolution PNG export and fullscreen where supported.
- **SVG export** of the complete curve at the selected N, plus **JSON project export/import** to resume editing.
- **Image upload** with local silhouette tracing, threshold adjustment, automatic dark/light detection and transparent PNG support.
- Responsive layout, keyboard controls, and reduced-motion support.
- A complete mathematics section: X/Y Fourier series, all four coefficient integrals, DC means, radius/phase identity, and live numerical equations.

## Run

Open `dist/index.html` directly in a browser. No dependencies, installation, API keys, or build step are required. All drawing data is included; optional Google Fonts fall back to system fonts offline.

Alternatively, from the repository root:

```sh
python -m http.server 4173 --directory dist
```

Then open http://localhost:4173. Space toggles playback outside controls; the range inputs support arrow keys and Home / End.

## Bring your own outline

Choose **Upload image** and select a PNG, JPG or WebP (up to 10 MiB and 25 megapixels). Filled silhouettes and high-contrast logos work best. The browser downsamples to at most 510 pixels on the longest side, thresholds luminance or alpha, selects the largest 4-connected foreground component and traces its directed exterior edges. It smooths corners at subpixel scale, centres the contour, scales its longest side to 1 and resamples it to 8,192 equally spaced positions. A worker handles contour extraction where supported; a local fallback uses the same algorithm.

**Edge threshold** and **Shape colour** refine the extracted silhouette. Transparent images use alpha rather than colour. Other significant disconnected parts are counted and omitted. Holes appear as purple reference contours; the Fourier series and RMS describe only the main exterior. This is silhouette tracing rather than semantic object recognition: busy photos, fine disconnected lines and highly textured images need preparation. Contours with excessive edges, holes or vertices are rejected with an explanation. All image and project processing stays on the device; there is no upload service.

**Full outline · SVG** saves the complete selected-N Fourier reconstruction, regardless of animation position. It includes a white background, red curve, purple secondary reference paths, and N/RMS metadata. Changing N changes the exported geometry. SVG is a portable vector illustration, not a project import format.

**Save project · JSON** preserves the source samples, reference rings, N, speed, position and display settings, plus the full reconstruction. **Import JSON** restores the project paused and recomputes coefficients and RMS from its source samples; it does not trust saved result values. The versioned format is `fourier-portrait`, version `1`. Import also accepts a path-only object such as `{"name":"Triangle","path":[{"x":0,"y":0},{"x":100,"y":0},{"x":40,"y":90}]}` or coordinate pairs. Paths must be finite, have nonzero signed area and contain 3–50,000 points. Imported projects are capped at 10 MiB, 8,192 samples and 100,000 reference vertices. These limits keep malformed files from allocating unbounded work.

Use **Bangladesh** to return to the included map. Custom images are kept only in memory; save a JSON project before reloading to keep your outline. Image threshold settings are not part of a saved JSON; the extracted contour is preserved instead. The FFT engine, all-N RMS study and separated X/Y epicycles work with custom outlines too.

The contour and interchange implementations are original and dependency-free. No code from DrawingWithFourier is included.

## How many harmonics can be used?

The detailed **Natural Earth 1:10m v5.1.2** Bangladesh geometry has 2,280 exterior vertices across 22 polygons. The largest polygon is the mainland. Its exterior is projected locally, centered, and sampled at **8,192 equal arc-length positions**. This implementation uses the **4,095 ordinary positive frequencies strictly below Nyquist**; the Nyquist bin remains in the residual. A radix-2 FFT creates the coefficients of each real coordinate series:

```text
f(t) = a₀ + Σ [aₖ cos(kt) + bₖ sin(kt)]
```

An inverse FFT reconstructs **16,384 positions per cycle**, so high-frequency detail is retained in the rendered line. Tiny circles can fall below a screen pixel and are omitted visually; every selected coefficient still contributes to the position. Offshore islands are coloured reference outlines, not part of the mainland's Fourier error metric.

`2^32` is **4,294,967,296 harmonics**, not 32. It is outside the available spectrum and is not practical to compute and animate in this browser app. A standard sampled real series with that many ordinary positive frequencies needs more than 8.59 billion samples. The input rejects this value explicitly instead of pretending to render it or silently substituting a smaller N.

## Mathematics on the page

The Math link opens native MathML equations for both coordinate series; the a/b and c/d coefficient integrals; a0/c0 averages; and the amplitude-phase identity with Rk = sqrt(ak² + bk²) and phi = atan2(bk, ak). Each X arm starts at -phi; the Y construction is rotated by pi/2 for vertical projection. The live examples show the first three selected terms using actual FFT coefficients and update with N. The N=150 button applies that value and displays the actual RMS for this boundary. Current t, x(t), and y(t) follow the drawing position.

## RMS study

Every integer **N=2…4095** was evaluated. Error is the root-mean-square Euclidean reconstruction distance divided by the mainland samples' RMS radius about their centroid, expressed as a percentage. Parseval's theorem gives the same residual as direct reconstruction; the checks compare both methods. Omitted spectral energy is summed directly, avoiding cancellation when error is very small. More orthogonal frequencies reduce this sampled RMS monotonically.

| Harmonics per axis | Sampled normalized RMS | Independent midpoint RMS |
| ---: | ---: | ---: |
| 128 | 0.719306% | 0.719405% |
| 256 | 0.300928% | 0.300955% |
| 512 | 0.105006% | 0.105053% |
| 768 | 0.052810% | 0.052981% |
| 1024 | 0.031998% | 0.032293% |
| 2048 | 0.011298% | 0.012364% |
| **4095** | **0.00004898%** | **0.008273%** |

**N=4095 is the sampled minimum within the tested range.** It does not produce exact zero error. The independent validation uses another 8,192 points halfway between the training positions on the original source polyline. Near-zero training error does not imply near-zero error between samples. This measures reconstruction of this boundary dataset, not real-world geographic accuracy. The complete 4,094-value convergence curve and validation results are in [`rms-analysis.json`](rms-analysis.json).

## Why circles cannot enter the map

The layout calculates an envelope containing every circle, over the entire cycle, including its radius. Bounds between sampled phases include a derivative-based margin. The X chain is placed below the map's lowest reference/reconstructed point; the Y chain is placed to the left of its leftmost point. Both retain an additional gap equal to 18% of the normalized mainland height. Projection lines connect the separated circles to the drawing point.

## Reproduce the checks

```sh
python prepare-boundary.py
node check-math.cjs
node check-interactions.cjs
node check-drawing-tools.cjs
```

The checks verify known signals, FFT/direct-series agreement, Nyquist protection, periodic closure, every tested RMS value's monotonicity, independent midpoint error, circle separation at off-grid phases, manual and power-notation input, invalid-input rejection, reduced motion, progressive detail, scrubbing, and pause/restart behavior. Contour tests cover edge order, holes, disconnected parts, alpha and inverted colours. Interchange tests cover JSON round trips, rejected malformed projects, legacy paths, actual selected-N SVG geometry and XML escaping. The numerical check regenerates `rms-analysis.json`. Optional `node check-drawing-tools.cjs --fixtures` writes reproducible PNG/JSON fixtures to the system temporary directory for browser testing.

## Files

- `dist/`: browser-ready HTML, CSS, FFT implementation, drawing engine, and boundary asset.
- `boundary-natural-earth.geojson`: pinned Bangladesh source geometry.
- `prepare-boundary.py`: standard-library asset and independent validation sample generator.
- `check-math.cjs`: numerical and layout verification.
- `check-interactions.cjs`: animation/control regression checks with a simulated clock.
- `dist/drawing-tools.js`: silhouette tracing, input validation, portable SVG/JSON formats.
- `dist/contour-worker.js`: off-thread contour extraction.
- `check-drawing-tools.cjs`: contour, interchange and export regression checks.
- `validation-samples.json`: independent midpoint reference positions.
- `rms-analysis.json`: exhaustive convergence report.

## Data credits

Made with [Natural Earth](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/). Its map data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The Bangladesh feature is extracted from the [v5.1.2 countries GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson). This is an artistic study of generalized geographic data. No third-party data licence is applied to the application source code.
