"""Draws the Tandem icon set. Two circles, one for each person, overlap; the shared time is the lit lens
in the middle. Rendered at four times the target size and reduced, so the edges are smooth.

Run from the project folder:  python3 scripts/make-icons.py
"""
from PIL import Image, ImageChops, ImageDraw

INK = (20, 28, 46)          # tile
CORAL = (228, 87, 46)       # first person
TEAL = (42, 157, 143)       # second person
LENS = (247, 244, 236)      # shared time
SIZE = 2048                 # working size


def circle_mask(cx, cy, r):
    m = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return m


def render(scale):
    """scale is the share of the tile the artwork may use. 1.0 fills the tile, 0.8 keeps it inside the
    safe zone that phones use when they crop an icon to a circle or rounded square."""
    r = int(SIZE * 0.235 * scale)
    gap = int(SIZE * 0.135 * scale)
    cy = SIZE // 2
    a = circle_mask(SIZE // 2 - gap, cy, r)
    b = circle_mask(SIZE // 2 + gap, cy, r)
    img = Image.new("RGB", (SIZE, SIZE), INK)
    img.paste(Image.new("RGB", (SIZE, SIZE), CORAL), mask=a)
    img.paste(Image.new("RGB", (SIZE, SIZE), TEAL), mask=b)
    img.paste(Image.new("RGB", (SIZE, SIZE), LENS), mask=ImageChops.multiply(a, b))
    return img


def save(img, name, px):
    img.resize((px, px), Image.LANCZOS).save("icons/" + name, optimize=True)


standard = render(1.0)
safe = render(0.80)
save(standard, "icon-512.png", 512)
save(standard, "icon-192.png", 192)
save(standard, "apple-touch-icon.png", 180)
save(standard, "favicon-32.png", 32)
save(safe, "icon-maskable-512.png", 512)

# Vector version for browsers that prefer it. Same geometry, expressed on a 512 unit grid.
r = 512 * 0.235
gap = 512 * 0.135
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Tandem">
  <defs>
    <clipPath id="a"><circle cx="{256 - gap:.1f}" cy="256" r="{r:.1f}"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="rgb{INK}"/>
  <circle cx="{256 - gap:.1f}" cy="256" r="{r:.1f}" fill="rgb{CORAL}"/>
  <circle cx="{256 + gap:.1f}" cy="256" r="{r:.1f}" fill="rgb{TEAL}"/>
  <circle cx="{256 + gap:.1f}" cy="256" r="{r:.1f}" fill="rgb{LENS}" clip-path="url(#a)"/>
</svg>
"""
open("icons/icon.svg", "w").write(svg)
print("icons written")
