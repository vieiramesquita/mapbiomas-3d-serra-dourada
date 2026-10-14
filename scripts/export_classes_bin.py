import rasterio
import numpy as np

mb_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_mapbiomas_utm.tif"
with rasterio.open(mb_path) as src:
    mb = src.read(1).astype(np.uint8)

out_bin = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public/classes.bin"
mb.tofile(out_bin)
print(f"Exported classes.bin: {mb.shape}, {len(mb.tobytes())} bytes")
