# Photo -> cute stylised full-body character image via FLUX.1 Kontext (HF Space).
# usage: python kontext.py in.jpg out.png [seed]
import sys, shutil
from gradio_client import Client, handle_file
from kontext_prompt import PROMPT
src, dst = sys.argv[1], sys.argv[2]
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 7
c = Client("black-forest-labs/FLUX.1-Kontext-Dev")
res, s = c.predict(handle_file(src), PROMPT, seed, False, 2.5, 28, api_name="/infer")
path = res["path"] if isinstance(res, dict) else res
shutil.copy(path, dst)
print("ok", dst, s)
