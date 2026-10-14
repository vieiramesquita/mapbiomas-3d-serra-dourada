import urllib.request
import urllib.parse
import json

url = "https://nominatim.openstreetmap.org/search?q=" + urllib.parse.quote("Parque Estadual da Serra Dourada") + "&format=json&polygon_geojson=1"
req = urllib.request.Request(url, headers={"User-Agent": "MapBiomas3D-LAPIG/1.0 (vinicius@lapig.ufg.br)"})

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    print("Found entries:", len(data))
    for item in data:
        print(f"Name: {item.get('display_name')}")
        print(f"Type: {item.get('type')}, Class: {item.get('class')}")
        print(f"BoundingBox: {item.get('boundingbox')}")
        geojson = item.get("geojson")
        print(f"GeoJSON Type: {geojson.get('type') if geojson else None}")
        
    if data:
        with open("/mnt/e/TrabalhosLAPIG/MapBiomas3D/serra_dourada_osm.json", "w", encoding="utf-8") as f:
            json.dump(data[0], f, indent=2)
        print("Saved to serra_dourada_osm.json")
except Exception as e:
    print("Error:", e)
