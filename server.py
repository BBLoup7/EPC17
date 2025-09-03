#!/usr/bin/env python3
"""
EPC17 - Event Management System - Network Server
Robust data management for multi-client access across local network
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import threading
from datetime import datetime
import uuid
import ssl

app = Flask(__name__, template_folder='.', static_folder='.', static_url_path='')
# Enable CORS for all origins with all methods and headers
CORS(app, 
     origins=['*'],  # Allow all origins
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
     supports_credentials=False)

# Clean server setup without custom logging

# Data storage configuration
DATA_DIR = 'data'
os.makedirs(DATA_DIR, exist_ok=True)

# Thread lock for concurrent access safety
data_lock = threading.Lock()

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

def generate_id():
    """Generate unique ID"""
    return str(uuid.uuid4())

# Web Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/registration')
def registration():
    return render_template('registration.html')

@app.route('/series')
def series():
    return render_template('series.html')

@app.route('/events')
def events():
    return render_template('events.html')

@app.route('/races')
def races():
    return render_template('races.html')

@app.route('/analytics')
def analytics():
    return render_template('analytics.html')

@app.route('/statistics')
def statistics():
    return render_template('analytics.html')  # Redirect to analytics for backward compatibility

@app.route('/big-screen.html')
def big_screen_redirect():
    return render_template('live-display.html')  # Redirect old big-screen.html to live-display.html

@app.route('/network-test')
def network_test():
    return render_template('network-test.html')

# API Endpoints
@app.route('/api/participants', methods=['GET', 'POST'])
def handle_participants():
    """Handle participant registration and retrieval with pagination"""
    if request.method == 'POST':
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
    events = load_data('events.json')
    
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
    races = load_data('races.json')
    
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

@app.route('/api/achievements', methods=['GET', 'POST'])
def handle_achievements():
    """Handle achievement data storage and retrieval"""
    if request.method == 'POST':
        data = request.json
        if not data or not data.get('participantId') or not data.get('tagId'):
            return jsonify({'error': 'Participant ID and tag ID are required'}), 400
            
        data['id'] = generate_id()
        data['earnedDate'] = datetime.now().isoformat()
        data['eventId'] = data.get('eventId', '')
        
        achievements = load_data('achievements.json')
        
        # Check if participant already has this achievement
        existing = next((a for a in achievements if 
                        a['participantId'] == data['participantId'] and 
                        a['tagId'] == data['tagId']), None)
        
        if not existing:
            achievements.append(data)
            if save_data('achievements.json', achievements):
                return jsonify(data), 201
            else:
                return jsonify({'error': 'Failed to save achievement'}), 500
        else:
            return jsonify({'message': 'Achievement already exists'}), 200
    
    # GET request
    achievements = load_data('achievements.json')
    participant_id = request.args.get('participantId')
    
    if participant_id:
        achievements = [a for a in achievements if a['participantId'] == participant_id]
    
    return jsonify(achievements)

@app.route('/api/calculate-achievements', methods=['POST'])
def calculate_achievements():
    """Calculate and award achievements for an event"""
    data = request.json
    if not data or not data.get('eventId'):
        return jsonify({'error': 'Event ID is required'}), 400
    
    event_id = data['eventId']
    
    try:
        # Load all necessary data
        participants = load_data('participants.json')
        races = load_data('races.json')
        events = load_data('events.json')
        achievements = load_data('achievements.json')
        
        # Calculate achievements for this event
        new_achievements = calculate_event_achievements(event_id, participants, races, events, achievements)
        
        # Save new achievements
        if new_achievements:
            all_achievements = load_data('achievements.json')
            all_achievements.extend(new_achievements)
            if save_data('achievements.json', all_achievements):
                return jsonify({
                    'success': True,
                    'newAchievements': len(new_achievements),
                    'achievements': new_achievements
                })
            else:
                return jsonify({'error': 'Failed to save achievements'}), 500
        else:
            return jsonify({'success': True, 'newAchievements': 0, 'achievements': []})
            
    except Exception as e:
        return jsonify({'error': f'Achievement calculation failed: {str(e)}'}), 500

@app.route('/api/standings')
def get_standings():
    """Calculate and return standings"""
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

def calculate_event_achievements(event_id, participants, races, events, existing_achievements):
    """
    Calculate achievements for participants based on event performance
    """
    new_achievements = []
    
    # Achievement definitions
    achievement_tags = {
        'lane-bias-index': {
            'title': '🧨 Lane Bias Index',
            'description': 'Which lane wins more than it should? Assigned if a driver wins primarily from a lane that statistically underperforms'
        },
        'anti-social-racer': {
            'title': '🧍‍♂️ Anti-Social Racer',
            'description': 'Fewest unique opponents - This driver keeps drawing the same people round after round'
        },
        'bracket-comeback': {
            'title': '🎯 Bracket Comeback of the Day',
            'description': 'Deepest lower-bracket run - Dropped early, then climbed all the way to the final'
        },
        'rematch-count': {
            'title': '🔁 Rematch Count',
            'description': 'Most rematches in a single event - They just couldn\'t get away from their rivals'
        },
        'silent-killer': {
            'title': '🔪 Silent Killer',
            'description': 'Most eliminations, no podium - Took out a lot of racers without placing'
        },
        'lane-loyalty-violation': {
            'title': '😬 Lane Loyalty Violation',
            'description': 'Never raced in the same lane twice - Switched lanes every single heat'
        },
        'clean-sweep': {
            'title': '🧹 Clean Sweep',
            'description': 'Perfect upper-bracket run - Won every match without ever dropping'
        },
        'unbreakable-wall': {
            'title': '🧱 Unbreakable Wall',
            'description': 'Eliminated the most opponents - Statistically the biggest threat on the bracket'
        },
        'luckiest-draw': {
            'title': '🍀 Luckiest Draw',
            'description': 'No rematches + preferred lane usage - Had the smoothest possible bracket run'
        }
    }
    
    # Load bracket data to extract race results
    print(f"🏆 Calculating achievements for event {event_id}")
    try:
        brackets_data = load_data('race_brackets.json')
        event_bracket = None
        
        # Find the bracket for this event
        for bracket in brackets_data:
            if bracket.get('eventId') == event_id:
                event_bracket = bracket
                break
        
        if not event_bracket:
            print(f"❌ No bracket found for event {event_id}")
            return new_achievements
            
        print(f"📊 Found bracket for event {event_id}")
        
        # Extract race results from bracket structure
        event_races = []
        if 'classes' in event_bracket:
            for class_name, class_bracket in event_bracket['classes'].items():
                if 'rounds' in class_bracket:
                    for round_data in class_bracket['rounds']:
                        if 'heats' in round_data:
                            for heat in round_data['heats']:
                                if 'results' in heat and 'lanes' in heat:
                                    # Process each result in this heat
                                    for result in heat['results']:
                                        if 'participantId' in result:
                                            # Find lane info for this participant
                                            participant_lane = next((lane for lane in heat['lanes'] 
                                                                   if lane.get('participant', {}).get('id') == result['participantId']), None)
                                            
                                            if participant_lane:
                                                race_record = {
                                                    'eventId': event_id,
                                                    'participantId': result['participantId'],
                                                    'position': result.get('position'),
                                                    'lane': participant_lane.get('lane'),
                                                    'round': round_data.get('roundNumber'),
                                                    'bracketType': round_data.get('bracketType', 'upper'),
                                                    'heatId': heat.get('id'),
                                                    'opponents': [lane.get('participant', {}).get('id') for lane in heat['lanes'] 
                                                                if lane.get('participant', {}).get('id') != result['participantId']]
                                                }
                                                event_races.append(race_record)
        
        print(f"📊 Extracted {len(event_races)} race results from bracket data")
        
        if not event_races:
            print("❌ No race results found in bracket data")
            return new_achievements
    
    except Exception as e:
        print(f"❌ Error loading bracket data: {e}")
        return new_achievements
    
    # Get event participants - look in both events array and participants array
    event_participants = []
    for participant in participants:
        # Check if participant is in this event
        if (event_id in participant.get('events', []) or 
            event_id == participant.get('eventId') or
            any(race['participantId'] == participant['id'] for race in event_races)):
            event_participants.append(participant)
    
    print(f"👥 Found {len(event_participants)} participants for event")
    
    # Analysis data structures
    participant_stats = {}
    lane_stats = {}
    
    # Initialize participant tracking
    for participant in event_participants:
        participant_stats[participant['id']] = {
            'lanes_used': set(),
            'opponents_faced': set(),
            'wins': 0,
            'total_races': 0,
            'eliminations_caused': 0,
            'lane_wins': {},
            'bracket_performance': {'upper': 0, 'lower': 0, 'wins_upper': 0, 'wins_lower': 0},
            'rematches': 0
        }
    
    # Analyze race data
    for race in event_races:
        participant_id = race.get('participantId')
        if not participant_id or participant_id not in participant_stats:
            continue
            
        lane_num = race.get('lane', 0)
        position = race.get('position')
        bracket_type = race.get('bracketType', 'upper')
        opponents = race.get('opponents', [])
        
        # Update participant stats
        participant_stats[participant_id]['lanes_used'].add(lane_num)
        participant_stats[participant_id]['total_races'] += 1
        
        # Track lane statistics globally
        if lane_num not in lane_stats:
            lane_stats[lane_num] = {'wins': 0, 'total': 0}
        lane_stats[lane_num]['total'] += 1
        
        # Track opponents and rematches
        for opponent_id in opponents:
            if opponent_id:
                if opponent_id in participant_stats[participant_id]['opponents_faced']:
                    participant_stats[participant_id]['rematches'] += 1
                participant_stats[participant_id]['opponents_faced'].add(opponent_id)
        
        # Track wins and performance
        if position == 1:
            participant_stats[participant_id]['wins'] += 1
            lane_stats[lane_num]['wins'] += 1
            
            if lane_num not in participant_stats[participant_id]['lane_wins']:
                participant_stats[participant_id]['lane_wins'][lane_num] = 0
            participant_stats[participant_id]['lane_wins'][lane_num] += 1
            
            # Track bracket performance
            if bracket_type == 'upper':
                participant_stats[participant_id]['bracket_performance']['wins_upper'] += 1
            else:
                participant_stats[participant_id]['bracket_performance']['wins_lower'] += 1
        
        # Track bracket rounds for performance analysis
        participant_stats[participant_id]['bracket_performance'][bracket_type] += 1
    
    # Calculate achievements
    for participant_id, stats in participant_stats.items():
        participant = next((p for p in event_participants if p['id'] == participant_id), None)
        if not participant:
            continue
            
        # Check if participant already has achievements (avoid duplicates)
        existing_tags = {a['tagId'] for a in existing_achievements if a.get('participantId') == participant_id}
        
        # 🧨 Lane Bias Index - wins primarily from underperforming lane
        if stats['wins'] > 0 and stats['lane_wins']:
            primary_lane = max(stats['lane_wins'], key=stats['lane_wins'].get)
            if primary_lane in lane_stats:
                lane_win_rate = lane_stats[primary_lane]['wins'] / max(lane_stats[primary_lane]['total'], 1)
                overall_win_rate = sum(ls['wins'] for ls in lane_stats.values()) / max(sum(ls['total'] for ls in lane_stats.values()), 1)
                
                if lane_win_rate < overall_win_rate * 0.8 and 'lane-bias-index' not in existing_tags:
                    new_achievements.append({
                        'participantId': participant_id,
                        'tagId': 'lane-bias-index',
                        'eventId': event_id,
                        'earnedDate': datetime.now().isoformat(),
                        'details': f'Won primarily from lane {primary_lane} (underperforming lane)'
                    })
        
        # 🧍‍♂️ Anti-Social Racer - fewest unique opponents
        if stats['total_races'] > 2:
            avg_opponents = sum(len(s['opponents_faced']) for s in participant_stats.values()) / len([s for s in participant_stats.values() if s['total_races'] > 0])
            if len(stats['opponents_faced']) < avg_opponents * 0.7 and 'anti-social-racer' not in existing_tags:
                new_achievements.append({
                    'participantId': participant_id,
                    'tagId': 'anti-social-racer',
                    'eventId': event_id,
                    'earnedDate': datetime.now().isoformat(),
                    'details': f'Faced only {len(stats["opponents_faced"])} unique opponents'
                })
        
        # 🔁 Rematch Count - most rematches
        if stats['rematches'] > 0:
            max_rematches = max((s['rematches'] for s in participant_stats.values()), default=0)
            if stats['rematches'] == max_rematches and max_rematches >= 3 and 'rematch-count' not in existing_tags:
                new_achievements.append({
                    'participantId': participant_id,
                    'tagId': 'rematch-count',
                    'eventId': event_id,
                    'earnedDate': datetime.now().isoformat(),
                    'details': f'Had {stats["rematches"]} rematches in a single event'
                })
        
        # 😬 Lane Loyalty Violation - never used same lane twice
        if len(stats['lanes_used']) == stats['total_races'] and stats['total_races'] >= 3 and 'lane-loyalty-violation' not in existing_tags:
            new_achievements.append({
                'participantId': participant_id,
                'tagId': 'lane-loyalty-violation',
                'eventId': event_id,
                'earnedDate': datetime.now().isoformat(),
                'details': f'Used {len(stats["lanes_used"])} different lanes in {stats["total_races"]} races'
            })
        
        # 🧹 Clean Sweep - perfect upper bracket run (simplified check)
        if stats['bracket_performance']['wins_upper'] >= 3 and stats['wins'] == stats['bracket_performance']['wins_upper'] and 'clean-sweep' not in existing_tags:
            new_achievements.append({
                'participantId': participant_id,
                'tagId': 'clean-sweep',
                'eventId': event_id,
                'earnedDate': datetime.now().isoformat(),
                'details': f'Perfect upper bracket run with {stats["wins"]} consecutive wins'
            })
        
        # 🍀 Luckiest Draw - no rematches + good lane usage
        if stats['rematches'] == 0 and stats['total_races'] >= 3 and len(stats['opponents_faced']) == stats['total_races'] and 'luckiest-draw' not in existing_tags:
            new_achievements.append({
                'participantId': participant_id,
                'tagId': 'luckiest-draw',
                'eventId': event_id,
                'earnedDate': datetime.now().isoformat(),
                'details': 'Perfect bracket draw with no rematches'
            })
    
    return new_achievements

# Clear all data endpoint (DANGER!)
@app.route('/api/clear-all', methods=['DELETE', 'POST'])
def clear_all_data():
    """DANGER: Clear all data permanently - use with extreme caution"""
    try:
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
        brackets = load_data('race_brackets.json')
        return jsonify(brackets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/race-brackets/<bracket_id>', methods=['GET'])
def get_race_bracket(bracket_id):
    """Get a specific race bracket"""
    try:
        brackets = load_data('race_brackets.json')
        bracket = next((b for b in brackets if b.get('id') == bracket_id), None)
        if bracket:
            return jsonify(bracket)
        return jsonify({'error': 'Race bracket not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/race-brackets', methods=['POST'])
def create_race_bracket():
    """Create a new race bracket"""
    try:
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
            'achievements': len(load_data('achievements.json')),
            'race_brackets': len(load_data('race_brackets.json'))
        }
    })

# Static file serving
@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files with cache-busting for development"""
    from flask import make_response
    
    response = make_response(send_from_directory('.', filename))
    
    # Add cache-busting headers for JavaScript files to prevent caching issues
    if filename.endswith('.js') or filename.endswith('.css'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    
    return response

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