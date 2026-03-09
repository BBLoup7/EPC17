# EPC17 — Professional Racing Event Management System

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-2.3.3-green.svg)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

> **EPC Technology — Project 17**
>
> Professional drag-racing event management focused on reliable results, reproducible pairings, and real-time operations.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [Architecture](#architecture)
- [API Documentation](#api-documentation)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

EPC17 is a robust, network-accessible system designed for managing professional snowmobile drag-racing events. It prioritizes data integrity, state persistence, and deterministic pairing logic over visual flashiness, ensuring that race directors can run events smoothly even under pressure.

The system includes a **Flask backend** for API and data management, a modular **JavaScript frontend** for the user interface, and a **SQLite database** for reliable local storage. It supports multi-client access, allowing separate devices for registration, race direction, and live displays.

## Key Features

### 🏁 Race Management
- **Bracket Generation**: Automated bracket creation based on class and participant counts.
- **Pairing Engine**: Deterministic logic to avoid rematches, optimize lane usage, and handle byes/free runs.
- **Real-time Operations**: Live race input, false-start handling, and crash recovery.
- **Tie-Breakers**: Automated generation of tie-breaker races for ranking resolution.

### 👥 Participant & Driver Management
- **Registration**: Full CRUD operations for participants, including tech sheet tracking.
- **Driver Profiles**: Comprehensive stats tracking (wins, losses, reaction times).
- **Driver Achievements**: Achievement badges and progress summary on Driver Profile.
- **Class Management**: Flexible assignment of drivers to multiple classes.
- **Driver Editing**: Dedicated interface for managing driver details without affecting event data.

### 🏆 Series & Event Management
- **Series Configuration**: Group events into championship series.
- **Event Logic**: Manage multiple events with distinct classes and rules.
- **Data Persistence**: Automatic saving of event state to prevent data loss.

### 📊 Analytics & Live Display
- **Real-time Dashboard**: Live metrics for race directors and spectators.
- **Analytics Engine**: Deep dive into event, series, and driver performance.
- **Visualizations**: Chart.js integration for win rates, lane bias, and more.
- **Live Display**: dedicated view for spectators with real-time updates.

### 🔒 Security & Permissions
- **Role-Based Access**: Granular permissions (Registration, Race Director, Admin, etc.).
- **Session Management**: Persistent sessions via SQLite backend.
- **Access Control**: Route protection and API security.

## Installation

### Requirements
- **Python 3.8+**
- **Node.js** (optional, for frontend tooling)
- **Modern Web Browser** (Chrome, Edge, Firefox)
- **Local Network Access** (for multi-device setup)

### 1. Clone the Repository
```bash
git clone https://github.com/BBLoup7/EPC17.git
cd EPC17
```

### 2. Set Up Virtual Environment
It's recommended to use a virtual environment for Python dependencies.

**Windows:**
```powershell
python -m venv .venv
.venv\Scripts\activate
```

**macOS/Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Initialize Database
The system uses SQLite. The database will be automatically initialized on the first run, but you can also manually generate seed data for testing.

```bash
# Optional: Generate synthetic test data
python utils/generate_data.py --force-reset

# Issue #123 realistic API simulation (40 events in one series)
# - 25 completed events, 15 upcoming events
# - 50-100 unique drivers per event
# - 70-250 registrations per event (rare peak events can approach 300)
python utils/generate_data.py --base-url http://localhost:5000 --username Admin --password Admin321

# Dry-run only (prints event archetype/lane/elimination plan, no writes)
python utils/generate_data.py --dry-run
```

### 5. Start the Server
```bash
# Development mode
set FLASK_ENV=development  # export FLASK_ENV=development on Linux/macOS
python server.py
```

Access the application at `http://localhost:5000`.

## Configuration

### Environment Variables
Create a `.env` file (optional) or set variables in your shell:

- `FLASK_APP`: `server.py`
- `FLASK_ENV`: `development` or `production`
- `PORT`: Default is `5000`
- `DEBUG`: `1` to enable debug logging

### Database
The SQLite database is located at `data/epc17.db`.
- **Backups**: Automatic backups are stored in `data/backups/`.
- **Migrations**: Use scripts in `utils/` for schema updates (e.g., `migrate_sessions.py`).

## Usage Guide

### Creating an Event
1. Log in with appropriate permissions (e.g., `events` role).
2. Navigate to **Events** page.
3. Click **"New Event"**, fill in details (Name, Date, Location), and save.
4. Configure **Classes** for the event.

### Registering Participants
1. Go to **Registration**.
2. Select the target **Event**.
3. Add new participants or select existing drivers.
4. Assign classes and save.

### Running Races
1. Go to **Races**.
2. Select the **Event**.
3. Click **"Initialize Brackets"** to generate pairings.
4. Click on a race card to enter results (Winner, RT, ET).
5. Proceed through heats until finals.

### Viewing Analytics
1. Navigate to **Analytics**.
2. Use tabs to switch between **Overall**, **Event**, **Series**, and **Lane** stats.
3. Filter by specific events or series to generate reports.

## Architecture

### Backend (Flask)
- **`server.py`**: Entry point, API routes, and socket handlers.
- **`utils/db_manager.py`**: Direct SQLite interaction layer.
- **`utils/*.py`**: Specialized helpers (data generation, migrations).

### Frontend (Modular JS)
- **`js/app.js`**: Main application entry and routing.
- **`modules/*.js`**: Domain-specific logic (Race, Event, Registration).
- **`utils/*.js`**: Shared utilities (Auth, DataManager, EventBus).
- **Components**: HTML templates located in `components/` or root.

### Data Flow
1. **Client** requests data via `DataManager` (fetch API).
2. **Server** validates request and queries `epc17.db`.
3. **Server** returns JSON response.
4. **Client** updates UI and broadcasts changes via `EventBus` (or WebSockets for live updates).

## API Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/participants` | List all participants |
| `POST` | `/api/participants` | Create new participant |
| `GET` | `/api/events` | List all events |
| `POST` | `/api/events` | Create new event |
| `GET` | `/api/races` | Get race brackets/results |
| `POST` | `/api/races/update` | Update race result |
| `GET` | `/api/stats/overall` | Get system-wide analytics |
| `GET` | `/api/health` | System health check |

*Note: All API endpoints require valid session authentication.*

## Development

### Code Standards
- **JavaScript**: ES6 modules, JSDoc comments for all functions.
- **Python**: PEP8 compliance, clear docstrings.
- **Formatting**: Prettier for JS/HTML/CSS.

### Directory Structure
```
EPC17/
├── data/              # Database and backups
├── docs/              # Documentation
├── js/                # Core frontend scripts
├── modules/           # Business logic modules
├── utils/             # Backend & frontend utilities
├── styles/            # CSS files
├── templates/         # HTML templates
├── tests/             # Python tests
├── server.py          # Main server file
└── requirements.txt   # Python dependencies
```

### Testing
Run unit tests using `pytest`:
```bash
pytest tests/
```

### Local GitHub Issue Agent
You can run a local, API-driven issue workflow from `agent/`:

```powershell
set GITHUB_TOKEN=your_token_here
set GITHUB_REPO=owner/repo
python -m agent.cli list
python -m agent.cli resolve 14 --context server.py --post --label in-progress
```

See `agent/README.md` for modes and full command options.

## Deployment

For production deployment:
1. Use a production WSGI server like **Gunicorn** or **Waitress**.
2. Set `FLASK_ENV=production`.
3. Ensure `data/` directory is writable.
4. Configure a reverse proxy (Nginx/Apache) for SSL and static files.

## Troubleshooting

- **Server won't start**: Check if port 5000 is in use or if Python dependencies are missing.
- **Database locked**: Ensure no other process is holding a lock on `epc17.db`.
- **Analytics blocked**: Some ad-blockers block `/api/analytics`. We use `/api/stats` to avoid this.
- **Permission denied**: Check user roles in `users.html` (Admin access required to modify).

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.
