# 🏁 EPC17 - Event Management System

## Overview
Professional event management system for racing events with network-accessible server architecture for multi-computer access.

## 🚀 Quick Start

### Installation
```bash
pip install -r requirements.txt
```

### Start Server
```bash
python server.py
```

**Server will be accessible at:**
- `http://localhost:5000` (local machine)
- `http://127.0.0.1:5000` (same as localhost)  
- `http://[your-ip]:5000` (network access from other computers)

## 🏗️ Architecture

### Unified Data Management
- **Single Source of Truth**: All data stored in `./data/` directory
- **Server-Side Storage**: JSON files managed by Python Flask server
- **Network Access**: CORS-enabled for multi-computer access
- **Thread-Safe**: Concurrent access protection with automatic backups

### Core Components

#### Backend (`server.py`)
- Flask REST API server
- Thread-safe data operations
- Network-accessible (`0.0.0.0:5000`)
- Automatic data backup system
- Health monitoring endpoint

#### Frontend Data Manager (`utils/data-manager.js`)
- Server-only data persistence
- Unified API client
- Error handling and offline fallback
- Export/import functionality

#### Modules
- `modules/registration.js` - Participant registration
- `modules/series.js` - Series management  
- `modules/event.js` - Event creation and management
- `modules/race.js` - Race brackets and results
- `modules/pairing-engine.js` - Advanced pairing logic

## 📊 Data Structure

### Storage Files (in `./data/`)
- `participants.json` - Participant registrations
- `series.json` - Race series information  
- `events.json` - Individual racing events
- `races.json` - Race results and brackets

### API Endpoints
```
GET/POST /api/participants    - Participant management
GET/POST /api/series         - Series management  
GET/POST /api/events         - Event management
GET/POST /api/races          - Race results
GET      /api/standings      - Calculate standings
GET      /api/health         - Server health check
```

## 🌐 Network Access

### Multi-Computer Setup
1. **Server Computer**: Run `python server.py`
2. **Client Computers**: Access via `http://[server-ip]:5000`
3. **Same Data**: All computers access the same centralized database

### Firewall Configuration
- **Windows**: Allow Python through Windows Firewall on port 5000
- **Network**: Ensure port 5000 is open on local network

## 🔧 Features

### Robust Data Management
- ✅ Thread-safe concurrent access
- ✅ Automatic data backups
- ✅ Error handling and recovery
- ✅ Export/import functionality
- ✅ Health monitoring

### Racing Functionality  
- ✅ Participant registration with payment helper (Do not support the payments itself)
- ✅ Series, seasons and events management
- ✅ Advanced pairing logic (avoid rematches, avoid returning lane logic)
- ✅ Track assignment optimization
- ✅ Instant Result of the event
- ✅ Bracket generation and management (single elimination and double elimination with winner/loser(up/low) brackets)

### User Experience
- ✅ Clean, modern UI
- ✅ Form validation
- ✅ Responsive design
- ✅ Error messages and feedback
- ✅ Export capabilities

## 🏃‍♂️ Development

### File Structure
```
EPC17/
├── server.py              # Main server application
├── requirements.txt       # Python dependencies
├── data/                  # JSON data storage
├── modules/               # Core business logic
├── utils/                 # Helper utilities  
├── components/            # Reusable UI components
├── js/                    # Main JavaScript files
├── styles/                # CSS styling
└── *.html                 # Page templates
```

### Clean Architecture Principles
- **Single Responsibility**: Each module has one purpose
- **Server-First**: All data operations go through server API
- **Network Ready**: Built for multi-computer access from day one
- **Scalable**: Can handle large numbers of events and participants

## 🚨 Troubleshooting

### Common Issues

**Different data on different URLs**
- **Fixed**: Now uses unified server API regardless of URL
- All endpoints (`localhost`, `127.0.0.1`) show same data

**Network access not working**
- Check firewall settings
- Verify server starts with `host='0.0.0.0'`
- Use actual IP address, not localhost, from other computers

**Data not persisting**
- Server automatically saves to `./data/` directory
- Check file permissions in data directory
- Review server console for error messages

## 📈 Scalability

### Performance Optimizations
- Parallel data loading
- Thread-safe operations
- Efficient API design
- Minimal client-side state

### Large Event Support
- UUID-based IDs (no collision risk)
- Indexed data access patterns
- Memory-efficient operations
- Background processing capability

---

**Server Status**: Check `/api/health` endpoint for real-time status
**Data Backup**: Automatic `.backup` files created on every save 