#!/usr/bin/env python3
"""
Migration script to add tie-breaker columns to the events table.

Run this script to add tie-breaker settings support to an existing database.

Usage:
    python utils/migrate_tie_breaker.py

Or from the project root:
    python -m utils.migrate_tie_breaker
"""

import sqlite3
import os
import sys

# Default database path
DEFAULT_DB_PATH = 'data/epc17.db'


def migrate_tie_breaker(db_path: str = DEFAULT_DB_PATH) -> bool:
    """
    Add tieBreakerEnabled and tieBreakerRank columns to the events table if they don't exist.
    
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
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(events)")
        columns = {row[1] for row in cursor.fetchall()}
        
        migrations_needed = []
        
        if 'tieBreakerEnabled' not in columns:
            migrations_needed.append(('tieBreakerEnabled', 'INTEGER DEFAULT 0'))
        
        if 'tieBreakerRank' not in columns:
            migrations_needed.append(('tieBreakerRank', 'INTEGER DEFAULT 3'))
        
        if not migrations_needed:
            print("[INFO] Tie-breaker columns already exist - no migration needed")
            conn.close()
            return True
        
        # Add columns
        for col_name, col_def in migrations_needed:
            print(f"[INFO] Adding column: {col_name}")
            cursor.execute(f'ALTER TABLE events ADD COLUMN {col_name} {col_def}')
        
        conn.commit()
        print(f"[SUCCESS] Added {len(migrations_needed)} column(s) to events table")
        
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
    
    print(f"EPC17 Tie-Breaker Settings Migration")
    print(f"Database: {db_path}")
    print("-" * 40)
    
    success = migrate_tie_breaker(db_path)
    
    if success:
        print("\n✅ Migration completed successfully!")
        print("Tie-breaker settings can now be configured for events.")
    else:
        print("\n❌ Migration failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()



