#!/usr/bin/env python3
"""
EPC17 - Event Management System - Network Server
Robust data management for multi-client access across local network
"""

from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
import os
import json
import threading
from datetime import datetime
import uuid
import ssl
import secrets

app = Flask(__name__, template_folder='.', static_folder='.', static_url_path='')
# Enable CORS for all origins with all methods and headers
CORS(app, 
     origins=['*'],  # Allow all origins
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
     supports_credentials=False)

# Achievements removed

# Clean server setup without custom logging

# Data storage configuration
DATA_DIR = 'data'
os.makedirs(DATA_DIR, exist_ok=True)

# Thread lock for concurrent access safety
data_lock = threading.Lock()

# In-memory session store for simple auth (no external libraries)
# Rule: EPC17_WORKFLOW.md - lightweight local dev, no DB
SESSIONS = {}

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
]

def is_admin_session(session):
    return bool(session) and session.get('username') == 'Admin'

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
        print("⚠️  cryptography library not available. Install with: pip install cryptography")
        return False
    except Exception as e:
        print(f"⚠️  Failed to create certificate: {e}")
        return False

def get_data_file(filename):
    """Get full path for data file"""
    return os.path.join(DATA_DIR, filename)

def load_data(filename):
    """Thread-safe data loading with enhanced error handling"""
    filepath = get_data_file(filename)
    with data_lock:
        if os.path.exists(filepath):
            try:
                # Check file size to prevent loading corrupted large files
                file_size = os.path.getsize(filepath)
                if file_size > 100 * 1024 * 1024:  # 100MB limit
                    print(f"⚠️ File {filename} is too large ({file_size} bytes), creating backup and resetting")
                    # Create backup with timestamp
                    backup_path = f"{filepath}.corrupted.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    os.rename(filepath, backup_path)
                    # Return empty array for the reset
                    return []
                
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError, UnicodeDecodeError) as e:
                print(f"❌ Error loading {filename}: {e}")
                # Create backup of corrupted file
                try:
                    backup_path = f"{filepath}.corrupted.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    os.rename(filepath, backup_path)
                    print(f"📦 Created backup of corrupted file: {backup_path}")
                except Exception as backup_error:
                    print(f"⚠️ Failed to create backup: {backup_error}")
                return []
        return []

def save_data(filename, data):
    """Thread-safe data saving with backup"""
    filepath = get_data_file(filename)
    backup_path = filepath + '.backup'
    
    with data_lock:
        try:
            # Create backup of existing data
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    backup_data = f.read()
                with open(backup_path, 'w', encoding='utf-8') as f:
                    f.write(backup_data)
            
            # Save new data
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except (IOError, json.JSONEncodeError) as e:
            print(f"Error saving {filename}: {e}")
            return False

def load_users():
    """Load users list from JSON file; ensure default Admin exists."""
    users = load_data('users.json')
    # Ensure default Admin exists
    has_admin = any(u.get('username') == 'Admin' for u in users)
    if not has_admin:
        users.append({
            'id': 'admin-default',
            'username': 'Admin',
            'password': 'Admin321',
            'permissions': ALL_CATEGORIES[:]
        })
        save_data('users.json', users)
    return users

def save_users(users):
    return save_data('users.json', users)

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

