"""
Races Blueprint — Bracket management, heat operations, standings
Target routes to migrate from server.py:
    GET    /api/races/<event_id>/bracket
    POST   /api/races/<event_id>/bracket
    PUT    /api/races/<event_id>/bracket
    POST   /api/races/<event_id>/heat/<heat_id>/result
    GET    /api/races/<event_id>/standings
    POST   /api/races/<event_id>/generate-round
    POST   /api/races/<event_id>/tie-breaker
    GET    /api/races/<event_id>/final-results
"""
