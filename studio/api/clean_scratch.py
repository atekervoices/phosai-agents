"""Database cleanup script to wipe legacy pre-multi-tenant test records."""

import asyncio
from sqlalchemy import text
from app.lib.database import engine

async def reset_fresh():
    print("Wiping legacy test agents, builder conversations, and call logs...")
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM call_events;"))
        await conn.execute(text("DELETE FROM calls;"))
        await conn.execute(text("DELETE FROM builder_messages;"))
        await conn.execute(text("DELETE FROM builder_conversations;"))
        await conn.execute(text("DELETE FROM agent_versions;"))
        await conn.execute(text("DELETE FROM phone_numbers;"))
        await conn.execute(text("DELETE FROM credentials;"))
        await conn.execute(text("DELETE FROM agents;"))
    print("Database wiped clean! Ready for fresh enterprise multi-tenant onboarding.")

if __name__ == "__main__":
    asyncio.run(reset_fresh())
