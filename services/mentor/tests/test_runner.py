"""Tests for running the learner's Python safely.

Everything here is about a program that misbehaves. The learner is a beginner
writing their first loops: an accidental `while True` is not an edge case, it
is Tuesday. None of it may take the sidecar down with it, and none of it may
leave the app hanging with no explanation.
"""

import os
import sys
import time

import pytest

from app.runner import run_python


def test_runs_hello_world_and_captures_stdout():
    result = run_python('print("hello")')
    assert result.ok is True
    assert result.stdout == "hello\n"
    assert result.exit_code == 0


def test_reports_how_long_the_run_took():
    assert run_python("x = 1").duration_ms >= 0


def test_stdin_is_delivered_to_input():
    result = run_python('name = input()\nprint(f"hi {name}")', stdin="Ada\n")
    assert result.stdout == "hi Ada\n"


def test_infinite_loop_is_killed_at_the_timeout():
    started = time.monotonic()
    result = run_python("while True: pass", timeout_ms=1000)
    elapsed_ms = (time.monotonic() - started) * 1000

    assert result.ok is False
    assert result.killed_reason == "timeout"
    assert elapsed_ms < 5000
    assert "took too long" in result.stderr.lower()


def test_output_produced_before_a_timeout_is_still_returned():
    result = run_python('print("before")\nwhile True: pass', timeout_ms=1000)
    assert "before" in result.stdout


def test_megabytes_of_stdout_are_truncated_with_a_flag():
    result = run_python('for _ in range(200000): print("x" * 100)', timeout_ms=10000)
    assert result.truncated is True
    assert len(result.stdout) <= 300_000
    assert "truncated" in result.stderr.lower()


def test_memory_hog_does_not_take_the_sidecar_down():
    """The guarantee that holds on every platform.

    `RLIMIT_AS` is rejected outright by macOS ("current limit exceeds maximum
    limit") even when the hard limit is unlimited, so the address-space cap in
    `sandbox.py` is enforced on Linux — where CI and any packaged Linux build
    run — and silently unavailable on macOS. What holds everywhere is that the
    allocation happens in a throwaway child bounded by the wall clock, so the
    sidecar itself keeps serving.
    """
    result = run_python("x = bytearray(4 * 1024 * 1024 * 1024)", timeout_ms=5000)
    assert result.duration_ms < 10_000

    # Still responsive afterwards: the sidecar survived.
    assert run_python('print("alive")').stdout == "alive\n"


@pytest.mark.skipif(sys.platform != "linux", reason="RLIMIT_AS is not enforced on macOS")
def test_memory_hog_is_killed_where_the_os_enforces_limits():
    result = run_python("x = bytearray(4 * 1024 * 1024 * 1024)", timeout_ms=10000)
    assert result.ok is False


def test_network_access_is_denied():
    """Connecting is the boundary, not constructing.

    A socket object that never connects is harmless, and refusing construction
    breaks stdlib imports that merely touch the module.
    """
    code = (
        "import socket\n"
        "try:\n"
        "    socket.socket().connect(('1.1.1.1', 80)); print('OPENED')\n"
        "except Exception:\n"
        "    print('BLOCKED')"
    )
    assert "BLOCKED" in run_python(code, timeout_ms=10000).stdout


def test_outbound_http_is_denied():
    code = (
        "import urllib.request\n"
        "try:\n"
        "    urllib.request.urlopen('http://example.com', timeout=2)\n"
        "    print('OPENED')\n"
        "except Exception:\n"
        "    print('BLOCKED')"
    )
    assert "BLOCKED" in run_python(code, timeout_ms=10000).stdout


def test_syntax_error_returns_the_traceback_as_stderr_not_a_500():
    result = run_python("print('unclosed")
    assert result.ok is False
    assert "SyntaxError" in result.stderr
    assert result.killed_reason is None


def test_a_runtime_error_reports_the_learners_line_number():
    result = run_python('print("fine")\nprint(missing)')
    assert result.ok is False
    assert "NameError" in result.stderr
    assert "line 2" in result.stderr


