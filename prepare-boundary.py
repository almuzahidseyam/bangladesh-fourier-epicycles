"""Prepare a local, dependency-free drawing asset from geoBoundaries ADM0."""
import json
import math
from pathlib import Path

root = Path(__file__).parent
data = json.loads((root / 'boundary-natural-earth.geojson').read_text())
geometry = data['features'][0]['geometry']
polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
rings = [polygon[0] for polygon in polygons]
def area(ring):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring, ring[1:])))
rings.sort(key=area, reverse=True)
cos_lat = math.cos(math.radians(23.7))
projected = [[[lon * cos_lat, -lat] for lon, lat, *_ in ring] for ring in rings]
main = projected[0]
cx = (min(p[0] for p in main)+max(p[0] for p in main))/2
cy = (min(p[1] for p in main)+max(p[1] for p in main))/2
height = max(p[1] for p in main)-min(p[1] for p in main)
normalized = [[[round((x-cx)/height,10),round((y-cy)/height,10)] for x,y in ring] for ring in projected]
# Begin near the northwestern edge; evenly spaced arc-length samples avoid
# over-weighting detailed coastline vertices in the Fourier transform.
ring = normalized[0][:-1]
start = min(range(len(ring)), key=lambda i: ring[i][0]+ring[i][1])
ring = ring[start:]+ring[:start]
ring.append(ring[0])
lengths = [0.0]
for a,b in zip(ring,ring[1:]):
    lengths.append(lengths[-1]+math.dist(a,b))
def resample(count, offset=0):
    samples=[]
    j=0
    for i in range(count):
        distance=(i+offset)*lengths[-1]/count
        while j<len(ring)-2 and lengths[j+1]<distance:
            j+=1
        t=(distance-lengths[j])/(lengths[j+1]-lengths[j])
        samples.append([round(ring[j][axis]*(1-t)+ring[j+1][axis]*t,11) for axis in (0,1)])
    return samples
samples=resample(8192)
asset={'samples':samples,'rings':normalized,'source':'Natural Earth 1:10m Admin 0, v5.1.2','license':'Public domain','url':'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/','vertices':sum(len(ring) for ring in rings)}
(root/'dist'/'boundary.js').write_text('window.BANGLADESH_BOUNDARY = '+json.dumps(asset,separators=(',',':'))+';\n',encoding='utf-8')
(root/'validation-samples.json').write_text(json.dumps(resample(8192,.5),separators=(',',':')),encoding='utf-8')
print(f'Prepared {len(samples)} samples, {len(rings)} boundary rings.')
