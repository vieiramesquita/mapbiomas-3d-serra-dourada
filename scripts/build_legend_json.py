import json
import pdfplumber

pdf_path = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/CodigosDeLegenda_LegendCodes_MapBiomas_Brazil_Collection11_PDF.pdf"
out_json = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/mapbiomas_col11_legend.json"

legend = {}

with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            for row in table:
                # row format: [None, name_pt, name_en, id, hex_code, ...]
                if len(row) >= 5 and row[3] is not None and row[4] is not None:
                    cid_str = row[3].strip()
                    hex_str = row[4].strip()
                    if cid_str.isdigit() and hex_str.startswith("#"):
                        cid = int(cid_str)
                        name_pt = row[1].strip() if row[1] else ""
                        name_en = row[2].strip() if row[2] else ""
                        legend[cid] = {
                            "id": cid,
                            "name_pt": name_pt,
                            "name_en": name_en,
                            "hex": hex_str
                        }

with open(out_json, "w", encoding="utf-8") as f:
    json.dump(legend, f, indent=2, ensure_ascii=False)

print(f"Extracted {len(legend)} classes to {out_json}:")
for cid, info in sorted(legend.items()):
    print(f"  ID {cid:2d}: {info['hex']} - {info['name_pt']}")
