"""Set Firebase Admin custom claims on a user by email or UID.

Usage:
    python -m scripts.set_admin simonallanachuka@gmail.com
    python scripts/set_admin.py <email_or_uid> [--remove]
"""

import os
import sys
import argparse

def init_firebase():
    import firebase_admin
    from firebase_admin import credentials

    if not firebase_admin._apps:
        cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            project_id = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
            if project_id:
                firebase_admin.initialize_app(options={"projectId": project_id})
            else:
                firebase_admin.initialize_app()

def main():
    parser = argparse.ArgumentParser(description="Set or remove Firebase Admin role for a user")
    parser.add_argument("identifier", help="User Email address or Firebase UID")
    parser.add_argument("--remove", action="store_true", help="Revoke admin privileges")
    args = parser.parse_args()

    init_firebase()
    from firebase_admin import auth

    ident = args.identifier.strip()
    try:
        if "@" in ident:
            user = auth.get_user_by_email(ident)
        else:
            user = auth.get_user(ident)
    except Exception as e:
        print(f"Error finding user '{ident}': {e}")
        sys.exit(1)

    target_role = "user" if args.remove else "admin"
    is_admin = not args.remove

    claims = user.custom_claims or {}
    claims["role"] = target_role
    claims["admin"] = is_admin

    auth.set_custom_user_claims(user.uid, claims)
    action = "Revoked admin from" if args.remove else "Granted admin role to"
    print(f"SUCCESS: {action} {user.email or user.uid} (UID: {user.uid}). Custom claims: {claims}")

if __name__ == "__main__":
    main()
