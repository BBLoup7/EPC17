#!/usr/bin/env python3
"""
Migration script to add sessions table to existing EPC17 databases.

Run this script to add persistent session support to an existing database.

Usage:
    python utils/migrate_sessions.py

Or from the project root:
    python -m utils.migrate_sessions
"""

import sqlite3
import os
import sys

# Default database path
DEFAULT_DB_PATH = 'data/epc17.db'


def migrate_sessions(db_path: str = DEFAULT_DB_PATH) -> bool:
    """
    Add sessions table to the database if it doesn't exist.
    
    Args:
        db_path: Path to the SQLite database file
        
    Returns:
        True if migration successful, False otherwise
    """
    if not os.path.exists(db_path):
        print(f"[ERROR] Database not found: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if sessions table already exists
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='sessions'
        """)
        
        if cursor.fetchone():
            print("[INFO] Sessions table already exists - no migration needed")
            conn.close()
            return True
        
        # Create sessions table
        print("[INFO] Creating sessions table...")
        cursor.execute('''
            CREATE TABLE sessions (
                token TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                username TEXT NOT NULL,
                permissions TEXT, -- JSON array
                allowedEvents TEXT, -- JSON array
                createdAt TEXT NOT NULL,
                expiresAt TEXT NOT NULL,
                lastActivity TEXT,
                userAgent TEXT,
                ipAddress TEXT
            )
        ''')
        
        # Create index for faster user session lookups
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt)')
        
        conn.commit()
        print("[SUCCESS] Sessions table created successfully")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main entry point for the migration script."""
    # Allow custom database path as argument
    db_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB_PATH
    
    print(f"EPC17 Sessions Table Migration")
    print(f"Database: {db_path}")
    print("-" * 40)
    
    success = migrate_sessions(db_path)
    
    if success:
        print("\n✅ Migration completed successfully!")
        print("Sessions will now be persisted across server restarts.")
    else:
        print("\n❌ Migration failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()













