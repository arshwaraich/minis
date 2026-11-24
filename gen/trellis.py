# Character image -> textured GLB via TRELLIS (HF Space).
# usage: python trellis.py in.png out.glb
import sys, shutil
from gradio_client import Client, handle_file
src, dst = sys.argv[1], sys.argv[2]
c = Client("trellis-community/TRELLIS")
c.predict(api_name="/start_session")
pre = c.predict(handle_file(src), api_name="/preprocess_image")
pre_path = pre["path"] if isinstance(pre, dict) else pre
out = c.predict(handle_file(pre_path), [], 0, 7.5, 12, 3.0, 12, "stochastic", 0.9, 1024, api_name="/generate_and_extract_glb")
glb = out[2] if isinstance(out[2], str) else out[2].get("path") or out[2].get("value")
shutil.copy(glb, dst)
print("ok", dst)
