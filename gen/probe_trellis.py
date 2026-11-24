from gradio_client import Client
c = Client("trellis-community/TRELLIS")
print(c.view_api(return_format="str")[:4000])
