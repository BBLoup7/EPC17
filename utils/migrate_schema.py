#!/usr/bin/env python3
"""
EPC17 Database Migration Script
Adds missing columns to the events table in existing databases.
"""

import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'epc17.db')

def migrate_events_table():
    if not os.path.exists(DB_PATH):
        print(f"[INFO] Database not found at {DB_PATH}. Nothing to migrate.")
        return

    print(f"[INFO] Checking database at {DB_PATH}...")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get existing columns
        cursor.execute("PRAGMA table_info(events)")
        columns = [row['name'] for row in cursor.fetchall()]
        
        missing_columns = {
            'eventName': 'TEXT',
            'seasonId': 'TEXT',
            'numberOfTracks': 'INTEGER DEFAULT 3',
            'eliminationType': "TEXT DEFAULT 'double'",
            'trackSurface': 'TEXT',
            'weatherContingency': 'TEXT',
            'driverMeetingTime': 'TEXT'
        }
        
        added_count = 0
        for col, type_def in missing_columns.items():
            if col not in columns:
                print(f"[INFO] Adding missing column: {col}")
                try:
                    cursor.execute(f"ALTER TABLE events ADD COLUMN {col} {type_def}")
                    added_count += 1
                except sqlite3.Error as e:
                    print(f"[ERROR] Failed to add column {col}: {e}")
        
        if added_count > 0:
            conn.commit()
            print(f"[SUCCESS] Added {added_count} missing columns to events table.")
        else:
            print("[INFO] Events table schema is up to date.")
            
    except sqlite3.Error as e:
        print(f"[ERROR] Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate_events_table()

