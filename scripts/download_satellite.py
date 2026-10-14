import math
import urllib.request
import io
import os
import concurrent.futures
from PIL import Image
import numpy as np
import rasterio
from rasterio.transform import from_bounds
import subprocess

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def num2deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)

# Geographic bounds (WGS84)
west = -50.502207
south = -16.162129
east = -50.040293
north = -15.934136

zoom = 14  # High detail (~9.5m/px, comparable to Sentinel-2 10m)
x_min, y_min = deg2num(north, west, zoom)
x_max, y_max = deg2num(south, east, zoom)

cols = x_max - x_min + 1
rows = y_max - y_min + 1
print(f"Downloading Satellite tiles: Zoom {zoom}, X: [{x_min}..{x_max}] ({cols} cols), Y: [{y_min}..{y_max}] ({rows} rows), Total = {cols * rows} tiles")

# Download tiles in parallel
tiles_data = {}

def fetch_tile(x, y):
    # Google Satellite URL (lyrs=s for satellite without labels)
    url = f"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={zoom}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            return (x, y, Image.open(io.BytesIO(data)))
    except Exception as e:
        print(f"Failed tile {x},{y}: {e}")
        return (x, y, Image.new("RGB", (256, 256), color=(30, 40, 30)))

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
    futures = [executor.submit(fetch_tile, x, y) for x in range(x_min, x_max + 1) for y in range(y_min, y_max + 1)]
    for f in concurrent.futures.as_completed(futures):
        x, y, img = f.result()
        tiles_data[(x, y)] = img

# Stitch mosaic image
mosaic_w = cols * 256
mosaic_h = rows * 256
mosaic = Image.new("RGB", (mosaic_w, mosaic_h))

for (x, y), tile_img in tiles_data.items():
    px = (x - x_min) * 256
    py = (y - y_min) * 256
    mosaic.paste(tile_img, (px, py))

# Bounds of the stitched tile grid in WGS84
lat_top, lon_left = num2deg(x_min, y_min, zoom)
lat_bottom, lon_right = num2deg(x_max + 1, y_max + 1, zoom)

print(f"Stitched mosaic: {mosaic_w}x{mosaic_h}. Geo bounds: [{lon_left:.4f}, {lat_bottom:.4f}, {lon_right:.4f}, {lat_top:.4f}]")

# Save as georeferenced GeoTIFF in EPSG:4326
raw_tif_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_satellite_wgs84.tif"
transform = from_bounds(lon_left, lat_bottom, lon_right, lat_top, mosaic_w, mosaic_h)

np_img = np.array(mosaic)
with rasterio.open(
    raw_tif_path,
    "w",
    driver="GTiff",
    height=mosaic_h,
    width=mosaic_w,
    count=3,
    dtype=np_img.dtype,
    crs="EPSG:4326",
    transform=transform,
    compress="lzw"
) as dst:
    for band in range(3):
        dst.write(np_img[:, :, band], band + 1)

print(f"Saved WGS84 satellite GeoTIFF: {raw_tif_path}")

# Warp to match our exact UTM 22S raster (1650 x 847)
ref_utm = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_dem_utm.tif"
with rasterio.open(ref_utm) as src:
    bounds = src.bounds
    width, height = src.width, src.height

output_utm = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_satellite_utm.tif"
cmd = [
    "gdalwarp",
    "-t_srs", "EPSG:31982",
    "-te", str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top),
    "-ts", str(width), str(height),
    "-r", "cubic",
    "-co", "COMPRESS=LZW",
    "-overwrite",
    raw_tif_path,
    output_utm
]

print("Warping satellite to exact UTM 22S grid...")
subprocess.run(cmd, check=True)

# Also export as PNG texture for Three.js
with rasterio.open(output_utm) as src:
    r = src.read(1)
    g = src.read(2)
    b = src.read(3)
    rgb = np.stack([r, g, b], axis=-1)
    img_tex = Image.fromarray(rgb, mode="RGB")
    tex_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public/satellite_texture.jpg"
    img_tex.save(tex_path, quality=90, optimize=True)
    print(f"Saved Three.js satellite texture: {tex_path}")

print("Satellite download and alignment completed successfully!")
