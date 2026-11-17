"""Sets the build stamp in config.js to the current time. Every open copy of Tandem compares its own stamp with the
published one, and reloads itself when they differ. Run this before publishing a change:  python3 scripts/bump-build.py
"""
import re, time, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / "config.js"
s = p.read_text(encoding="utf-8")
stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
if re.search(r'build:\s*"[^"]*"', s):
    s = re.sub(r'build:\s*"[^"]*"', 'build: "%s"' % stamp, s)
else:
    s = s.replace("window.TANDEM_CONFIG = {", 'window.TANDEM_CONFIG = {\n  /* Changes whenever a new version is published, so open copies know to reload. */\n  build: "%s",' % stamp, 1)
p.write_text(s, encoding="utf-8")
print("build", stamp)
