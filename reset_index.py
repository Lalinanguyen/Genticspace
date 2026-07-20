import asyncio
import asyncpg
from app.config import settings

async def main():
    conn = await asyncpg.connect(settings.DATABASE_URL)
    await conn.execute("DELETE FROM index_state")
    await conn.close()
    print("Index state reset. Restart uvicorn to rescan.")

asyncio.run(main())
