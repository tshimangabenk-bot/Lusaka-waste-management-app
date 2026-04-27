# Gunicorn production configuration
# Run with:  gunicorn -c gunicorn.conf.py "app:create_app()"

import multiprocessing

# Bind to port 5000 by default (override with $PORT env var)
import os
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"

# 2 workers per CPU core is a sensible starting point for I/O-bound Flask apps
workers = multiprocessing.cpu_count() * 2 + 1

# Gevent async workers handle concurrent requests without blocking threads
# Install with:  pip install gevent
worker_class = "sync"   # change to "gevent" if you install gevent

# Restart workers after this many requests (prevents memory leaks)
max_requests = 1000
max_requests_jitter = 100

# Timeout (seconds) — raise if Firebase / DB calls are slow
timeout = 60

# Log to stdout so cloud platforms (Railway, Render, Heroku) capture it
accesslog  = "-"
errorlog   = "-"
loglevel   = "info"
