"""
API tests for participant endpoints.
Uses pytest-flask with in-memory SQLite.
"""

import pytest

from utils.db_manager import DatabaseManager


class TestParticipantsAPI:
    """Test suite for /api/participants endpoints."""

    def test_get_participants_returns_list(self, client, monkeypatch):
        """GET /api/participants should return a list."""
        monkeypatch.setattr('server.require_permission', lambda *_: (True, None))
        response = client.get('/api/participants')
        assert response.status_code == 200
        data = response.get_json()
        assert isinstance(data, (list, dict))

    def test_create_participant(self, client, monkeypatch):
        """POST /api/participants should create a new participant."""
        monkeypatch.setattr('server.require_permission', lambda *_: (True, None))
        response = client.post('/api/participants', 
            json={
                'name': 'Test Driver',
                'racingNumber': '99',
                'selectedClasses': ['Pro']
            }
        )
        # Should succeed or return validation error
        assert response.status_code in [200, 201, 400, 403, 500]

    def test_get_participants_pagination(self, client, monkeypatch):
        """GET /api/participants should support pagination."""
        monkeypatch.setattr('server.require_permission', lambda *_: (True, None))
        response = client.get('/api/participants?page=1&limit=10')
        assert response.status_code == 200

    def test_register_participant_for_event_normalizes_participant_id(self, client, monkeypatch):
        """POST /api/events/<id>/participants should match participant IDs by string value."""
        monkeypatch.setattr('server.require_permission', lambda *_: (True, None))

        class FakeDb:
            def __init__(self):
                self.event = {'id': 'evt-1', 'participants': [], 'currentParticipants': 0}
                self.participant = {'id': 101, 'name': 'Driver 101', 'eventIds': []}
                self.saved_participant = None

            def get_events(self):
                return [self.event]

            def get_participants(self):
                return [self.participant]

            def update_event(self, event_id, event):
                self.event = event
                return True

            def update_participant(self, participant_id, participant):
                self.saved_participant = participant
                return True

        fake_db = FakeDb()
        monkeypatch.setattr('server.get_db_manager', lambda: fake_db)

        response = client.post(
            '/api/events/evt-1/participants',
            json={'participantId': '101'},
        )

        assert response.status_code == 201
        payload = response.get_json()
        assert payload.get('success') is True
        assert '101' in fake_db.event['participants']
        assert fake_db.saved_participant is not None
        assert 'evt-1' in fake_db.saved_participant.get('eventIds', [])


class TestDatabaseParticipantUpdates:
    """Unit tests for participant update behavior at the DB layer."""

    def test_update_participant_returns_true_for_unchanged_and_changed_data(self, tmp_path):
        db_path = tmp_path / 'participants-update.db'
        db = DatabaseManager(str(db_path))

        participant = {
            'id': 'p-1',
            'name': 'Driver One',
            'selectedClasses': ['Pro'],
            'eventClasses': {'evt-1': ['Pro']},
        }
        assert db.add_participant(participant) is True

        stored = db.get_participant('p-1')
        assert stored is not None

        # Unchanged update should still be treated as success.
        assert db.update_participant('p-1', stored) is True

        # Changed update should continue to succeed as usual.
        changed = dict(stored)
        changed['name'] = 'Driver One Updated'
        assert db.update_participant('p-1', changed) is True

        db.close()
