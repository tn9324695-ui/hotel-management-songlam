"""Read-only XLSX extraction with source coordinates. No Excel/macro execution."""
import sys, json, zipfile, hashlib, posixpath, io
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

def read_xlsx(source):
    data = source.read_bytes()
    # Parse the exact immutable bytes that were checksummed, even if a user saves
    # another version of the file while this review is in progress.
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if sum(i.file_size for i in z.infolist()) > 50 * 1024 * 1024:
            raise ValueError("WORKBOOK_TOO_LARGE")
        workbook = ET.fromstring(z.read("xl/workbook.xml"))
        relationships = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        targets = {r.attrib["Id"]: r.attrib["Target"] for r in relationships if r.get("TargetMode") != "External"}
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            shared = ["".join(e.itertext()) for e in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        styles = ET.fromstring(z.read("xl/styles.xml")) if "xl/styles.xml" in z.namelist() else None
        custom_formats = {} if styles is None else {f.get("numFmtId"): f.get("formatCode") for f in styles.findall("m:numFmts/m:numFmt", NS)}
        formats = [] if styles is None else [f.get("numFmtId") for f in styles.findall("m:cellXfs/m:xf", NS)]
        sheets = []
        for item in workbook.find("m:sheets", NS):
            target = targets[item.attrib[RID]]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            if not target.startswith("xl/worksheets/"):
                raise ValueError("UNSUPPORTED_SHEET_TARGET")
            xml = ET.fromstring(z.read(target))
            rows = []
            for row in xml.findall("m:sheetData/m:row", NS):
                cells = []
                for c in row.findall("m:c", NS):
                    kind, raw = c.get("t"), c.findtext("m:v", default=None, namespaces=NS)
                    value = shared[int(raw)] if kind == "s" and raw is not None else "".join(c.find("m:is", NS).itertext()) if kind == "inlineStr" and c.find("m:is", NS) is not None else raw
                    formula = c.findtext("m:f", default=None, namespaces=NS)
                    if value is None and formula is None:
                        continue
                    style = int(c.get("s", "0"))
                    num_format = formats[style] if style < len(formats) else None
                    cells.append({"cell": c.get("r"), "value": value, "type": kind or "n", "formula": formula,
                                  "numFmtId": num_format, "format": custom_formats.get(num_format)})
                if cells:
                    rows.append({"row": int(row.get("r")), "hidden": row.get("hidden") == "1", "cells": cells})
            sheets.append({"name": item.get("name"), "state": item.get("state", "visible"), "rows": rows,
                           "merges": [r.get("ref") for r in xml.findall("m:mergeCells/m:mergeCell", NS)]})
        return {"sourceName": source.name, "sourceSha256": hashlib.sha256(data).hexdigest(), "sourceBytes": len(data),
                "date1904": workbook.find("m:workbookPr", NS) is not None and workbook.find("m:workbookPr", NS).get("date1904") in ("1", "true"),
                "externalLinks": [n for n in z.namelist() if n.startswith("xl/externalLinks/")],
                "macroParts": [n for n in z.namelist() if "vbaproject" in n.lower()], "sheets": sheets}

if __name__ == "__main__":
    source, output = map(Path, sys.argv[1:])
    if not source.is_absolute() or not output.is_absolute() or source.resolve() == output.resolve():
        raise ValueError("ABSOLUTE_DISTINCT_PATHS_REQUIRED")
    result = read_xlsx(source)
    with output.open("x", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps({"sha256": result["sourceSha256"], "sheets": [{"name": s["name"], "nonemptyRows": len(s["rows"])} for s in result["sheets"]]}))
