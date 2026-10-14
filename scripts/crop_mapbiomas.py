import json
import rasterio
from rasterio.windows import from_bounds
import numpy as np

# Load OSM boundary
with open("/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_osm.json", "r") as f:
    osm_data = json.load(f)

# Bounding box from OSM: ['lat_min', 'lat_max', 'lon_min', 'lon_max']
bbox = [float(x) for x in osm_data["boundingbox"]]
lat_min, lat_max, lon_min, lon_max = bbox[0], bbox[1], bbox[2], bbox[3]

# Add a slight buffer (e.g., 0.02 degrees ~ 2km) for context
buf = 0.02
left = lon_min - buf
bottom = lat_min - buf
right = lon_max + buf
top = lat_max + buf

print(f"BBox with buffer: W={left:.4f}, S={bottom:.4f}, E={right:.4f}, N={top:.4f}")

input_tif = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/brazil_coverage-col11_2025.tif"
output_tif = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_mapbiomas_2025.tif"

with rasterio.open(input_tif) as src:
    print(f"Source CRS: {src.crs}, shape: {src.shape}")
    window = from_bounds(left, bottom, right, top, transform=src.transform)
    # Round window to integer pixel coordinates
    window = window.round_offsets().round_lengths()
    print(f"Window: {window}")
    
    data = src.read(1, window=window)
    win_transform = src.window_transform(window)
    
    meta = src.meta.copy()
    meta.update({
        "height": data.shape[0],
        "width": data.shape[1],
        "transform": win_transform,
        "compress": "lzw"
    })
    
    with rasterio.open(output_tif, "w", **meta) as dst:
        dst.write(data, 1)

print(f"Saved cropped MapBiomas raster: {output_tif} with shape {data.shape}")

# Value counts
unique, counts = np.unique(data, return_counts=True)
val_counts = dict(zip(unique, counts))

# Load legend
with open("/mnt/e/TrabalhosLAPIG/MapBiomas3D/mapbiomas_col11_legend.json", "r") as f:
    legend = json.load(f)

print("\nPresent Classes:")
for val, count in sorted(val_counts.items(), key=lambda x: x[1], reverse=True):
    val_int = int(val)
    info = legend.get(str(val_int), {"name_pt": "Desconhecido", "hex": "#000000"})
    pct = (count / data.size) * 100
    print(f"  Class {val_int:2d} ({pct:5.2f}% - {count:8d} px): {info['hex']} | {info['name_pt']}")
