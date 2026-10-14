import json
import os
import rasterio
import numpy as np
from PIL import Image

dem_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_dem_utm.tif"
mb_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_mapbiomas_utm.tif"
legend_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/mapbiomas_col11_legend.json"
out_dir = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public"
os.makedirs(out_dir, exist_ok=True)

# 1. Read DEM
with rasterio.open(dem_path) as src:
    dem = src.read(1).astype(np.float32)
    dem_bounds = src.bounds
    dem_crs = src.crs.to_string()
    res_x, res_y = src.res

valid_mask = dem > 0
min_elev = float(dem[valid_mask].min()) if np.any(valid_mask) else 0.0
max_elev = float(dem[valid_mask].max()) if np.any(valid_mask) else 1000.0
dem[~valid_mask] = min_elev

H, W = dem.shape
print(f"DEM: {W}x{H}, min={min_elev:.1f}m, max={max_elev:.1f}m")

# 2. Normalize height and export both 8-bit PNG and raw Float32 binary
norm_dem = (dem - min_elev) / (max_elev - min_elev)

# 8-bit grayscale heightmap for Three.js DisplacementMap
dem_u8 = (norm_dem * 255.0).astype(np.uint8)
img_dem8 = Image.fromarray(dem_u8, mode="L")
dem_png_path = os.path.join(out_dir, "heightmap.png")
img_dem8.save(dem_png_path)
print(f"Saved 8-bit heightmap: {dem_png_path}")

# Raw float32 normalized elevation binary for exact geometry displacement
bin_path = os.path.join(out_dir, "elevation.bin")
norm_dem.astype(np.float32).tofile(bin_path)
print(f"Saved Float32 elevation binary: {bin_path} ({os.path.getsize(bin_path)} bytes)")

# 3. Read MapBiomas and build RGBA texture
with rasterio.open(mb_path) as src:
    mb = src.read(1)

with open(legend_path, "r", encoding="utf-8") as f:
    legend = json.load(f)

# Define official MapBiomas groupings
CLASS_GROUPS = {
    3:  {"group": "Vegetação Nativa", "color": "#1f8d49"},
    4:  {"group": "Vegetação Nativa", "color": "#7dc975"},
    11: {"group": "Vegetação Nativa", "color": "#519799"},
    12: {"group": "Vegetação Nativa", "color": "#d6bc74"},
    29: {"group": "Vegetação Nativa", "color": "#ad5100"},
    9:  {"group": "Agropecuária",     "color": "#7a5900"},
    15: {"group": "Agropecuária",     "color": "#588834"},
    21: {"group": "Agropecuária",     "color": "#749c44"},
    39: {"group": "Agropecuária",     "color": "#f5b3c8"},
    41: {"group": "Agropecuária",     "color": "#f54ca9"},
    24: {"group": "Áreas Não Vegetadas", "color": "#d4271e"},
    25: {"group": "Áreas Não Vegetadas", "color": "#db4d4f"},
    33: {"group": "Corpos Hídricos",  "color": "#2532e4"}
}

tex_rgba = np.zeros((H, W, 4), dtype=np.uint8)
classes_stats = {}

unique_vals, counts = np.unique(mb, return_counts=True)
total_valid_pixels = int(np.sum(counts[unique_vals > 0]))
pixel_area_ha = (res_x * res_y) / 10000.0  # 900 m2 = 0.09 ha
pixel_area_km2 = (res_x * res_y) / 1000000.0  # 0.0009 km2

total_area_ha = round(total_valid_pixels * pixel_area_ha, 2)
total_area_km2 = round(total_valid_pixels * pixel_area_km2, 2)

groups_summary = {
    "Vegetação Nativa": {"pixels": 0, "area_ha": 0.0, "area_km2": 0.0, "color": "#10b981"},
    "Agropecuária":     {"pixels": 0, "area_ha": 0.0, "area_km2": 0.0, "color": "#f59e0b"},
    "Áreas Não Vegetadas": {"pixels": 0, "area_ha": 0.0, "area_km2": 0.0, "color": "#ef4444"},
    "Corpos Hídricos":  {"pixels": 0, "area_ha": 0.0, "area_km2": 0.0, "color": "#3b82f6"}
}

