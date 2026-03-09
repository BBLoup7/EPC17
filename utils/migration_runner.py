"""
Versioned Migration Runner for EPC17
Manages database schema migrations with a _migrations tracking table.

Usage (call on server startup in server.py):
    from utils.migration_runner import run_migrations
    run_migrations('epc17.db')

Migration files live in the migrations/ directory and must be named:
    001_description.py
    002_description.py
    ...

Each migration file must define a run(conn) function that receives
a sqlite3 connection and performs the migration.
"""

import os
import sys
import sqlite3
import importlib.util
import logging
from datetime import datetime

logger = logging.getLogger('EPC17.migrations')


def _ensure_migrations_table(conn):
    """Create the _migrations table if it doesn't exist."""
    conn.execute('''
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL
        )
    ''')
    conn.commit()


def _get_applied_migrations(conn):
    """Return a set of migration names already applied."""
    cursor = conn.execute('SELECT name FROM _migrations ORDER BY id')
    return set(row[0] for row in cursor.fetchall())


def _discover_migrations(migrations_dir):
    """
    Scan the migrations directory for numbered .py files.
    Returns a sorted list of (name, filepath) tuples.
    """
    if not os.path.isdir(migrations_dir):
        logger.warning('Migrations directory not found: %s', migrations_dir)
        return []

    migrations = []
    for filename in sorted(os.listdir(migrations_dir)):
        if filename.endswith('.py') and filename[0].isdigit():
            name = filename[:-3]  # strip .py
            filepath = os.path.join(migrations_dir, filename)
            migrations.append((name, filepath))

    return migrations


def _load_migration_module(name, filepath):
    """Dynamically import a migration file."""
    spec = importlib.util.spec_from_file_location(f'migration_{name}', filepath)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_migrations(db_path, migrations_dir=None):
    """
    Apply all pending migrations to the database.
    
    Args:
        db_path: Path to the SQLite database file
        migrations_dir: Path to the migrations directory (defaults to ./migrations/)
    
    Returns:
        List of migration names that were applied
    """
    if migrations_dir is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        migrations_dir = os.path.join(base_dir, 'migrations')

    conn = sqlite3.connect(db_path)
    applied = []

    try:
        _ensure_migrations_table(conn)
        already_applied = _get_applied_migrations(conn)
        discovered = _discover_migrations(migrations_dir)

        for name, filepath in discovered:
            if name in already_applied:
                logger.debug('Migration %s already applied, skipping', name)
                continue

            logger.info('Applying migration: %s', name)
            try:
                module = _load_migration_module(name, filepath)
                if hasattr(module, 'run'):
                    module.run(conn)
                else:
                    logger.warning('Migration %s has no run() function, skipping', name)
                    continue

                conn.execute(
                    'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
                    (name, datetime.now().isoformat())
                )
                conn.commit()
                applied.append(name)
                logger.info('Migration %s applied successfully', name)

            except Exception as e:
                conn.rollback()
                logger.error('Migration %s failed: %s', name, e)
                raise RuntimeError(f'Migration {name} failed: {e}') from e

    finally:
        conn.close()

    if applied:
        logger.info('Applied %d migration(s): %s', len(applied), ', '.join(applied))
    else:
        logger.info('No pending migrations')

    return applied
