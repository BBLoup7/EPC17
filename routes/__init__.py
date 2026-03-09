"""
EPC17 Route Blueprints
Each file in this package is a Flask Blueprint for a group of related API routes.
Import and register them in server.py via:

    from routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api')

Target structure (incremental migration from server.py):
    routes/
        __init__.py         -- this file
        auth.py             -- 3 auth routes (login, logout, check-auth)
        participants.py     -- 4 CRUD routes
        events.py           -- 5 routes + registration
        series.py           -- 4 CRUD routes
        races.py            -- 8 routes (races + brackets + standings)
        stats.py            -- 11 analytics routes
        settings.py         -- 3 routes (settings + email config)
        pages.py            -- 9 page-serving routes
        utility.py          -- version, health, clear-database
"""
