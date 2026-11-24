# Probe the FLUX.1 Kontext Space API (anonymous) and print its endpoints.
from gradio_client import Client
c = Client("black-forest-labs/FLUX.1-Kontext-Dev")
print(c.view_api(return_format="str")[:2500])
