"""
Pytest fixtures for EPC17 API testing.
Provides a test Flask client with an in-memory SQLite database.
"""

import sys
import os
import pytest

# Add project root to path so server can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def app():
    """Create a Flask app configured for testing."""
    # Import here to avoid circular imports
    from server import app as flask_app
    
    flask_app.config['TESTING'] = True
    flask_app.config['DEBUG'] = False
    
    yield flask_app


@pytest.fixture
def client(app):
    """Create a Flask test client."""
    return app.test_client()


@pytest.fixture
def authenticated_client(client):
    """Create a test client that is already authenticated as admin."""
    # Login with default admin credentials
    response = client.post('/api/auth/login', json={
        'username': 'admin',
        'password': 'admin123'
    })
    
    if response.status_code == 200:
        data = response.get_json()
        token = data.get('token', '')
        client._token = token
    
    return client
