#!/usr/bin/env python3
"""
EPC17 Database Manager - Python SQLite Interface
Provides SQLite database operations for the Flask server
"""

import sqlite3
import json
import os
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional

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
        # Note: Removed idx_participants_eventId as participants table doesn't have eventId column
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_id ON events(id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_seriesId ON events(seriesId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_races_eventId ON races(eventId)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_races_status ON races(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_race_brackets_eventId ON race_brackets(eventId)')

        conn.commit()
        conn.close()
        print("[SUCCESS] Database tables created successfully")

    def _get_connection(self):
        """Get database connection (thread-safe)"""
        if not self.connection:
            self._ensure_db_exists()
        return self.connection

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
                    participant = dict(row)
                    # Parse JSON fields
                    for field in ['selectedClasses', 'sledConfigurations', 'contact', 'sponsors', 'statistics', 'eventClasses', 'eventIds']:
                        if participant.get(field):
                            try:
                                participant[field] = json.loads(participant[field])
                            except (json.JSONDecodeError, TypeError, ValueError) as e:
                                print(f"Warning: Failed to parse JSON for participant {participant.get('id', 'unknown')} field {field}: {e}")
                                # Use {} for contact and eventClasses, [] for arrays
                                participant[field] = {} if field in ['contact', 'eventClasses'] else []
                    participants.append(participant)
                except Exception as e:
                    print(f"Error processing participant row: {e}")
                    print(f"Row data: {dict(row) if row else 'None'}")
                    # Skip this participant and continue
                    continue

            return participants

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
                print(f"[ERROR] Error adding participant: {e}")
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
                print(f"[ERROR] Error adding participants batch: {e}")
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
                return cursor.rowcount > 0
            except Exception as e:
                print(f"[ERROR] Error updating participant: {e}")
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
                print(f"[ERROR] Error deleting participant: {e}")
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
                print(f"[ERROR] Error adding series: {e}")
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
                print(f"[ERROR] Error adding series batch: {e}")
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
                print(f"[ERROR] Error updating series: {e}")
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
                print(f"[ERROR] Error deleting series: {e}")
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
                event = dict(row)
                # Parse JSON fields and convert booleans
                for field in ['participants', 'classes']:
                    if event.get(field):
                        try:
                            event[field] = json.loads(event[field])
                        except (json.JSONDecodeError, TypeError):
                            event[field] = []

                # Convert integer booleans back to actual booleans
                event['registrationOpen'] = bool(event.get('registrationOpen', 1))
                event['requiresClassSeparation'] = bool(event.get('requiresClassSeparation', 1))
                event['freeRunEnabled'] = bool(event.get('freeRunEnabled', 0))

                events.append(event)

            return events

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific event by ID"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM events WHERE id = ?', (event_id,))
            row = cursor.fetchone()

            if row:
                event = dict(row)
                # Parse JSON fields and convert booleans
                for field in ['participants', 'classes']:
                    if event.get(field):
                        try:
                            event[field] = json.loads(event[field])
                        except (json.JSONDecodeError, TypeError):
                            event[field] = []

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
                for field in ['participants']:
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
                        maxParticipants, currentParticipants, participants, classes, status, registrationOpen,
                        requiresClassSeparation, freeRunEnabled, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    data['id'], data.get('name'), data.get('eventName'), data.get('seriesId'), data.get('seasonId'),
                    data.get('description'), data.get('date'), data.get('location'),
                    data.get('numberOfTracks', 3), data.get('eliminationType', 'double'),
                    data.get('trackSurface'), data.get('weatherContingency'), data.get('driverMeetingTime'),
                    data.get('maxParticipants', 0), data.get('currentParticipants', 0),
                    data['participants'], json.dumps(data.get('classes', [])),
                    data.get('status', 'upcoming'), data['registrationOpen'],
                    data['requiresClassSeparation'], data['freeRunEnabled'],
                    data['createdAt'], data['updatedAt']
                ))
                if commit:
                    conn.commit()
                return True
            except Exception as e:
                print(f"[ERROR] Error adding event: {e}")
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
                    for field in ['participants']:
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
                        data['participants'], json.dumps(data.get('classes', [])),
                        data.get('status', 'upcoming'), data['registrationOpen'],
                        data['requiresClassSeparation'], data['freeRunEnabled'],
                        data['createdAt'], data['updatedAt']
                    ))

                cursor = conn.executemany('''
                    INSERT INTO events (
                        id, name, eventName, seriesId, seasonId, description, date, location,
                        numberOfTracks, eliminationType, trackSurface, weatherContingency, driverMeetingTime,
                        maxParticipants, currentParticipants, participants, classes, status, registrationOpen,
                        requiresClassSeparation, freeRunEnabled, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', params_list)
                if commit:
                    conn.commit()
                return True
            except Exception as e:
                print(f"[ERROR] Error adding events batch: {e}")
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
                for field in ['participants']:
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
                        maxParticipants = ?, currentParticipants = ?, participants = ?, classes = ?,
                        status = ?, registrationOpen = ?, requiresClassSeparation = ?,
                        freeRunEnabled = ?, updatedAt = ?
                    WHERE id = ?
                ''', (
                    data.get('name'), data.get('eventName'), data.get('seriesId'), data.get('seasonId'),
                    data.get('description'), data.get('date'), data.get('location'),
                    data.get('numberOfTracks', 3), data.get('eliminationType', 'double'),
                    data.get('trackSurface'), data.get('weatherContingency'), data.get('driverMeetingTime'),
                    data.get('maxParticipants', 0), data.get('currentParticipants', 0),
                    data['participants'], json.dumps(data.get('classes', [])),
                    data.get('status', 'upcoming'),
                    data['registrationOpen'], data['requiresClassSeparation'], data['freeRunEnabled'],
                    data['updatedAt'], event_id
                ))
                if commit:
                    conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                print(f"[ERROR] Error updating event: {e}")
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
                print(f"[ERROR] Error deleting event: {e}")
                return False

    # Race brackets operations
    def get_race_brackets(self) -> List[Dict[str, Any]]:
        """Get all race brackets"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM race_brackets ORDER BY createdAt DESC')
            rows = cursor.fetchall()

            brackets = []
            for row in rows:
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
                    print(f"Warning: Failed to parse bracketData for bracket {bracket.get('id', 'unknown')}: {e}")
                    bracket['classes'] = {}
                    bracket['participants'] = []
                    bracket['lowerBracket'] = {}
                    bracket['isComplete'] = False

                brackets.append(bracket)

            return brackets

    def get_all_races(self) -> List[Dict[str, Any]]:
        """Get all races without pagination"""
        with self.lock:
            conn = self._get_connection()
            cursor = conn.execute('SELECT * FROM races ORDER BY createdAt DESC')
            rows = cursor.fetchall()

            races = []
            for row in rows:
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
                races.append(race)

            return races

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
                races.append(race)

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
                print(f"[ERROR] Error adding race: {e}")
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
                print(f"[ERROR] Error adding races batch: {e}")
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
                print(f"[ERROR] Error updating race {race_id}: {e}")
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
                print(f"[ERROR] Error deleting race {race_id}: {e}")
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
                print(f"[DEBUG] Adding race bracket with ID: {bracket.get('id', 'unknown')}")
                print(f"[DEBUG] Event ID: {bracket.get('eventId', 'unknown')}")
                print(f"[DEBUG] Bracket keys: {list(bracket.keys())}")

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
                print(f"[DEBUG] Extracted data: bracketData_size={len(bracket_data_json)}")

                # Check if bracket already exists for this eventId
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM race_brackets WHERE eventId = ?', (event_id,))
                existing = cursor.fetchone()
                if existing:
                    print(f"[DEBUG] Bracket already exists for eventId {event_id}, updating instead")
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

                print(f"[DEBUG] Inserting new bracket with id={bracket_id}, eventId={event_id}")
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
                print(f"[ERROR] Error adding race bracket: {e}")
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
                print(f"[ERROR] Error updating race bracket: {e}")
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
                print(f"[ERROR] Error deleting race bracket: {e}")
                return False

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
                print(f"[ERROR] Error adding user: {e}")
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
                print(f"[ERROR] Error updating user: {e}")
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
                print(f"[ERROR] Error deleting user: {e}")
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
                print(f"[ERROR] Error getting settings: {e}")
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
                print(f"[ERROR] Error saving settings: {e}")
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
