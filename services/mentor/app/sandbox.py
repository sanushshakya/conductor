"""The wrapper that runs inside the learner's subprocess.

This file is written into each run's temporary directory and executed there.
Putting the restrictions *inside* the child, before the learner's code is
compiled, is deliberate:

  * `python -I` (isolated mode) ignores PYTHONPATH, so the usual
    `sitecustomize.py` trick does not fire. Isolation is worth keeping — it is
    what stops the learner's directory shadowing a standard-library module —
    so the restrictions come from the wrapper instead.
  * Everything the learner's code can see is set up in one readable place.

The tracebacks the learner sees must look like Python's, not like this file's,
so the wrapper is stripped out of them before they are printed.
"""

import builtins
import os
import resource
import sys
import traceback

#: Address space the learner's program may claim. A beginner who allocates a
#: four-gigabyte bytearray gets a clean MemoryError instead of the operating
#: system deciding which process to kill — which might be the sidecar.
MEMORY_LIMIT_BYTES = 512 * 1024 * 1024

#: CPU seconds. The parent also enforces a wall clock; this catches a tight
#: loop fractionally sooner and survives a parent that is itself wedged.
CPU_LIMIT_SECONDS = 10


def _limit_resources() -> None:
    for limit, value in (
        (resource.RLIMIT_AS, MEMORY_LIMIT_BYTES),
        (resource.RLIMIT_CPU, CPU_LIMIT_SECONDS),
        # No subprocesses: a fork bomb from a typo is not a lesson anyone needs.
        (resource.RLIMIT_NPROC, 0),
        # No core dumps filling the user's disk after a crash.
        (resource.RLIMIT_CORE, 0),
    ):
        try:
            soft, hard = resource.getrlimit(limit)
            ceiling = value if hard == resource.RLIM_INFINITY else min(value, hard)
            resource.setrlimit(limit, (ceiling, hard))
        except (ValueError, OSError):
            # A platform without this limit is not a reason to refuse to run
            # the learner's program; the parent's wall clock still applies.
            pass


def _block_network() -> None:
    """Refuse outbound connections at the lowest layer available.

    Lessons never need the network, and a beginner cannot audit what the code
    an agent wrote for them reaches out to.

    This patches the **C extension** `_socket`, not the pure-Python `socket`
    wrapper. Patching the wrapper alone leaves two one-line escapes, both of
    which an agent could plausibly produce:

        import _socket                      # the wrapper was never involved
        importlib.reload(socket)            # re-imports from _socket, undoing it

    Because `socket.socket` IS `_socket.socket` and `socket.create_connection`
    is built on it, blocking `connect` here closes the wrapper, the reload, and
    everything layered above them — urllib, requests, httpx — in one place.
    """
    import _socket
    import socket

    message = "Network access is not available inside a lesson."

    def _refuse_connect(self, *_args, **_kwargs):
        raise OSError(message)

    # `_socket.socket` is an immutable C type, so its methods cannot be
    # replaced. Swapping the NAME in the module for a refusing subclass works
    # instead, and covers both remaining escapes:
    #   import _socket            -> resolves to this subclass
    #   importlib.reload(socket)  -> `class socket(_socket.socket)` re-reads
    #                                the name, so the reload inherits the block
    class BlockedRawSocket(_socket.socket):  # type: ignore[misc]
        # Empty __slots__ keeps this a drop-in base. Without it the subclass
        # gains a __weakref__ slot, and a later `class socket(_socket.socket)`
        # — which is exactly what reloading the socket module does — dies with
        # "__weakref__ slot disallowed" instead of refusing cleanly.
        __slots__ = ()
        connect = _refuse_connect
        connect_ex = _refuse_connect

    _socket.socket = BlockedRawSocket  # type: ignore[assignment]

    # The already-imported `socket.socket` still derives from the ORIGINAL
    # C type, so it needs the block applied directly. It is a Python class,
    # so unlike its base it accepts the assignment.
    socket.socket.connect = _refuse_connect  # type: ignore[assignment]
    socket.socket.connect_ex = _refuse_connect  # type: ignore[assignment]
    socket.create_connection = _refuse(message)  # type: ignore[assignment]
    socket.create_server = _refuse(message)  # type: ignore[assignment]


def _refuse(message: str):
    def _blocked(*_args, **_kwargs):
        raise OSError(message)

    return _blocked


def _clean_environment() -> None:
    """Remove the app's own secrets from the learner's view."""
    for key in ("CONDUCTOR_TOKEN",):
        os.environ.pop(key, None)


def _print_learner_traceback(code_path: str) -> None:
    """Print a traceback with this wrapper's frames removed.

    A beginner reading `File "/tmp/.../runner_main.py", line 41, in <module>`
    learns that the tool is confusing, not that their variable was misspelled.
    Only frames from their own file survive.
    """
    exc_type, exc_value, exc_tb = sys.exc_info()
    frames = [f for f in traceback.extract_tb(exc_tb) if f.filename == code_path]

    sys.stderr.write("Traceback (most recent call last):\n")
    for line in traceback.format_list(frames):
        sys.stderr.write(line.replace(code_path, "your program"))
    for line in traceback.format_exception_only(exc_type, exc_value):
        sys.stderr.write(line)


def _install_thread_hook(code_path: str) -> None:
    """Scrub the sandbox path out of failures raised off the main thread.

    `_print_learner_traceback` only sees exceptions that reach the main
    thread's except clause; a thread that dies goes through
    `threading.excepthook` instead and would print the temp path plus the
    interpreter's own threading.py.
    """
    import threading

    def hook(args) -> None:
        for line in traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback):
            sys.stderr.write(line.replace(code_path, "your program"))

    threading.excepthook = hook


def run_learner_file(code_path: str) -> int:
    _limit_resources()
    _block_network()
    _clean_environment()
    _install_thread_hook(code_path)

    with open(code_path, "r", encoding="utf-8") as handle:
        source = handle.read()

    namespace = {"__name__": "__main__", "__file__": code_path, "__builtins__": builtins}

    try:
        compiled = compile(source, code_path, "exec")
    except SyntaxError:
        # Python's own rendering of a SyntaxError includes the FILENAME, which
        # here is a path like /var/folders/.../conductor-run-ab12/program.py.
        # A syntax error is the most common thing a beginner produces, and
        # lessons 0.3 and 1.7 are about reading errors — so the first error
        # they are taught to read must not be full of this app's plumbing.
        for line in traceback.format_exception_only(*sys.exc_info()[:2]):
            sys.stderr.write(line.replace(code_path, "your program"))
        return 1

    try:
        exec(compiled, namespace)  # noqa: S102 - running learner code is the job
    except SystemExit as exit_request:
        return int(exit_request.code or 0)
    except MemoryError:
        sys.stderr.write("MemoryError: this program asked for more memory than a lesson allows.\n")
        return 1
    except BaseException:  # noqa: BLE001 - every failure belongs to the learner
        _print_learner_traceback(code_path)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(run_learner_file(sys.argv[1]))
