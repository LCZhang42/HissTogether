"""Normalize selected generated key poses into deterministic 64x64 game assets."""

from pathlib import Path
from PIL import Image

SOURCE_ROOT = Path(r"C:\Users\Liang Cheng\.codex\generated_images\01a1d86c-a09f-7ae3-bf7e-a45317feddbd")
OUTPUT_ROOT = Path(__file__).parents[1] / "apps" / "client" / "public" / "assets" / "cats"

SOURCES = {
    "kitten_01_lightning_tail": {
        "idle": "exec-9eedf880-91d1-4a98-9d3e-d94902befaaa.png",
        "hiss": "exec-60b73af3-7b25-425e-9fa0-4ef127e64864.png",
    },
    "kitten_02_ground_gripper": {
        "idle": "exec-4307c936-d733-4da0-abb1-9698c218753e.png",
        "hiss": "exec-0d5550d2-59d9-4a1c-a0ff-7b078c8275e6.png",
    },
    "kitten_03_judgmental_eyes": {
        "idle": "exec-bdf2fd9b-4f83-40c2-a2ed-6779167806ac.png",
        "hiss": "exec-3cc629c0-06f4-4e04-8b07-d0ea50731de1.png",
    },
    "kitten_04_big_hiss": {
        "idle": "exec-5d0fe9d5-3c1e-4e8d-b9f2-ed4a8a323d6b.png",
        "hiss": "exec-5dbf08fb-d281-49c3-82bc-65edeb0c742a.png",
    },
}

ANIMATION_SOURCES = {
    "kitten_01_lightning_tail": "exec-7ea6e89e-cb8a-4f53-9fb6-4180c82e6c76.png",
    "kitten_02_ground_gripper": "exec-0a5b8cbf-ec76-4afa-aa95-9e0f8c018c26.png",
    "kitten_03_judgmental_eyes": "exec-1274b000-568e-4c5f-ad82-c69a4b01b72d.png",
    "kitten_04_big_hiss": "exec-6452c80e-05be-4d40-8e47-ec6879d75c0e.png",
}

ANIMATION_STATES = ("anticipate", "recover", "side_eye")

REACTION_SOURCES = {
    "kitten_01_lightning_tail": "exec-bb08d5dd-e3db-4bb2-ba67-cbea2bacbb56.png",
    "kitten_02_ground_gripper": "exec-0117c560-2637-4496-a74f-9d196e58b870.png",
    "kitten_03_judgmental_eyes": "exec-a2f663f9-6132-453d-986b-f79ee606c9b5.png",
    "kitten_04_big_hiss": "exec-c8cdc61d-d4f4-4e29-a5c0-b1d33e85fe5e.png",
}

REACTION_STATES = ("walk", "meow", "boop", "surprised")


def normalize_image(image: Image.Image, label: str) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            pixels[x, y] = (red, green, blue, 255 if alpha >= 96 else 0)

    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"No opaque pixels in {label}")
    image = image.crop(bounds)
    scale = min(58 / image.width, 58 / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.NEAREST)
    image = image.quantize(colors=24, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")

    canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    x = (64 - image.width) // 2
    y = 61 - image.height
    canvas.alpha_composite(image, (x, y))
    return canvas


def normalize(source: Path) -> Image.Image:
    return normalize_image(Image.open(source), str(source))


def strip_frames(source: Path, states: tuple[str, ...]) -> list[Image.Image]:
    strip = Image.open(source).convert("RGBA")
    frames = []
    for index, state in enumerate(states):
        left = round(index * strip.width / len(states))
        right = round((index + 1) * strip.width / len(states))
        frames.append(normalize_image(strip.crop((left, 0, right, strip.height)), f"{source}:{state}"))
    return frames


def main() -> None:
    lineups = {
        state: Image.new("RGBA", (256, 64), (0, 0, 0, 0))
        for state in ("idle", "hiss", *ANIMATION_STATES, *REACTION_STATES)
    }
    for index, (kitten, states) in enumerate(SOURCES.items()):
        destination = OUTPUT_ROOT / kitten
        destination.mkdir(parents=True, exist_ok=True)
        for state, filename in states.items():
            asset = normalize(SOURCE_ROOT / filename)
            asset.save(destination / f"{state}.png", optimize=True)
            lineups[state].alpha_composite(asset, (index * 64, 0))
        for state, asset in zip(ANIMATION_STATES, strip_frames(SOURCE_ROOT / ANIMATION_SOURCES[kitten], ANIMATION_STATES)):
            asset.save(destination / f"{state}.png", optimize=True)
            lineups[state].alpha_composite(asset, (index * 64, 0))
        for state, asset in zip(REACTION_STATES, strip_frames(SOURCE_ROOT / REACTION_SOURCES[kitten], REACTION_STATES)):
            asset.save(destination / f"{state}.png", optimize=True)
            lineups[state].alpha_composite(asset, (index * 64, 0))

    preview = OUTPUT_ROOT / "previews"
    preview.mkdir(parents=True, exist_ok=True)
    for state, lineup in lineups.items():
        lineup.save(preview / f"{state}_lineup.png", optimize=True)
    print(f"Wrote 36 key poses and {len(lineups)} lineups to {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()

