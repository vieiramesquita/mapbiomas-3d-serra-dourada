import rasterio
import numpy as np
from PIL import Image

def export_4k_satellite():
    in_tif = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_satellite_utm_4k.tif"
    out_jpg = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public/satellite_texture.jpg"
    print(f"Reading {in_tif}...")
    with rasterio.open(in_tif) as src:
        r = src.read(1)
        g = src.read(2)
        b = src.read(3)
        rgb = np.stack([r, g, b], axis=-1)
        img = Image.fromarray(rgb, mode="RGB")
        print(f"Image dimensions: {img.size}")
        img.save(out_jpg, "JPEG", quality=92, subsampling=0, optimize=True)
        print(f"Successfully saved 4K satellite texture: {out_jpg}")

if __name__ == "__main__":
    export_4k_satellite()
