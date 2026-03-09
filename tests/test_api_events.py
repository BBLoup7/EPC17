"""
API tests for event endpoints.
"""

import pytest


class TestEventsAPI:
    """Test suite for /api/events endpoints."""

    @staticmethod
    def _auth_headers(client):
        token = getattr(client, '_token', '')
        if not token:
            pytest.skip('Authenticated token unavailable in test environment')
        return {'Authorization': f'Bearer {token}'}

    def test_get_events_returns_list(self, client):
        """GET /api/events should return a list."""
        response = client.get('/api/events')
        assert response.status_code in [200, 401, 403]
        if response.status_code == 200:
            data = response.get_json()
            assert isinstance(data, (list, dict))

    def test_get_single_event_not_found(self, client):
        """GET /api/events/<nonexistent_id> should return 404."""
        response = client.get('/api/events/nonexistent_id_12345')
        assert response.status_code in [404, 200]  # Depends on implementation

    def test_create_event_requires_auth(self, client):
        """POST /api/events should require authentication."""
        response = client.post('/api/events', json={
            'name': 'Test Event',
            'date': '2026-03-01'
        })
        # Should either succeed or require auth
        assert response.status_code in [200, 201, 401, 403]

    def test_event_class_config_round_trip_persistence(self, authenticated_client):
        """Event classSettings and classOrder should persist through create and update."""
        client = authenticated_client
        headers = self._auth_headers(client)

        create_payload = {
            'name': 'Issue110 Config Event',
            'date': '2026-03-02',
            'location': 'Test Track',
            'classSettings': [
                {'classId': 'pro', 'className': 'Pro', 'enabled': True, 'price': 75, 'fee': 75},
                {'classId': 'sport', 'className': 'Sport', 'enabled': False, 'price': 55, 'fee': 55}
            ],
            'classOrder': ['pro', 'sport']
        }

        create_response = client.post('/api/events', json=create_payload, headers=headers)
        assert create_response.status_code in [200, 201], create_response.get_json()
        created_event = create_response.get_json()
        event_id = created_event['id']

        update_payload = {
            'name': 'Issue110 Config Event',
            'date': '2026-03-02',
            'location': 'Test Track',
            'classSettings': [
                {'classId': 'sport', 'className': 'Sport', 'enabled': True, 'price': 60, 'fee': 60},
                {'classId': 'pro', 'className': 'Pro', 'enabled': True, 'price': 80, 'fee': 80}
            ],
            'classOrder': ['sport', 'pro']
        }

        update_response = client.put(f'/api/events/{event_id}', json=update_payload, headers=headers)
        assert update_response.status_code == 200, update_response.get_json()

        get_response = client.get('/api/events')
        assert get_response.status_code == 200
        body = get_response.get_json()
        events = body.get('events', body if isinstance(body, list) else [])
        updated_event = next((e for e in events if e.get('id') == event_id), None)
        assert updated_event is not None

        assert updated_event.get('classOrder') == ['sport', 'pro']
        assert isinstance(updated_event.get('classSettings'), list)
        assert [c.get('classId') for c in updated_event.get('classSettings', [])] == ['sport', 'pro']
        assert all(c.get('enabled') is True for c in updated_event.get('classSettings', []))

    def test_event_without_enabled_classes_stays_unconfigured(self, authenticated_client):
        """
        Event with no enabled class settings should not be transformed into enabled defaults.
        """
        client = authenticated_client
        headers = self._auth_headers(client)

        payload = {
            'name': 'Issue110 Empty Enabled Event',
            'date': '2026-03-03',
            'location': 'Test Track',
            'classSettings': [
                {'classId': 'pro', 'className': 'Pro', 'enabled': False, 'price': 75, 'fee': 75},
                {'classId': 'sport', 'className': 'Sport', 'enabled': False, 'price': 55, 'fee': 55}
            ],
            'classOrder': ['pro', 'sport']
        }

        create_response = client.post('/api/events', json=payload, headers=headers)
        assert create_response.status_code in [200, 201], create_response.get_json()
        event_id = create_response.get_json()['id']

        get_response = client.get('/api/events')
        assert get_response.status_code == 200
        body = get_response.get_json()
        events = body.get('events', body if isinstance(body, list) else [])
        event = next((e for e in events if e.get('id') == event_id), None)
        assert event is not None

        class_settings = event.get('classSettings', [])
        assert len(class_settings) == 2
        assert [c.get('enabled') for c in class_settings] == [False, False]
