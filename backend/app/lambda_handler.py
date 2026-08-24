from mangum import Mangum

from app.serverless import app

# 1. Lambda owns process lifecycle; database bootstrap is disabled by deployment configuration.
handler = Mangum(app, lifespan="off")
