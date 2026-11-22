"""Normalize generated trigger characters into deterministic 64x64 RGBA game assets."""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parents[1]
SOURCE_ROOT = ROOT / "art-source" / "triggers"
OUTPUT_ROOT = ROOT / "apps" / "client" / "public" / "assets" / "triggers"

SOURCES = {
    "dog": "dog-source.png",
    "cat-mom": "cat-mom-source.png",
    "stranger": "stranger-source.png",
    "vacuum-mom": "vacuum-mom-source.png",
}


def normalize(source: Path, name: str) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 96 else 0)
    image.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"No opaque pixels in {source}")
    image = image.crop(bounds)

    scale = min(58 / image.width, 58 / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.NEAREST)
    image = image.quantize(colors=24, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
    image.putalpha(image.getchannel("A").point(lambda value: 255 if value >= 128 else 0))

    canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    x = (64 - image.width) // 2
    y = 61 - image.height
    canvas.alpha_composite(image, (x, y))
    if name == "stranger":
        # The human remains readable at kitten eye level while sharing the same asset contract.
        canvas = canvas.crop((0, 0, 64, 64))
    return canvas


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGBA", (64 * len(SOURCES), 64), (0, 0, 0, 0))
    for index, (name, filename) in enumerate(SOURCES.items()):
        asset = normalize(SOURCE_ROOT / filename, name)
        asset.save(OUTPUT_ROOT / f"{name}.png", optimize=True)
        preview.alpha_composite(asset, (index * 64, 0))
    preview.save(OUTPUT_ROOT / "preview.png", optimize=True)
    print(f"Wrote {len(SOURCES)} trigger sprites and preview to {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