# Admin-only Users & Permissions page
@app.route('/users.html')
def users_permissions_page():
    sess = get_session_from_request()
    if not sess or sess.get('username') != 'Admin':
        return 'Access Denied', 403
    return render_template('users.html')

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
        print(f"🔍 DEBUG - POST /api/participants called")
        print(f"🔍 DEBUG - Content-Type: {request.content_type}")
        print(f"🔍 DEBUG - Request data: {request.data}")
        
        data = request.json
        print(f"🔍 DEBUG - Parsed JSON: {data}")
        
        if not data or not data.get('name'):
            print(f"❌ DEBUG - Validation failed: name missing")
            return jsonify({'error': 'Name is required'}), 400
            
        data['id'] = generate_id()
        data['registrationDate'] = datetime.now().isoformat()
        data['paymentStatus'] = data.get('paymentStatus', 'pending')
        
        print(f"🔍 DEBUG - Final data to save: {data}")
        
        participants = load_data('participants.json')
        print(f"🔍 DEBUG - Current participants count: {len(participants)}")
        
        participants.append(data)
        print(f"🔍 DEBUG - After append count: {len(participants)}")
        
        save_result = save_data('participants.json', participants)
        print(f"🔍 DEBUG - Save result: {save_result}")
        
        if save_result:
            print(f"✅ DEBUG - Successfully saved participant: {data['id']}")
            return jsonify(data), 201
        else:
            print(f"❌ DEBUG - Failed to save participant")
            return jsonify({'error': 'Failed to save participant'}), 500
    
    # GET request with pagination
    ok, err = require_permission(['registration'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    participants = load_data('participants.json')
    
    # Apply filters
    event_id = request.args.get('eventId')
    series_id = request.args.get('seriesId')
    search = request.args.get('search')
    class_filter = request.args.get('class')
    
    if event_id:
        print(f"🔍 DEBUG - Filtering participants by eventId: {event_id}")
        filtered_participants = [p for p in participants if p.get('eventId') == event_id]
        print(f"🔍 DEBUG - Found {len(filtered_participants)} participants for event {event_id}")
        participants = filtered_participants
    if series_id:
        participants = [p for p in participants if series_id in p.get('series', [])]
    if search:
        search_lower = search.lower()
        participants = [p for p in participants if p.get('name', '').lower().find(search_lower) != -1]
    if class_filter:
        participants = [p for p in participants if class_filter in p.get('classes', [])]
    
    # Apply pagination
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50000))  # High default limit to get all participants
    
    # Log performance warning for large datasets
    if len(participants) > 10000:
        print(f"⚠️ PERFORMANCE WARNING: Loading {len(participants)} participants. Consider contacting software representative for optimization.")
    
    print(f"🔍 DEBUG - Loading participants: page={page}, limit={limit}, total_participants={len(participants)}")
    
    total = len(participants)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    paginated_participants = participants[start_idx:end_idx]
    
    print(f"🔍 DEBUG - Returning {len(paginated_participants)} participants (total: {total})")
    
    return jsonify({
        'participants': paginated_participants,
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/participants/<participant_id>', methods=['PUT', 'DELETE'])
def handle_participant_by_id(participant_id):
    """Handle participant updates and deletion"""
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
            
            participants = load_data('participants.json')
            
            # Find the participant to update
            participant_index = next((i for i, p in enumerate(participants) if p['id'] == participant_id), None)
            if participant_index is None:
                return jsonify({'error': 'Participant not found'}), 404
            
            # Update the participant data
            data['id'] = participant_id  # Ensure ID doesn't change
            data['updatedAt'] = datetime.now().isoformat()
            
            # Preserve original registration date if not provided
            if 'createdAt' not in data and 'registrationDate' in participants[participant_index]:
                data['createdAt'] = participants[participant_index]['registrationDate']
            
            participants[participant_index] = data
            
            if save_data('participants.json', participants):
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
            participants = load_data('participants.json')
            events = load_data('events.json')
            series = load_data('series.json')
            
            # Find and remove the participant
            participant_index = next((i for i, p in enumerate(participants) if p['id'] == participant_id), None)
            if participant_index is None:
                return jsonify({'error': 'Participant not found'}), 404
            
            deleted_participant = participants.pop(participant_index)
            
            # Remove participant from events
            for event in events:
                if 'participants' in event and participant_id in event['participants']:
                    event['participants'].remove(participant_id)
                    event['currentParticipants'] = len(event['participants'])
            
            # Save files
            if save_data('participants.json', participants) and save_data('events.json', events):
                return jsonify({
                    'success': True,
                    'message': f'Participant "{deleted_participant["name"]}" deleted successfully'
                }), 200
            else:
                return jsonify({'error': 'Failed to save changes'}), 500
                
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
        
        series = load_data('series.json')
        series.append(data)
        
        if save_data('series.json', series):
            return jsonify(data), 201
        else:
            return jsonify({'error': 'Failed to save series'}), 500
    
    # GET request with pagination
    # Allow registration users to read series for registration workflows
    ok, err = require_permission(['series', 'registration'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    series = load_data('series.json')
    
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
    
    print(f"🔍 DEBUG - Returning {len(paginated_series)} series (total: {total})")
    
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
    print(f"🔍 Received {request.method} request for series {series_id}")
    
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
            
            series = load_data('series.json')
            
            # Find the series to update
            series_index = next((i for i, s in enumerate(series) if s['id'] == series_id), None)
            if series_index is None:
                return jsonify({'error': 'Series not found'}), 404
            
            # Update the series data
            data['id'] = series_id  # Ensure ID doesn't change
            data['updatedAt'] = datetime.now().isoformat()
            
            # Preserve original creation date if not provided
            if 'createdAt' not in data and 'createdDate' in series[series_index]:
                data['createdAt'] = series[series_index]['createdDate']
            
            series[series_index] = data
            
            if save_data('series.json', series):
                print(f"✅ Successfully updated series {series_id}")
                return jsonify(data), 200
            else:
                return jsonify({'error': 'Failed to update series'}), 500
                
        except Exception as e:
            print(f"❌ Error updating series {series_id}: {str(e)}")
            return jsonify({'error': f'Update failed: {str(e)}'}), 500
    
    elif request.method == 'DELETE':
        """Delete a specific series"""
        try:
            ok, err = require_permission('series')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code
            series = load_data('series.json')
            participants = load_data('participants.json')
            
            # Find and remove the series
            series_index = next((i for i, s in enumerate(series) if s['id'] == series_id), None)
            if series_index is None:
                return jsonify({'error': 'Series not found'}), 404
            
            deleted_series = series.pop(series_index)
            
            # Remove series from participants' series lists
            for participant in participants:
                if 'series' in participant and series_id in participant['series']:
                    participant['series'].remove(series_id)
            
            # Save both files
            if save_data('series.json', series) and save_data('participants.json', participants):
                return jsonify({
                    'success': True,
                    'message': f'Series "{deleted_series["name"]}" deleted successfully'
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
        
        events = load_data('events.json')
        events.append(data)
        
        if save_data('events.json', events):
            return jsonify(data), 201
        else:
            return jsonify({'error': 'Failed to save event'}), 500
    
    # GET request with pagination
    # Allow registration users to read events for registration workflows
    ok, err = require_permission(['events', 'registration'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    events = load_data('events.json')
    # Admin sees all; non-admins may be scoped by allowedEvents
    sess = get_session_from_request()
    if sess and not is_admin_session(sess):
        allowed = set(sess.get('allowedEvents', []) or [])
        if allowed:
            events = [e for e in events if e.get('id') in allowed]
    
    # Apply filters
    series_id = request.args.get('seriesId')
    status = request.args.get('status')
    search = request.args.get('search')
    
    if series_id:
        events = [e for e in events if e.get('seriesId') == series_id]
    if status:
        events = [e for e in events if e.get('status') == status]
    if search:
        search_lower = search.lower()
        events = [e for e in events if e.get('name', '').lower().find(search_lower) != -1]
    
    # Apply pagination
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 1000))  # Increased limit to allow more events
    
    total = len(events)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    paginated_events = events[start_idx:end_idx]
    
    print(f"🔍 DEBUG - Returning {len(paginated_events)} events (total: {total})")
    
    return jsonify({
        'events': paginated_events,
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

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
            print(f"🔍 DEBUG - PUT /api/events/{event_id} called")
            data = request.json
            print(f"🔍 DEBUG - Request data: {data}")
            
            if not data:
                print(f"❌ DEBUG - No data provided")
                return jsonify({'error': 'No data provided'}), 400
            
            events = load_data('events.json')
            
            # Find the event to update
            event_index = next((i for i, e in enumerate(events) if e['id'] == event_id), None)
            if (event_index is None):
                print(f"❌ DEBUG - Event {event_id} not found")
                return jsonify({'error': 'Event not found'}), 404
            
            # Get the existing event data
            existing_event = events[event_index]
            print(f"🔍 DEBUG - Existing event: {existing_event.get('name', 'Unknown')}")
            
            # For partial updates, preserve existing data and only update provided fields
            if not data.get('name') and 'name' not in data:
                # This is a partial update (like participant count sync)
                # Preserve the existing name and other required fields
                data['name'] = existing_event.get('name')
                print(f"🔍 DEBUG - Partial update detected, preserving name: {data['name']}")
                if not data['name']:
                    print(f"❌ DEBUG - No name found in existing event")
                    return jsonify({'error': 'Event name is required'}), 400
            
            # Update the event data (merge with existing data)
            updated_event = {
                **existing_event, 
                **data,
                'id': event_id,  # Ensure ID doesn't change
                'updatedAt': datetime.now().isoformat()
            }
            
            print(f"🔍 DEBUG - Updated event data: {updated_event.get('name', 'Unknown')}")
            
            # Preserve original creation date if not provided
            if 'createdAt' not in updated_event and 'createdDate' in existing_event:
                updated_event['createdAt'] = existing_event['createdDate']
            
            # Update participant count if participants list changed
            if 'participants' in data:
                updated_event['currentParticipants'] = len(data['participants'])
                print(f"🔍 DEBUG - Updated participant count: {updated_event['currentParticipants']}")
            
            events[event_index] = updated_event
            
            if save_data('events.json', events):
                print(f"✅ DEBUG - Successfully updated event: {updated_event.get('name', 'Unknown')}")
                return jsonify(updated_event), 200
            else:
                print(f"❌ DEBUG - Failed to save event data")
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
            events = load_data('events.json')
            participants = load_data('participants.json')
            
            # Find and remove the event
            event_index = next((i for i, e in enumerate(events) if e['id'] == event_id), None)
            if event_index is None:
                return jsonify({'error': 'Event not found'}), 404
            
            deleted_event = events.pop(event_index)
            
            # Remove event from participants' event lists
            for participant in participants:
                if 'events' in participant and event_id in participant['events']:
                    participant['events'].remove(event_id)
            
            # Save both files
            if save_data('events.json', events) and save_data('participants.json', participants):
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
        events = load_data('events.json')
        participants = load_data('participants.json')
        
        # Find event
        event = next((e for e in events if e['id'] == event_id), None)
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        
        # Find participant
        participant = next((p for p in participants if p['id'] == participant_id), None)
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
        
        # Add event to participant's events list
        if 'events' not in participant:
            participant['events'] = []
        if event_id not in participant['events']:
            participant['events'].append(event_id)
        
        # Save both files
        if save_data('events.json', events) and save_data('participants.json', participants):
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
    if request.method == 'POST':
        ok, err = require_permission('races')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        data = request.json
        data['id'] = generate_id()
        data['createdDate'] = datetime.now().isoformat()
        
        races = load_data('races.json')
        races.append(data)
        
        if save_data('races.json', races):
            return jsonify(data), 201
        else:
            return jsonify({'error': 'Failed to save race'}), 500
    
    # GET request with pagination
    ok, err = require_permission(['races'])
    if not ok:
        msg, code = err
        return jsonify({'error': msg}), code
    races = load_data('races.json')
    # Scope by allowedEvents if not admin
    sess = get_session_from_request()
    if sess and not is_admin_session(sess):
        allowed = set(sess.get('allowedEvents', []) or [])
        if allowed:
            races = [r for r in races if r.get('eventId') in allowed]
    
    # Apply filters
    event_id = request.args.get('eventId')
    class_name = request.args.get('class')
    
    if event_id:
        races = [r for r in races if r.get('eventId') == event_id]
    if class_name:
        races = [r for r in races if r.get('className') == class_name]
    
    # Apply pagination
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 100))
    
    total = len(races)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    paginated_races = races[start_idx:end_idx]
    
    return jsonify({
        'races': paginated_races,
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/races/<race_id>', methods=['PUT', 'DELETE'])
def handle_race_by_id(race_id):
    """Handle race updates and deletion"""
    if request.method == 'PUT':
        """Update a specific race"""
        try:
            ok, err = require_permission('races')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code
            data = request.json
            races = load_data('races.json')
            
            # Find the race to update
            race_index = next((i for i, r in enumerate(races) if r['id'] == race_id), None)
            if race_index is None:
                return jsonify({'error': 'Race not found'}), 404
            
            # Update the race data
            data['id'] = race_id  # Ensure ID doesn't change
            data['updatedAt'] = datetime.now().isoformat()
            
            # Preserve original creation date if not provided
            if 'createdAt' not in data and 'createdDate' in races[race_index]:
                data['createdAt'] = races[race_index]['createdDate']
            
            races[race_index] = data
            
            if save_data('races.json', races):
                return jsonify(data), 200
            else:
                return jsonify({'error': 'Failed to update race'}), 500
                
        except Exception as e:
            return jsonify({'error': f'Update failed: {str(e)}'}), 500
    
    elif request.method == 'DELETE':
        """Delete a specific race"""
        try:
            ok, err = require_permission('races')
            if not ok:
                msg, code = err
                return jsonify({'error': msg}), code
            races = load_data('races.json')
            
            # Find and remove the race
            race_index = next((i for i, r in enumerate(races) if r['id'] == race_id), None)
            if race_index is None:
                return jsonify({'error': 'Race not found'}), 404
            
            deleted_race = races.pop(race_index)
            
            if save_data('races.json', races):
                return jsonify({
                    'success': True,
                    'message': f'Race deleted successfully'
                }), 200
            else:
                return jsonify({'error': 'Failed to save changes'}), 500
                
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
    
    participants = load_data('participants.json')
    races = load_data('races.json')
    series = load_data('series.json')
    events = load_data('events.json')
    
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

# Clear all data endpoint (DANGER!)
@app.route('/api/clear-all', methods=['DELETE', 'POST'])
def clear_all_data():
    """DANGER: Clear all data permanently - use with extreme caution"""
    try:
        # Admin only
        sess = get_session_from_request()
        if not is_admin_session(sess):
            return jsonify({'error': 'Access Denied'}), 403
        # List of all data files to clear
        data_files = [
            'participants.json',
            'series.json', 
            'events.json',
            'races.json',
            'achievements.json'
        ]
        
        cleared_files = []
        
        with data_lock:
            for filename in data_files:
                filepath = get_data_file(filename)
                backup_path = filepath + '.backup'
                
                try:
                    # Create backup before clearing
                    if os.path.exists(filepath):
                        with open(filepath, 'r', encoding='utf-8') as f:
                            backup_data = f.read()
                        with open(backup_path, 'w', encoding='utf-8') as f:
                            f.write(backup_data)
                    
                    # Clear the file (write empty array)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump([], f, indent=2)
                    
                    cleared_files.append(filename)
                    
                except Exception as e:
                    print(f"Error clearing {filename}: {e}")
                    # Continue with other files even if one fails
        
        return jsonify({
            'status': 'success',
            'message': 'All data cleared successfully',
            'cleared_files': cleared_files,
            'backup_created': True,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

# Race Brackets endpoints
@app.route('/api/race-brackets', methods=['GET'])
def get_race_brackets():
    """Get all race brackets"""
    try:
        # Allow registration users to read race brackets for registration workflows
        ok, err = require_permission(['races', 'registration'])
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        brackets = load_data('race_brackets.json')
        # Scope by allowedEvents if not admin
        sess = get_session_from_request()
        if sess and not is_admin_session(sess):
            allowed = set(sess.get('allowedEvents', []) or [])
            if allowed:
                brackets = [b for b in brackets if b.get('eventId') in allowed]
        return jsonify(brackets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/race-brackets/<bracket_id>', methods=['GET'])
def get_race_bracket(bracket_id):
    """Get a specific race bracket"""
    try:
        # Allow registration users to read race brackets for registration workflows
        ok, err = require_permission(['races', 'registration'])
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        brackets = load_data('race_brackets.json')
        bracket = next((b for b in brackets if b.get('id') == bracket_id), None)
        # Scope check for non-admin
        sess = get_session_from_request()
        if bracket and sess and not is_admin_session(sess):
            allowed = set(sess.get('allowedEvents', []) or [])
            if allowed and bracket.get('eventId') not in allowed:
                return jsonify({'error': 'Access Denied'}), 403
        if bracket:
            return jsonify(bracket)
        return jsonify({'error': 'Race bracket not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/race-brackets', methods=['POST'])
def create_race_bracket():
    """Create a new race bracket"""
    try:
        ok, err = require_permission('races')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        bracket_data = request.get_json()
        if not bracket_data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Generate ID if not provided
        if 'id' not in bracket_data:
            bracket_data['id'] = generate_id()
        
        # Add timestamps
        bracket_data['createdAt'] = datetime.now().isoformat()
        bracket_data['updatedAt'] = datetime.now().isoformat()
        
        # Load existing brackets
        brackets = load_data('race_brackets.json')
        
        # Add new bracket
        brackets.append(bracket_data)
        
        # Save back to file
        if save_data('race_brackets.json', brackets):
            return jsonify(bracket_data), 201
        else:
            return jsonify({'error': 'Failed to save race bracket'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
        
        brackets = load_data('race_brackets.json')
        
        # Find and update bracket
        for i, bracket in enumerate(brackets):
            if bracket.get('id') == bracket_id:
                bracket_data['id'] = bracket_id
                bracket_data['updatedAt'] = datetime.now().isoformat()
                # Preserve createdAt if it exists
                if 'createdAt' in bracket:
                    bracket_data['createdAt'] = bracket['createdAt']
                
                brackets[i] = bracket_data
                
                if save_data('race_brackets.json', brackets):
                    return jsonify(bracket_data)
                else:
                    return jsonify({'error': 'Failed to update race bracket'}), 500
        
        return jsonify({'error': 'Race bracket not found'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/race-brackets/<bracket_id>', methods=['DELETE'])
def delete_race_bracket(bracket_id):
    """Delete a race bracket"""
    try:
        ok, err = require_permission('race:edit')
        if not ok:
            msg, code = err
            return jsonify({'error': msg}), code
        brackets = load_data('race_brackets.json')
        
        # Find and remove bracket
        for i, bracket in enumerate(brackets):
            if bracket.get('id') == bracket_id:
                del brackets[i]
                
                if save_data('race_brackets.json', brackets):
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
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'data_files': {
            'participants': len(load_data('participants.json')),
            'series': len(load_data('series.json')),
            'events': len(load_data('events.json')),
            'races': len(load_data('races.json')),
            'race_brackets': len(load_data('race_brackets.json'))
        }
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
        page_perm_map = {
            'registration.html': ['registration'],
            'series.html': ['series'],
            'events.html': ['events'],
            'races.html': ['races'],
            'analytics.html': ['analytics'],
            'driver-profile.html': ['drivers profile'],
            'live-display.html': ['live display'],
            'users.html': ['*'],
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
    users = load_users()
    user = next((u for u in users if u.get('username') == username and u.get('password') == password), None)
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    # Ensure Admin invariants: Admin always has all categories
    if user.get('username') == 'Admin':
        if set(user.get('permissions', [])) != set(ALL_CATEGORIES):
            user['permissions'] = ALL_CATEGORIES[:]
        save_users(users)
    token = create_session(
        user.get('id'),
        user.get('username'),
        user.get('permissions', []),
        user.get('allowedEvents', [])
    )
    resp = jsonify({'token': token, 'username': user.get('username'), 'permissions': user.get('permissions', []), 'allowedEvents': user.get('allowedEvents', [])})
    # Set cookie so subsequent page GETs include auth
    resp.set_cookie('auth_token', token, httponly=False, samesite='Lax')
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
    if not sess or sess.get('username') != 'Admin':
        return False
    return True

@app.route('/api/users', methods=['GET', 'POST'])
def users_collection():
    sess = get_session_from_request()
    if not ensure_admin(sess):
        return jsonify({'error': 'Access Denied'}), 403
    if request.method == 'GET':
        return jsonify(load_users())
    data = request.get_json() or {}
    if not data.get('username') or not data.get('password'):
        return jsonify({'error': 'username and password are required'}), 400
    users = load_users()
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
    users.append(new_user)
    save_users(users)
    return jsonify(new_user), 201

@app.route('/api/users/<user_id>', methods=['PUT', 'DELETE'])
def users_item(user_id):
    sess = get_session_from_request()
    if not ensure_admin(sess):
        return jsonify({'error': 'Access Denied'}), 403
    users = load_users()
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
            save_users(users)
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
        save_users(users)
        return jsonify(users[idx])
    else:
        deleted = users.pop(idx)
        save_users(users)
        return jsonify({'success': True, 'deletedId': deleted.get('id')})

if __name__ == '__main__':
    print("🏁 Starting EPC17 Event Management System Server")
    print("📡 Network accessible at:")
    print("   - http://localhost:5000")
    print("   - http://127.0.0.1:5000")
    print("   - http://[your-ip]:5000 (for network access)")
    print("💾 Data stored in: ./data/")
    
    # Check for SSL certificates
    use_ssl = False
    if os.path.exists("cert.pem") and os.path.exists("key.pem"):
        use_ssl = True
        print("🔒 SSL certificates found - HTTPS enabled")
        print("   - https://localhost:5000")
        print("   - https://127.0.0.1:5000")
        print("   - https://[your-ip]:5000 (for network access)")
    else:
        print("🔓 Running in HTTP mode (no SSL certificates)")
        print("💡 To enable HTTPS, install cryptography: pip install cryptography")
        print("   Then restart the server to auto-generate certificates")
    
    # Run server accessible from network
    if use_ssl:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain("cert.pem", "key.pem")
        app.run(
            host='0.0.0.0',  # Accept connections from any IP
            port=5000,
            debug=False,     # Disable debug mode for network deployment
            threaded=True,   # Enable multi-threading for concurrent requests
            ssl_context=context
        )
    else:
        app.run(
            host='0.0.0.0',  # Accept connections from any IP
            port=5000,
            debug=False,     # Disable debug mode for network deployment
            threaded=True    # Enable multi-threading for concurrent requests
        ) 