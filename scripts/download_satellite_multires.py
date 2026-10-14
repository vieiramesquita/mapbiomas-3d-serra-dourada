import math
import urllib.request
import io
import os
import sys
import time
import argparse
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

def main():
    parser = argparse.ArgumentParser(description="Download and generate High-Res 8K / 12K Satellite Texture for Serra Dourada")
    parser.add_argument("--zoom", type=int, default=15, help="Tile zoom level (15 for ~11.5K native, 16 for ~22.8K native)")
    parser.add_argument("--workers", type=int, default=32, help="Parallel download workers")
    args = parser.parse_args()

    zoom = args.zoom
    workers = args.workers

    # Bounding box with small safety padding to ensure 100% coverage after UTM warping
    west_pad = -50.510
    south_pad = -16.175
    east_pad = -50.030
    north_pad = -15.925

    x_min, y_min = deg2num(north_pad, west_pad, zoom)
    x_max, y_max = deg2num(south_pad, east_pad, zoom)

    cols = x_max - x_min + 1
    rows = y_max - y_min + 1
    total_tiles = cols * rows
    mosaic_w = cols * 256
    mosaic_h = rows * 256

    print(f"=== Satellite High-Res Generator (Zoom {zoom}) ===")
    print(f"Tiles: X:[{x_min}..{x_max}] ({cols} cols), Y:[{y_min}..{y_max}] ({rows} rows)")
    print(f"Total tiles to download: {total_tiles}")
    print(f"Native mosaic dimensions: {mosaic_w} x {mosaic_h} pixels")

    tiles_data = {}
    downloaded = 0
    start_time = time.time()

    def fetch_tile(coord):
        x, y = coord
        url = f"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={zoom}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=8) as resp:
                    data = resp.read()
                    img = Image.open(io.BytesIO(data))
                    return (x, y, img)
            except Exception as e:
                time.sleep(0.5 * (attempt + 1))
        print(f"Warning: Failed tile {x},{y} after 4 attempts, using placeholder.")
        return (x, y, Image.new("RGB", (256, 256), color=(40, 50, 40)))

    coords = [(x, y) for x in range(x_min, x_max + 1) for y in range(y_min, y_max + 1)]

    print(f"Starting parallel download with {workers} threads...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_tile, c): c for c in coords}
        for future in concurrent.futures.as_completed(futures):
            x, y, img = future.result()
            tiles_data[(x, y)] = img
            downloaded += 1
            if downloaded % 100 == 0 or downloaded == total_tiles:
                elapsed = time.time() - start_time
                rate = downloaded / max(0.1, elapsed)
                pct = downloaded / total_tiles * 100
                print(f"Progress: {downloaded}/{total_tiles} ({pct:.1f}%) - {rate:.1f} tiles/s")

    elapsed_dl = time.time() - start_time
    print(f"Download completed in {elapsed_dl:.1f}s ({total_tiles/elapsed_dl:.1f} tiles/s average)")

    print(f"Stitching {mosaic_w}x{mosaic_h} mosaic...")
    mosaic = Image.new("RGB", (mosaic_w, mosaic_h))
    for (x, y), tile_img in tiles_data.items():
        px = (x - x_min) * 256
        py = (y - y_min) * 256
        mosaic.paste(tile_img, (px, py))

    # Georeference in WGS84
    lat_top, lon_left = num2deg(x_min, y_min, zoom)
    lat_bottom, lon_right = num2deg(x_max + 1, y_max + 1, zoom)
    transform = from_bounds(lon_left, lat_bottom, lon_right, lat_top, mosaic_w, mosaic_h)

    wgs84_tif = f"/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_satellite_wgs84_z{zoom}.tif"
    print(f"Saving georeferenced GeoTIFF: {wgs84_tif}...")
    np_img = np.array(mosaic)
    with rasterio.open(
        wgs84_tif,
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

    print(f"Saved {wgs84_tif} successfully!")

    # Reference UTM raster
    ref_utm = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_dem_utm.tif"
    with rasterio.open(ref_utm) as src:
        bounds = src.bounds

    # Produce 8K and 12K warped UTM rasters and web JPEG textures
    targets = [
        {"name": "8K",  "w": 8192,  "h": 4205, "tif": "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_satellite_utm_8k.tif",  "jpg": "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public/satellite_texture_8k.jpg", "qual": 88},
        {"name": "12K", "w": 12288, "h": 6308, "tif": "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_satellite_utm_12k.tif", "jpg": "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public/satellite_texture_12k.jpg", "qual": 85}
    ]

    for t in targets:
        print(f"\n--- Processing {t['name']} ({t['w']} x {t['h']} px) ---")
        cmd = [
            "gdalwarp",
            "-t_srs", "EPSG:31982",
            "-te", str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top),
            "-ts", str(t["w"]), str(t["h"]),
            "-r", "cubic",
            "-co", "COMPRESS=LZW",
            "-overwrite",
            wgs84_tif,
            t["tif"]
        ]
        print(f"Running gdalwarp for {t['name']}...")
        subprocess.run(cmd, check=True)

        print(f"Exporting optimized web JPEG: {t['jpg']}...")
        with rasterio.open(t["tif"]) as src:
            r = src.read(1)
            g = src.read(2)
            b = src.read(3)
            rgb = np.stack([r, g, b], axis=-1)
            tex_img = Image.fromarray(rgb, mode="RGB")
            tex_img.save(t["jpg"], "JPEG", quality=t["qual"], subsampling=0, optimize=True)
            fsize_mb = os.path.getsize(t["jpg"]) / (1024 * 1024)
            print(f"Successfully generated {t['name']} texture: {t['jpg']} ({fsize_mb:.2f} MB)")

    # Also update default satellite_texture.jpg to the 8K version as standard baseline
    default_jpg = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public/satellite_texture.jpg"
    print(f"\nSetting default satellite_texture.jpg to 8K Ultra-sharp...")
    Image.open(targets[0]["jpg"]).save(default_jpg, "JPEG", quality=88, subsampling=0, optimize=True)
    def_mb = os.path.getsize(default_jpg) / (1024 * 1024)
    print(f"Updated default satellite_texture.jpg ({def_mb:.2f} MB)")

    print("\n=== All High-Res Satellite Textures Generated Successfully! ===")

if __name__ == "__main__":
    main()
