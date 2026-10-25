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

        # Create wallets table if not exists
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS wallets (
                id UUID PRIMARY KEY,
                organization_id VARCHAR(255) UNIQUE NOT NULL,
                balance_credits NUMERIC(14, 4) DEFAULT 10000.0 NOT NULL,
                lifetime_granted NUMERIC(14, 4) DEFAULT 10000.0 NOT NULL,
                lifetime_consumed NUMERIC(14, 4) DEFAULT 0.0 NOT NULL,
                low_balance_threshold NUMERIC(14, 4) DEFAULT 1000.0 NOT NULL,
                is_active BOOLEAN DEFAULT TRUE NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
            );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wallets_organization_id ON wallets (organization_id);"))

        # Create credit_transactions table if not exists
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS credit_transactions (
                id UUID PRIMARY KEY,
                wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
                amount NUMERIC(14, 4) NOT NULL,
                balance_after NUMERIC(14, 4) NOT NULL,
                transaction_type VARCHAR(50) NOT NULL,
                description TEXT,
                granted_by_user_id VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
            );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_credit_transactions_wallet_id ON credit_transactions (wallet_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_credit_transactions_created_at ON credit_transactions (created_at);"))

        # Create usage_events table if not exists
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS usage_events (
                id UUID PRIMARY KEY,
                wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
                api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
                service_type VARCHAR(50) NOT NULL,
                endpoint VARCHAR(255) NOT NULL,
                units_metered NUMERIC(14, 4) NOT NULL,
                unit_type VARCHAR(30) NOT NULL,
                cost_credits NUMERIC(14, 4) NOT NULL,
                metadata_json JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
            );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usage_events_wallet_id ON usage_events (wallet_id);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usage_events_service_type ON usage_events (service_type);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usage_events_created_at ON usage_events (created_at);"))

    print("Multi-tenant, API Key, and Billing schema updates applied successfully!")

if __name__ == "__main__":
    asyncio.run(update_schema())
