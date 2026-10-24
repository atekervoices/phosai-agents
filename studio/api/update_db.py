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
            
        # Create api_keys table if not exists
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id UUID PRIMARY KEY,
                organization_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255),
                name VARCHAR(100) NOT NULL,
                key_prefix VARCHAR(32) NOT NULL,
                hashed_key VARCHAR(64) NOT NULL,
                masked_key VARCHAR(40) NOT NULL,
                scopes JSONB DEFAULT '[]'::jsonb NOT NULL,
                is_active BOOLEAN DEFAULT TRUE NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
                last_used_at TIMESTAMPTZ
            );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_api_keys_organization_id ON api_keys (organization_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_api_keys_key_prefix ON api_keys (key_prefix);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys (user_id);"))

    print("Multi-tenant and API Key schema updates applied successfully!")

if __name__ == "__main__":
    asyncio.run(update_schema())
