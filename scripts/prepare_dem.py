import subprocess
import rasterio

# Reference MapBiomas cropped raster
ref_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_mapbiomas_2025.tif"
with rasterio.open(ref_path) as src:
    bounds = src.bounds
    res_x, res_y = src.res
    width, height = src.width, src.height
    crs = src.crs.to_string()

print(f"Reference raster: {width}x{height}, bounds={bounds}, CRS={crs}")

dem_urls = [
    "/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S17_00_W051_00_DEM/Copernicus_DSM_COG_10_S17_00_W051_00_DEM.tif",
    "/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S16_00_W051_00_DEM/Copernicus_DSM_COG_10_S16_00_W051_00_DEM.tif",
    "/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S17_00_W050_00_DEM/Copernicus_DSM_COG_10_S17_00_W050_00_DEM.tif",
    "/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S16_00_W050_00_DEM/Copernicus_DSM_COG_10_S16_00_W050_00_DEM.tif"
]

output_dem = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_dem_copernicus.tif"

cmd = [
    "gdalwarp",
    "-te", str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top),
    "-ts", str(width), str(height),
    "-t_srs", crs,
    "-r", "bilinear",
    "-co", "COMPRESS=DEFLATE",
    "-overwrite",
    *dem_urls,
    output_dem
]

print("Running gdalwarp to extract DEM...")
result = subprocess.run(cmd, capture_output=True, text=True)
print("Exit code:", result.returncode)
if result.stdout:
    print("Stdout:", result.stdout)
if result.stderr:
    print("Stderr:", result.stderr)

# Inspect resulting DEM
with rasterio.open(output_dem) as dem_src:
    dem_data = dem_src.read(1)
    print(f"Generated DEM: shape={dem_data.shape}, min={dem_data.min():.1f}m, max={dem_data.max():.1f}m, mean={dem_data.mean():.1f}m")
