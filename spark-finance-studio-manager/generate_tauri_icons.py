import os
from PIL import Image, ImageDraw

def draw_spark_icon(size):
    # Create RGBA image
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale factor
    s = size / 512.0
    corner_radius = int(120 * s)

    # Gradient/Solid Royal Spark Blue rounded rectangle
    # Draw rounded background
    bg_color = (0, 74, 198, 255) # #004AC6
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner_radius, fill=bg_color)

    # Inner subtle glow border
    inner_margin = max(1, int(4 * s))
    draw.rounded_rectangle(
        [inner_margin, inner_margin, size - 1 - inner_margin, size - 1 - inner_margin],
        radius=max(1, corner_radius - inner_margin),
        outline=(255, 255, 255, 40),
        width=max(1, int(3 * s))
    )

    # Draw 4-point Spark Star in center
    cx, cy = size / 2.0, size / 2.0
    outer_r = 180 * s
    inner_r = 45 * s

    points = [
        (cx, cy - outer_r), # Top tip
        (cx + inner_r, cy - inner_r),
        (cx + outer_r, cy), # Right tip
        (cx + inner_r, cy + inner_r),
        (cx, cy + outer_r), # Bottom tip
        (cx - inner_r, cy + inner_r),
        (cx - outer_r, cy), # Left tip
        (cx - inner_r, cy - inner_r),
    ]

    draw.polygon(points, fill=(255, 255, 255, 255))

    # Center glowing golden dot / diamond
    gold_r = 25 * s
    draw.ellipse([cx - gold_r, cy - gold_r, cx + gold_r, cy + gold_r], fill=(255, 215, 0, 240))

    # Small satellite sparkles
    for dx, dy in [(120 * s, -120 * s), (-110 * s, 110 * s)]:
        scx, scy = cx + dx, cy + dy
        sr = 22 * s
        sir = 6 * s
        sp_points = [
            (scx, scy - sr),
            (scx + sir, scy - sir),
            (scx + sr, scy),
            (scx + sir, scy + sir),
            (scx, scy + sr),
            (scx - sir, scy + sir),
            (scx - sr, scy),
            (scx - sir, scy - sir),
        ]
        draw.polygon(sp_points, fill=(255, 255, 255, 220))

    return img

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), 'src-tauri', 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    master = draw_spark_icon(1024)

    sizes = {
        '32x32.png': 32,
        '64x64.png': 64,
        '128x128.png': 128,
        '128x128@2x.png': 256,
        'icon.png': 512,
        'Square30x30Logo.png': 30,
        'Square44x44Logo.png': 44,
        'Square71x71Logo.png': 71,
        'Square89x89Logo.png': 89,
        'Square107x107Logo.png': 107,
        'Square142x142Logo.png': 142,
        'Square150x150Logo.png': 150,
        'Square284x284Logo.png': 284,
        'Square310x310Logo.png': 310,
        'StoreLogo.png': 50,
    }

    for filename, sz in sizes.items():
        resized = master.resize((sz, sz), Image.Resampling.LANCZOS)
        out_path = os.path.join(icons_dir, filename)
        resized.save(out_path, 'PNG')
        print(f"Generated: {filename} ({sz}x{sz})")

    # Generate multi-size icon.ico for Windows
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path = os.path.join(icons_dir, 'icon.ico')
    master.save(ico_path, format='ICO', sizes=ico_sizes)
    print("Generated: icon.ico (multi-resolution)")

if __name__ == '__main__':
    main()
