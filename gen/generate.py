# Batch: for each person in web/people.json without a sprite, make an illustrated
# character (FLUX.1 Kontext on Hugging Face), cut it out, and record "sprite".
# Stops cleanly when the free GPU quota runs out; rerun later to continue.
# usage: python generate.py [--force NAME,...]   (HF_TOKEN env var raises the quota)
import json, os, sys, subprocess, shutil, pathlib
from gradio_client import Client, handle_file

ROOT = pathlib.Path(__file__).resolve().parent.parent
PEOPLE = ROOT / "web" / "people.json"
OUT = ROOT / "gen" / "out"; OUT.mkdir(exist_ok=True)
SPR = ROOT / "web" / "gen"; SPR.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / "gen"))
from kontext_prompt import PROMPT  # noqa: E402

force = set(sys.argv[sys.argv.index("--force") + 1].split(",")) if "--force" in sys.argv else set()
people = json.loads(PEOPLE.read_text())
todo = [p for p in people if p.get("image") and (not p.get("sprite") or p["name"] in force)]
if not todo:
    print("nothing to do"); sys.exit(0)
tok = os.environ.get("HF_TOKEN")
client = Client("black-forest-labs/FLUX.1-Kontext-Dev", **({"token": tok} if tok else {}))
done = 0
for p in todo:
    img = p["image"] if p["image"].startswith("http") else str(ROOT / "web" / p["image"])
    stem = pathlib.Path(p["image"]).stem
    raw = OUT / f"{stem}.webp"
    try:
        res, _ = client.predict(handle_file(img), PROMPT, 7, False, 2.5, 28, api_name="/infer")
    except Exception as e:
        msg = str(e)
        print(f"stopped at {p['name']}: {msg[:160]}")
        break
    shutil.copy(res["path"] if isinstance(res, dict) else res, raw)
    subprocess.run([sys.executable, "-I", str(ROOT / "gen" / "cutout.py"), str(raw), str(SPR / f"{stem}.png")], check=True)
    p["sprite"] = f"gen/{stem}.png"
    PEOPLE.write_text(json.dumps(people, indent=1) + "\n")
    done += 1
    print("✓", p["name"])
print(f"{done} generated, {sum(1 for q in people if not q.get('sprite'))} still without a sprite")
