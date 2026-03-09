#!/usr/bin/env python3
"""
EPC17 - Event Management System - Network Server
Robust data management for multi-client access across local network
"""

from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
# from flask_cors import CORS  # Temporarily disabled
import os
import json
import threading
import time
from datetime import datetime
import uuid
import ssl
import secrets
from utils.db_manager import DatabaseManager

# WebSocket support
try:
    from flask_socketio import SocketIO, emit
    SOCKETIO_AVAILABLE = True
except ImportError:
    print("⚠️ Flask-SocketIO not available. WebSocket support disabled.")
    print("   Install with: pip install flask-socketio")
    SOCKETIO_AVAILABLE = False
    SocketIO = None
    emit = None

app = Flask(__name__, template_folder='.', static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = secrets.token_hex(16)

# Debug logging helper
DEBUG_MODE = os.environ.get('FLASK_DEBUG', '0') == '1' or os.environ.get('DEBUG', '0') == '1'

def log_debug(*args, **kwargs):
    """Conditional logging based on environment variable"""
    if DEBUG_MODE:
        print(*args, **kwargs)

# Initialize SocketIO if available
socketio = SocketIO(app, cors_allowed_origins="*") if SOCKETIO_AVAILABLE else None

# COMPLETELY DISABLE CORS FOR TESTING
# No CORS configuration at all

# Achievements removed

# Clean server setup without custom logging

# Database configuration - initialize lazily
# TEMPORARILY DISABLED FOR TESTING
# db_manager = None
#
# def get_db_manager():
#     global db_manager
#     if db_manager is None:
#         print("[INFO] Initializing database manager...")
#         try:
#             db_manager = DatabaseManager('data/epc17.db')
#             print("[SUCCESS] Database manager initialized")
#         except Exception as e:
#             print(f"[ERROR] Failed to initialize database manager: {e}")
#             raise
#     return db_manager

_db_manager = None


def get_db_manager():
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager('data/epc17.db')
    return _db_manager

# In-memory session store for simple auth (no external libraries)
# Rule: EPC17_WORKFLOW.md - lightweight local dev, no DB
SESSIONS = {}

# -------------------- WEBSOCKET HELPERS --------------------

def emit_websocket_event(event_name, data):
    """
    Emit a WebSocket event to all connected clients
    Falls back gracefully if WebSocket is not available
    """
    if socketio and SOCKETIO_AVAILABLE:
        try:
            socketio.emit(event_name, data)
            print(f"📡 WebSocket event emitted: {event_name}")
        except Exception as e:
            print(f"⚠️ Failed to emit WebSocket event {event_name}: {e}")
    else:
        # WebSocket not available, event bus will handle updates
        pass

# -------------------- END WEBSOCKET HELPERS --------------------

# Centralized permission helpers
ALL_CATEGORIES = [
    'series',
    'events',
    'registration',
    'races',
    'drivers profile',
    'analytics',
    'live display',
    'animator',
    'admin_power',  # User management permission
]

def is_admin_session(session):
    if not session:
        return False
    # Admin username has full access
    if session.get('username') == 'Admin':
        return True
    # Users with admin_power permission also have admin access
    permissions = session.get('permissions', []) or []
    return 'admin_power' in permissions

def has_permission(session, permission_or_list):
    if not session:
        return False
    if is_admin_session(session):
        return True
    perms = session.get('permissions', []) or []
    if isinstance(permission_or_list, (list, tuple, set)):
        return any(p in perms for p in permission_or_list)
    return permission_or_list in perms

def require_permission(permission_or_list):
    sess = get_session_from_request()
    if not sess:
        return False, ('Unauthorized', 401)
    if has_permission(sess, permission_or_list):
        return True, None
    return False, ('Access Denied', 403)

def create_self_signed_cert():
    """Create a self-signed certificate for HTTPS"""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from datetime import datetime, timedelta
        
        # Generate private key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        
        # Create certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Alaska"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "EPC Technology"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "EPC Technology"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ])
        
        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            private_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.utcnow()
        ).not_valid_after(
            datetime.utcnow() + timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress("127.0.0.1"),
                x509.IPAddress("192.168.1.114"),
            ]),
            critical=False,
        ).sign(private_key, hashes.SHA256())
        
        # Save certificate and key
        with open("cert.pem", "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        
        with open("key.pem", "wb") as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        return True
    except ImportError:
        print("cryptography library not available. Install with: pip install cryptography")
        return False
    except Exception as e:
        print(f"Failed to create certificate: {e}")
        return False

# Database operations - no more JSON files needed!

def create_session(user_id, username, permissions, allowed_events=None):
    token = secrets.token_hex(16)
    SESSIONS[token] = {
        'userId': user_id,
        'username': username,
        'permissions': permissions,
        'allowedEvents': allowed_events or [],
        'createdAt': datetime.now().isoformat()
    }
    return token

def get_session_from_request():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        return SESSIONS.get(token)
    # Also allow token via query for simple local links
    token = request.args.get('token')
    if token:
        return SESSIONS.get(token)
    # Also check cookie for auth token so page loads carry session
    cookie_token = request.cookies.get('auth_token')
    if cookie_token:
        return SESSIONS.get(cookie_token)
    return None

# Rule: EPC17_WORKFLOW.md - unify permission checks to category-only
# Replace legacy fine-grained or wildcard permission model
def require_permission(permission_or_list):
    return_value = None
    # Delegate to the normalized helper defined above
    allowed, err = False, None
    sess = get_session_from_request()
    if not sess:
        return False, ('Unauthorized', 401)
    if has_permission(sess, permission_or_list):
        return True, None
    return False, ('Access Denied', 403)

def generate_id():
    """Generate unique ID"""
    return str(uuid.uuid4())

# Web Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/registration')
def registration():
    ok, err = require_permission(['registration'])
    if not ok:
        msg, code = err
        return msg, code
    return render_template('registration.html')

@app.route('/series')
def series():
    ok, err = require_permission(['series'])
    if not ok:
        msg, code = err
        return msg, code
    return render_template('series.html')

@app.route('/events')
def events():
    ok, err = require_permission(['events'])
    if not ok:
        msg, code = err
        return msg, code
    return render_template('events.html')

@app.route('/races')
def races():
    ok, err = require_permission(['races'])
    if not ok:
        msg, code = err
        return msg, code
    return render_template('races.html')

@app.route('/analytics')
def analytics():
    ok, err = require_permission(['analytics'])
    if not ok:
        msg, code = err
        return msg, code
    return render_template('analytics.html')

@app.route('/statistics')
def statistics():
    ok, err = require_permission(['analytics'])
    if not ok:
        msg, code = err
        return msg, code
    return render_template('analytics.html')  # Redirect to analytics for backward compatibility

@app.route('/big-screen.html')
def big_screen_redirect():
    ok, err = require_permission(['live display'])
    if not ok:
        msg, code = err
        return msg, code
    return render_template('live-display.html')  # Redirect old big-screen.html to live-display.html

@app.route('/network-test')
def network_test():
    return render_template('network-test.html')

# Admin-only Users & Permissions page (requires admin_power permission)
@app.route('/users.html')
def users_permissions_page():
    sess = get_session_from_request()
    if not ensure_admin(sess):
        return 'Access Denied', 403
    return render_template('users.html')

# Tech Inspection page
@app.route('/tech-inspection.html')
def tech_inspection_page():
    return render_template('tech-inspection.html')

# Version endpoint
@app.route('/api/version', methods=['GET'])
def get_version():
    """Get the current version from version.json (single source of truth)."""
    try:
        version_path = os.path.join(os.path.dirname(__file__), 'version.json')
        if os.path.exists(version_path):
            with open(version_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            v = f"{data.get('major', 0)}.{data.get('minor', 0)}.{data.get('patch', 0)}"
            return jsonify({'version': v, 'name': 'EPC17'})
        return jsonify({'version': 'unknown', 'name': 'EPC17'})
    except Exception as e:
        print(f"[ERROR] Failed to read version from version.json: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'version': '2.6.0', 'name': 'EPC17'})

# API Endpoints
@app.route('/api/participants', methods=['GET', 'POST'])
def handle_participants():
    """Handle participant registration and retrieval with pagination"""
    if request.method == 'POST':
        # Rule: EPC17_WORKFLOW.md - category-only permissions (registration)
        ok, err = require_permission('registration')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        log_debug(f"DEBUG DEBUG - POST /api/participants called")
        log_debug(f"DEBUG DEBUG - Content-Type: {request.content_type}")
        log_debug(f"DEBUG DEBUG - Request data: {request.data}")
        
        data = request.json
        log_debug(f"DEBUG DEBUG - Parsed JSON: {data}")
        
        if not data or not data.get('name'):
            log_debug(f"DEBUG - Validation failed: name missing")
            return jsonify({'error': 'Name is required'}), 400
            
        data['id'] = generate_id()
        data['registrationDate'] = datetime.now().isoformat()
        data['paymentStatus'] = data.get('paymentStatus', 'pending')
        data['createdAt'] = data['registrationDate']
        data['updatedAt'] = data['registrationDate']

        log_debug(f"DEBUG DEBUG - Final data to save: {data}")

        if get_db_manager().add_participant(data):
            print(f"SUCCESS - Successfully saved participant: {data['id']}")
            return jsonify(data), 201
        else:
            print(f"ERROR - Failed to save participant")
            return jsonify({'error': 'Failed to save participant'}), 500
    
    # GET request with pagination
    log_debug("[DEBUG] Participants API called - SERVER_VERSION_2025")
    ok, err = require_permission(['registration'])
    if not ok:
        msg, code = err
        log_debug(f"[DEBUG] Permission check failed: {msg}")
        return jsonify({'error': msg}), code

    log_debug("[DEBUG] Permission check passed, querying paginated participants")
    event_id = request.args.get('eventId')
    search = request.args.get('search')
    class_filter = request.args.get('class')
    status = request.args.get('status')
    page = max(int(request.args.get('page', 1)), 1)
    limit = min(max(int(request.args.get('limit', 50)), 1), 500)

    try:
        result = get_db_manager().get_participants_paginated(
            page=page,
            limit=limit,
            search=search,
            status=status,
            event_id=event_id,
            class_filter=class_filter,
        )
    except Exception as e:
        print(f"[ERROR] Failed to get participants from database: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Database error retrieving participants'}), 500

    log_debug(
        f"DEBUG DEBUG - Returning {len(result['participants'])} participants "
        f"(total: {result['total']}, page={result['page']}, limit={result['limit']})"
    )
    return jsonify(result)

@app.route('/api/participants/<participant_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_participant_by_id(participant_id):
    """Handle participant updates and deletion"""
    if request.method == 'GET':
        ok, err = require_permission('registration')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        try:
            participant = get_db_manager().get_participant(participant_id)
            if not participant:
                return jsonify({'error': 'Participant not found'}), 404
            return jsonify(participant), 200
        except Exception as e:
            return jsonify({'error': f'Lookup failed: {str(e)}'}), 500

    if request.method == 'PUT':
        ok, err = require_permission('registration')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        """Update a specific participant"""
        try:
            data = request.json
            if not data or not data.get('name'):
                return jsonify({'error': 'Participant name is required'}), 400

            # Check if participant exists
            existing_participant = get_db_manager().get_participant(participant_id)
            if not existing_participant:
                return jsonify({'error': 'Participant not found'}), 404

            # Update the participant data
            data['id'] = participant_id  # Ensure ID doesn't change
            data['updatedAt'] = datetime.now().isoformat()

            # Preserve original registration date if not provided
            if 'createdAt' not in data and 'registrationDate' in existing_participant:
                data['createdAt'] = existing_participant['registrationDate']

            if get_db_manager().update_participant(participant_id, data):
                return jsonify(data), 200
            else:
                return jsonify({'error': 'Failed to update participant'}), 500

        except Exception as e:
            return jsonify({'error': f'Update failed: {str(e)}'}), 500
    
    elif request.method == 'DELETE':
        """Delete a specific participant"""
        try:
            ok, err = require_permission('registration')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code

            # Check if participant exists
            participant = get_db_manager().get_participant(participant_id)
            if not participant:
                return jsonify({'error': 'Participant not found'}), 404

            # Get all events to remove participant from them
            events = get_db_manager().get_events()

            # Remove participant from events
            for event in events:
                if 'participants' in event and isinstance(event['participants'], list) and participant_id in event['participants']:
                    event['participants'].remove(participant_id)
                    event['currentParticipants'] = len(event['participants'])
                    # Update the event in database
                    get_db_manager().update_event(event['id'], event)

            # Delete the participant
            if get_db_manager().delete_participant(participant_id):
                return jsonify({
                    'success': True,
                    'message': f'Participant "{participant["name"]}" deleted successfully'
                }), 200
            else:
                return jsonify({'error': 'Failed to delete participant'}), 500

        except Exception as e:
            return jsonify({'error': f'Delete failed: {str(e)}'}), 500

@app.route('/api/series', methods=['GET', 'POST'])
def handle_series():
    """Handle series management with pagination"""
    if request.method == 'POST':
        ok, err = require_permission('series')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        data = request.json
        if not data or not data.get('name'):
            return jsonify({'error': 'Series name is required'}), 400
            
        data['id'] = generate_id()
        data['createdDate'] = datetime.now().isoformat()
        data['status'] = data.get('status', 'upcoming')
        data['events'] = data.get('events', [])
        data['createdAt'] = data['createdDate']
        data['updatedAt'] = data['createdDate']

        if get_db_manager().add_series(data):
            return jsonify(data), 201
        else:
            return jsonify({'error': 'Failed to save series'}), 500
    
    # GET request with pagination
    # Allow registration users to read series for registration workflows
    ok, err = require_permission(['series', 'registration'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    series = get_db_manager().get_series()
    
    # Apply filters
    status = request.args.get('status')
    search = request.args.get('search')
    
    if status:
        series = [s for s in series if s.get('status') == status]
    if search:
        search_lower = search.lower()
        series = [s for s in series if s.get('name', '').lower().find(search_lower) != -1]
    
    # Apply pagination
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 1000))  # Increase default limit to 1000 to get all series
    
    total = len(series)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    paginated_series = series[start_idx:end_idx]
    
    log_debug(f"DEBUG DEBUG - Returning {len(paginated_series)} series (total: {total})")
    
    return jsonify({
        'series': paginated_series,
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/series/<series_id>', methods=['PUT', 'DELETE'])
def handle_series_by_id(series_id):
    """Handle series updates and deletion"""
    log_debug(f"DEBUG Received {request.method} request for series {series_id}")
    
    if request.method == 'PUT':
        """Update a specific series"""
        try:
            ok, err = require_permission('series')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code
            print(f"📝 Processing PUT request for series {series_id}")
            data = request.json
            if not data or not data.get('name'):
                return jsonify({'error': 'Series name is required'}), 400
            
            # Check if series exists
            existing_series = get_db_manager().get_series_by_id(series_id)
            if not existing_series:
                return jsonify({'error': 'Series not found'}), 404

            # Update the series data
            data['id'] = series_id  # Ensure ID doesn't change
            data['updatedAt'] = datetime.now().isoformat()

            # Preserve original creation date if not provided
            if 'createdAt' not in data and 'createdDate' in existing_series:
                data['createdAt'] = existing_series['createdDate']

            if get_db_manager().update_series(series_id, data):
                print(f"SUCCESS - Successfully updated series {series_id}")
                return jsonify(data), 200
            else:
                return jsonify({'error': 'Failed to update series'}), 500
                
        except Exception as e:
            print(f"ERROR updating series {series_id}: {str(e)}")
            return jsonify({'error': f'Update failed: {str(e)}'}), 500
    
    elif request.method == 'DELETE':
        """Delete a specific series"""
        try:
            ok, err = require_permission('series')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code
            # Check if series exists
            series = get_db_manager().get_series_by_id(series_id)
            if not series:
                return jsonify({'error': 'Series not found'}), 404

            # Get all participants to remove series from their lists
            participants = get_db_manager().get_participants()

            # Remove series from participants' series lists (if they have series field)
            for participant in participants:
                # Note: participants table doesn't have series field in current schema
                # This might need to be updated if series membership is tracked per participant
                pass

            # Delete the series
            if get_db_manager().delete_series(series_id):
                return jsonify({
                    'success': True,
                    'message': f'Series "{series["name"]}" deleted successfully'
                }), 200
            else:
                return jsonify({'error': 'Failed to save changes'}), 500
                
        except Exception as e:
            return jsonify({'error': f'Delete failed: {str(e)}'}), 500

@app.route('/api/events', methods=['GET', 'POST'])
def handle_events():
    """Handle events with pagination"""
    if request.method == 'POST':
        ok, err = require_permission('events')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        data = request.json
        if not data or not data.get('name'):
            return jsonify({'error': 'Event name is required'}), 400
            
        data['id'] = generate_id()
        data['createdDate'] = datetime.now().isoformat()
        data['status'] = data.get('status', 'upcoming')
        data['participants'] = data.get('participants', [])
        data['currentParticipants'] = len(data['participants'])
        
        if get_db_manager().add_event(data):
            return jsonify(data), 201
        else:
            return jsonify({'error': 'Failed to save event'}), 500
    
    # GET request with pagination
    # Allow registration users to read events for registration workflows
    ok, err = require_permission(['events', 'registration'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    # Admin sees all; non-admins may be scoped by allowedEvents
    sess = get_session_from_request()
    allowed_events = None
    if sess and not is_admin_session(sess):
        allowed = set(sess.get('allowedEvents', []) or [])
        if allowed:
            allowed_events = sorted(allowed)

    # Apply filters (at SQL level)
    series_id = request.args.get('seriesId')
    status = request.args.get('status')
    search = request.args.get('search')
    page = max(int(request.args.get('page', 1)), 1)
    limit = min(max(int(request.args.get('limit', 50)), 1), 500)

    result = get_db_manager().get_events_paginated(
        page=page,
        limit=limit,
        series_id=series_id,
        status=status,
        search=search,
        allowed_event_ids=allowed_events,
    )

    log_debug(f"DEBUG - Returning {len(result['events'])} events (total: {result['total']})")
    return jsonify(result)

@app.route('/api/events/<event_id>', methods=['PUT', 'DELETE'])
def handle_event_by_id(event_id):
    """Handle event updates and deletion"""
    if request.method == 'PUT':
        """Update a specific event"""
        try:
            ok, err = require_permission('events')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code
            log_debug(f"DEBUG DEBUG - PUT /api/events/{event_id} called")
            data = request.json
            log_debug(f"DEBUG DEBUG - Request data: {data}")
            
            if not data:
                log_debug(f"DEBUG - No data provided")
                return jsonify({'error': 'No data provided'}), 400
            
            events = get_db_manager().get_events()

            # Find the event to update
            existing_event = next((e for e in events if e['id'] == event_id), None)
            if not existing_event:
                log_debug(f"DEBUG - Event {event_id} not found")
                return jsonify({'error': 'Event not found'}), 404
            log_debug(f"DEBUG DEBUG - Existing event: {existing_event.get('name', 'Unknown')}")
            
            # For partial updates, preserve existing data and only update provided fields
            if not data.get('name') and 'name' not in data:
                # This is a partial update (like participant count sync)
                # Preserve the existing name and other required fields
                data['name'] = existing_event.get('name')
                log_debug(f"DEBUG DEBUG - Partial update detected, preserving name: {data['name']}")
                if not data['name']:
                    log_debug(f"DEBUG - No name found in existing event")
                    return jsonify({'error': 'Event name is required'}), 400
            
            # Update the event data (merge with existing data)
            updated_event = {
                **existing_event, 
                **data,
                'id': event_id,  # Ensure ID doesn't change
                'updatedAt': datetime.now().isoformat()
            }
            
            log_debug(f"DEBUG DEBUG - Updated event data: {updated_event.get('name', 'Unknown')}")
            
            # Preserve original creation date if not provided
            if 'createdAt' not in updated_event and 'createdDate' in existing_event:
                updated_event['createdAt'] = existing_event['createdDate']
            
            # Update participant count if participants list changed
            if 'participants' in data:
                updated_event['currentParticipants'] = len(data['participants'])
                log_debug(f"DEBUG DEBUG - Updated participant count: {updated_event['currentParticipants']}")
            
            if get_db_manager().update_event(event_id, updated_event):
                print(f"SUCCESS - Successfully updated event: {updated_event.get('name', 'Unknown')}")
                
                # Emit WebSocket event if status changed
                if existing_event.get('status') != updated_event.get('status'):
                    emit_websocket_event('event_status_changed', {
                        'eventId': event_id,
                        'oldStatus': existing_event.get('status'),
                        'newStatus': updated_event.get('status')
                    })
                
                return jsonify(updated_event), 200
            else:
                print(f"ERROR - Failed to save event data")
                return jsonify({'error': 'Failed to update event'}), 500
                
        except Exception as e:
            return jsonify({'error': f'Update failed: {str(e)}'}), 500
    
    elif request.method == 'DELETE':
        """Delete a specific event"""
        try:
            ok, err = require_permission('events')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code
            events = get_db_manager().get_events()
            participants = get_db_manager().get_participants()

            # Find and remove the event
            event = next((e for e in events if e['id'] == event_id), None)
            if not event:
                return jsonify({'error': 'Event not found'}), 404

            deleted_event = event

            # Remove event from participants' event lists
            for participant in participants:
                event_ids = participant.get('eventIds', [])
                if isinstance(event_ids, list) and event_id in event_ids:
                    event_ids.remove(event_id)
                    participant['eventIds'] = event_ids
                    get_db_manager().update_participant(participant['id'], participant)

            # Delete the event
            if get_db_manager().delete_event(event_id):
                return jsonify({
                    'success': True,
                    'message': f'Event "{deleted_event["name"]}" deleted successfully'
                }), 200
            else:
                return jsonify({'error': 'Failed to save changes'}), 500
                
        except Exception as e:
            return jsonify({'error': f'Delete failed: {str(e)}'}), 500

@app.route('/api/events/<event_id>/participants', methods=['POST'])
def register_participant_for_event(event_id):
    """Register a participant for a specific event"""
    # Category-only enforcement: registration
    ok, err = require_permission('registration')
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    # Enforce event scope for non-admin
    sess = get_session_from_request()
    if sess and not is_admin_session(sess):
        allowed = set(sess.get('allowedEvents', []) or [])
        if allowed and event_id not in allowed:
            return jsonify({'error': 'Access Denied'}), 403
    data = request.json
    if not data or not data.get('participantId'):
        return jsonify({'error': 'Participant ID is required'}), 400
    
    participant_id = data['participantId']
    
    try:
        # Load data
        events = get_db_manager().get_events()
        participants = get_db_manager().get_participants()
        
        # Find event
        event = next((e for e in events if e['id'] == event_id), None)
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        
        # Find participant with normalized ID comparison to avoid false misses
        participant_id_str = str(participant_id)
        participant = next((p for p in participants if str(p.get('id')) == participant_id_str), None)
        if not participant:
            return jsonify({'error': 'Participant not found'}), 404
        
        # Check if already registered
        if 'participants' not in event:
            event['participants'] = []
        
        if participant_id in event['participants']:
            return jsonify({'message': 'Participant already registered for this event'}), 200
        
        # Add participant to event
        event['participants'].append(participant_id)
        event['currentParticipants'] = len(event['participants'])
        
        # Add event to participant's eventIds list
        event_ids = participant.get('eventIds', [])
        if not isinstance(event_ids, list):
            event_ids = []
        if event_id not in event_ids:
            event_ids.append(event_id)
            participant['eventIds'] = event_ids

        # Save both records
        if get_db_manager().update_event(event_id, event) and get_db_manager().update_participant(participant_id, participant):
            return jsonify({
                'success': True,
                'message': f'Participant {participant_id} registered for event {event_id}',
                'eventParticipants': len(event['participants'])
            }), 201
        else:
            return jsonify({'error': 'Failed to save registration'}), 500
            
    except Exception as e:
        return jsonify({'error': f'Registration failed: {str(e)}'}), 500

@app.route('/api/races', methods=['GET', 'POST'])
def handle_races():
    """Handle races with pagination"""
    db = get_db_manager()

    if request.method == 'POST':
        ok, err = require_permission('races')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code

        data = request.json or {}
        data['id'] = generate_id()
        now = datetime.utcnow().isoformat()
        data['createdAt'] = data.get('createdAt', now)
        data['updatedAt'] = now

        if not db.add_race(data):
            return jsonify({'error': 'Failed to save race'}), 500

        return jsonify(data), 201

    ok, err = require_permission(['races'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code

    filters = {}
    event_id = request.args.get('eventId')
    if event_id:
        filters['eventId'] = event_id

    class_name = request.args.get('class')
    if class_name:
        filters['className'] = class_name

    status_filter = request.args.get('status')
    if status_filter:
        filters['status'] = status_filter

    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 100))

    result = db.get_races(filters=filters, page=page, limit=limit)

    sess = get_session_from_request()
    if sess and not is_admin_session(sess):
        allowed = set(sess.get('allowedEvents', []) or [])
        if allowed:
            result['races'] = [r for r in result['races'] if r.get('eventId') in allowed]
            result['total'] = len(result['races'])
            result['totalPages'] = (result['total'] + limit - 1) // limit

    return jsonify(result)

@app.route('/api/races/<race_id>', methods=['PUT', 'DELETE'])
def handle_race_by_id(race_id):
    """Handle race updates and deletion"""
    db = get_db_manager()

    if request.method == 'PUT':
        try:
            ok, err = require_permission('races')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code

            data = request.json or {}
            old_race = db.get_race(race_id)
            data['updatedAt'] = datetime.utcnow().isoformat()

            if not db.update_race(race_id, data):
                return jsonify({'error': 'Race not found'}), 404

            updated_race = db.get_race(race_id)
            
            # Emit WebSocket events for race status changes
            if old_race and old_race.get('status') != updated_race.get('status'):
                if updated_race.get('status') == 'completed':
                    emit_websocket_event('race_completed', {'race': updated_race})
                elif updated_race.get('status') == 'in_progress':
                    emit_websocket_event('race_started', {'race': updated_race})
            
            return jsonify(updated_race), 200

        except Exception as e:
            return jsonify({'error': f'Update failed: {str(e)}'}), 500

    try:
        ok, err = require_permission('races')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code

        if not db.delete_race(race_id):
            return jsonify({'error': 'Race not found'}), 404

        return jsonify({'success': True, 'message': 'Race deleted successfully'}), 200

    except Exception as e:
        return jsonify({'error': f'Delete failed: {str(e)}'}), 500


@app.route('/api/standings')
def get_standings():
    """Calculate and return standings"""
    ok, err = require_permission(['analytics'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    series_id = request.args.get('seriesId')
    event_id = request.args.get('eventId')
    
    participants = get_db_manager().get_participants()
    races = get_db_manager().get_all_races()
    series = get_db_manager().get_series()
    events = get_db_manager().get_events()
    
    # Calculate standings logic
    standings = []
    for participant in participants:
        participant_races = [r for r in races if r.get('participantId') == participant['id']]
        
        if series_id and series_id not in participant.get('series', []):
            continue
        if event_id and not any(r.get('eventId') == event_id for r in participant_races):
            continue
            
        # Get series name
        series_name = 'Unknown'
        for s in series:
            if s['id'] in participant.get('series', []):
                series_name = s['name']
                break
        
        # Calculate stats
        events_participated = len({r.get('eventId') for r in participant_races if r.get('eventId')})
        wins = sum(1 for r in participant_races if r.get('position') == 1)
        points = sum(r.get('points', 0) for r in participant_races)
        
        standings.append({
            'participantId': participant['id'],
            'name': participant['name'],
            'seriesName': series_name,
            'eventsParticipated': events_participated,
            'wins': wins,
            'points': points,
            'team': participant.get('team', ''),
            'vehicleClass': participant.get('vehicleClass', '')
        })
    
    # Sort by points (descending)
    standings.sort(key=lambda x: x['points'], reverse=True)
    return jsonify(standings)

def calculate_event_achievements(*args, **kwargs):
    """Achievements removed: return no achievements."""
    return []


@app.route('/api/race-brackets', methods=['GET'])
def get_race_brackets():
    """Get all race brackets with pagination and filtering"""
    ok, err = require_permission(['races'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code

    db = get_db_manager()

    # Get query parameters
    page = max(int(request.args.get('page', 1)), 1)
    limit = min(max(int(request.args.get('limit', 50)), 1), 200)
    event_id = request.args.get('eventId')

    # Scope by allowedEvents if not admin
    sess = get_session_from_request()
    allowed_ids = None
    if sess and not is_admin_session(sess):
        allowed = set(sess.get('allowedEvents', []) or [])
        if allowed:
            allowed_ids = sorted(allowed)

    if event_id:
        # Fetch full bracket data only for a specific event.
        bracket = db.get_race_bracket_by_event_id(event_id)
        brackets = [bracket] if bracket else []
        if allowed_ids is not None:
            brackets = [b for b in brackets if b and b.get('eventId') in allowed_ids]
        total = len(brackets)
        return jsonify({
            'brackets': brackets,
            'total': total,
            'page': 1,
            'limit': max(total, 1),
            'totalPages': 1
        })

    metadata_result = db.get_race_bracket_metadata(
        page=page,
        limit=limit,
        allowed_event_ids=allowed_ids,
    )
    return jsonify(metadata_result)

# WORKING POST ENDPOINT - COPIED EXACTLY FROM auth/login
@app.route('/api/race-brackets', methods=['POST'])
def create_race_bracket():
    """Create a new race bracket"""
    try:
        log_debug("[DEBUG] POST /api/race-brackets received")
        ok, err = require_permission('races')
        if not ok:
            msg, code = err
            log_debug(f"[DEBUG] Permission denied: {msg}")
            return jsonify({'error': msg}), code

        data = request.get_json() or {}
        log_debug(f"[DEBUG] Received bracket data with ID: {data.get('id', 'unknown')}, eventId: {data.get('eventId', 'unknown')}")
        log_debug(f"[DEBUG] Data size: {len(str(data))} characters")

        if not data.get('eventId'):
            log_debug("[DEBUG] Missing eventId in request")
            return jsonify({'error': 'eventId is required'}), 400

        data['id'] = data.get('id') or generate_id()
        data['createdAt'] = data.get('createdAt') or datetime.utcnow().isoformat()
        data['updatedAt'] = datetime.utcnow().isoformat()

        log_debug(f"[DEBUG] Calling db_manager.add_race_bracket")
        try:
            result = get_db_manager().add_race_bracket(data)
            log_debug(f"[DEBUG] add_race_bracket returned: {result}")
        except Exception as db_error:
            print(f"[ERROR] Exception in add_race_bracket: {str(db_error)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Database error: {str(db_error)}'}), 500

        if not result:
            log_debug("[DEBUG] add_race_bracket returned False")
            return jsonify({'error': 'Failed to create race bracket'}), 500

        log_debug("[DEBUG] Bracket created successfully")
        
        # Emit WebSocket event for new bracket
        emit_websocket_event('bracket_updated', {
            'bracketId': data['id'],
            'eventId': data.get('eventId')
        })
        
        return jsonify(data), 201

    except Exception as e:
        print(f"[ERROR] Exception in create_race_bracket: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/test-post', methods=['POST'])
def test_post():
    """Test POST endpoint without /api/ prefix"""
    print("[TEST] POST /test-post received!")
    try:
        data = request.get_json()
        print(f"[TEST] Test data: {data}")
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        print(f"[TEST] Test error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/simple-test', methods=['POST'])
def simple_test():
    """Ultra simple test"""
    return 'OK'

@app.route('/minimal-post', methods=['POST'])
def minimal_post():
    """Minimal POST test"""
    return jsonify({'status': 'success'}), 200

@app.route('/api/race-brackets/<bracket_id>', methods=['PUT'])
def update_race_bracket(bracket_id):
    """Update an existing race bracket"""
    try:
        ok, err = require_permission('races')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        bracket_data = request.get_json()
        if not bracket_data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Check if bracket exists
        existing_bracket = get_db_manager().get_race_bracket(bracket_id)
        if not existing_bracket:
            return jsonify({'error': 'Race bracket not found'}), 404

        bracket_data['id'] = bracket_id
        bracket_data['updatedAt'] = datetime.now().isoformat()
        # Preserve createdAt if it exists
        if 'createdAt' in existing_bracket:
            bracket_data['createdAt'] = existing_bracket['createdAt']

        if get_db_manager().update_race_bracket(bracket_id, bracket_data):
            # Emit WebSocket event for bracket update
            emit_websocket_event('bracket_updated', {
                'bracketId': bracket_id,
                'eventId': bracket_data.get('eventId')
            })
            return jsonify(bracket_data)
        else:
            return jsonify({'error': 'Failed to update race bracket'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/race-brackets/<bracket_id>', methods=['DELETE'])
def delete_race_bracket(bracket_id):
    """Delete a race bracket"""
    try:
        ok, err = require_permission('races')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        # Check if bracket exists
        existing_bracket = get_db_manager().get_race_bracket(bracket_id)
        if not existing_bracket:
            return jsonify({'error': 'Race bracket not found'}), 404

        if get_db_manager().delete_race_bracket(bracket_id):
            return jsonify({'message': 'Race bracket deleted'})
        else:
            return jsonify({'error': 'Failed to delete race bracket'}), 500
        
        return jsonify({'error': 'Race bracket not found'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Health check endpoint
@app.route('/api/health')
def health_check():
    """Server health check"""
    try:
        db_manager = get_db_manager()
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'database_stats': db_manager.get_stats_counts()
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }), 500

# -------------------- EMAIL & SETTINGS ENDPOINTS --------------------

# Settings management
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    """Get or update application settings"""
    if request.method == 'GET':
        # Read settings from SQLite database
        settings = get_db_manager().get_settings()
        # Return default settings if none exist
        if not settings:
            settings = {
                'emailEnabled': False,
                'emailSubject': 'Your Event Performance Statistics',
                'emailBodyTemplate': 'Dear {name},\n\nThank you for participating in {event}!\n\nPlease find attached your performance statistics.',
                'updatedAt': datetime.now().isoformat()
            }
            get_db_manager().save_settings(settings)
        return jsonify(settings)
    
    # POST - Update settings (admin only)
    sess = get_session_from_request()
    if not is_admin_session(sess):
        return jsonify({'error': 'Access Denied'}), 403
    
    data = request.get_json() or {}
    settings = get_db_manager().get_settings() or {}
    
    # Update settings
    settings.update(data)
    settings['updatedAt'] = datetime.now().isoformat()
    
    if get_db_manager().save_settings(settings):
        return jsonify(settings), 200
    else:
        return jsonify({'error': 'Failed to save settings'}), 500

# Email sending endpoint
@app.route('/api/send-event-stats', methods=['POST'])
def send_event_stats():
    """Send event statistics PDFs to drivers via email"""
    try:
        # Require analytics permission
        ok, err = require_permission(['analytics'])
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        
        # Check if email is enabled in settings
        settings = get_db_manager().get_settings() or {}
        if not settings.get('emailEnabled', False):
            return jsonify({
                'error': 'Email sending is disabled in settings',
                'disabled': True
            }), 400
        
        # Get request data
        data = request.get_json() or {}
        event_name = data.get('eventName', 'Event')
        recipients = data.get('recipients', [])
        
        if not recipients:
            return jsonify({'error': 'No recipients provided'}), 400
        
        # Import email sender
        import sys
        import importlib.util
        email_sender_path = os.path.join(os.path.dirname(__file__), 'utils', 'email-sender.py')
        spec = importlib.util.spec_from_file_location("email_sender", email_sender_path)
        email_sender_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(email_sender_module)
        EmailSender = email_sender_module.EmailSender
        create_default_body_template = email_sender_module.create_default_body_template
        
        # Initialize email sender
        sender = EmailSender()
        
        # Validate configuration
        is_valid, error_msg = sender.validate_config()
        if not is_valid:
            if 'internet' in error_msg.lower() or 'connection' in error_msg.lower():
                return jsonify({
                    'error': 'Could not send emails – no internet.',
                    'offline': True
                }), 503
            else:
                return jsonify({
                    'error': f'Email configuration error: {error_msg}',
                    'config_error': True
                }), 500
        
        # Get email template from settings
        subject = settings.get('emailSubject', 'Your Event Performance Statistics')
        body_template = settings.get('emailBodyTemplate', create_default_body_template())
        
        # Process recipients - convert PDF base64 to bytes
        import base64
        processed_recipients = []
        for recipient in recipients:
            try:
                pdf_base64 = recipient.get('pdfData', '')
                if pdf_base64.startswith('data:application/pdf;base64,'):
                    pdf_base64 = pdf_base64.split(',')[1]
                
                pdf_bytes = base64.b64decode(pdf_base64)
                
                processed_recipients.append({
                    'name': recipient.get('name', 'Driver'),
                    'email': recipient.get('email', ''),
                    'pdf_data': pdf_bytes,
                    'pdf_filename': recipient.get('fileName', 'stats.pdf')
                })
            except Exception as e:
                print(f"Error processing recipient {recipient.get('name', 'Unknown')}: {e}")
                continue
        
        # Send bulk emails
        results = sender.send_bulk_emails(
            recipients=processed_recipients,
            subject=subject,
            body_template=body_template,
            event_name=event_name
        )
        
        # Check if there was a configuration error
        if 'error' in results:
            return jsonify({
                'error': results['error'],
                'offline': 'internet' in results['error'].lower()
            }), 503
        
        # Return results
        return jsonify({
            'success': True,
            'successCount': results['success_count'],
            'failedCount': results['failed_count'],
            'details': results['details']
        }), 200
        
    except ImportError as e:
        return jsonify({
            'error': f'Email module not available: {str(e)}',
            'config_error': True
        }), 500
    except Exception as e:
        print(f"Error sending event stats: {str(e)}")
        return jsonify({
            'error': f'Failed to send emails: {str(e)}'
        }), 500

# Clear all data endpoint (DANGER! - Admin only)
@app.route('/api/clear-database', methods=['POST'])
def clear_database():
    """DANGER: Clear all database data and create backup - Admin only"""
    global _db_manager
    log_debug(f"[DEBUG] Clear database endpoint called at {datetime.now().isoformat()}")

    try:
        # Admin only - check this first
        sess = get_session_from_request()
        if not is_admin_session(sess):
            log_debug("[DEBUG] Access denied - not admin")
            return jsonify({'error': 'Access Denied'}), 403

        log_debug("[DEBUG] Admin access confirmed, starting backup creation...")

        # Create database backup before clearing
        backup_path = f"data/backups/backup_clear_all_{int(datetime.now().timestamp())}.db"

        try:
            # Create backup of the database file
            import shutil
            shutil.copy2('data/epc17.db', backup_path)
            print(f"[INFO] Database backup created: {backup_path}")
        except Exception as e:
            print(f"[WARNING] Failed to create database backup: {e}")
            return jsonify({
                'status': 'error',
                'error': f'Failed to create backup: {str(e)}'
            }), 500

        # Create fresh database by removing the current one and letting it be recreated
        try:
            log_debug("[DEBUG] Starting database recreation process...")

            # Close any existing connections
            if _db_manager is not None:
                log_debug("[DEBUG] Closing existing database manager...")
                _db_manager.close()
                log_debug("[DEBUG] Database manager closed")

            # Remove the current database file
            if os.path.exists('data/epc17.db'):
                log_debug("[DEBUG] Removing existing database file...")
                os.remove('data/epc17.db')
                log_debug("[DEBUG] Database file removed")

            # Create a new database manager which will initialize a fresh database
            log_debug("[DEBUG] Creating new database manager...")
            from utils.db_manager import DatabaseManager
            _db_manager = DatabaseManager('data/epc17.db')
            log_debug("[DEBUG] New database manager created")

            print("[INFO] Fresh database created successfully")

            return jsonify({
                'status': 'success',
                'message': 'Database cleared and backup created successfully',
                'backup_path': backup_path,
                'timestamp': datetime.now().isoformat()
            })

        except Exception as e:
            print(f"[ERROR] Failed to create fresh database: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'status': 'error',
                'error': f'Failed to create fresh database: {str(e)}'
            }), 500

    except Exception as e:
        print(f"[ERROR] Exception in clear_database: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

# Check email configuration
@app.route('/api/email-config-status', methods=['GET'])
def email_config_status():
    """Check if email configuration is valid"""
    try:
        import importlib.util
        email_sender_path = os.path.join(os.path.dirname(__file__), 'utils', 'email-sender.py')
        spec = importlib.util.spec_from_file_location("email_sender", email_sender_path)
        email_sender_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(email_sender_module)
        EmailSender = email_sender_module.EmailSender
        
        sender = EmailSender()
        is_valid, message = sender.validate_config()
        
        return jsonify({
            'configured': bool(sender.email_user and sender.email_pass),
            'valid': is_valid,
            'online': sender.check_internet_connection(),
            'message': message
        })
    except ImportError:
        return jsonify({
            'configured': False,
            'valid': False,
            'online': False,
            'message': 'Email module not available'
        })

# Static file serving
@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files with cache-busting for development"""
    from flask import make_response
    # Gate HTML files by permissions (except index.html and login overlay dependency)
    if filename.endswith('.html'):
        if filename == 'index.html':
            return render_template('index.html')
        if filename == 'login.html':
            return render_template('login.html')
        page_perm_map = {
            'registration.html': ['registration'],
            'series.html': ['series'],
            'events.html': ['events'],
            'races.html': ['races'],
            'analytics.html': ['analytics'],
            # Allow driver profiles for registration workflows (and keep legacy permission)
            'driver-profile.html': ['drivers profile', 'registration'],
            'live-display.html': ['live display'],
            'users.html': ['admin_power'],
        }
        required = page_perm_map.get(filename)
        if required:
            ok, err = require_permission(required)
            if not ok:
                msg, code = err
                return msg, code
        else:
            # Deny any other .html pages not explicitly allowed
            return 'Access Denied', 403
    response = make_response(send_from_directory('.', filename))
    
    # Add cache-busting headers for JavaScript files to prevent caching issues
    if filename.endswith('.js') or filename.endswith('.css'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    
    return response

# -------------------- AUTH ENDPOINTS --------------------
# Rule: EPC17_WORKFLOW.md - simple JSON storage, no external libs
# Rule: EPC17_PROMPTS.md not applicable here; feature is backend auth

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    username = data.get('username', '')
    password = data.get('password', '')

    # Simple login for Admin without database check
    if username == 'Admin' and password == 'Admin321':
        # Create admin user with all permissions
        admin_permissions = ALL_CATEGORIES[:]
        token = create_session(
            'admin-user-id',
            'Admin',
            admin_permissions,
            []  # No event restrictions for admin
        )
        resp = jsonify({'token': token, 'username': 'Admin', 'permissions': admin_permissions, 'allowedEvents': []})
        resp.set_cookie('auth_token', token, max_age=60*60*24*30, httponly=False, samesite='Lax')
        return resp

    # Fallback to database authentication for other users
    users = get_db_manager().get_users()
    user = next((u for u in users if u.get('username') == username and u.get('password') == password), None)
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401

    # Ensure Admin invariants: Admin always has all categories
    if user.get('username') == 'Admin':
        if set(user.get('permissions', [])) != set(ALL_CATEGORIES):
            user['permissions'] = ALL_CATEGORIES[:]
            get_db_manager().update_user(user['id'], user)

    token = create_session(
        user.get('id'),
        user.get('username'),
        user.get('permissions', []),
        user.get('allowedEvents', [])
    )
    resp = jsonify({'token': token, 'username': user.get('username'), 'permissions': user.get('permissions', []), 'allowedEvents': user.get('allowedEvents', [])})
    # Set cookie so subsequent page GETs include auth
    resp.set_cookie('auth_token', token, max_age=60*60*24*30, httponly=False, samesite='Lax')
    return resp

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        SESSIONS.pop(token, None)
    resp = jsonify({'success': True})
    # Clear auth cookie
    resp.set_cookie('auth_token', '', expires=0)
    return resp

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    sess = get_session_from_request()
    if not sess:
        return jsonify({'authenticated': False}), 200
    return jsonify({'authenticated': True, 'username': sess['username'], 'permissions': sess['permissions'], 'allowedEvents': sess.get('allowedEvents', [])})

def ensure_admin(sess):
    """Check if user has admin privileges (either Admin username or admin_power permission)"""
    if not sess:
        return False
    # Admin username has all privileges
    if sess.get('username') == 'Admin':
        return True
    # Or user has admin_power permission
    return 'admin_power' in (sess.get('permissions', []) or [])

@app.route('/api/users', methods=['GET', 'POST'])
def users_collection():
    sess = get_session_from_request()
    if not ensure_admin(sess):
        return jsonify({'error': 'Access Denied'}), 403
    if request.method == 'GET':
        # Get all users from database
        users = get_db_manager().get_users()
        return jsonify(users)
    # POST - Create new user
    data = request.get_json() or {}
    if not data.get('username') or not data.get('password'):
        return jsonify({'error': 'username and password are required'}), 400
    users = get_db_manager().get_users()
    if any(u.get('username') == data['username'] for u in users):
        return jsonify({'error': 'Username already exists'}), 400
    new_user = {
        'id': generate_id(),
        'username': data['username'],
        'password': data['password'],
        'permissions': [p for p in (data.get('permissions', []) or []) if p in ALL_CATEGORIES],
        'allowedEvents': data.get('allowedEvents', [])
    }
    # Prevent creation of another Admin username
    if new_user['username'] == 'Admin':
        return jsonify({'error': 'Cannot create another Admin user'}), 400
    if get_db_manager().add_user(new_user):
        return jsonify(new_user), 201
    else:
        return jsonify({'error': 'Failed to create user'}), 500

@app.route('/api/users/<user_id>', methods=['PUT', 'DELETE'])
def users_item(user_id):
    sess = get_session_from_request()
    if not ensure_admin(sess):
        return jsonify({'error': 'Access Denied'}), 403
    users = get_db_manager().get_users()
    idx = next((i for i, u in enumerate(users) if u.get('id') == user_id), None)
    if idx is None:
        return jsonify({'error': 'User not found'}), 404
    # Disallow modifying Admin permissions or deleting Admin
    if users[idx].get('username') == 'Admin':
        if request.method == 'DELETE':
            return jsonify({'error': 'Cannot delete Admin user'}), 400
        if request.method == 'PUT':
            data = request.get_json() or {}
            # Admin username/password can be changed? Keep it simple: disallow username change; allow password change if desired
            if 'username' in data and data['username'] != 'Admin':
                return jsonify({'error': 'Cannot change Admin username'}), 400
            # Force keep wildcard permissions
            users[idx]['permissions'] = ALL_CATEGORIES[:]
            if 'password' in data:
                users[idx]['password'] = data['password']
            get_db_manager().update_user(users[idx]['id'], users[idx])
            return jsonify(users[idx])
    if request.method == 'PUT':
        data = request.get_json() or {}
        if 'username' in data:
            # prevent duplicate username
            if any(u.get('username') == data['username'] and u.get('id') != user_id for u in users):
                return jsonify({'error': 'Username already exists'}), 400
            users[idx]['username'] = data['username']
        if 'password' in data:
            users[idx]['password'] = data['password']
        if 'permissions' in data:
            users[idx]['permissions'] = [p for p in (data.get('permissions', []) or []) if p in ALL_CATEGORIES]
        if 'allowedEvents' in data:
            users[idx]['allowedEvents'] = list({e for e in (data.get('allowedEvents', []) or []) if isinstance(e, str) and e})
        get_db_manager().update_user(users[idx]['id'], users[idx])
        return jsonify(users[idx])
    else:
        deleted = users.pop(idx)
        get_db_manager().delete_user(deleted['id'])
        return jsonify({'success': True, 'deletedId': deleted.get('id')})

# ============================================================================
# ANALYTICS API ENDPOINTS
# ============================================================================

def is_heat_completed(heat):
    """
    Determine whether a heat should be treated as completed for analytics.

    Supports both:
    - Legacy bracket schema: heat.isComplete == True
    - Current bracket schema: heat.status == 'completed' AND heat.results is a non-empty list
    """
    if not isinstance(heat, dict):
        return False

    # Legacy schema support
    if heat.get('isComplete') is True:
        return True

    # Current schema support (RaceUI / RaceManager)
    if heat.get('status') == 'completed':
        results = heat.get('results')
        return isinstance(results, list) and len(results) > 0

    return False


def get_heat_lane_for_participant(heat, participant_id):
    """
    Return the lane number for a participant in a heat.

    Supports multiple lane shapes:
    - { lane, participant: { id, ... } }
    - { lane, participantId }
    """
    if not isinstance(heat, dict) or not participant_id:
        return None

    lanes = heat.get('lanes')
    if not isinstance(lanes, list):
        return None

    for lane in lanes:
        if not isinstance(lane, dict):
            continue

        pid = None
        participant = lane.get('participant')
        if isinstance(participant, dict):
            pid = participant.get('id')
        if not pid:
            pid = lane.get('participantId') or lane.get('participant_id')

        if pid == participant_id:
            return lane.get('lane', 'Unknown')

    return None


def parse_finish_position(value):
    """Parse a finish position value into an int, or return None when not numeric (FS/DSQ/etc)."""
    # bool is a subclass of int; treat it as invalid here.
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return None
    if isinstance(value, str):
        try:
            return int(value)
        except Exception:
            return None
    return None


def compute_driver_achievements(driver_id, race_brackets, event_filter=None):
    """
    Compute driver achievements based on race bracket history.

    Mirrors the frontend AchievementsEngine rules so API consumers can render
    achievements without re-processing the full bracket tree on the client.
    """
    stats = {
        'totalRaces': 0,
        'totalWins': 0,
        'totalLosses': 0,
        'bestWinStreak': 0,
        'classWins': 0,
        'uniqueClasses': 0,
        'comebackWins': 0,
        'perfectEvents': 0,
        'uniqueWinLanes': 0,
    }

    achievement_definitions = [
        {
            'id': 'first_win',
            'name': 'First Blood',
            'description': 'Win your very first race',
            'icon': '🏆',
            'rarity': 'common',
            'check': lambda s: s['totalWins'] >= 1,
        },
        {
            'id': 'win_streak_3',
            'name': 'Hot Streak',
            'description': 'Win 3 races in a row',
            'icon': '🔥',
            'rarity': 'rare',
            'check': lambda s: s['bestWinStreak'] >= 3,
        },
        {
            'id': 'win_streak_5',
            'name': 'Unstoppable',
            'description': 'Win 5 races in a row',
            'icon': '⚡',
            'rarity': 'epic',
            'check': lambda s: s['bestWinStreak'] >= 5,
        },
        {
            'id': 'race_10',
            'name': 'Veteran',
            'description': 'Complete 10 races',
            'icon': '🎖️',
            'rarity': 'common',
            'check': lambda s: s['totalRaces'] >= 10,
        },
        {
            'id': 'race_50',
            'name': 'Road Warrior',
            'description': 'Complete 50 races',
            'icon': '🛡️',
            'rarity': 'rare',
            'check': lambda s: s['totalRaces'] >= 50,
        },
        {
            'id': 'event_winner',
            'name': 'Champion',
            'description': 'Win a class in an event',
            'icon': '👑',
            'rarity': 'epic',
            'check': lambda s: s['classWins'] >= 1,
        },
        {
            'id': 'multi_class',
            'name': 'Jack of All Trades',
            'description': 'Race in 3 or more different classes',
            'icon': '🃏',
            'rarity': 'rare',
            'check': lambda s: s['uniqueClasses'] >= 3,
        },
        {
            'id': 'comeback_king',
            'name': 'Comeback King',
            'description': 'Win a race after being in the lower bracket',
            'icon': '💪',
            'rarity': 'rare',
            'check': lambda s: s['comebackWins'] >= 1,
        },
        {
            'id': 'perfect_event',
            'name': 'Flawless Victory',
            'description': 'Win every race in a class with no losses',
            'icon': '💎',
            'rarity': 'legendary',
            'check': lambda s: s['perfectEvents'] >= 1,
        },
        {
            'id': 'lane_master',
            'name': 'Lane Master',
            'description': 'Win from every lane position (1-4)',
            'icon': '🎯',
            'rarity': 'epic',
            'check': lambda s: s['uniqueWinLanes'] >= 4,
        },
    ]

    current_streak = 0
    win_lanes = set()
    classes = set()
    chronological_results = []

    for bracket in race_brackets or []:
        if not isinstance(bracket, dict):
            continue

        bracket_event_id = bracket.get('eventId')
        if event_filter and bracket_event_id != event_filter:
            continue

        classes_map = bracket.get('classes')
        if not isinstance(classes_map, dict):
            continue

        for class_name, class_data in classes_map.items():
            if not isinstance(class_data, dict):
                continue

            participants = class_data.get('participants') or []
            participant_obj = next(
                (p for p in participants if isinstance(p, dict) and p.get('id') == driver_id),
                None
            )

            winner = class_data.get('winner')
            if isinstance(winner, dict) and winner.get('id') == driver_id:
                stats['classWins'] += 1
                if participant_obj and (participant_obj.get('losses') or 0) == 0:
                    stats['perfectEvents'] += 1
                if participant_obj and participant_obj.get('currentBracket') == 'lower':
                    stats['comebackWins'] += 1

            for round_data in class_data.get('rounds') or []:
                if not isinstance(round_data, dict):
                    continue
                for heat in round_data.get('heats') or []:
                    if not is_heat_completed(heat):
                        continue
                    if not isinstance(heat.get('results'), list):
                        continue

                    result = next(
                        (
                            r for r in heat['results']
                            if isinstance(r, dict) and r.get('participantId') == driver_id
                        ),
                        None
                    )
                    if not result:
                        continue

                    classes.add(class_name)
                    position = parse_finish_position(result.get('position')) or 0
                    is_win = position == 1
                    completed_at = heat.get('completedAt') or ''
                    chronological_results.append((completed_at, is_win))

                    stats['totalRaces'] += 1
                    if is_win:
                        stats['totalWins'] += 1
                        lane = get_heat_lane_for_participant(heat, driver_id)
                        if lane not in [None, 'Unknown']:
                            win_lanes.add(lane)
                    else:
                        stats['totalLosses'] += 1

    for _, is_win in sorted(chronological_results, key=lambda item: item[0]):
        if is_win:
            current_streak += 1
            stats['bestWinStreak'] = max(stats['bestWinStreak'], current_streak)
        else:
            current_streak = 0

    stats['uniqueClasses'] = len(classes)
    stats['uniqueWinLanes'] = len(win_lanes)

    earned = []
    for ach in achievement_definitions:
        try:
            if ach['check'](stats):
                earned.append({
                    'id': ach['id'],
                    'name': ach['name'],
                    'description': ach['description'],
                    'icon': ach['icon'],
                    'rarity': ach['rarity'],
                })
        except Exception:
            continue

    return {
        'earned': earned,
        'stats': stats,
        'total': len(achievement_definitions),
    }


def add_cors_headers(response):
    """Add CORS headers to response"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

@app.after_request
def after_request_cors(response):
    """Add CORS headers to all responses"""
    if request.path.startswith('/api/stats'):
        response = add_cors_headers(response)
    return response

@app.route('/api/stats/overall', methods=['GET'])
def get_overall_analytics():
    """Get overall system analytics across all events and participants"""
    try:
        db = get_db_manager()
        
        counts = db.get_stats_counts()
        total_drivers = counts.get('participants', 0)
        total_events = counts.get('events', 0)
        total_revenue = db.get_total_revenue()
        total_races = db.get_completed_races_count()

        # Count total entries from eventClasses map (single table scan only).
        total_entries = 0
        for participant in db.get_participants():
            event_classes = participant.get('eventClasses', {})
            if isinstance(event_classes, dict):
                total_entries += len(event_classes)

        status_counts = db.get_events_by_status_counts()
        events_by_status = {
            'upcoming': status_counts.get('upcoming', 0),
            'active': status_counts.get('active', 0) + status_counts.get('in-progress', 0),
            'completed': status_counts.get('completed', 0),
            'cancelled': status_counts.get('cancelled', 0),
        }
        
        # Average participants per event
        avg_participants_per_event = round(total_entries / total_events, 1) if total_events > 0 else 0
        
        response = jsonify({
            'totalRevenue': round(total_revenue, 2),
            'totalDrivers': total_drivers,
            'totalEntries': total_entries,
            'totalRaces': total_races,
            'totalEvents': total_events,
            'eventsByStatus': events_by_status,
            'avgParticipantsPerEvent': avg_participants_per_event,
            'lastUpdated': datetime.now().isoformat()
        })
        return add_cors_headers(response)
    except Exception as e:
        print(f"[ERROR] Error getting overall analytics: {e}")
        import traceback
        traceback.print_exc()
        error_response = jsonify({'error': str(e), 'message': 'Failed to fetch overall analytics'})
        return add_cors_headers(error_response), 500


@app.route('/api/stats/event/<event_id>', methods=['GET'])
def get_event_analytics(event_id):
    """Get detailed analytics for a specific event"""
    try:
        db = get_db_manager()
        
        # Get event data
        event = db.get_event(event_id)
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        
        # Get participants for this event (database-level filter).
        event_participants = db.get_participants_by_event(event_id)
        
        # Get race bracket for this event
        race_bracket = db.get_race_bracket_by_event_id(event_id)
        
        # Calculate statistics
        total_participants = len(event_participants)
        
        # Calculate revenue for this event
        total_revenue = sum(p.get('totalFee', 0) or 0 for p in event_participants)
        
        # Class breakdown
        class_breakdown = {}
        for p in event_participants:
            event_classes = p.get('eventClasses', {})
            if isinstance(event_classes, dict) and event_id in event_classes:
                classes = event_classes[event_id]
                if isinstance(classes, list):
                    for class_name in classes:
                        if class_name not in class_breakdown:
                            class_breakdown[class_name] = {
                                'name': class_name,
                                'participants': 0,
                                'races': 0,
                                'completedRaces': 0,
                                'revenue': 0
                            }
                        class_breakdown[class_name]['participants'] += 1
                        # Distribute revenue evenly across classes
                        class_breakdown[class_name]['revenue'] += (p.get('totalFee', 0) or 0) / len(classes)
        
        # Count races by class
        total_races = 0
        completed_races = 0
        
        if race_bracket and isinstance(race_bracket.get('classes'), dict):
            for class_name, class_data in race_bracket['classes'].items():
                if isinstance(class_data.get('rounds'), list):
                    for round_data in class_data['rounds']:
                        if isinstance(round_data.get('heats'), list):
                            for heat in round_data['heats']:
                                total_races += 1
                                if is_heat_completed(heat):
                                    completed_races += 1
                                
                                # Update class breakdown
                                if class_name in class_breakdown:
                                    class_breakdown[class_name]['races'] += 1
                                    if is_heat_completed(heat):
                                        class_breakdown[class_name]['completedRaces'] += 1
        
        # Round revenue values
        for class_data in class_breakdown.values():
            class_data['revenue'] = round(class_data['revenue'], 2)
        
        response = jsonify({
            'eventId': event_id,
            'eventName': event.get('name', 'Unknown Event'),
            'totalParticipants': total_participants,
            'totalRevenue': round(total_revenue, 2),
            'totalRaces': total_races,
            'completedRaces': completed_races,
            'classBreakdown': list(class_breakdown.values()),
            'lastUpdated': datetime.now().isoformat()
        })
        return add_cors_headers(response)
    except Exception as e:
        print(f"[ERROR] Error getting event analytics for {event_id}: {e}")
        import traceback
        traceback.print_exc()
        error_response = jsonify({'error': str(e), 'message': f'Failed to fetch analytics for event {event_id}'})
        return add_cors_headers(error_response), 500


@app.route('/api/stats/driver/<driver_id>', methods=['GET'])
def get_driver_analytics(driver_id):
    """Get detailed analytics for a specific driver"""
    try:
        db = get_db_manager()
        event_filter = request.args.get('eventId', None)
        
        # Get participant data
        participant = db.get_participant(driver_id)
        if not participant:
            return jsonify({'error': 'Driver not found'}), 404
        
        # Get only race brackets that likely include this driver.
        race_brackets = db.get_race_brackets_for_driver(driver_id, event_filter)
        
        # Collect race history
        all_races = []
        lane_stats = {}
        class_stats = {}
        event_stats = {}
        
        for bracket in race_brackets:
            bracket_event_id = bracket.get('eventId')
            
            # Skip if filtering by event and this isn't the right event
            if event_filter and bracket_event_id != event_filter:
                continue
            
            if bracket and isinstance(bracket.get('classes'), dict):
                for class_name, class_data in bracket['classes'].items():
                    if isinstance(class_data.get('rounds'), list):
                        for round_data in class_data['rounds']:
                            if isinstance(round_data.get('heats'), list):
                                for heat in round_data['heats']:
                                    if not is_heat_completed(heat):
                                        continue
                                    
                                    # Find driver in this heat
                                    driver_lane = None
                                    driver_result = None
                                    
                                    driver_lane = get_heat_lane_for_participant(heat, driver_id)
                                    
                                    if isinstance(heat.get('results'), list):
                                        for result in heat['results']:
                                            if result.get('participantId') == driver_id:
                                                driver_result = result
                                                break
                                    
                                    if driver_lane and driver_result:
                                        position_value = driver_result.get('position', 0)
                                        position = parse_finish_position(position_value) or 0
                                        
                                        # Add to race history
                                        all_races.append({
                                            'eventId': bracket_event_id,
                                            'className': class_name,
                                            'round': round_data.get('roundNumber', 0),
                                            'heatId': heat.get('id'),
                                            'lane': driver_lane,
                                            'position': position,
                                            'completedAt': heat.get('completedAt', ''),
                                            'isWin': position == 1
                                        })
                                        
                                        # Update lane stats
                                        if driver_lane not in lane_stats:
                                            lane_stats[driver_lane] = {'total': 0, 'wins': 0}
                                        lane_stats[driver_lane]['total'] += 1
                                        if position == 1:
                                            lane_stats[driver_lane]['wins'] += 1
                                        
                                        # Update class stats
                                        if class_name not in class_stats:
                                            class_stats[class_name] = {
                                                'className': class_name,
                                                'races': 0,
                                                'wins': 0,
                                                'positions': []
                                            }
                                        class_stats[class_name]['races'] += 1
                                        class_stats[class_name]['positions'].append(position)
                                        if position == 1:
                                            class_stats[class_name]['wins'] += 1
                                        
                                        # Update event stats
                                        if bracket_event_id not in event_stats:
                                            event_stats[bracket_event_id] = {
                                                'eventId': bracket_event_id,
                                                'races': 0,
                                                'wins': 0
                                            }
                                        event_stats[bracket_event_id]['races'] += 1
                                        if position == 1:
                                            event_stats[bracket_event_id]['wins'] += 1
        
        # Calculate aggregate statistics
        total_races = len(all_races)
        total_wins = sum(1 for r in all_races if r['isWin'])
        win_rate = round((total_wins / total_races * 100), 1) if total_races > 0 else 0
        
        # Calculate average position
        positions = [r['position'] for r in all_races if isinstance(r.get('position'), int) and r['position'] > 0]
        avg_position = round(sum(positions) / len(positions), 2) if positions else 0
        
        # Calculate best win streak
        best_streak = 0
        current_streak = 0
        for race in sorted(all_races, key=lambda x: x.get('completedAt', '')):
            if race['isWin']:
                current_streak += 1
                best_streak = max(best_streak, current_streak)
            else:
                current_streak = 0
        
        # Process lane stats
        lane_performance = {}
        for lane, stats in lane_stats.items():
            lane_performance[lane] = {
                'total': stats['total'],
                'wins': stats['wins'],
                'winRate': round((stats['wins'] / stats['total'] * 100), 1) if stats['total'] > 0 else 0
            }
        
        # Process class stats
        class_performance = []
        for class_name, stats in class_stats.items():
            positions = [p for p in stats.get('positions', []) if isinstance(p, int) and p > 0]
            class_performance.append({
                'className': class_name,
                'races': stats['races'],
                'wins': stats['wins'],
                'winRate': round((stats['wins'] / stats['races'] * 100), 1) if stats['races'] > 0 else 0,
                'avgPosition': round(sum(positions) / len(positions), 2) if positions else 0
            })
        
        # Process event stats
        event_performance = [
            {
                'eventId': eid,
                'races': estats['races'],
                'wins': estats['wins'],
                'winRate': round((estats['wins'] / estats['races'] * 100), 1) if estats['races'] > 0 else 0
            }
            for eid, estats in event_stats.items()
        ]

        achievements = compute_driver_achievements(
            driver_id=driver_id,
            race_brackets=race_brackets,
            event_filter=event_filter,
        )
        
        return jsonify({
            'driverId': driver_id,
            'driverName': participant.get('name', 'Unknown'),
            'totalRaces': total_races,
            'totalWins': total_wins,
            'winRate': win_rate,
            'avgPosition': avg_position,
            'bestStreak': best_streak,
            'eventsParticipated': len(event_stats),
            'lanePerformance': lane_performance,
            'classPerformance': class_performance,
            'eventPerformance': event_performance,
            'achievements': achievements,
            'raceHistory': all_races[-20:],  # Last 20 races
            'lastUpdated': datetime.now().isoformat()
        })
    except Exception as e:
        print(f"[ERROR] Error getting driver analytics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats/lane', methods=['GET'])
@app.route('/api/stats/lane/<event_id>', methods=['GET'])
def get_lane_analytics(event_id=None):
    """Get lane performance statistics across all events or for a specific event"""
    try:
        db = get_db_manager()
        
        # Get race brackets
        race_brackets = db.get_race_brackets()
        
        # Filter by event if specified
        if event_id:
            race_brackets = [b for b in race_brackets if b.get('eventId') == event_id]
        
        # Calculate lane statistics (Raw Stats - Unadjusted)
        # NOTE: This logic must remain stable; UI depends on these raw numbers.
        lane_stats = {}

        # Contextual lane stats (Effective races only; solo runs excluded from performance calcs)
        lane_contextual = {}
        meta = {
            'totalSoloHeats': 0,
            'totalEffectiveHeats': 0,
            'totalEffectiveLaneAppearances': 0,
            'minEffectiveRacesForRanking': 10
        }
        
        for bracket in race_brackets:
            if bracket and isinstance(bracket.get('classes'), dict):
                for class_name, class_data in bracket['classes'].items():
                    if isinstance(class_data.get('rounds'), list):
                        for round_data in class_data['rounds']:
                            if isinstance(round_data.get('heats'), list):
                                for heat in round_data['heats']:
                                    if not is_heat_completed(heat):
                                        continue
                                    
                                    # Process each result (raw) and compute contextual lane metrics
                                    results = heat.get('results')
                                    lanes = heat.get('lanes')
                                    if isinstance(results, list) and isinstance(lanes, list):
                                        # --- Raw Stats (Unadjusted) ---
                                        for result in results:
                                            participant_id = result.get('participantId')
                                            position_value = result.get('position', 0)
                                            position = parse_finish_position(position_value) or 0

                                            # Find lane for this participant
                                            lane_num = get_heat_lane_for_participant(heat, participant_id)

                                            if lane_num:
                                                if lane_num not in lane_stats:
                                                    lane_stats[lane_num] = {
                                                        'lane': lane_num,
                                                        'totalRaces': 0,
                                                        'wins': 0,
                                                        'winRate': 0
                                                    }

                                                lane_stats[lane_num]['totalRaces'] += 1
                                                if position == 1:
                                                    lane_stats[lane_num]['wins'] += 1

                                        # --- Contextual Stats (Effective) ---
                                        active_lanes = set()
                                        winner_lanes = set()

                                        for result in results:
                                            pid = result.get('participantId')
                                            lane_num = get_heat_lane_for_participant(heat, pid)

                                            # Guardrails: lane_num may be missing/Unknown in malformed heats
                                            if not lane_num or lane_num == 'Unknown':
                                                continue

                                            active_lanes.add(lane_num)

                                            pos = parse_finish_position(result.get('position'))
                                            if pos == 1:
                                                winner_lanes.add(lane_num)

                                        active_lane_count = len(active_lanes)
                                        if active_lane_count == 0:
                                            continue

                                        if active_lane_count == 1:
                                            meta['totalSoloHeats'] += 1
                                        else:
                                            meta['totalEffectiveHeats'] += 1

                                        expected_share = (1.0 / active_lane_count) if active_lane_count >= 2 else 0.0

                                        for lane_num in active_lanes:
                                            if lane_num not in lane_contextual:
                                                lane_contextual[lane_num] = {
                                                    'lane': lane_num,
                                                    'soloRaces': 0,
                                                    'effectiveRaces': 0,
                                                    'effectiveWins': 0,
                                                    'expectedWins': 0.0,
                                                    'performanceIndex': None,
                                                    'usageShare': 0.0,
                                                    'confidence': 'LOW',
                                                    'excludedFromRanking': True
                                                }

                                            ctx = lane_contextual[lane_num]

                                            if active_lane_count == 1:
                                                ctx['soloRaces'] += 1
                                            else:
                                                ctx['effectiveRaces'] += 1
                                                meta['totalEffectiveLaneAppearances'] += 1
                                                ctx['expectedWins'] += expected_share
                                                if lane_num in winner_lanes:
                                                    ctx['effectiveWins'] += 1
        
        # Calculate win rates
        for stats in lane_stats.values():
            if stats['totalRaces'] > 0:
                stats['winRate'] = round((stats['wins'] / stats['totalRaces'] * 100), 1)

        # Ensure any lane with raw stats appears in contextual output (even if only solo or malformed)
        for lane_num in lane_stats.keys():
            if lane_num not in lane_contextual:
                lane_contextual[lane_num] = {
                    'lane': lane_num,
                    'soloRaces': 0,
                    'effectiveRaces': 0,
                    'effectiveWins': 0,
                    'expectedWins': 0.0,
                    'performanceIndex': None,
                    'usageShare': 0.0,
                    'confidence': 'LOW',
                    'excludedFromRanking': True
                }

        # Finalize contextual derived metrics
        denom = meta.get('totalEffectiveLaneAppearances') or 0
        min_effective = meta.get('minEffectiveRacesForRanking') or 10

        for ctx in lane_contextual.values():
            expected = float(ctx.get('expectedWins') or 0.0)
            effective_races = int(ctx.get('effectiveRaces') or 0)
            effective_wins = int(ctx.get('effectiveWins') or 0)

            # Expected wins can be fractional; keep a stable precision for UI and tests
            ctx['expectedWins'] = round(expected, 4)

            if expected > 0:
                ctx['performanceIndex'] = round((effective_wins / expected), 3)
            else:
                ctx['performanceIndex'] = None

            share = (effective_races / denom) if denom > 0 else 0.0
            ctx['usageShare'] = round(share, 4)

            if effective_races < 10:
                ctx['confidence'] = 'LOW'
            elif effective_races <= 30:
                ctx['confidence'] = 'MEDIUM'
            else:
                ctx['confidence'] = 'HIGH'

            ctx['excludedFromRanking'] = effective_races < min_effective
        
        return jsonify({
            'eventId': event_id or 'all',
            'laneStats': list(lane_stats.values()),
            'laneContextualStats': list(lane_contextual.values()),
            'meta': meta,
            'lastUpdated': datetime.now().isoformat()
        })
    except Exception as e:
        print(f"[ERROR] Error getting lane analytics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats/class/<event_id>', methods=['GET'])
@app.route('/api/stats/class/<event_id>/<class_name>', methods=['GET'])
def get_class_analytics(event_id, class_name=None):
    """Get class-specific analytics for an event"""
    try:
        db = get_db_manager()
        
        # Get event
        event = db.get_event(event_id)
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        
        # Get participants for this event
        all_participants = db.get_participants()
        event_participants = [
            p for p in all_participants 
            if event_id in (p.get('eventClasses', {}) or {})
        ]
        
        # Get race bracket
        race_bracket = db.get_race_bracket_by_event_id(event_id)
        
        # Build class breakdown
        class_breakdown = {}
        
        for p in event_participants:
            event_classes = p.get('eventClasses', {})
            if isinstance(event_classes, dict) and event_id in event_classes:
                classes = event_classes[event_id]
                if isinstance(classes, list):
                    for cls in classes:
                        # Filter by class_name if specified
                        if class_name and cls != class_name:
                            continue
                        
                        if cls not in class_breakdown:
                            class_breakdown[cls] = {
                                'className': cls,
                                'participants': 0,
                                'totalRaces': 0,
                                'completedRaces': 0,
                                'revenue': 0,
                                'winners': {}
                            }
                        
                        class_breakdown[cls]['participants'] += 1
                        class_breakdown[cls]['revenue'] += (p.get('totalFee', 0) or 0) / len(classes)
        
        # Add race information
        if race_bracket and isinstance(race_bracket.get('classes'), dict):
            for cls, class_data in race_bracket['classes'].items():
                # Filter by class_name if specified
                if class_name and cls != class_name:
                    continue
                
                if cls not in class_breakdown:
                    class_breakdown[cls] = {
                        'className': cls,
                        'participants': 0,
                        'totalRaces': 0,
                        'completedRaces': 0,
                        'revenue': 0,
                        'winners': {}
                    }
                
                if isinstance(class_data.get('rounds'), list):
                    for round_data in class_data['rounds']:
                        if isinstance(round_data.get('heats'), list):
                            for heat in round_data['heats']:
                                class_breakdown[cls]['totalRaces'] += 1
                                
                                if is_heat_completed(heat):
                                    class_breakdown[cls]['completedRaces'] += 1
                                    
                                    # Track winners
                                    if isinstance(heat.get('results'), list):
                                        for result in heat['results']:
                                            pos = parse_finish_position(result.get('position')) or 0
                                            if pos == 1:
                                                pid = result.get('participantId', 'Unknown')
                                                if pid not in class_breakdown[cls]['winners']:
                                                    class_breakdown[cls]['winners'][pid] = 0
                                                class_breakdown[cls]['winners'][pid] += 1
        
        # Round revenue and format winners
        for cls_data in class_breakdown.values():
            cls_data['revenue'] = round(cls_data['revenue'], 2)
            # Convert winners dict to sorted list
            winners_list = [
                {'driverId': pid, 'wins': count}
                for pid, count in cls_data['winners'].items()
            ]
            winners_list.sort(key=lambda x: x['wins'], reverse=True)
            cls_data['topWinners'] = winners_list[:5]  # Top 5 winners
            del cls_data['winners']
        
        return jsonify({
            'eventId': event_id,
            'classBreakdown': list(class_breakdown.values()),
            'lastUpdated': datetime.now().isoformat()
        })
    except Exception as e:
        print(f"[ERROR] Error getting class analytics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats/time', methods=['GET'])
@app.route('/api/stats/time/<event_id>', methods=['GET'])
def get_time_analytics(event_id=None):
    """Get time-based analytics (races over time, participation trends)"""
    try:
        db = get_db_manager()
        
        # Get events and brackets once, then batch participant lookup.
        events = [db.get_event(event_id)] if event_id else db.get_events()
        events = [e for e in events if e]
        event_ids = [e.get('id') for e in events if e.get('id')]
        race_brackets = (
            db.get_race_brackets_by_event_ids(event_ids) if event_ids else []
        )

        participants = db.get_participants_by_event_ids(event_ids) if event_ids else []
        participant_counts_by_event = {eid: 0 for eid in event_ids}
        for participant in participants:
            event_classes = participant.get('eventClasses', {}) or {}
            if isinstance(event_classes, dict):
                for eid in event_classes.keys():
                    if eid in participant_counts_by_event:
                        participant_counts_by_event[eid] += 1
        
        # Time-based statistics
        events_by_month = {}
        races_by_month = {}
        participants_by_month = {}
        
        for event in events:
            if event.get('date'):
                try:
                    event_date = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
                    month_key = event_date.strftime('%Y-%m')
                    
                    events_by_month[month_key] = events_by_month.get(month_key, 0) + 1
                    
                    participants_by_month[month_key] = participants_by_month.get(month_key, 0) + participant_counts_by_event.get(event.get('id'), 0)
                except:
                    pass
        
        # Count races by completion time
        for bracket in race_brackets:
            bracket_event_id = bracket.get('eventId')
            event = next((e for e in events if e.get('id') == bracket_event_id), None)
            
            if event and event.get('date'):
                try:
                    event_date = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
                    month_key = event_date.strftime('%Y-%m')
                    
                    if bracket and isinstance(bracket.get('classes'), dict):
                        for class_data in bracket['classes'].values():
                            if isinstance(class_data.get('rounds'), list):
                                for round_data in class_data['rounds']:
                                    if isinstance(round_data.get('heats'), list):
                                        completed_heats = sum(1 for h in round_data['heats'] if is_heat_completed(h))
                                        races_by_month[month_key] = races_by_month.get(month_key, 0) + completed_heats
                except:
                    pass
        
        return jsonify({
            'eventId': event_id or 'all',
            'eventsByMonth': events_by_month,
            'racesByMonth': races_by_month,
            'participantsByMonth': participants_by_month,
            'lastUpdated': datetime.now().isoformat()
        })
    except Exception as e:
        print(f"[ERROR] Error getting time analytics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats/series/<series_id>', methods=['GET'])
def get_series_analytics(series_id):
    """Get analytics for a specific series"""
    try:
        db = get_db_manager()
        
        # Get series
        series = db.get_series_by_id(series_id)
        if not series:
            return jsonify({'error': 'Series not found'}), 404
        
        # Get events in this series.
        series_events = db.get_events_paginated(
            page=1,
            limit=100000,
            series_id=series_id,
        ).get('events', [])
        
        # Aggregate statistics across all events in series
        total_participants = set()
        total_races = 0
        total_revenue = 0
        
        series_event_ids = [e.get('id') for e in series_events if e.get('id')]
        series_participants = db.get_participants_by_event_ids(series_event_ids)
        participants_by_event = {eid: [] for eid in series_event_ids}
        for participant in series_participants:
            event_classes = participant.get('eventClasses', {}) or {}
            if isinstance(event_classes, dict):
                for eid in event_classes.keys():
                    if eid in participants_by_event:
                        participants_by_event[eid].append(participant)

        series_brackets = db.get_race_brackets_by_event_ids(series_event_ids)
        brackets_by_event = {b.get('eventId'): b for b in series_brackets if b.get('eventId')}

        for event in series_events:
            event_id = event.get('id')
            event_participants = participants_by_event.get(event_id, [])
            for participant in event_participants:
                total_participants.add(participant.get('id'))
                total_revenue += participant.get('totalFee', 0) or 0

            # Count races
            race_bracket = brackets_by_event.get(event_id)
            if race_bracket and isinstance(race_bracket.get('classes'), dict):
                for class_data in race_bracket['classes'].values():
                    if isinstance(class_data.get('rounds'), list):
                        for round_data in class_data['rounds']:
                            if isinstance(round_data.get('heats'), list):
                                total_races += sum(1 for h in round_data['heats'] if is_heat_completed(h))
        
        return jsonify({
            'seriesId': series_id,
            'seriesName': series.get('name', 'Unknown'),
            'totalEvents': len(series_events),
            'totalParticipants': len(total_participants),
            'totalRaces': total_races,
            'totalRevenue': round(total_revenue, 2),
            'events': [
                {
                    'id': e.get('id'),
                    'name': e.get('name'),
                    'date': e.get('date'),
                    'status': e.get('status')
                }
                for e in series_events
            ],
            'lastUpdated': datetime.now().isoformat()
        })
    except Exception as e:
        print(f"[ERROR] Error getting series analytics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats/top-performers', methods=['GET'])
def get_top_performers():
    """Get top performing drivers across all events or specific event"""
    try:
        db = get_db_manager()
        limit = int(request.args.get('limit', 10))
        event_filter = request.args.get('eventId', None)
        
        # Get all participants
        participants = db.get_participants()
        
        # Get all race brackets
        race_brackets = db.get_race_brackets()
        
        # Filter by event if specified
        if event_filter:
            race_brackets = [b for b in race_brackets if b.get('eventId') == event_filter]
        
        # Calculate performance for each driver
        driver_performance = {}
        
        for bracket in race_brackets:
            if bracket and isinstance(bracket.get('classes'), dict):
                for class_data in bracket['classes'].values():
                    if isinstance(class_data.get('rounds'), list):
                        for round_data in class_data['rounds']:
                            if isinstance(round_data.get('heats'), list):
                                for heat in round_data['heats']:
                                    if not is_heat_completed(heat):
                                        continue
                                    
                                    if isinstance(heat.get('results'), list):
                                        for result in heat['results']:
                                            driver_id = result.get('participantId')
                                            position_value = result.get('position', 0)
                                            position = parse_finish_position(position_value)
                                            
                                            if driver_id:
                                                if driver_id not in driver_performance:
                                                    driver_performance[driver_id] = {
                                                        'driverId': driver_id,
                                                        'totalRaces': 0,
                                                        'wins': 0,
                                                        'podiums': 0
                                                    }
                                                
                                                driver_performance[driver_id]['totalRaces'] += 1
                                                if position == 1:
                                                    driver_performance[driver_id]['wins'] += 1
                                                if position is not None and position <= 3:
                                                    driver_performance[driver_id]['podiums'] += 1
        
        # Calculate win rates and add driver names
        top_drivers = []
        for driver_id, perf in driver_performance.items():
            if perf['totalRaces'] > 0:
                participant = next((p for p in participants if p.get('id') == driver_id), None)
                if participant:
                    perf['driverName'] = participant.get('name', 'Unknown')
                    perf['winRate'] = round((perf['wins'] / perf['totalRaces'] * 100), 1)
                    top_drivers.append(perf)
        
        # Sort by wins (primary) and win rate (secondary)
        top_drivers.sort(key=lambda x: (x['wins'], x['winRate']), reverse=True)
        
        return jsonify({
            'topPerformers': top_drivers[:limit],
            'eventId': event_filter or 'all',
            'lastUpdated': datetime.now().isoformat()
        })
    except Exception as e:
        print(f"[ERROR] Error getting top performers: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("Starting EPC17 Event Management System Server")
    print("Network accessible at:")
    print("   - http://localhost:5000")
    print("   - http://127.0.0.1:5000")
    print("   - http://[your-ip]:5000 (for network access)")
    print("Data stored in: ./data/")
    
    # WebSocket status
    if SOCKETIO_AVAILABLE and socketio:
        print("✅ WebSocket support enabled (Flask-SocketIO)")
    else:
        print("⚠️ WebSocket support disabled - install flask-socketio for real-time updates")
    
    # Check for SSL certificates
    use_ssl = False
    if os.path.exists("cert.pem") and os.path.exists("key.pem"):
        use_ssl = True
        print("SSL certificates found - HTTPS enabled")
        print("   - https://localhost:5000")
        print("   - https://127.0.0.1:5000")
        print("   - https://[your-ip]:5000 (for network access)")
    else:
        print("Running in HTTP mode (no SSL certificates)")
        print("To enable HTTPS, install cryptography: pip install cryptography")
        print("   Then restart the server to auto-generate certificates")
    
    # Debug: Print all registered routes
    log_debug("[DEBUG] Registered routes:")
    for rule in app.url_map.iter_rules():
        log_debug(f"[DEBUG] {rule.rule} -> {rule.endpoint} ({', '.join(rule.methods)})")

    # Run server accessible from network
    if socketio and SOCKETIO_AVAILABLE:
        # Use socketio.run for WebSocket support
        socketio.run(
            app,
            host='0.0.0.0',
            port=5000,
            debug=True,
            allow_unsafe_werkzeug=True  # Allow in development
        )
    else:
        # Fallback to regular Flask run
        app.run(
            host='0.0.0.0',
            port=5000,
            debug=True,
            threaded=False
        ) 
