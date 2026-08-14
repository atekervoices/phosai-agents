import asyncio
from app.lib.database import async_session
from sqlalchemy import text

async def main():
    async with async_session() as session:
        result = await session.execute(
            text("""
                UPDATE provider_configs 
                SET config_json = jsonb_set(config_json, '{base_url}', '"wss://control.atekervoices.com/control"') 
                WHERE provider_type = 'stt' AND provider_name LIKE 'phosai%';
            """)
        )
        await session.commit()
        print(f"Successfully updated {result.rowcount} rows in provider_configs DB table!")

if __name__ == "__main__":
    asyncio.run(main())
