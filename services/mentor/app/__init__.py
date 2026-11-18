"""Conductor's Python sidecar.

Runs the learner's Python, serves the reference Hospital API, grades the
learner's own API over real HTTP, and proxies the AI mentor. It binds
127.0.0.1 only and requires a per-launch token on every route: it is a local
component of a desktop app, not a server, and nothing outside this machine
should ever be able to reach it.
"""

__version__ = "0.1.0"
