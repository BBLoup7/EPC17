#!/usr/bin/env python3
"""
EPC17 Database Manager - Python SQLite Interface
Provides SQLite database operations for the Flask server
"""

import sqlite3
import json
import os
import logging
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional

logger = logging.getLogger('EPC17.db')

class DatabaseManager:
    """
    Python SQLite Database Manager for EPC17
    Mirrors the Node.js DatabaseManager functionality
    """

    def __init__(self, db_path: str = 'data/epc17.db'):
        self.db_path = db_path
        self.lock = threading.RLock()
        self.connection = None
        self._ensure_db_exists()

    def _ensure_db_exists(self):
        """Ensure database file exists and initialize connection"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        # Initialize database if it doesn't exist
        if not os.path.exists(self.db_path):
            print("[INFO] Creating new SQLite database...")
            self._initialize_database()
        else:
            print("[INFO] SQLite database exists, connecting...")

        # Establish connection
        self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=NORMAL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.row_factory = sqlite3.Row  # Enable column access by name
        self._ensure_indexes()
        self._ensure_event_columns()

    def _initialize_database(self):
        """Initialize database with tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Participants table (CONSOLIDATED STRUCTURE)
        cursor.execute('''
            CREATE TABLE participants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                nickname TEXT,
                dob TEXT,
                racingNumber TEXT,
                registrationType TEXT,
                registrationDate TEXT,
                paymentStatus TEXT,
                status TEXT DEFAULT 'active',
                totalFee REAL DEFAULT 0,
                contact TEXT, -- JSON object {email, phone, emergency} (CONSOLIDATED)
                sponsors TEXT, -- JSON array
                sledConfigurations TEXT, -- JSON object
                statistics TEXT, -- JSON object (CONSOLIDATED - all stats here)
                eventClasses TEXT, -- JSON object {eventId: [classes]} (PRIMARY SOURCE)
                selectedClasses TEXT, -- JSON array (COMPUTED from eventClasses)
                _searchText TEXT, -- Pre-computed search text
                _migrated INTEGER DEFAULT 0, -- Migration flag
                _migrationDate TEXT, -- Migration timestamp
                createdAt TEXT,
                updatedAt TEXT
            )
        ''')

        # Series table
        cursor.execute('''
            CREATE TABLE series (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                sledClasses TEXT, -- JSON array
                events TEXT, -- JSON array
                standings TEXT, -- JSON array
                seasons TEXT, -- JSON array
                status TEXT DEFAULT 'active',
                createdAt TEXT,
                updatedAt TEXT
            )
        ''')

        # Events table
        cursor.execute('''
            CREATE TABLE events (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                eventName TEXT,
                seriesId TEXT,
                seasonId TEXT,
                description TEXT,
                date TEXT,
                location TEXT,
                numberOfTracks INTEGER DEFAULT 3,
                eliminationType TEXT DEFAULT 'double',
                trackSurface TEXT,
                weatherContingency TEXT,
                driverMeetingTime TEXT,
                maxParticipants INTEGER,
                currentParticipants INTEGER DEFAULT 0,
                participants TEXT, -- JSON array
                classes TEXT, -- JSON array
                classSettings TEXT, -- JSON array of class config objects
                classOrder TEXT, -- JSON array of ordered class IDs
                status TEXT DEFAULT 'upcoming',
                registrationOpen INTEGER DEFAULT 1, -- Boolean as integer
                requiresClassSeparation INTEGER DEFAULT 1, -- Boolean as integer
                freeRunEnabled INTEGER DEFAULT 0, -- Boolean as integer
                createdAt TEXT,
                updatedAt TEXT
            )
        ''')

        # Races table
        cursor.execute('''
            CREATE TABLE races (
                id TEXT PRIMARY KEY,
                eventId TEXT,
                bracketId TEXT,
                className TEXT,
                roundNumber INTEGER,
                matchNumber INTEGER,
                bracketType TEXT,
                roundName TEXT,
                status TEXT DEFAULT 'pending',
                startTime TEXT,
                endTime TEXT,
                results TEXT, -- JSON array
                statistics TEXT, -- JSON object
                createdAt TEXT,
                updatedAt TEXT,
                FOREIGN KEY (eventId) REFERENCES events (id),
                FOREIGN KEY (bracketId) REFERENCES race_brackets (id)
            )
        ''')

        # Race brackets table
        cursor.execute('''
            CREATE TABLE race_brackets (
                id TEXT PRIMARY KEY,
                eventId TEXT UNIQUE,
                bracketData TEXT, -- JSON object containing the full bracket
                createdAt TEXT,
                updatedAt TEXT,
                FOREIGN KEY (eventId) REFERENCES events (id)
            )
        ''')

        # Users table
        cursor.execute('''
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                permissions TEXT, -- JSON array
                allowedEvents TEXT, -- JSON array
                createdAt TEXT,
                updatedAt TEXT
            )
        ''')

        # Settings table
        cursor.execute('''
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updatedAt TEXT
            )
        ''')

        # Create indexes for performance (OPTIMIZED for analytics)
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_participants_id ON participants(id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_participants_name ON participants(name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_participants_racingNumber ON participants(racingNumber)')
        # Note: Removed idx_participants_eventId as participants table doesn't have eventId column
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_id ON events(id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_seriesId ON events(seriesId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_seriesId_status ON events(seriesId, status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_races_eventId ON races(eventId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_races_status ON races(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_races_className ON races(className)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_races_bracketId ON races(bracketId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_races_eventId_className ON races(eventId, className)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_race_brackets_eventId ON race_brackets(eventId)')

        conn.commit()
        conn.close()
        print("[SUCCESS] Database tables created successfully")

    def _get_connection(self):
        """Get database connection (thread-safe)"""
        if not self.connection:
            self._ensure_db_exists()
        return self.connection

    def _ensure_indexes(self):
        """Ensure runtime indexes exist for existing databases."""
        conn = self.connection
        if conn is None:
            return
        cursor = conn.cursor()
        index_statements = [
            'CREATE INDEX IF NOT EXISTS idx_participants_id ON participants(id)',
            'CREATE INDEX IF NOT EXISTS idx_participants_name ON participants(name)',
            'CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status)',
            'CREATE INDEX IF NOT EXISTS idx_participants_racingNumber ON participants(racingNumber)',
            'CREATE INDEX IF NOT EXISTS idx_events_id ON events(id)',
            'CREATE INDEX IF NOT EXISTS idx_events_seriesId ON events(seriesId)',
            'CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)',
            'CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)',
            'CREATE INDEX IF NOT EXISTS idx_events_seriesId_status ON events(seriesId, status)',
            'CREATE INDEX IF NOT EXISTS idx_races_eventId ON races(eventId)',
            'CREATE INDEX IF NOT EXISTS idx_races_status ON races(status)',
            'CREATE INDEX IF NOT EXISTS idx_races_className ON races(className)',
            'CREATE INDEX IF NOT EXISTS idx_races_bracketId ON races(bracketId)',
            'CREATE INDEX IF NOT EXISTS idx_races_eventId_className ON races(eventId, className)',
            'CREATE INDEX IF NOT EXISTS idx_race_brackets_eventId ON race_brackets(eventId)',
        ]
        for statement in index_statements:
            cursor.execute(statement)
        conn.commit()

    def _ensure_event_columns(self):
        """Ensure new event config columns exist on existing databases."""
        conn = self.connection
        if conn is None:
            return

        cursor = conn.cursor()
        rows = cursor.execute("PRAGMA table_info(events)").fetchall()
        existing_columns = {row["name"] if isinstance(row, sqlite3.Row) else row[1] for row in rows}

        alter_statements = []
        if "classSettings" not in existing_columns:
            alter_statements.append("ALTER TABLE events ADD COLUMN classSettings TEXT")
        if "classOrder" not in existing_columns:
            alter_statements.append("ALTER TABLE events ADD COLUMN classOrder TEXT")

        for statement in alter_statements:
            cursor.execute(statement)

        if alter_statements:
            conn.commit()
            logger.info("Added missing events columns: %s", ", ".join(stmt.split()[-2] for stmt in alter_statements))

    @staticmethod
    def _parse_participant_row(row: sqlite3.Row) -> Dict[str, Any]:
        participant = dict(row)
        for field in ['selectedClasses', 'sledConfigurations', 'contact', 'sponsors', 'statistics', 'eventClasses', 'eventIds']:
            if participant.get(field):
                try:
                    participant[field] = json.loads(participant[field])
                except (json.JSONDecodeError, TypeError, ValueError):
                    participant[field] = {} if field in ['contact', 'eventClasses'] else []
        return participant

    @staticmethod
    def _parse_event_row(row: sqlite3.Row) -> Dict[str, Any]:
        event = dict(row)
        for field in ['participants', 'classes', 'classSettings', 'classOrder']:
            if event.get(field):
                try:
                    event[field] = json.loads(event[field])
                except (json.JSONDecodeError, TypeError):
                    event[field] = []
            elif field in ('classSettings', 'classOrder'):
                event[field] = []

        # Backward compatibility for legacy rows using only "classes"
        if not event.get('classSettings') and isinstance(event.get('classes'), list):
            legacy_class_settings = []
            for cls in event['classes']:
                if isinstance(cls, dict):
                    class_id = cls.get('classId') or cls.get('id') or cls.get('name') or ''
                    class_name = cls.get('className') or cls.get('name') or class_id
                    price = cls.get('price', cls.get('fee', cls.get('defaultFee', 0)))
                    legacy_class_settings.append({
                        'classId': class_id,
                        'className': class_name,
                        'enabled': cls.get('enabled', True),
                        'price': price,
                        'fee': price,
                        'description': cls.get('description')
                    })
                else:
                    class_name = str(cls)
                    legacy_class_settings.append({
                        'classId': class_name,
                        'className': class_name,
                        'enabled': True,
                        'price': 0,
                        'fee': 0,
                        'description': None
                    })
            event['classSettings'] = legacy_class_settings

        if not event.get('classOrder') and isinstance(event.get('classSettings'), list):
            event['classOrder'] = [
                cs.get('classId')
                for cs in event['classSettings']
                if isinstance(cs, dict) and cs.get('classId')
            ]
        event['registrationOpen'] = bool(event.get('registrationOpen', 1))
        event['requiresClassSeparation'] = bool(event.get('requiresClassSeparation', 1))
        event['freeRunEnabled'] = bool(event.get('freeRunEnabled', 0))
        return event

    @staticmethod
    def _parse_race_row(row: sqlite3.Row) -> Dict[str, Any]:
        race = dict(row)
        if race.get('results'):
            try:
                race['results'] = json.loads(race['results'])
            except (json.JSONDecodeError, TypeError):
                race['results'] = []
        if race.get('statistics'):
            try:
                race['statistics'] = json.loads(race['statistics'])
            except (json.JSONDecodeError, TypeError):
                race['statistics'] = {}
        return race

    @staticmethod
    def _parse_bracket_row(row: sqlite3.Row) -> Dict[str, Any]:
        bracket = dict(row)
        try:
            if bracket.get('bracketData'):
                bracket_data = json.loads(bracket['bracketData'])
                bracket.update(bracket_data)
            else:
                bracket['classes'] = {}
                bracket['participants'] = []
                bracket['lowerBracket'] = {}
                bracket['isComplete'] = False
        except (json.JSONDecodeError, TypeError):
            bracket['classes'] = {}
            bracket['participants'] = []
            bracket['lowerBracket'] = {}
            bracket['isComplete'] = False
        return bracket

    def begin_transaction(self):
        """Begin a manual transaction"""
        with self.lock:
            conn = self._get_connection()
            conn.execute("BEGIN")

    def commit(self):
        """Commit the current transaction"""
        with self.lock:
            conn = self._get_connection()
            conn.commit()

    def rollback(self):
        """Rollback the current transaction"""
        with self.lock:
            conn = self._get_connection()
            conn.rollback()

    # Participant operations
    def get_participants(self) -> List[Dict[str, Any]]:
        """Get all participants"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM participants ORDER BY name')
            rows = cursor.fetchall()

            participants = []
            for row in rows:
                try:
                    participants.append(self._parse_participant_row(row))
                except Exception as e:
                    logger.error(f"Error processing participant row: {e}")
                    print(f"Row data: {dict(row) if row else 'None'}")
                    # Skip this participant and continue
                    continue

            return participants

    def get_participants_paginated(
        self,
        page: int = 1,
        limit: int = 50,
        search: Optional[str] = None,
        status: Optional[str] = None,
        event_id: Optional[str] = None,
        class_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get participants with SQL-level filtering and pagination."""
        with self.lock:
            conn = self._get_connection()
            where = []
            params: List[Any] = []

            if search:
                where.append("LOWER(name) LIKE ?")
                params.append(f"%{search.lower()}%")
            if status:
                where.append("status = ?")
                params.append(status)
            if class_filter:
                # JSON array contains class value
                where.append("selectedClasses LIKE ?")
                params.append(f'%"{class_filter}"%')
            if event_id:
                # eventClasses is a JSON object keyed by event ID
                where.append(
                    "EXISTS (SELECT 1 FROM json_each(COALESCE(participants.eventClasses, '{}')) AS ec WHERE ec.key = ?)"
                )
                params.append(event_id)

            where_sql = f" WHERE {' AND '.join(where)}" if where else ""
            count_sql = f"SELECT COUNT(*) AS total FROM participants{where_sql}"

            try:
                total = conn.execute(count_sql, params).fetchone()["total"]
            except sqlite3.OperationalError:
                # Fallback for SQLite builds without JSON1
                fallback_where = [w for w in where if "json_each" not in w]
                fallback_params = [p for i, p in enumerate(params) if "json_each" not in where[i]]
                if event_id:
                    fallback_where.append("eventClasses LIKE ?")
                    fallback_params.append(f'%"{event_id}"%')
                fallback_where_sql = f" WHERE {' AND '.join(fallback_where)}" if fallback_where else ""
                total = conn.execute(
                    f"SELECT COUNT(*) AS total FROM participants{fallback_where_sql}",
                    fallback_params,
                ).fetchone()["total"]
                where_sql = fallback_where_sql
                params = fallback_params

            offset = max(page - 1, 0) * limit
            query = f"""
                SELECT * FROM participants
                {where_sql}
                ORDER BY name
                LIMIT ? OFFSET ?
            """
            rows = conn.execute(query, params + [limit, offset]).fetchall()
            participants = [self._parse_participant_row(row) for row in rows]
            return {
                "participants": participants,
                "total": total,
                "page": page,
                "limit": limit,
                "totalPages": (total + limit - 1) // limit if limit else 1,
            }

    def get_participants_by_event(self, event_id: str) -> List[Dict[str, Any]]:
        """Get participants registered in a specific event."""
        return self.get_participants_paginated(
            page=1,
            limit=1_000_000,
            event_id=event_id,
        )["participants"]

    def get_participants_by_event_ids(self, event_ids: List[str]) -> List[Dict[str, Any]]:
        """Get participants registered in any of the provided event IDs."""
        if not event_ids:
            return []
        with self.lock:
            conn = self._get_connection()
            placeholders = ",".join(["?"] * len(event_ids))
            query = f"""
                SELECT * FROM participants
                WHERE EXISTS (
                    SELECT 1
                    FROM json_each(COALESCE(participants.eventClasses, '{{}}')) AS ec
                    WHERE ec.key IN ({placeholders})
                )
                ORDER BY name
            """
            try:
                rows = conn.execute(query, event_ids).fetchall()
            except sqlite3.OperationalError:
                like_clauses = " OR ".join(["eventClasses LIKE ?"] * len(event_ids))
                like_params = [f'%"{event_id}"%' for event_id in event_ids]
                rows = conn.execute(
                    f"SELECT * FROM participants WHERE ({like_clauses}) ORDER BY name",
                    like_params,
                ).fetchall()
            return [self._parse_participant_row(row) for row in rows]

    def get_participant(self, participant_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific participant by ID"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM participants WHERE id = ?', (participant_id,))
            row = cursor.fetchone()

            if row:
                participant = dict(row)
                # Parse JSON fields
                for field in ['selectedClasses', 'sledClasses', 'contact', 'sponsors', 'sledConfigurations', 'statistics', 'eventClasses']:
                    if participant.get(field):
                        try:
                            participant[field] = json.loads(participant[field])
                        except (json.JSONDecodeError, TypeError):
                            # Use {} for contact and eventClasses, [] for arrays
                            participant[field] = {} if field in ['contact', 'eventClasses'] else []
                return participant
            return None

    def add_participant(self, participant: Dict[str, Any], commit: bool = True) -> bool:
        """Add a new participant"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage (serialize JSON fields)
                data = participant.copy()
                for field in ['selectedClasses', 'sledClasses', 'contact', 'sponsors', 'sledConfigurations', 'statistics', 'eventClasses']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        # Use {} for contact and eventClasses, [] for arrays
                        data[field] = json.dumps({} if field in ['contact', 'eventClasses'] else [])

                # Set timestamps
                now = datetime.now().isoformat()
                data['createdAt'] = data.get('createdAt', now)
                data['updatedAt'] = now

                cursor = conn.execute('''
                    INSERT INTO participants (
                        id, name, nickname, dob, racingNumber,
                        registrationType, registrationDate, paymentStatus, status, totalFee,
                        selectedClasses, sledConfigurations, contact, sponsors,
                        statistics, eventClasses, _searchText, _migrated, _migrationDate, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    data['id'], data['name'], data.get('nickname'), data.get('dob'),
                    data.get('racingNumber'),
                    data.get('registrationType'), data.get('registrationDate'),
                    data.get('paymentStatus'), data.get('status', 'active'), data.get('totalFee', 0),
                    data['selectedClasses'], data['sledConfigurations'], data['contact'],
                    data['sponsors'], data['statistics'], 
                    data.get('eventClasses', json.dumps({})),
                    data.get('_searchText', ''), data.get('_migrated', 0), data.get('_migrationDate', ''),
                    data['createdAt'], data['updatedAt']
                ))
                if commit:
                    conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding participant: {e}")
                return False

    def add_participants_batch(self, participants: List[Dict[str, Any]], commit: bool = True) -> bool:
        """Add multiple participants in a batch transaction"""
        with self.lock:
            conn = self._get_connection()
            try:
                params_list = []
                now = datetime.now().isoformat()
                
                for participant in participants:
                    # Prepare data for storage (serialize JSON fields)
                    data = participant.copy()
                    for field in ['selectedClasses', 'sledClasses', 'contact', 'sponsors', 'sledConfigurations', 'statistics', 'eventClasses']:
                        if field in data and data[field] is not None:
                            data[field] = json.dumps(data[field])
                        else:
                            # Use {} for contact and eventClasses, [] for arrays
                            data[field] = json.dumps({} if field in ['contact', 'eventClasses'] else [])

                    # Set timestamps
                    data['createdAt'] = data.get('createdAt', now)
                    data['updatedAt'] = now
                    
                    params_list.append((
                        data['id'], data['name'], data.get('nickname'), data.get('dob'),
                        data.get('racingNumber'),
                        data.get('registrationType'), data.get('registrationDate'),
                        data.get('paymentStatus'), data.get('status', 'active'), data.get('totalFee', 0),
                        data['selectedClasses'], data['sledConfigurations'], data['contact'],
                        data['sponsors'], data['statistics'], 
                        data.get('eventClasses', json.dumps({})),
                        data.get('_searchText', ''), data.get('_migrated', 0), data.get('_migrationDate', ''),
                        data['createdAt'], data['updatedAt']
                    ))

                cursor = conn.executemany('''
                    INSERT INTO participants (
                        id, name, nickname, dob, racingNumber,
                        registrationType, registrationDate, paymentStatus, status, totalFee,
                        selectedClasses, sledConfigurations, contact, sponsors,
                        statistics, eventClasses, _searchText, _migrated, _migrationDate, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', params_list)
                if commit:
                    conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding participants batch: {e}")
                if commit:
                    conn.rollback()
                return False

    def update_participant(self, participant_id: str, participant: Dict[str, Any], commit: bool = True) -> bool:
        """Update an existing participant"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage
                data = participant.copy()
                for field in ['selectedClasses', 'sledClasses', 'contact', 'sponsors', 'sledConfigurations', 'statistics', 'eventClasses']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        # Use {} for contact and eventClasses, [] for arrays
                        data[field] = json.dumps({} if field in ['contact', 'eventClasses'] else [])

                data['updatedAt'] = datetime.now().isoformat()

                cursor = conn.execute('''
                    UPDATE participants SET
                        name = ?, nickname = ?, dob = ?, racingNumber = ?,
                        registrationType = ?, registrationDate = ?, paymentStatus = ?, status = ?, totalFee = ?,
                        selectedClasses = ?, sledConfigurations = ?, contact = ?, sponsors = ?,
                        statistics = ?, eventClasses = ?, updatedAt = ?
                    WHERE id = ?
                ''', (
                    data['name'], data.get('nickname'), data.get('dob'), data.get('racingNumber'),
                    data.get('registrationType'),
                    data.get('registrationDate'), data.get('paymentStatus'), data.get('status', 'active'),
                    data.get('totalFee', 0),
                    data['selectedClasses'], data['sledConfigurations'], data['contact'], data['sponsors'],
                    data['statistics'], data['eventClasses'], data['updatedAt'], participant_id
                ))
                if commit:
                    conn.commit()
                if cursor.rowcount > 0:
                    return True

                # SQLite reports rowcount=0 when values are unchanged.
                # Treat that as success if the participant still exists.
                existing = conn.execute(
                    'SELECT 1 FROM participants WHERE id = ?',
                    (participant_id,)
                ).fetchone()
                return existing is not None
            except Exception as e:
                logger.error(f"Error updating participant: {e}")
                return False

    def delete_participant(self, participant_id: str) -> bool:
        """Delete a participant"""
        with self.lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute('DELETE FROM participants WHERE id = ?', (participant_id,))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error deleting participant: {e}")
                return False

    # Series operations
    def get_series(self) -> List[Dict[str, Any]]:
        """Get all series"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM series ORDER BY name')
            rows = cursor.fetchall()

            series_list = []
            for row in rows:
                series = dict(row)
                # Parse JSON fields
                for field in ['sledClasses', 'events', 'standings', 'seasons']:
                    if series.get(field):
                        try:
                            series[field] = json.loads(series[field])
                        except (json.JSONDecodeError, TypeError):
                            series[field] = []
                series_list.append(series)

            return series_list

    def get_series_by_id(self, series_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific series by ID"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM series WHERE id = ?', (series_id,))
            row = cursor.fetchone()

            if row:
                series = dict(row)
                # Parse JSON fields
                for field in ['sledClasses', 'events', 'standings', 'seasons']:
                    if series.get(field):
                        try:
                            series[field] = json.loads(series[field])
                        except (json.JSONDecodeError, TypeError):
                            series[field] = []
                return series
            return None

    def add_series(self, series: Dict[str, Any]) -> bool:
        """Add a new series"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage
                data = series.copy()
                for field in ['sledClasses', 'events', 'standings', 'seasons']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        data[field] = json.dumps([])

                # Set timestamps
                now = datetime.now().isoformat()
                data['createdAt'] = data.get('createdAt', now)
                data['updatedAt'] = now

                cursor = conn.execute('''
                    INSERT INTO series (
                        id, name, description, sledClasses, events, standings, seasons,
                        status, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    data['id'], data['name'], data.get('description'), data['sledClasses'],
                    data['events'], data['standings'], data['seasons'],
                    data.get('status', 'active'), data['createdAt'], data['updatedAt']
                ))
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding series: {e}")
                return False

    def add_series_batch(self, series_list: List[Dict[str, Any]]) -> bool:
        """Add multiple series in a batch transaction"""
        with self.lock:
            conn = self._get_connection()
            try:
                params_list = []
                now = datetime.now().isoformat()
                
                for series in series_list:
                    # Prepare data for storage
                    data = series.copy()
                    for field in ['sledClasses', 'events', 'standings', 'seasons']:
                        if field in data and data[field] is not None:
                            data[field] = json.dumps(data[field])
                        else:
                            data[field] = json.dumps([])

                    # Set timestamps
                    data['createdAt'] = data.get('createdAt', now)
                    data['updatedAt'] = now
                    
                    params_list.append((
                        data['id'], data['name'], data.get('description'), data['sledClasses'],
                        data['events'], data['standings'], data['seasons'],
                        data.get('status', 'active'), data['createdAt'], data['updatedAt']
                    ))

                cursor = conn.executemany('''
                    INSERT INTO series (
                        id, name, description, sledClasses, events, standings, seasons,
                        status, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', params_list)
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding series batch: {e}")
                conn.rollback()
                return False

    def update_series(self, series_id: str, series: Dict[str, Any]) -> bool:
        """Update an existing series"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage
                data = series.copy()
                for field in ['sledClasses', 'events', 'standings', 'seasons']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        data[field] = json.dumps([])

                data['updatedAt'] = datetime.now().isoformat()

                cursor = conn.execute('''
                    UPDATE series SET
                        name = ?, description = ?, sledClasses = ?, events = ?,
                        standings = ?, seasons = ?, status = ?, updatedAt = ?
                    WHERE id = ?
                ''', (
                    data['name'], data.get('description'), data['sledClasses'], data['events'],
                    data['standings'], data['seasons'], data.get('status', 'active'),
                    data['updatedAt'], series_id
                ))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error updating series: {e}")
                return False

    def delete_series(self, series_id: str) -> bool:
        """Delete a series"""
        with self.lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute('DELETE FROM series WHERE id = ?', (series_id,))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error deleting series: {e}")
                return False

    # Events operations
    def get_events(self) -> List[Dict[str, Any]]:
        """Get all events"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM events ORDER BY date DESC')
            rows = cursor.fetchall()

            events = []
            for row in rows:
                events.append(self._parse_event_row(row))

            return events

    def get_events_paginated(
        self,
        page: int = 1,
        limit: int = 50,
        series_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        allowed_event_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Get events with SQL-level filtering and pagination."""
        with self.lock:
            conn = self._get_connection()
            where = []
            params: List[Any] = []

            if series_id:
                where.append("seriesId = ?")
                params.append(series_id)
            if status:
                where.append("status = ?")
                params.append(status)
            if search:
                where.append("LOWER(name) LIKE ?")
                params.append(f"%{search.lower()}%")
            if allowed_event_ids:
                placeholders = ",".join(["?"] * len(allowed_event_ids))
                where.append(f"id IN ({placeholders})")
                params.extend(allowed_event_ids)

            where_sql = f" WHERE {' AND '.join(where)}" if where else ""
            total = conn.execute(
                f"SELECT COUNT(*) AS total FROM events{where_sql}",
                params,
            ).fetchone()["total"]

            offset = max(page - 1, 0) * limit
            rows = conn.execute(
                f"""
                SELECT * FROM events
                {where_sql}
                ORDER BY date DESC
                LIMIT ? OFFSET ?
                """,
                params + [limit, offset],
            ).fetchall()
            events = [self._parse_event_row(row) for row in rows]
            return {
                "events": events,
                "total": total,
                "page": page,
                "limit": limit,
                "totalPages": (total + limit - 1) // limit if limit else 1,
            }

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific event by ID"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM events WHERE id = ?', (event_id,))
            row = cursor.fetchone()

            if row:
                event = dict(row)
                # Parse JSON fields and convert booleans
                for field in ['participants', 'classes', 'classSettings', 'classOrder']:
                    if event.get(field):
                        try:
                            event[field] = json.loads(event[field])
                        except (json.JSONDecodeError, TypeError):
                            event[field] = []
                    elif field in ('classSettings', 'classOrder'):
                        event[field] = []

                if not event.get('classSettings') and isinstance(event.get('classes'), list):
                    legacy_class_settings = []
                    for cls in event['classes']:
                        if isinstance(cls, dict):
                            class_id = cls.get('classId') or cls.get('id') or cls.get('name') or ''
                            class_name = cls.get('className') or cls.get('name') or class_id
                            price = cls.get('price', cls.get('fee', cls.get('defaultFee', 0)))
                            legacy_class_settings.append({
                                'classId': class_id,
                                'className': class_name,
                                'enabled': cls.get('enabled', True),
                                'price': price,
                                'fee': price,
                                'description': cls.get('description')
                            })
                        else:
                            class_name = str(cls)
                            legacy_class_settings.append({
                                'classId': class_name,
                                'className': class_name,
                                'enabled': True,
                                'price': 0,
                                'fee': 0,
                                'description': None
                            })
                    event['classSettings'] = legacy_class_settings

                if not event.get('classOrder') and isinstance(event.get('classSettings'), list):
                    event['classOrder'] = [
                        cs.get('classId')
                        for cs in event['classSettings']
                        if isinstance(cs, dict) and cs.get('classId')
                    ]

                # Convert integer booleans back to actual booleans
                event['registrationOpen'] = bool(event.get('registrationOpen', 1))
                event['requiresClassSeparation'] = bool(event.get('requiresClassSeparation', 1))
                event['freeRunEnabled'] = bool(event.get('freeRunEnabled', 0))

                return event
            return None

    def add_event(self, event: Dict[str, Any], commit: bool = True) -> bool:
        """Add a new event"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage
                data = event.copy()
                if ('classes' not in data or data.get('classes') is None) and isinstance(data.get('classSettings'), list):
                    data['classes'] = data.get('classSettings', [])
                for field in ['participants', 'classes', 'classSettings', 'classOrder']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        data[field] = json.dumps([])

                # Convert booleans to integers
                data['registrationOpen'] = 1 if data.get('registrationOpen', True) else 0
                data['requiresClassSeparation'] = 1 if data.get('requiresClassSeparation', True) else 0
                data['freeRunEnabled'] = 1 if data.get('freeRunEnabled', False) else 0

                # Set timestamps
                now = datetime.now().isoformat()
                data['createdAt'] = data.get('createdAt', now)
                data['updatedAt'] = now

                cursor = conn.execute('''
                    INSERT INTO events (
                        id, name, eventName, seriesId, seasonId, description, date, location,
                        numberOfTracks, eliminationType, trackSurface, weatherContingency, driverMeetingTime,
                        maxParticipants, currentParticipants, participants, classes, classSettings, classOrder, status, registrationOpen,
                        requiresClassSeparation, freeRunEnabled, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    data['id'], data.get('name'), data.get('eventName'), data.get('seriesId'), data.get('seasonId'),
                    data.get('description'), data.get('date'), data.get('location'),
                    data.get('numberOfTracks', 3), data.get('eliminationType', 'double'),
                    data.get('trackSurface'), data.get('weatherContingency'), data.get('driverMeetingTime'),
                    data.get('maxParticipants', 0), data.get('currentParticipants', 0),
                    data['participants'], data['classes'], data['classSettings'], data['classOrder'],
                    data.get('status', 'upcoming'), data['registrationOpen'],
                    data['requiresClassSeparation'], data['freeRunEnabled'],
                    data['createdAt'], data['updatedAt']
                ))
                if commit:
                    conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding event: {e}")
                return False

    def add_events_batch(self, events: List[Dict[str, Any]], commit: bool = True) -> bool:
        """Add multiple events in a batch transaction"""
        with self.lock:
            conn = self._get_connection()
            try:
                params_list = []
                now = datetime.now().isoformat()
                
                for event in events:
                    # Prepare data for storage
                    data = event.copy()
                    if ('classes' not in data or data.get('classes') is None) and isinstance(data.get('classSettings'), list):
                        data['classes'] = data.get('classSettings', [])
                    for field in ['participants', 'classes', 'classSettings', 'classOrder']:
                        if field in data and data[field] is not None:
                            data[field] = json.dumps(data[field])
                        else:
                            data[field] = json.dumps([])

                    # Convert booleans to integers
                    data['registrationOpen'] = 1 if data.get('registrationOpen', True) else 0
                    data['requiresClassSeparation'] = 1 if data.get('requiresClassSeparation', True) else 0
                    data['freeRunEnabled'] = 1 if data.get('freeRunEnabled', False) else 0

                    # Set timestamps
                    data['createdAt'] = data.get('createdAt', now)
                    data['updatedAt'] = now
                    
                    params_list.append((
                        data['id'], data.get('name'), data.get('eventName'), data.get('seriesId'), data.get('seasonId'),
                        data.get('description'), data.get('date'), data.get('location'),
                        data.get('numberOfTracks', 3), data.get('eliminationType', 'double'),
                        data.get('trackSurface'), data.get('weatherContingency'), data.get('driverMeetingTime'),
                        data.get('maxParticipants', 0), data.get('currentParticipants', 0),
                        data['participants'], data['classes'], data['classSettings'], data['classOrder'],
                        data.get('status', 'upcoming'), data['registrationOpen'],
                        data['requiresClassSeparation'], data['freeRunEnabled'],
                        data['createdAt'], data['updatedAt']
                    ))

                cursor = conn.executemany('''
                    INSERT INTO events (
                        id, name, eventName, seriesId, seasonId, description, date, location,
                        numberOfTracks, eliminationType, trackSurface, weatherContingency, driverMeetingTime,
                        maxParticipants, currentParticipants, participants, classes, classSettings, classOrder, status, registrationOpen,
                        requiresClassSeparation, freeRunEnabled, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', params_list)
                if commit:
                    conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding events batch: {e}")
                if commit:
                    conn.rollback()
                return False

    def update_event(self, event_id: str, event: Dict[str, Any], commit: bool = True) -> bool:
        """Update an existing event"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage
                data = event.copy()
                if ('classes' not in data or data.get('classes') is None) and isinstance(data.get('classSettings'), list):
                    data['classes'] = data.get('classSettings', [])
                for field in ['participants', 'classes', 'classSettings', 'classOrder']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        data[field] = json.dumps([])

                # Convert booleans to integers
                data['registrationOpen'] = 1 if data.get('registrationOpen', True) else 0
                data['requiresClassSeparation'] = 1 if data.get('requiresClassSeparation', True) else 0
                data['freeRunEnabled'] = 1 if data.get('freeRunEnabled', False) else 0

                data['updatedAt'] = datetime.now().isoformat()

                cursor = conn.execute('''
                    UPDATE events SET
                        name = ?, eventName = ?, seriesId = ?, seasonId = ?, description = ?, date = ?, location = ?,
                        numberOfTracks = ?, eliminationType = ?, trackSurface = ?, weatherContingency = ?, driverMeetingTime = ?,
                        maxParticipants = ?, currentParticipants = ?, participants = ?, classes = ?, classSettings = ?, classOrder = ?,
                        status = ?, registrationOpen = ?, requiresClassSeparation = ?,
                        freeRunEnabled = ?, updatedAt = ?
                    WHERE id = ?
                ''', (
                    data.get('name'), data.get('eventName'), data.get('seriesId'), data.get('seasonId'),
                    data.get('description'), data.get('date'), data.get('location'),
                    data.get('numberOfTracks', 3), data.get('eliminationType', 'double'),
                    data.get('trackSurface'), data.get('weatherContingency'), data.get('driverMeetingTime'),
                    data.get('maxParticipants', 0), data.get('currentParticipants', 0),
                    data['participants'], data['classes'], data['classSettings'], data['classOrder'],
                    data.get('status', 'upcoming'),
                    data['registrationOpen'], data['requiresClassSeparation'], data['freeRunEnabled'],
                    data['updatedAt'], event_id
                ))
                if commit:
                    conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error updating event: {e}")
                import traceback
                traceback.print_exc()
                return False

    def delete_event(self, event_id: str) -> bool:
        """Delete an event"""
        with self.lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute('DELETE FROM events WHERE id = ?', (event_id,))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error deleting event: {e}")
                return False

    # Race brackets operations
    def get_race_brackets(self) -> List[Dict[str, Any]]:
        """Get all race brackets"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM race_brackets ORDER BY createdAt DESC')
            rows = cursor.fetchall()
            return [self._parse_bracket_row(row) for row in rows]

    def get_race_brackets_by_event_ids(self, event_ids: List[str]) -> List[Dict[str, Any]]:
        """Get race brackets for specific event IDs."""
        if not event_ids:
            return []
        with self.lock:
            conn = self._get_connection()
            placeholders = ",".join(["?"] * len(event_ids))
            rows = conn.execute(
                f"SELECT * FROM race_brackets WHERE eventId IN ({placeholders}) ORDER BY createdAt DESC",
                event_ids,
            ).fetchall()
            return [self._parse_bracket_row(row) for row in rows]

    def get_race_brackets_for_driver(self, driver_id: str, event_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get race brackets containing a driver ID in bracketData."""
        with self.lock:
            conn = self._get_connection()
            like_param = f"%{driver_id}%"
            if event_id:
                rows = conn.execute(
                    """
                    SELECT * FROM race_brackets
                    WHERE eventId = ? AND bracketData LIKE ?
                    ORDER BY createdAt DESC
                    """,
                    (event_id, like_param),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM race_brackets
                    WHERE bracketData LIKE ?
                    ORDER BY createdAt DESC
                    """,
                    (like_param,),
                ).fetchall()
            return [self._parse_bracket_row(row) for row in rows]

    def get_race_bracket_metadata(
        self,
        page: int = 1,
        limit: int = 50,
        event_id: Optional[str] = None,
        allowed_event_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Get lightweight race bracket metadata without bracketData."""
        with self.lock:
            conn = self._get_connection()
            where = []
            params: List[Any] = []
            if event_id:
                where.append("eventId = ?")
                params.append(event_id)
            if allowed_event_ids:
                placeholders = ",".join(["?"] * len(allowed_event_ids))
                where.append(f"eventId IN ({placeholders})")
                params.extend(allowed_event_ids)
            where_sql = f" WHERE {' AND '.join(where)}" if where else ""

            total = conn.execute(
                f"SELECT COUNT(*) AS total FROM race_brackets{where_sql}",
                params,
            ).fetchone()["total"]
            offset = max(page - 1, 0) * limit
            rows = conn.execute(
                f"""
                SELECT id, eventId, createdAt, updatedAt
                FROM race_brackets
                {where_sql}
                ORDER BY createdAt DESC
                LIMIT ? OFFSET ?
                """,
                params + [limit, offset],
            ).fetchall()
            brackets = [dict(row) for row in rows]
            return {
                "brackets": brackets,
                "total": total,
                "page": page,
                "limit": limit,
                "totalPages": (total + limit - 1) // limit if limit else 1,
            }

    def get_all_races(self) -> List[Dict[str, Any]]:
        """Get all races without pagination"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM races ORDER BY createdAt DESC')
            rows = cursor.fetchall()
            return [self._parse_race_row(row) for row in rows]

    def get_races(self, filters: Optional[Dict[str, Any]] = None, page: int = 1, limit: int = 50) -> Dict[str, Any]:
        """Get races with optional filtering and pagination"""
        filters = filters or {}

        with self.lock:
            conn = self._get_connection()
            params = []
            query = 'SELECT * FROM races WHERE 1=1'

            if filters.get('eventId'):
                query += ' AND eventId = ?'
                params.append(filters['eventId'])

            if filters.get('className'):
                query += ' AND className = ?'
                params.append(filters['className'])

            if filters.get('status'):
                query += ' AND status = ?'
                params.append(filters['status'])

            count_query = 'SELECT COUNT(*) FROM races WHERE 1=1'
            count_params = []
            if filters.get('eventId'):
                count_query += ' AND eventId = ?'
                count_params.append(filters['eventId'])
            if filters.get('className'):
                count_query += ' AND className = ?'
                count_params.append(filters['className'])
            if filters.get('status'):
                count_query += ' AND status = ?'
                count_params.append(filters['status'])

            cursor = conn.execute(count_query, count_params)
            total = cursor.fetchone()[0]

            offset = (page - 1) * limit
            query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?'
            params.extend([limit, offset])

            cursor = conn.execute(query, params)
            rows = cursor.fetchall()

            races = []
            for row in rows:
                races.append(self._parse_race_row(row))

            return {
                'races': races,
                'total': total,
                'page': page,
                'limit': limit,
                'totalPages': (total + limit - 1) // limit,
            }

    def get_race(self, race_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific race by ID"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM races WHERE id = ?', (race_id,))
            row = cursor.fetchone()

            if row:
                race = dict(row)
                # Parse JSON fields
                if race.get('results'):
                    try:
                        race['results'] = json.loads(race['results'])
                    except (json.JSONDecodeError, TypeError):
                        race['results'] = []
                if race.get('statistics'):
                    try:
                        race['statistics'] = json.loads(race['statistics'])
                    except (json.JSONDecodeError, TypeError):
                        race['statistics'] = {}
                return race
            return None

    def add_race(self, race: Dict[str, Any], commit: bool = True) -> bool:
        """Add a new race"""
        with self.lock:
            conn = self._get_connection()
            try:
                data = race.copy()
                
                # Serialize JSON fields
                if 'results' in data and data['results'] is not None:
                    data['results'] = json.dumps(data['results'])
                else:
                    data['results'] = json.dumps([])
                
                if 'statistics' in data and data['statistics'] is not None:
                    data['statistics'] = json.dumps(data['statistics'])
                else:
                    data['statistics'] = json.dumps({})

                now = datetime.now().isoformat()
                data['createdAt'] = data.get('createdAt', now)
                data['updatedAt'] = data.get('updatedAt', now)

                cursor = conn.execute(
                    '''
                    INSERT INTO races (
                        id, eventId, bracketId, className, roundNumber, matchNumber,
                        bracketType, roundName, status, startTime, endTime, results,
                        statistics, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        data['id'],
                        data.get('eventId'),
                        data.get('bracketId'),
                        data.get('className'),
                        data.get('roundNumber'),
                        data.get('matchNumber'),
                        data.get('bracketType'),
                        data.get('roundName'),
                        data.get('status', 'pending'),
                        data.get('startTime'),
                        data.get('endTime'),
                        data['results'],
                        data['statistics'],
                        data['createdAt'],
                        data['updatedAt'],
                    ),
                )
                if commit:
                    conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error adding race: {e}")
                return False

    def add_races_batch(self, races: List[Dict[str, Any]], commit: bool = True) -> bool:
        """Add multiple races in a batch transaction"""
        with self.lock:
            conn = self._get_connection()
            try:
                params_list = []
                now = datetime.now().isoformat()
                
                for race in races:
                    data = race.copy()
                    
                    # Serialize JSON fields
                    if 'results' in data and data['results'] is not None:
                        data['results'] = json.dumps(data['results'])
                    else:
                        data['results'] = json.dumps([])
                    
                    if 'statistics' in data and data['statistics'] is not None:
                        data['statistics'] = json.dumps(data['statistics'])
                    else:
                        data['statistics'] = json.dumps({})

                    data['createdAt'] = data.get('createdAt', now)
                    data['updatedAt'] = data.get('updatedAt', now)
                    
                    params_list.append((
                        data['id'],
                        data.get('eventId'),
                        data.get('bracketId'),
                        data.get('className'),
                        data.get('roundNumber'),
                        data.get('matchNumber'),
                        data.get('bracketType'),
                        data.get('roundName'),
                        data.get('status', 'pending'),
                        data.get('startTime'),
                        data.get('endTime'),
                        data['results'],
                        data['statistics'],
                        data['createdAt'],
                        data['updatedAt'],
                    ))

                cursor = conn.executemany(
                    '''
                    INSERT INTO races (
                        id, eventId, bracketId, className, roundNumber, matchNumber,
                        bracketType, roundName, status, startTime, endTime, results,
                        statistics, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    params_list
                )
                if commit:
                    conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding races batch: {e}")
                if commit:
                    conn.rollback()
                return False

    def update_race(self, race_id: str, race: Dict[str, Any], commit: bool = True) -> bool:
        """Update an existing race"""
        with self.lock:
            conn = self._get_connection()
            try:
                data = race.copy()
                if 'results' in data:
                    data['results'] = json.dumps(data['results']) if data['results'] is not None else json.dumps([])

                fields = []
                values = []
                for key, value in data.items():
                    fields.append(f"{key} = ?")
                    values.append(value)

                fields.append('updatedAt = ?')
                values.append(datetime.now().isoformat())

                values.append(race_id)

                cursor = conn.execute(
                    f"UPDATE races SET {', '.join(fields)} WHERE id = ?",
                    values,
                )
                if commit:
                    conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error updating race {race_id}: {e}")
                return False

    def delete_race(self, race_id: str) -> bool:
        """Delete a specific race"""
        with self.lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute('DELETE FROM races WHERE id = ?', (race_id,))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error deleting race {race_id}: {e}")
                return False

    def get_race_bracket(self, bracket_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific race bracket by ID"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM race_brackets WHERE id = ?', (bracket_id,))
            row = cursor.fetchone()

            if row:
                bracket = dict(row)
                # Parse bracketData JSON field and reconstruct bracket object
                try:
                    if bracket.get('bracketData'):
                        bracket_data = json.loads(bracket['bracketData'])
                        # Merge bracketData into bracket object
                        bracket.update(bracket_data)
                    else:
                        # Set defaults if no bracketData
                        bracket['classes'] = {}
                        bracket['participants'] = []
                        bracket['lowerBracket'] = {}
                        bracket['isComplete'] = False

                except (json.JSONDecodeError, TypeError) as e:
                    print(f"Warning: Failed to parse bracketData for bracket {bracket_id}: {e}")
                    bracket['classes'] = {}
                    bracket['participants'] = []
                    bracket['lowerBracket'] = {}
                    bracket['isComplete'] = False

                return bracket
            return None

    def get_race_bracket_by_event_id(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific race bracket by event ID"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM race_brackets WHERE eventId = ?', (event_id,))
            row = cursor.fetchone()

            if row:
                bracket = dict(row)
                # Parse bracketData JSON field and reconstruct bracket object
                try:
                    if bracket.get('bracketData'):
                        bracket_data = json.loads(bracket['bracketData'])
                        # Merge bracketData into bracket object
                        bracket.update(bracket_data)
                    else:
                        # Set defaults if no bracketData
                        bracket['classes'] = {}
                        bracket['participants'] = []
                        bracket['lowerBracket'] = {}
                        bracket['isComplete'] = False

                except (json.JSONDecodeError, TypeError) as e:
                    print(f"Warning: Failed to parse bracketData for event {event_id}: {e}")
                    bracket['classes'] = {}
                    bracket['participants'] = []
                    bracket['lowerBracket'] = {}
                    bracket['isComplete'] = False

                return bracket
            return None

    def add_race_bracket(self, bracket: Dict[str, Any], commit: bool = True) -> bool:
        """Add a new race bracket"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Debug logging
                logger.debug(f"Adding race bracket with ID: {bracket.get('id', 'unknown')}")
                logger.debug(f"Event ID: {bracket.get('eventId', 'unknown')}")
                logger.debug(f"Bracket keys: {list(bracket.keys())}")

                # Set timestamps
                now = datetime.now().isoformat()
                created_at = bracket.get('createdAt', now)
                updated_at = now

                # Extract data for individual columns
                bracket_id = bracket.get('id')
                event_id = bracket.get('eventId')

                # Store all bracket data in bracketData JSON field (matching actual schema)
                bracket_data = {
                    "classes": bracket.get('classes', {}),
                    "currentRound": bracket.get('currentRound', 0),
                    "eliminationType": bracket.get('eliminationType', 'double'),
                    "isComplete": bracket.get('isComplete', False),
                    "lowerBracket": bracket.get('lowerBracket', {}),
                    "numberOfLanes": bracket.get('numberOfLanes', 4),
                    "participants": bracket.get('participants', [])
                }

                bracket_data_json = json.dumps(bracket_data)
                logger.debug(f"Extracted data: bracketData_size={len(bracket_data_json)}")

                # Check if bracket already exists for this eventId
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM race_brackets WHERE eventId = ?', (event_id,))
                existing = cursor.fetchone()
                if existing:
                    logger.debug(f"Bracket already exists for eventId {event_id}, updating instead")
                    # Update existing bracket
                    cursor.execute('''
                        UPDATE race_brackets SET
                            id = ?, bracketData = ?, updatedAt = ?
                        WHERE eventId = ?
                    ''', (
                        bracket_id, bracket_data_json, updated_at, event_id
                    ))
                    if commit:
                        conn.commit()
                    print(f"[SUCCESS] Race bracket updated successfully for event {event_id}")
                    return True

                logger.debug(f"Inserting new bracket with id={bracket_id}, eventId={event_id}")
                cursor.execute('''
                    INSERT INTO race_brackets (
                        id, eventId, bracketData, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?)
                ''', (
                    bracket_id, event_id, bracket_data_json, created_at, updated_at
                ))
                if commit:
                    conn.commit()
                print(f"[SUCCESS] Race bracket inserted successfully")
                return True
            except Exception as e:
                logger.error(f"Error adding race bracket: {e}")
                import traceback
                traceback.print_exc()
                if commit:
                    conn.rollback()
                return False

    def update_race_bracket(self, bracket_id: str, bracket: Dict[str, Any], commit: bool = True) -> bool:
        """Update an existing race bracket"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Store all bracket data in bracketData JSON field (matching actual schema)
                bracket_data = {
                    "classes": bracket.get('classes', {}),
                    "currentRound": bracket.get('currentRound', 0),
                    "eliminationType": bracket.get('eliminationType', 'double'),
                    "isComplete": bracket.get('isComplete', False),
                    "lowerBracket": bracket.get('lowerBracket', {}),
                    "numberOfLanes": bracket.get('numberOfLanes', 4),
                    "participants": bracket.get('participants', [])
                }

                bracket_data_json = json.dumps(bracket_data)
                updated_at = datetime.now().isoformat()

                cursor = conn.execute('''
                    UPDATE race_brackets SET
                        bracketData = ?, updatedAt = ?
                    WHERE id = ?
                ''', (
                    bracket_data_json, updated_at, bracket_id
                ))
                if commit:
                    conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error updating race bracket: {e}")
                return False

    def delete_race_bracket(self, bracket_id: str) -> bool:
        """Delete a race bracket"""
        with self.lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute('DELETE FROM race_brackets WHERE id = ?', (bracket_id,))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error deleting race bracket: {e}")
                return False

    # Aggregation and count operations
    def count_participants(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """Count participants with optional filters."""
        filters = filters or {}
        with self.lock:
            conn = self._get_connection()
            where = []
            params: List[Any] = []
            if filters.get("search"):
                where.append("LOWER(name) LIKE ?")
                params.append(f"%{str(filters['search']).lower()}%")
            if filters.get("status"):
                where.append("status = ?")
                params.append(filters["status"])
            if filters.get("eventId"):
                where.append(
                    "EXISTS (SELECT 1 FROM json_each(COALESCE(participants.eventClasses, '{}')) AS ec WHERE ec.key = ?)"
                )
                params.append(filters["eventId"])
            where_sql = f" WHERE {' AND '.join(where)}" if where else ""
            try:
                row = conn.execute(
                    f"SELECT COUNT(*) AS total FROM participants{where_sql}",
                    params,
                ).fetchone()
                return int(row["total"] if row else 0)
            except sqlite3.OperationalError:
                if filters.get("eventId"):
                    fallback_where = []
                    fallback_params: List[Any] = []
                    if filters.get("search"):
                        fallback_where.append("LOWER(name) LIKE ?")
                        fallback_params.append(f"%{str(filters['search']).lower()}%")
                    if filters.get("status"):
                        fallback_where.append("status = ?")
                        fallback_params.append(filters["status"])
                    fallback_where.append("eventClasses LIKE ?")
                    fallback_params.append(f'%"{filters["eventId"]}"%')
                    where_sql = f" WHERE {' AND '.join(fallback_where)}"
                    params = fallback_params
                row = conn.execute(
                    f"SELECT COUNT(*) AS total FROM participants{where_sql}",
                    params,
                ).fetchone()
                return int(row["total"] if row else 0)

    def count_events(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """Count events with optional filters."""
        filters = filters or {}
        with self.lock:
            conn = self._get_connection()
            where = []
            params: List[Any] = []
            if filters.get("seriesId"):
                where.append("seriesId = ?")
                params.append(filters["seriesId"])
            if filters.get("status"):
                where.append("status = ?")
                params.append(filters["status"])
            if filters.get("search"):
                where.append("LOWER(name) LIKE ?")
                params.append(f"%{str(filters['search']).lower()}%")
            where_sql = f" WHERE {' AND '.join(where)}" if where else ""
            row = conn.execute(
                f"SELECT COUNT(*) AS total FROM events{where_sql}",
                params,
            ).fetchone()
            return int(row["total"] if row else 0)

    def count_races(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """Count races with optional filters."""
        filters = filters or {}
        with self.lock:
            conn = self._get_connection()
            where = []
            params: List[Any] = []
            if filters.get("eventId"):
                where.append("eventId = ?")
                params.append(filters["eventId"])
            if filters.get("className"):
                where.append("className = ?")
                params.append(filters["className"])
            if filters.get("status"):
                where.append("status = ?")
                params.append(filters["status"])
            where_sql = f" WHERE {' AND '.join(where)}" if where else ""
            row = conn.execute(
                f"SELECT COUNT(*) AS total FROM races{where_sql}",
                params,
            ).fetchone()
            return int(row["total"] if row else 0)

    def count_race_brackets(self) -> int:
        """Count race brackets."""
        with self.lock:
            conn = self._get_connection()
            row = conn.execute("SELECT COUNT(*) AS total FROM race_brackets").fetchone()
            return int(row["total"] if row else 0)

    def get_stats_counts(self) -> Dict[str, int]:
        """Get top-level record counts for major tables."""
        return {
            "participants": self.count_participants(),
            "events": self.count_events(),
            "races": self.count_races(),
            "race_brackets": self.count_race_brackets(),
            "series": self.count_series(),
        }

    def count_series(self) -> int:
        """Count all series."""
        with self.lock:
            conn = self._get_connection()
            row = conn.execute("SELECT COUNT(*) AS total FROM series").fetchone()
            return int(row["total"] if row else 0)

    def get_events_by_status_counts(self) -> Dict[str, int]:
        """Get event counts grouped by status."""
        with self.lock:
            conn = self._get_connection()
            rows = conn.execute(
                "SELECT COALESCE(status, 'unknown') AS status, COUNT(*) AS total FROM events GROUP BY status"
            ).fetchall()
            return {row["status"]: int(row["total"]) for row in rows}

    def get_total_revenue(self) -> float:
        """Get total participant revenue."""
        with self.lock:
            conn = self._get_connection()
            row = conn.execute("SELECT COALESCE(SUM(totalFee), 0) AS total FROM participants").fetchone()
            return float(row["total"] if row else 0.0)

    def get_completed_races_count(self) -> int:
        """Get completed race count from races table."""
        return self.count_races({"status": "completed"})

    # Users operations
    def get_users(self) -> List[Dict[str, Any]]:
        """Get all users"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM users ORDER BY username')
            rows = cursor.fetchall()

            users = []
            for row in rows:
                user = dict(row)
                # Parse JSON fields
                for field in ['permissions', 'allowedEvents']:
                    if user.get(field):
                        try:
                            user[field] = json.loads(user[field])
                        except (json.JSONDecodeError, TypeError):
                            user[field] = []
                users.append(user)

            return users

    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Get a user by username"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM users WHERE username = ?', (username,))
            row = cursor.fetchone()

            if row:
                user = dict(row)
                # Parse JSON fields
                for field in ['permissions', 'allowedEvents']:
                    if user.get(field):
                        try:
                            user[field] = json.loads(user[field])
                        except (json.JSONDecodeError, TypeError):
                            user[field] = []
                return user
            return None

    def add_user(self, user: Dict[str, Any]) -> bool:
        """Add a new user"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage
                data = user.copy()
                for field in ['permissions', 'allowedEvents']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        data[field] = json.dumps([])

                # Set timestamps
                now = datetime.now().isoformat()
                data['createdAt'] = data.get('createdAt', now)
                data['updatedAt'] = now

                cursor = conn.execute('''
                    INSERT INTO users (
                        id, username, password, permissions, allowedEvents, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    data['id'], data['username'], data['password'], data['permissions'],
                    data['allowedEvents'], data['createdAt'], data['updatedAt']
                ))
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error adding user: {e}")
                return False

    def update_user(self, user_id: str, user: Dict[str, Any]) -> bool:
        """Update an existing user"""
        with self.lock:
            conn = self._get_connection()
            try:
                # Prepare data for storage
                data = user.copy()
                for field in ['permissions', 'allowedEvents']:
                    if field in data and data[field] is not None:
                        data[field] = json.dumps(data[field])
                    else:
                        data[field] = json.dumps([])

                data['updatedAt'] = datetime.now().isoformat()

                cursor = conn.execute('''
                    UPDATE users SET
                        username = ?, password = ?, permissions = ?, allowedEvents = ?, updatedAt = ?
                    WHERE id = ?
                ''', (
                    data['username'], data.get('password'), data['permissions'],
                    data['allowedEvents'], data['updatedAt'], user_id
                ))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error updating user: {e}")
                return False

    def delete_user(self, user_id: str) -> bool:
        """Delete a user"""
        with self.lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Error deleting user: {e}")
                return False

    # Settings operations
    def get_settings(self) -> Optional[Dict[str, Any]]:
        """
        Get all application settings as a dictionary.
        Settings are stored as key-value pairs in the settings table,
        but returned as a single dictionary for compatibility with legacy code.
        """
        with self.lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute('SELECT key, value, updatedAt FROM settings')
                rows = cursor.fetchall()
                
                if not rows:
                    return None
                
                # Reconstruct settings dictionary from key-value pairs
                settings = {}
                for row in rows:
                    key = row['key']
                    value = row['value']
                    # Try to parse JSON values
                    try:
                        settings[key] = json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        # If not JSON, store as string
                        settings[key] = value
                
                # Include the most recent updatedAt timestamp
                if rows:
                    settings['updatedAt'] = max(row['updatedAt'] for row in rows)
                
                return settings
            except Exception as e:
                logger.error(f"Error getting settings: {e}")
                return None

    def save_settings(self, settings: Dict[str, Any]) -> bool:
        """
        Save application settings to the database.
        Each key-value pair in the settings dict is stored as a separate row.
        """
        with self.lock:
            conn = self._get_connection()
            try:
                updated_at = datetime.now().isoformat()
                
                # Insert or replace each setting
                for key, value in settings.items():
                    if key == 'updatedAt':
                        # Skip the updatedAt field, we'll set it ourselves
                        continue
                    
                    # Serialize non-string values to JSON
                    if isinstance(value, (dict, list, bool, int, float)):
                        value_str = json.dumps(value)
                    else:
                        value_str = str(value)
                    
                    conn.execute('''
                        INSERT OR REPLACE INTO settings (key, value, updatedAt)
                        VALUES (?, ?, ?)
                    ''', (key, value_str, updated_at))
                
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"Error saving settings: {e}")
                import traceback
                traceback.print_exc()
                conn.rollback()
                return False

    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            self.connection = None

    def get_stats(self) -> Dict[str, int]:
        """Get database statistics"""
        with self.lock:
            conn = self._get_connection()
            stats = {}

            tables = ['participants', 'series', 'events', 'races', 'race_brackets', 'users']
            for table in tables:
                try:
                    cursor = conn.execute(f'SELECT COUNT(*) as count FROM {table}')
                    result = cursor.fetchone()
                    stats[table] = result['count'] if result else 0
                except Exception:
                    stats[table] = 0

            return stats
