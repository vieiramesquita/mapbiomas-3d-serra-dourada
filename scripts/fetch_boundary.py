import urllib.request
import urllib.parse
import json

query = """[out:json][timeout:30];
(
  relation["name"~"Serra Dourada"]["boundary"="protected_area"];
  relation["name"~"Serra Dourada"]["leisure"="nature_reserve"];
  way["name"~"Serra Dourada"]["boundary"="protected_area"];
  way["name"~"Serra Dourada"]["leisure"="nature_reserve"];
);
out tags bb;
"""

url = "https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(query)
req = urllib.request.Request(url, headers={"User-Agent": "MapBiomas3D/1.0"})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    print("Found elements:", len(data.get("elements", [])))
    for el in data.get("elements", []):
        print("Type:", el.get("type"), "ID:", el.get("id"))
        print("Tags:", el.get("tags"))
        print("Bounds:", el.get("bounds"))
except Exception as e:
    print("Error:", e)
