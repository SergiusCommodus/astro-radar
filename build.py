"""Builds dist/index.html, a single self contained page, from src/, data/ and assets/."""
import base64, pathlib
root = pathlib.Path(__file__).parent
t = (root / "src/template.html").read_text()
earth = base64.b64encode((root / "assets/earth.jpg").read_bytes()).decode()
t = (t.replace("__EARTH__", earth)
      .replace("__ZIPDATA__", (root / "data/zipdata.json").read_text())
      .replace("__MODEL__", (root / "src/model.js").read_text())
      .replace("__APP__", (root / "src/app.js").read_text()))
# The page body has no document wrapper (it is also published as a hosted artifact), so add one for standalone hosting.
PREFIX = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n'
out = root / "dist/index.html"
out.write_text(PREFIX + t + "\n</body>\n</html>\n", encoding="utf-8")
(root / "dist/artifact.html").write_text(t, encoding="utf-8")
print(f"built {out} ({out.stat().st_size:,} bytes)")