def test_the_traceback_does_not_leak_the_sandbox_wrapper():
    result = run_python("raise ValueError('boom')")
    assert "runner_main" not in result.stderr
    assert "sandbox" not in result.stderr.lower()
    assert "ValueError: boom" in result.stderr


def test_each_run_gets_a_clean_temp_cwd():
    first = run_python('open("note.txt", "w").write("hello")\nprint("wrote")')
    assert first.ok is True
    second = run_python(
        "import os\nprint('note.txt' in os.listdir('.'))"
    )
    assert second.stdout.strip() == "False"


def test_a_run_cannot_see_the_sidecar_source():
    result = run_python("import os\nprint('main.py' in os.listdir('.'))")
    assert result.stdout.strip() == "False"


def test_the_session_token_is_not_visible_to_learner_code(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", "super-secret-token")
    result = run_python("import os\nprint(os.environ.get('CONDUCTOR_TOKEN', 'ABSENT'))")
    assert "super-secret-token" not in result.stdout
    assert result.stdout.strip() == "ABSENT"


def test_concurrent_runs_do_not_share_a_directory():
    a = run_python('open("a.txt", "w").write("a")\nimport os\nprint(sorted(os.listdir(".")))')
    b = run_python('import os\nprint(sorted(os.listdir(".")))')
    assert "a.txt" not in b.stdout


def test_empty_code_runs_and_prints_nothing():
    result = run_python("")
    assert result.ok is True
    assert result.stdout == ""


# ── sandbox escapes found in review ──────────────────────────────────────


def test_the_raw_socket_module_is_also_blocked():
    """`socket` is a thin wrapper over the C extension `_socket`.

    Patching only the wrapper leaves `import _socket` as a one-line escape,
    which is exactly the code an agent might produce and a learner would paste
    in without reading.
    """
    code = (
        "import _socket\n"
        "try:\n"
        "    s = _socket.socket(); s.connect(('1.1.1.1', 80)); print('OPENED')\n"
        "except Exception:\n"
        "    print('BLOCKED')"
    )
    assert "BLOCKED" in run_python(code, timeout_ms=10000).stdout


def test_reloading_socket_does_not_restore_networking():
    code = (
        "import socket, importlib\n"
        "importlib.reload(socket)\n"
        "try:\n"
        "    socket.create_connection(('1.1.1.1', 80), 3); print('OPENED')\n"
        "except Exception:\n"
        "    print('BLOCKED')"
    )
    assert "BLOCKED" in run_python(code, timeout_ms=10000).stdout


def test_the_mentor_api_key_is_not_visible_to_learner_code(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_API_KEY", "sk-SECRET-KEY-12345")
    result = run_python("import os; print(os.environ.get('CONDUCTOR_API_KEY', 'ABSENT'))")
    assert "sk-SECRET-KEY-12345" not in result.stdout
    assert result.stdout.strip() == "ABSENT"


def test_only_an_allowlist_of_environment_variables_reaches_learner_code(monkeypatch):
    monkeypatch.setenv("SOME_COMPANY_INTERNAL_SECRET", "leak-me")
    result = run_python("import os; print('leak-me' in str(dict(os.environ)))")
    assert result.stdout.strip() == "False"


def test_path_is_still_available_so_normal_python_works(monkeypatch):
    result = run_python("import os, json; print(bool(os.environ.get('PATH')))")
    assert result.stdout.strip() == "True"


def test_a_syntax_error_does_not_reveal_the_sandbox_temp_path():
    result = run_python("print('unclosed")
    assert "SyntaxError" in result.stderr
    assert "/var/folders" not in result.stderr
    assert "conductor-run-" not in result.stderr
    assert "/tmp" not in result.stderr
    assert "your program" in result.stderr


def test_an_indentation_error_does_not_reveal_the_sandbox_temp_path():
    result = run_python("def f():\npass")
    assert "conductor-run-" not in result.stderr


def test_stderr_truncation_is_explained_like_stdout_truncation():
    result = run_python(
        "import sys\nfor _ in range(200000): sys.stderr.write('y' * 100)", timeout_ms=10000
    )
    assert "truncated" in result.stderr.lower()
