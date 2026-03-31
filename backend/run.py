import sys, os

# Aggiungi user site-packages al path (dove sono installati fastapi, uvicorn, ecc.)
user_sp = os.path.join(os.environ.get("APPDATA", ""), "Python", "Python314", "site-packages")
if user_sp not in sys.path:
    sys.path.insert(0, user_sp)

# Anche tessdata locale
os.environ.setdefault("TESSDATA_PREFIX", os.path.join(os.path.dirname(__file__), "tessdata"))

import uvicorn
uvicorn.run("main:app", host="0.0.0.0", port=8000)