for val, count in zip(unique_vals, counts):
    val_int = int(val)
    if val_int == 0:
        continue
    mask = (mb == val_int)
    info = legend.get(str(val_int), {"name_pt": f"Classe {val_int}", "hex": "#888888"})
    hex_code = info["hex"].lstrip("#")
    
    # Calibração fotorealista para pastagens e campos do Cerrado
    if val_int == 15:  # Pastagem / Braquiária
        hex_code = "588834"
    elif val_int == 21:  # Mosaico de usos agropecuários
        hex_code = "749c44"

    r = int(hex_code[0:2], 16)
    g = int(hex_code[2:4], 16)
    b = int(hex_code[4:6], 16)
    tex_rgba[mask] = [r, g, b, 255]
    
    pct = (count / total_valid_pixels) * 100.0
    ha = count * pixel_area_ha
    km2 = count * pixel_area_km2

    grp_info = CLASS_GROUPS.get(val_int, {"group": "Outros", "color": "#888888"})
    grp_name = grp_info["group"]
    if grp_name in groups_summary:
        groups_summary[grp_name]["pixels"] += int(count)
        groups_summary[grp_name]["area_ha"] += ha
        groups_summary[grp_name]["area_km2"] += km2

    classes_stats[val_int] = {
        "id": val_int,
        "name_pt": info.get("name_pt", "").replace("\n", " "),
        "name_en": info.get("name_en", "").replace("\n", " "),
        "group": grp_name,
        "hex": "#" + hex_code,
        "count": int(count),
        "area_ha": round(ha, 2),
        "area_km2": round(km2, 2),
        "percentage": round(pct, 2)
    }

# Complete group percentages
formatted_groups = []
for g_name, g_data in groups_summary.items():
    g_pct = (g_data["pixels"] / total_valid_pixels) * 100.0 if total_valid_pixels > 0 else 0
    formatted_groups.append({
        "name": g_name,
        "pixels": g_data["pixels"],
        "area_ha": round(g_data["area_ha"], 2),
        "area_km2": round(g_data["area_km2"], 2),
        "percentage": round(g_pct, 2),
        "color": g_data["color"]
    })

# Save texture as PNG
img_tex = Image.fromarray(tex_rgba, mode="RGBA")
tex_png_path = os.path.join(out_dir, "mapbiomas_texture.png")
img_tex.save(tex_png_path, optimize=True)
print(f"Saved texture: {tex_png_path}")

# 4. Save metadata JSON
metadata = {
    "title": "Parque Estadual da Serra Dourada - MapBiomas Col. 11 (2025)",
    "location": "Goiás, Brasil",
    "width": W,
    "height": H,
    "res_x": res_x,
    "res_y": res_y,
    "aspect_ratio": round(W / H, 4),
    "elevation": {
        "min_m": round(min_elev, 1),
        "max_m": round(max_elev, 1),
        "span_m": round(max_elev - min_elev, 1)
    },
    "bounds": {
        "left": dem_bounds.left,
        "bottom": dem_bounds.bottom,
        "right": dem_bounds.right,
        "top": dem_bounds.top,
        "crs": dem_crs
    },
    "statistics": {
        "total_pixels": total_valid_pixels,
        "total_area_ha": total_area_ha,
        "total_area_km2": total_area_km2,
        "pixel_resolution_m": float(res_x),
        "groups": formatted_groups
    },
    "classes": sorted(classes_stats.values(), key=lambda x: x["percentage"], reverse=True)
}

meta_path = os.path.join(out_dir, "metadata.json")
with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(metadata, f, indent=2, ensure_ascii=False)

print(f"Saved metadata: {meta_path}")
print("Three.js assets prepared successfully!")
