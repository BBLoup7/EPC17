/**
 * SQLite Database Module for EPC17 Event Management System
 * Replaces JSON file I/O with SQLite queries using better-sqlite3
 * Maintains the same interface as the original DataManager for compatibility
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const BackupManager = require('./backup');

class DatabaseManager {
    constructor() {
        console.log('🏁 Initializing DatabaseManager with SQLite');
        this.dbPath = path.join(__dirname, '..', 'data', 'epc17.db');
        this.db = null;
        this.initialized = false;
        this.backupManager = null;

        // Performance optimizations
        this.preparedStatements = new Map();
        this.paginationCache = new Map();
        this.statsCache = new Map();
        this.lastLoadTime = new Map();
        this.loadingPromises = new Map();

        // Initialize event bus and statistics manager
        this.eventBus = null;
        this.statisticsManager = null;
        this.initializeIntegrations();
        this.initializeDatabase();
        this.initializeBackup();
    }

    /**
     * Initialize integrations with other systems
     */
    initializeIntegrations() {
        // Initialize event bus if available
        if (typeof globalEventBus !== 'undefined') {
            this.eventBus = globalEventBus;
            console.log('📡 DatabaseManager connected to global event bus');
        } else if (typeof window !== 'undefined' && window.globalEventBus) {
            this.eventBus = window.globalEventBus;
            console.log('📡 DatabaseManager connected to window event bus');
        }

        // Initialize statistics manager
        if (typeof StatisticsManager !== 'undefined') {
            this.statisticsManager = new StatisticsManager(this);
            if (this.eventBus) {
                this.statisticsManager.setEventBus(this.eventBus);
            }
            console.log('📊 StatisticsManager initialized and connected');
        }
    }

    /**
     * Initialize database and create tables
     */
    async initializeDatabase() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Create database connection
            this.db = new Database(this.dbPath);

            // Enable WAL mode for better performance and non-blocking backups
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');

            // Create tables based on existing JSON structure
            await this.createTables();

            // Run migration if needed (but only if not a fresh setup)
            if (fs.existsSync(this.dbPath) && fs.statSync(this.dbPath).size > 0) {
                await this.runMigration();
            }

            this.initialized = true;
            console.log('✅ Database initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Initialize backup system
     */
    initializeBackup() {
        try {
            // Initialize backup manager with smart retention
            this.backupManager = new BackupManager(this.dbPath, {
                backupInterval: 60000, // 1 minute
                maxBackups: 5,
                retentionConfig: {
                    intervals: [
                        { age: 60, count: 1 },      // Keep 1 backup from last minute
                        { age: 600, count: 1 },     // Keep 1 backup from last 10 minutes
                        { age: 3600, count: 1 },    // Keep 1 backup from last hour
                        { age: 86400, count: 1 },   // Keep 1 backup from last 24 hours
                        { age: Infinity, count: 1 } // Keep 1 oldest backup
                    ]
                }
            });

            console.log('✅ Backup system initialized');
        } catch (error) {
            console.error('❌ Failed to initialize backup system:', error);
        }
    }

    /**
     * Trigger backup after truly important operations only
     * This should be used sparingly for major operations like:
     * - Bulk data imports
     * - Database migrations
     * - End-of-event operations
     * - Manual admin operations
     *
     * DO NOT use for individual CRUD operations (add/update/delete single records)
     */
    triggerMajorBackup(reason = 'major_operation') {
        if (this.backupManager) {
            console.log(`💾 Triggering major backup: ${reason}`);
            this.backupManager.createBackup(`backup_${reason}_${Date.now()}`).catch(error => {
                console.error('❌ Major backup failed:', error);
            });
        }
    }

    /**
     * Legacy method - deprecated, use triggerMajorBackup for important operations only
     * @deprecated Use triggerMajorBackup() for major operations instead
     */
    triggerBackup(reason = 'manual') {
        console.warn('⚠️ triggerBackup() is deprecated. Use triggerMajorBackup() for major operations only.');
        // Only allow specific important reasons
        const allowedReasons = ['migration', 'bulk_import', 'end_of_event', 'manual_admin'];
        if (allowedReasons.includes(reason)) {
            this.triggerMajorBackup(reason);
        }
    }

    /**
     * Create database tables based on JSON structure
     */
    async createTables() {
        // Check if tables already exist and have data
        const existingTables = ['participants', 'series', 'events', 'races', 'race_brackets', 'users'];
        let hasExistingData = false;

        for (const table of existingTables) {
            try {
                const result = this.db.prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?`).get(table);
                if (result && result.count > 0) {
                    // Check if table has data
                    const dataCheck = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                    if (dataCheck && dataCheck.count > 0) {
                        hasExistingData = true;
                        console.log(`📊 Table ${table} exists with ${dataCheck.count} records - preserving data`);
                        break;
                    }
                }
            } catch (error) {
                // Table doesn't exist or can't be queried, continue
            }
        }

        // Only drop tables if this is a fresh setup (no existing data)
        if (!hasExistingData) {
            console.log('🆕 Fresh database setup - creating tables');
            for (const table of existingTables) {
                try {
                    this.db.exec(`DROP TABLE IF EXISTS ${table}`);
                    console.log(`✅ Dropped existing table: ${table}`);
                } catch (error) {
                    console.warn(`⚠️ Failed to drop table ${table}:`, error.message);
                }
            }
        } else {
            console.log('💾 Existing data found - skipping table recreation to preserve data');
            return; // Don't recreate tables if data exists
        }

        const tables = {
            participants: `
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
            `,
            series: `
                CREATE TABLE series (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT DEFAULT 'active',
                    registrationFee REAL DEFAULT 0,
                    pointsSystem TEXT,
                    seasonStartDate TEXT,
                    seasonEndDate TEXT,
                    rules TEXT,
                    sledClasses TEXT, -- JSON array
                    events TEXT, -- JSON array
                    standings TEXT, -- JSON array
                    seasons TEXT, -- JSON array
                    createdAt TEXT,
                    updatedAt TEXT,
                    createdDate TEXT
                )
            `,
            events: `
                CREATE TABLE events (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    eventName TEXT,
                    date TEXT,
                    location TEXT,
                    seriesId TEXT,
                    seasonId TEXT,
                    numberOfTracks INTEGER DEFAULT 3,
                    eliminationType TEXT DEFAULT 'double',
                    trackSurface TEXT,
                    weatherContingency TEXT,
                    driverMeetingTime TEXT,
                    maxParticipants INTEGER DEFAULT 0,
                    currentParticipants INTEGER DEFAULT 0,
                    participants TEXT, -- JSON array
                    classes TEXT, -- JSON array for classSettings
                    status TEXT DEFAULT 'upcoming',
                    registrationOpen INTEGER DEFAULT 1,
                    requiresClassSeparation INTEGER DEFAULT 0,
                    freeRunEnabled INTEGER DEFAULT 0,
                    createdAt TEXT,
                    updatedAt TEXT
                )
            `,
            races: `
                CREATE TABLE races (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    eventId TEXT,
                    className TEXT,
                    round INTEGER,
                    heat INTEGER,
                    lane INTEGER,
                    participantId TEXT,
                    position INTEGER,
                    time REAL,
                    status TEXT DEFAULT 'pending',
                    createdAt TEXT,
                    updatedAt TEXT
                )
            `,
            race_brackets: `
                CREATE TABLE race_brackets (
                    id TEXT PRIMARY KEY,
                    eventId TEXT NOT NULL,
                    classes TEXT, -- JSON object
                    currentRound INTEGER DEFAULT 1,
                    eliminationType TEXT DEFAULT 'double',
                    isComplete INTEGER DEFAULT 0,
                    lowerBracket TEXT, -- JSON array
                    numberOfLanes INTEGER DEFAULT 3,
                    participants TEXT, -- JSON array
                    createdAt TEXT,
                    updatedAt TEXT,
                    UNIQUE(eventId)
                )
            `,
            users: `
                CREATE TABLE users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    password TEXT NOT NULL,
                    permissions TEXT, -- JSON array
                    allowedEvents TEXT, -- JSON array
                    createdAt TEXT,
                    updatedAt TEXT
                )
            `
        };

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX idx_participants_eventId ON participants(eventId)',
            'CREATE INDEX idx_participants_racingNumber ON participants(racingNumber)',
            'CREATE INDEX idx_events_seriesId ON events(seriesId)',
            'CREATE INDEX idx_events_date ON events(date)',
            'CREATE INDEX idx_races_eventId ON races(eventId)',
            'CREATE INDEX idx_races_participantId ON races(participantId)',
            'CREATE INDEX idx_race_brackets_eventId ON race_brackets(eventId)'
        ];

        // Execute table creation
        for (const [tableName, sql] of Object.entries(tables)) {
            this.db.exec(sql);
            console.log(`✅ Created table: ${tableName}`);
        }

        // Execute index creation
        for (const indexSql of indexes) {
            this.db.exec(indexSql);
        }

        console.log('✅ All tables and indexes created');
    }

    /**
     * Run migration to import existing JSON data
     */
    async runMigration() {
        try {
            // Check if migration has already been run
            const migrationCheck = this.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_log'"
            ).get();

            if (!migrationCheck) {
                // Create migration log table
                this.db.exec(`
                    CREATE TABLE migration_log (
                        id INTEGER PRIMARY KEY,
                        table_name TEXT NOT NULL,
                        records_migrated INTEGER DEFAULT 0,
                        migrated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                console.log('🔄 Running data migration from JSON files...');
                await this.migrateFromJSON();
            } else {
                console.log('✅ Migration already completed');
            }
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }

    /**
     * LEGACY: Migrate data from JSON files to SQLite
     * ⚠️ WARNING: This is a ONE-TIME migration utility for historical data conversion.
     * 
     * This method reads legacy JSON files and imports them into SQLite database.
     * It should NOT be used in production or called repeatedly.
     * 
     * Use the standalone migration script (utils/migrate-to-sqlite.js) instead.
     * 
     * @deprecated Use utils/migrate-to-sqlite.js for initial migration
     */
    async migrateFromJSON() {
        // Safety check: Don't migrate if tables already have data
        const tables = ['participants', 'series', 'events'];
        for (const table of tables) {
            const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
            if (result.count > 0) {
                throw new Error(
                    `⚠️ MIGRATION BLOCKED: Table '${table}' already contains ${result.count} records. ` +
                    `This migration should only run once on an empty database. ` +
                    `To re-migrate, manually clear the database first.`
                );
            }
        }

        console.log('⚠️ Running ONE-TIME JSON to SQLite migration...');
        
        const jsonFiles = [
            { file: 'participants.json', table: 'participants' },
            { file: 'series.json', table: 'series' },
            { file: 'events.json', table: 'events' },
            { file: 'race_brackets.json', table: 'race_brackets' },
            { file: 'users.json', table: 'users' }
        ];

        for (const { file, table } of jsonFiles) {
            const filePath = path.join(__dirname, '..', 'data', file);

            if (fs.existsSync(filePath)) {
                try {
                    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                    if (Array.isArray(jsonData) && jsonData.length > 0) {
                        await this.migrateTable(table, jsonData);
                        console.log(`✅ Migrated ${jsonData.length} records to ${table}`);
                    } else {
                        console.log(`⚠️ No data to migrate for ${table}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to migrate ${table}:`, error);
                }
            } else {
                console.log(`⚠️ JSON file not found: ${file}`);
            }
        }

        // Log migration completion
        this.db.prepare(`
            INSERT INTO migration_log (table_name, records_migrated)
            VALUES (?, ?)
        `).run('migration_complete', 1);

        console.log('✅ Data migration completed - this should only happen once');
    }

    /**
     * Migrate specific table data
     */
    async migrateTable(tableName, data) {
        const insertStmt = this.db.prepare(`
            INSERT OR REPLACE INTO ${tableName} (${Object.keys(data[0]).join(', ')})
            VALUES (${Object.keys(data[0]).map(() => '?').join(', ')})
        `);

        const transaction = this.db.transaction((items) => {
            for (const item of items) {
                const values = Object.values(item);
                insertStmt.run(...values);
            }
        });

        transaction(data);
    }

    /**
     * Get prepared statement (for performance)
     */
    getPreparedStatement(sql) {
        if (!this.preparedStatements.has(sql)) {
            this.preparedStatements.set(sql, this.db.prepare(sql));
        }
        return this.preparedStatements.get(sql);
    }

    // Participant Management
    /**
     * Add new participant
     */
    async addParticipant(participantData) {
        try {
            // Generate ID if not provided
            if (!participantData.id) {
                participantData.id = this.generateId();
            }

            // Add timestamps
            participantData.createdAt = new Date().toISOString();
            participantData.updatedAt = new Date().toISOString();

            const stmt = this.getPreparedStatement(`
                INSERT INTO participants (${Object.keys(participantData).join(', ')})
                VALUES (${Object.keys(participantData).map(() => '?').join(', ')})
            `);

            stmt.run(...Object.values(participantData));

            // Emit event for real-time updates
            if (this.eventBus) {
                this.eventBus.emit('participant-added', participantData);
            }

            console.log('✅ Participant added to database:', participantData.id);
            return participantData;
        } catch (error) {
            console.error('❌ Error adding participant:', error);
            throw error;
        }
    }

    /**
     * Update participant
     */
    async updateParticipant(id, updates) {
        try {
            // Add updated timestamp
            updates.updatedAt = new Date().toISOString();

            // Build dynamic update query
            const fields = Object.keys(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const values = fields.map(field => updates[field]);

            const stmt = this.getPreparedStatement(`
                UPDATE participants SET ${setClause} WHERE id = ?
            `);

            stmt.run(...values, id);

            // Get updated participant
            const updatedParticipant = this.getParticipant(id);

            // Broadcast participant updated event
            if (this.eventBus) {
                this.eventBus.emit('participant-updated', {
                    participant: updatedParticipant,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Participant updated in database:', id);
            return updatedParticipant;
        } catch (error) {
            console.error('❌ Error updating participant:', error);
            throw error;
        }
    }

    /**
     * Get participant by ID
     */
    getParticipant(id) {
        const stmt = this.getPreparedStatement('SELECT * FROM participants WHERE id = ?');
        return stmt.get(id);
    }

    /**
     * Get all participants
     */
    getParticipantsArray() {
        const stmt = this.getPreparedStatement('SELECT * FROM participants');
        return stmt.all();
    }

    /**
     * Get participants with pagination and filtering
     */
    async getParticipants(filters = {}, page = 1, limit = 50) {
        let query = 'SELECT * FROM participants WHERE 1=1';
        const params = [];

        // Apply filters
        if (filters.eventId) {
            query += ' AND eventId = ?';
            params.push(filters.eventId);
        }
        if (filters.search) {
            query += ' AND (name LIKE ? OR nickname LIKE ? OR racingNumber LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        if (filters.class) {
            query += ' AND selectedClasses LIKE ?';
            params.push(`%${filters.class}%`);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = this.getPreparedStatement(query);
        const participants = stmt.all(...params);

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total').replace(' LIMIT ? OFFSET ?', '');
        const countStmt = this.getPreparedStatement(countQuery);
        const total = countStmt.get(...params.slice(0, -2)).total;

        return {
            participants,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Delete participant
     */
    async deleteParticipant(id) {
        try {
            const participant = this.getParticipant(id);
            if (!participant) {
                throw new Error('Participant not found');
            }

            const stmt = this.getPreparedStatement('DELETE FROM participants WHERE id = ?');
            stmt.run(id);

            // Broadcast participant deleted event
            if (this.eventBus) {
                this.eventBus.emit('participant-deleted', {
                    participantId: id,
                    participantName: participant.name,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Participant deleted from database:', participant.name);
            return true;
        } catch (error) {
            console.error('❌ Error deleting participant:', error);
            throw error;
        }
    }

    // Series Management
    /**
     * Add new series
     */
    async addSeries(seriesData) {
        try {
            // Generate ID if not provided
            if (!seriesData.id) {
                seriesData.id = this.generateId();
            }

            // Add timestamps
            seriesData.createdAt = new Date().toISOString();
            seriesData.updatedAt = new Date().toISOString();

            const stmt = this.getPreparedStatement(`
                INSERT INTO series (${Object.keys(seriesData).join(', ')})
                VALUES (${Object.keys(seriesData).map(() => '?').join(', ')})
            `);

            stmt.run(...Object.values(seriesData));

            // Broadcast series added event
            if (this.eventBus) {
                this.eventBus.emit('series-added', {
                    series: seriesData,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Series added to database:', seriesData.id);
            return seriesData;
        } catch (error) {
            console.error('❌ Error adding series:', error);
            throw error;
        }
    }

    /**
     * Get all series
     */
    getAllSeries() {
        const stmt = this.getPreparedStatement('SELECT * FROM series');
        return stmt.all();
    }

    /**
     * Get series by ID
     */
    getSeries(id) {
        const stmt = this.getPreparedStatement('SELECT * FROM series WHERE id = ?');
        return stmt.get(id);
    }

    /**
     * Update series
     */
    async updateSeries(id, updates) {
        try {
            // Add updated timestamp
            updates.updatedAt = new Date().toISOString();

            // Build dynamic update query
            const fields = Object.keys(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const values = fields.map(field => updates[field]);

            const stmt = this.getPreparedStatement(`
                UPDATE series SET ${setClause} WHERE id = ?
            `);

            stmt.run(...values, id);

            // Get updated series
            const updatedSeries = this.getSeries(id);

            // Broadcast series updated event
            if (this.eventBus) {
                this.eventBus.emit('series-updated', {
                    series: updatedSeries,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Series updated in database:', id);
            return updatedSeries;
        } catch (error) {
            console.error('❌ Error updating series:', error);
            throw error;
        }
    }

    /**
     * Delete series
     */
    async deleteSeries(id) {
        try {
            const series = this.getSeries(id);
            if (!series) {
                throw new Error('Series not found');
            }

            // Delete associated events first
            const deleteEventsStmt = this.getPreparedStatement('DELETE FROM events WHERE seriesId = ?');
            deleteEventsStmt.run(id);

            // Delete series
            const stmt = this.getPreparedStatement('DELETE FROM series WHERE id = ?');
            stmt.run(id);

            // Broadcast series deleted event
            if (this.eventBus) {
                this.eventBus.emit('series-deleted', {
                    seriesId: id,
                    seriesName: series.name,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Series deleted from database:', series.name);
            return true;
        } catch (error) {
            console.error('❌ Error deleting series:', error);
            throw error;
        }
    }

    // Event Management
    /**
     * Add new event
     */
    async addEvent(eventData) {
        try {
            // Generate ID if not provided
            if (!eventData.id) {
                eventData.id = this.generateId();
            }

            // Add timestamps and set initial status
            eventData.createdAt = new Date().toISOString();
            eventData.updatedAt = new Date().toISOString();
            eventData.status = eventData.status || 'upcoming';

            const stmt = this.getPreparedStatement(`
                INSERT INTO events (${Object.keys(eventData).join(', ')})
                VALUES (${Object.keys(eventData).map(() => '?').join(', ')})
            `);

            stmt.run(...Object.values(eventData));

            // Broadcast event added event
            if (this.eventBus) {
                this.eventBus.emit('event-added', {
                    event: eventData,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Event added to database:', eventData.id);
            return eventData;
        } catch (error) {
            console.error('❌ Error adding event:', error);
            throw error;
        }
    }

    /**
     * Get event by ID
     */
    getEvent(id) {
        const stmt = this.getPreparedStatement('SELECT * FROM events WHERE id = ?');
        const event = stmt.get(id);
        
        if (!event) return null;
        
        // Parse JSON fields
        if (event.participants && typeof event.participants === 'string') {
            try {
                event.participants = JSON.parse(event.participants);
            } catch (e) {
                console.error('Failed to parse participants for event', event.id, e);
                event.participants = [];
            }
        }
        if (event.classes && typeof event.classes === 'string') {
            try {
                event.classes = JSON.parse(event.classes);
            } catch (e) {
                console.error('Failed to parse classes for event', event.id, e);
                event.classes = [];
            }
        }
        // Convert integer booleans to actual booleans
        event.registrationOpen = Boolean(event.registrationOpen);
        event.requiresClassSeparation = Boolean(event.requiresClassSeparation);
        event.freeRunEnabled = Boolean(event.freeRunEnabled);
        
        return event;
    }

    /**
     * Get events with pagination and filtering
     */
    async getEvents(filters = {}, page = 1, limit = 1000) {
        let query = 'SELECT * FROM events WHERE 1=1';
        const params = [];

        // Apply filters
        if (filters.seriesId) {
            query += ' AND seriesId = ?';
            params.push(filters.seriesId);
        }
        if (filters.seasonId) {
            query += ' AND seasonId = ?';
            params.push(filters.seasonId);
        }
        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters.search) {
            query += ' AND (name LIKE ? OR eventName LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = this.getPreparedStatement(query);
        const events = stmt.all(...params);

        // Parse JSON fields for each event
        const parsedEvents = events.map(event => {
            // Parse JSON fields
            if (event.participants && typeof event.participants === 'string') {
                try {
                    event.participants = JSON.parse(event.participants);
                } catch (e) {
                    console.error('Failed to parse participants for event', event.id, e);
                    event.participants = [];
                }
            }
            if (event.classes && typeof event.classes === 'string') {
                try {
                    event.classes = JSON.parse(event.classes);
                } catch (e) {
                    console.error('Failed to parse classes for event', event.id, e);
                    event.classes = [];
                }
            }
            // Convert integer booleans to actual booleans
            event.registrationOpen = Boolean(event.registrationOpen);
            event.requiresClassSeparation = Boolean(event.requiresClassSeparation);
            event.freeRunEnabled = Boolean(event.freeRunEnabled);
            
            return event;
        });

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total').replace(' LIMIT ? OFFSET ?', '');
        const countStmt = this.getPreparedStatement(countQuery);
        const total = countStmt.get(...params.slice(0, -2)).total;

        return {
            events: parsedEvents,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Get all events as array
     */
    getEventsArray() {
        const stmt = this.getPreparedStatement('SELECT * FROM events');
        const events = stmt.all();
        
        // Parse JSON fields for each event
        return events.map(event => {
            // Parse JSON fields
            if (event.participants && typeof event.participants === 'string') {
                try {
                    event.participants = JSON.parse(event.participants);
                } catch (e) {
                    console.error('Failed to parse participants for event', event.id, e);
                    event.participants = [];
                }
            }
            if (event.classes && typeof event.classes === 'string') {
                try {
                    event.classes = JSON.parse(event.classes);
                } catch (e) {
                    console.error('Failed to parse classes for event', event.id, e);
                    event.classes = [];
                }
            }
            // Convert integer booleans to actual booleans
            event.registrationOpen = Boolean(event.registrationOpen);
            event.requiresClassSeparation = Boolean(event.requiresClassSeparation);
            event.freeRunEnabled = Boolean(event.freeRunEnabled);
            
            return event;
        });
    }

    /**
     * Update event
     */
    async updateEvent(id, updates) {
        try {
            // Add updated timestamp
            updates.updatedAt = new Date().toISOString();

            // Build dynamic update query
            const fields = Object.keys(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const values = fields.map(field => updates[field]);

            const stmt = this.getPreparedStatement(`
                UPDATE events SET ${setClause} WHERE id = ?
            `);

            stmt.run(...values, id);

            // Get updated event
            const updatedEvent = this.getEvent(id);

            // Broadcast event updated event
            if (this.eventBus) {
                this.eventBus.emit('event-updated', {
                    event: updatedEvent,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Event updated in database:', id);
            return updatedEvent;
        } catch (error) {
            console.error('❌ Error updating event:', error);
            throw error;
        }
    }

    /**
     * Delete event
     */
    async deleteEvent(id) {
        try {
            const event = this.getEvent(id);
            if (!event) {
                throw new Error('Event not found');
            }

            // Delete associated race brackets and races first
            const deleteRacesStmt = this.getPreparedStatement('DELETE FROM races WHERE eventId = ?');
            deleteRacesStmt.run(id);

            const deleteBracketStmt = this.getPreparedStatement('DELETE FROM race_brackets WHERE eventId = ?');
            deleteBracketStmt.run(id);

            // Delete event
            const stmt = this.getPreparedStatement('DELETE FROM events WHERE id = ?');
            stmt.run(id);

            // Broadcast event deleted event
            if (this.eventBus) {
                this.eventBus.emit('event-deleted', {
                    eventId: id,
                    eventName: event.name,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Event deleted from database:', event.name);
            return true;
        } catch (error) {
            console.error('❌ Error deleting event:', error);
            throw error;
        }
    }

    /**
     * Update event status
     */
    async updateEventStatus(eventId, newStatus) {
        try {
            console.log(`🔄 Updating event ${eventId} status to: ${newStatus}`);

            const stmt = this.getPreparedStatement('UPDATE events SET status = ?, updatedAt = ? WHERE id = ?');
            stmt.run(newStatus, new Date().toISOString(), eventId);

            // Emit event for UI updates
            if (this.eventBus) {
                this.eventBus.emit('eventStatusUpdated', { eventId, status: newStatus });
            }

            console.log(`✅ Event ${eventId} status updated to: ${newStatus}`);
            return true;
        } catch (error) {
            console.error('❌ Error updating event status:', error);
            throw error;
        }
    }

    /**
     * Register participant for event
     */
    async registerParticipantForEvent(eventId, participantId) {
        try {
            console.log(`📝 Registering participant ${participantId} for event ${eventId}`);

            // Find the event
            const event = this.getEvent(eventId);
            if (!event) {
                throw new Error('Event not found');
            }

            // Check if participant exists
            const participant = this.getParticipant(participantId);
            if (!participant) {
                throw new Error('Participant not found');
            }

            // Parse current participants array
            let participants = [];
            if (event.participants) {
                try {
                    participants = JSON.parse(event.participants);
                } catch (error) {
                    console.warn('⚠️ Failed to parse participants array, initializing as empty');
                    participants = [];
                }
            }

            // Check if participant is already registered
            if (participants.includes(participantId)) {
                console.log(`⚠️ Participant ${participantId} is already registered for event ${eventId}`);
                return true; // Already registered, return success
            }

            // Check if event is full
            if (event.maxParticipants && participants.length >= event.maxParticipants) {
                throw new Error('Event is full');
            }

            // Add participant to event
            participants.push(participantId);

            // Update both event and participant
            const [updatedEvent, updatedParticipantRecord] = await Promise.all([
                this.updateEvent(eventId, {
                    participants: JSON.stringify(participants),
                    currentParticipants: participants.length
                }),
                this.updateParticipant(participantId, {
                    eventId: eventId
                })
            ]);

            // Broadcast participant registered event
            if (this.eventBus) {
                this.eventBus.emit('participant-registered', {
                    eventId,
                    participantId,
                    eventName: event.name || 'Unknown Event',
                    participantName: participant.name || 'Unknown Participant',
                    timestamp: new Date().toISOString()
                });
            }

            console.log(`✅ Participant ${participant.name || participant.id || 'Unknown'} registered for event ${event.name || event.id || 'Unknown'}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to register participant for event:', error);
            throw error;
        }
    }

    /**
     * Remove participant from event
     */
    async removeParticipantFromEvent(eventId, participantId) {
        try {
            console.log(`📝 Removing participant ${participantId} from event ${eventId}`);

            // Find the event
            const event = this.getEvent(eventId);
            if (!event) {
                throw new Error('Event not found');
            }

            // Check if participant exists
            const participant = this.getParticipant(participantId);
            if (!participant) {
                throw new Error('Participant not found');
            }

            // Parse current participants array
            let participants = [];
            if (event.participants) {
                try {
                    participants = JSON.parse(event.participants);
                } catch (error) {
                    console.warn('⚠️ Failed to parse participants array, initializing as empty');
                    participants = [];
                }
            }

            // Find and remove participant
            const participantIndex = participants.indexOf(participantId);
            if (participantIndex === -1) {
                console.log(`⚠️ Participant ${participantId} is not registered for event ${eventId}`);
                return true; // Not registered, return success
            }

            // Remove participant from event
            participants.splice(participantIndex, 1);

            // Update both event and participant
            const [updatedEvent, updatedParticipantRecord] = await Promise.all([
                this.updateEvent(eventId, {
                    participants: JSON.stringify(participants),
                    currentParticipants: participants.length
                }),
                this.updateParticipant(participantId, {
                    eventId: null  // Clear eventId when removing from event
                })
            ]);

            // Broadcast participant removed event
            if (this.eventBus) {
                this.eventBus.emit('participant-removed', {
                    eventId,
                    participantId,
                    eventName: event.name,
                    participantName: participant.name,
                    timestamp: new Date().toISOString()
                });
            }

            console.log(`✅ Participant ${participant.name} removed from event ${event.name}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to remove participant from event:', error);
            throw error;
        }
    }

    // Race Bracket Management
    /**
     * Save race bracket
     */
    async saveRaceBracket(eventId, bracketData, options = {}) {
        try {
            // Ensure the bracket has an eventId
            bracketData.eventId = eventId;
            bracketData.updatedAt = new Date().toISOString();

            // Generate ID if not provided
            if (!bracketData.id) {
                bracketData.id = this.generateId();
            }

            // Check if bracket already exists
            const existingStmt = this.getPreparedStatement('SELECT * FROM race_brackets WHERE eventId = ?');
            const existing = existingStmt.get(eventId);

            if (existing) {
                // Update existing bracket
                const fields = Object.keys(bracketData);
                const setClause = fields.map(field => `${field} = ?`).join(', ');
                const values = fields.map(field => bracketData[field]);

                const stmt = this.getPreparedStatement(`
                    UPDATE race_brackets SET ${setClause} WHERE eventId = ?
                `);

                stmt.run(...values, eventId);
                console.log('✅ Race bracket updated in database:', eventId);
            } else {
                // Insert new bracket
                const stmt = this.getPreparedStatement(`
                    INSERT INTO race_brackets (${Object.keys(bracketData).join(', ')})
                    VALUES (${Object.keys(bracketData).map(() => '?').join(', ')})
                `);

                stmt.run(...Object.values(bracketData));
                console.log('✅ Race bracket created in database:', eventId);
            }

            // Broadcast bracket saved event
            if (this.eventBus) {
                this.eventBus.emit('race-bracket-saved', {
                    eventId,
                    bracket: bracketData,
                    timestamp: new Date().toISOString()
                });
            }

            return bracketData;
        } catch (error) {
            console.error('❌ Error saving race bracket:', error);
            throw error;
        }
    }

    /**
     * Get race bracket by event ID
     */
    getRaceBracket(eventId) {
        const stmt = this.getPreparedStatement('SELECT * FROM race_brackets WHERE eventId = ?');
        return stmt.get(eventId);
    }

    /**
     * Get all race brackets
     */
    async getRaceBrackets() {
        const stmt = this.getPreparedStatement('SELECT * FROM race_brackets');
        return stmt.all();
    }

    /**
     * Delete race bracket
     */
    deleteRaceBracket(eventId) {
        try {
            console.log(`🗑️ Deleting race bracket for event: ${eventId}`);

            const stmt = this.getPreparedStatement('DELETE FROM race_brackets WHERE eventId = ?');
            stmt.run(eventId);

            // Emit event for UI updates
            if (this.eventBus) {
                this.eventBus.emit('raceBracketDeleted', { eventId });
            }

            return true;
        } catch (error) {
            console.error('❌ Error deleting race bracket:', error);
            return false;
        }
    }

    // User Management
    /**
     * Add new user
     */
    async addUser(userData) {
        try {
            // Generate ID if not provided
            if (!userData.id) {
                userData.id = this.generateId();
            }

            // Add timestamps
            userData.createdAt = new Date().toISOString();
            userData.updatedAt = new Date().toISOString();

            const stmt = this.getPreparedStatement(`
                INSERT INTO users (${Object.keys(userData).join(', ')})
                VALUES (${Object.keys(userData).map(() => '?').join(', ')})
            `);

            stmt.run(...Object.values(userData));

            console.log('✅ User added to database:', userData.id);
            return userData;
        } catch (error) {
            console.error('❌ Error adding user:', error);
            throw error;
        }
    }

    /**
     * Get all users
     */
    getAllUsers() {
        const stmt = this.getPreparedStatement('SELECT * FROM users');
        return stmt.all();
    }

    // Race Management
    /**
     * Add new race
     */
    async addRace(raceData) {
        try {
            // Generate ID if not provided
            if (!raceData.id) {
                raceData.id = this.generateId();
            }

            // Add timestamps
            raceData.createdAt = new Date().toISOString();
            raceData.updatedAt = new Date().toISOString();

            const stmt = this.getPreparedStatement(`
                INSERT INTO races (${Object.keys(raceData).join(', ')})
                VALUES (${Object.keys(raceData).map(() => '?').join(', ')})
            `);

            stmt.run(...Object.values(raceData));

            // Broadcast race added event
            if (this.eventBus) {
                this.eventBus.emit('race-added', {
                    race: raceData,
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ Race added to database:', raceData.id);
            return raceData;
        } catch (error) {
            console.error('❌ Error adding race:', error);
            throw error;
        }
    }

    /**
     * Get races with pagination and filtering
     */
    async getRaces(filters = {}, page = 1, limit = 50) {
        let query = 'SELECT * FROM races WHERE 1=1';
        const params = [];

        // Apply filters
        if (filters.eventId) {
            query += ' AND eventId = ?';
            params.push(filters.eventId);
        }
        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters.search) {
            query += ' AND name LIKE ?';
            params.push(`%${filters.search}%`);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = this.getPreparedStatement(query);
        const races = stmt.all(...params);

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total').replace(' LIMIT ? OFFSET ?', '');
        const countStmt = this.getPreparedStatement(countQuery);
        const total = countStmt.get(...params.slice(0, -2)).total;

        return {
            races,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Get all races as array
     */
    getRacesArray() {
        const stmt = this.getPreparedStatement('SELECT * FROM races');
        return stmt.all();
    }

    // Utility Methods
    /**
     * Generate a unique ID
     */
    generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for environments that don't support crypto.randomUUID
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Clear all data from database
     */
    async clearAllData() {
        try {
            console.log('🧹 Clearing all data from database...');

            // Clear all tables
            const tables = ['participants', 'series', 'events', 'races', 'race_brackets', 'users'];
            for (const table of tables) {
                this.db.exec(`DELETE FROM ${table}`);
            }

            // Broadcast data cleared event
            if (this.eventBus) {
                this.eventBus.emit('data-cleared', {
                    timestamp: new Date().toISOString()
                });
            }

            console.log('✅ All data cleared successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
            throw error;
        }
    }

    /**
     * Get database statistics
     */
    getDatabaseStats() {
        const stats = {};

        const tables = ['participants', 'series', 'events', 'races', 'race_brackets', 'users'];
        for (const table of tables) {
            const stmt = this.getPreparedStatement(`SELECT COUNT(*) as count FROM ${table}`);
            stats[table] = stmt.get().count;
        }

        return stats;
    }

    /**
     * Start automatic backup system
     */
    startAutoBackup(options = {}) {
        if (this.backupManager) {
            return this.backupManager.startAutoBackup(options);
        }
        console.warn('⚠️ Backup manager not initialized');
        return null;
    }

    /**
     * Stop automatic backup system
     */
    stopAutoBackup() {
        if (this.backupManager) {
            this.backupManager.stopAutoBackup();
        }
    }

    /**
     * Create manual backup
     */
    async createManualBackup(filename = null) {
        if (this.backupManager) {
            return await this.backupManager.createManualBackup(filename);
        }
        console.warn('⚠️ Backup manager not initialized');
        return null;
    }

    /**
     * List available backups
     */
    listBackups() {
        if (this.backupManager) {
            return this.backupManager.listBackups();
        }
        return [];
    }

    /**
     * Restore from latest backup
     */
    async restoreLatestBackup() {
        if (this.backupManager) {
            return await this.backupManager.restoreLatestBackup();
        }
        throw new Error('Backup manager not initialized');
    }

    /**
     * Restore from specific backup
     */
    async restoreFromBackup(backupName) {
        if (this.backupManager) {
            return await this.backupManager.restoreFromBackup(backupName);
        }
        throw new Error('Backup manager not initialized');
    }

    /**
     * Get backup statistics
     */
    getBackupStats() {
        if (this.backupManager) {
            return this.backupManager.getBackupStats();
        }
        return null;
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log('🔒 Database connection closed');
        }
        if (this.backupManager) {
            this.backupManager.stopAutoBackup();
        }
    }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseManager;
} else {
    // Export for browser environment (if needed)
    window.DatabaseManager = DatabaseManager;
}
