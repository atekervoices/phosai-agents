"""Migration script to ensure user_id and organization_id columns exist on multi-tenant tables."""

import asyncio
from sqlalchemy import text
from app.lib.database import engine

async def update_schema():
    print("Checking and applying multi-tenant schema updates...")
    async with engine.begin() as conn:
        tables = ["agents", "calls", "credentials", "phone_numbers"]
        for table in tables:
            # Check user_id
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);"))
            await conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_user_id ON {table} (user_id);"))
            
            # Check organization_id
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);"))
            await conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_organization_id ON {table} (organization_id);"))
            
    print("Multi-tenant schema updates applied successfully!")

if __name__ == "__main__":
    asyncio.run(update_schema())
