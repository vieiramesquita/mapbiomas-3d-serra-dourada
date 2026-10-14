import subprocess
import rasterio

# Reproject DEM to UTM 22S (EPSG:31982) with 30m resolution
input_dem = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_dem_copernicus.tif"
output_dem_utm = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_dem_utm.tif"

cmd_dem = [
    "gdalwarp",
    "-t_srs", "EPSG:31982",
    "-tr", "30", "30",
    "-r", "bilinear",
    "-co", "COMPRESS=DEFLATE",
    "-overwrite",
    input_dem,
    output_dem_utm
]

print("Reprojecting DEM to UTM 22S...")
subprocess.run(cmd_dem, check=True)

# Get bounds of the reprojected DEM to match MapBiomas exactly
with rasterio.open(output_dem_utm) as src:
    bounds = src.bounds
    width, height = src.width, src.height
    print(f"Reprojected DEM UTM: {width}x{height}, bounds={bounds}")

# Reproject MapBiomas raster to match DEM grid exactly using nearest neighbor (categorical classes)
input_mb = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_mapbiomas_2025.tif"
output_mb_utm = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_mapbiomas_utm.tif"

cmd_mb = [
    "gdalwarp",
    "-t_srs", "EPSG:31982",
    "-te", str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top),
    "-ts", str(width), str(height),
    "-r", "near",
    "-co", "COMPRESS=LZW",
    "-overwrite",
    input_mb,
    output_mb_utm
]

print("Reprojecting MapBiomas to UTM 22S...")
subprocess.run(cmd_mb, check=True)

with rasterio.open(output_mb_utm) as src:
    print(f"Reprojected MapBiomas UTM: {src.width}x{src.height}, bounds={src.bounds}")

print("Both DEM and MapBiomas successfully projected to UTM 22S (EPSG:31982) in meters!")
