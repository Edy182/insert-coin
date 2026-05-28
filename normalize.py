"""Two-pass EBU R128 loudness normalization for the 7 game bg tracks."""
import subprocess, re, os, glob, json, shutil, imageio_ffmpeg, sys

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
TARGET_I, TARGET_TP, TARGET_LRA = -18, -1, 11

files = sorted(glob.glob('assets/sounds/*.mp3'))
for f in files:
    name = os.path.basename(f)
    bak = f + '.bak'
    if not os.path.exists(bak):
        shutil.copy2(f, bak)

    p1 = subprocess.run(
        [FFMPEG, '-hide_banner', '-i', f,
         '-af', f'loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json',
         '-f', 'null', '-'],
        capture_output=True, text=True, encoding='utf-8', errors='replace')

    m = re.search(r'\{\s*"input_i".*?\}', p1.stderr, re.DOTALL)
    if not m:
        print(f"FAIL pass1 {name}: no JSON found")
        continue
    d = json.loads(m.group(0))

    tmp = f + '.tmp.mp3'
    afilter = (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:"
               f"measured_I={d['input_i']}:measured_TP={d['input_tp']}:"
               f"measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:"
               f"offset={d['target_offset']}:linear=true:print_format=summary")
    p2 = subprocess.run(
        [FFMPEG, '-hide_banner', '-y', '-i', f, '-af', afilter,
         '-c:a', 'libmp3lame', '-b:a', '192k', tmp],
        capture_output=True, text=True, encoding='utf-8', errors='replace')

    if p2.returncode == 0 and os.path.exists(tmp) and os.path.getsize(tmp) > 0:
        os.replace(tmp, f)
        print(f"OK   {name}  (was I={d['input_i']} TP={d['input_tp']})")
    else:
        if os.path.exists(tmp): os.remove(tmp)
        print(f"FAIL pass2 {name}: {p2.stderr[-300:]}")
