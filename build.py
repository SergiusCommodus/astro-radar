"""Builds dist/index.html, a single self contained page, from src/, data/ and assets/."""
import base64, pathlib
root = pathlib.Path(__file__).parent
t = (root / "src/template.html").read_text()
earth = base64.b64encode((root / "assets/earth.jpg").read_bytes()).decode()
t = (t.replace("__EARTH__", earth)
      .replace("__ZIPDATA__", (root / "data/zipdata.json").read_text())
      .replace("__MODEL__", (root / "src/model.js").read_text())
      .replace("__APP__", (root / "src/app.js").read_text()))
out = root / "dist/index.html"
out.write_text(t)
print(f"built {out} ({out.stat().st_size:,} bytes)")
