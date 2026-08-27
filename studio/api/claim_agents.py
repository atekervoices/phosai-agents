"""Script to inspect and manage unassigned legacy database records."""

import asyncio
from sqlalchemy import text
from app.lib.database import engine

async def inspect_and_clean():
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT id, name, user_id, organization_id FROM agents;"))
        rows = res.all()
        print(f"Total Agents in DB: {len(rows)}")
        for r in rows:
            print(f"Agent ID={r[0]} Name='{r[1]}' UserID='{r[2]}' OrgID='{r[3]}'")

if __name__ == "__main__":
    asyncio.run(inspect_and_clean())
