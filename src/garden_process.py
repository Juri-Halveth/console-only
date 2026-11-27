"""Own the process group of one explicitly requested Garden command."""
from contextlib import ExitStack
import os
import signal
import subprocess
import sys
import threading
import time


def start(command, root):
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
    if os.name == 'nt':
        return WindowsCommand(command, root, env)
    return PosixCommand(command, root, env)


class OutputReader(threading.Thread):
    """Own the output stream and propagate read or consumer failures to the supervisor."""
    def __init__(self, stream, consume):
        super().__init__(daemon=True)
        self.stream = stream
        self.consume = consume
        self.error = None

    def run(self):
        try:
            with self.stream as stream:
                while chunk := stream.read(8192):
                    self.consume(chunk)
        except Exception as exc:
            self.error = exc

    def finish(self):
        self.join(timeout=4)
        if self.is_alive():
            raise RuntimeError('Ausgabe nach Gruppenabbruch weiterhin offen; Lauf vor Wiederholung prüfen')
        if self.error is not None:
            raise RuntimeError('Ausgabe des Laufs unvollständig; vor Wiederholung prüfen') from self.error


class PosixCommand:
    def __init__(self, command, root, env):
        # Leave the leader waitable until close(), even if it exits before a
        # child finishes writing. Its PID cannot be recycled as another PGID.
        if not hasattr(os, 'waitid') or not hasattr(os, 'WNOWAIT'):
            raise OSError('Dieser POSIX-Host unterstützt keine sichere Prozessgruppenverwaltung')
        self.proc = subprocess.Popen(command, cwd=root, env=env, start_new_session=True,
                                     stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        self.stdout = self.proc.stdout

    def poll(self):
        event = os.waitid(os.P_PID, self.proc.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        if not event:
            return None
        return event.si_status if event.si_code == os.CLD_EXITED else -event.si_status

    def stop(self):
        try:
            os.killpg(self.proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def close(self):
        self.proc.wait(timeout=5)


if os.name == 'nt':
    import _winapi
    import ctypes
    from ctypes import wintypes
    import msvcrt

    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateJobObjectW.argtypes = (wintypes.LPVOID, wintypes.LPCWSTR)
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.AssignProcessToJobObject.argtypes = (wintypes.HANDLE, wintypes.HANDLE)
    kernel.TerminateJobObject.argtypes = (wintypes.HANDLE, wintypes.UINT)
    kernel.ResumeThread.argtypes = (wintypes.HANDLE,)
    kernel.ResumeThread.restype = wintypes.DWORD
    kernel.QueryInformationJobObject.argtypes = (
        wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD))

    class JobAccounting(ctypes.Structure):
        _fields_ = [('times', ctypes.c_longlong * 4), ('page_faults', wintypes.DWORD),
                    ('total', wintypes.DWORD), ('active', wintypes.DWORD), ('terminated', wintypes.DWORD)]


class WindowsCommand:
    def __init__(self, command, root, env):
        # Popen closes the primary thread handle. Keep it until the suspended
        # process belongs to our anonymous job so no child can start earlier.
        with ExitStack() as handles, ExitStack() as temporary:
            self.job = kernel.CreateJobObjectW(None, None)
            if not self.job:
                raise ctypes.WinError(ctypes.get_last_error())
            handles.callback(_winapi.CloseHandle, self.job)
            read_fd, write_fd = os.pipe()
            self.stdout = os.fdopen(read_fd, 'rb')
            writer = temporary.enter_context(os.fdopen(write_fd, 'wb'))
            null = temporary.enter_context(open(os.devnull, 'rb'))
            try:
                def inherit(stream):
                    current = _winapi.GetCurrentProcess()
                    handle = _winapi.DuplicateHandle(current, msvcrt.get_osfhandle(stream.fileno()),
                        current, 0, True, _winapi.DUPLICATE_SAME_ACCESS)
                    temporary.callback(_winapi.CloseHandle, handle)
                    return handle

                stdin, stdout = inherit(null), inherit(writer)
                info = subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESTDHANDLES,
                    hStdInput=stdin, hStdOutput=stdout, hStdError=stdout,
                    lpAttributeList={'handle_list': [stdin, stdout]})
                args = subprocess.list2cmdline(command)
                sys.audit('subprocess.Popen', command[0], args, root, env)
                create_suspended = 0x4
                self.process, thread, _, _ = _winapi.CreateProcess(
                    None, args, None, None, True, create_suspended, env, str(root), info)
                handles.callback(_winapi.CloseHandle, self.process)
                temporary.callback(_winapi.CloseHandle, thread)
                try:
                    if not kernel.AssignProcessToJobObject(self.job, self.process):
                        raise ctypes.WinError(ctypes.get_last_error())
                    if kernel.ResumeThread(thread) == 0xffffffff:
                        raise ctypes.WinError(ctypes.get_last_error())
                except BaseException:
                    _winapi.TerminateProcess(self.process, 1)
                    _winapi.WaitForSingleObject(self.process, _winapi.INFINITE)
                    raise
            except BaseException:
                self.stdout.close()
                raise
            self.handles = handles.pop_all()

    def poll(self):
        if _winapi.WaitForSingleObject(self.process, 0) == _winapi.WAIT_TIMEOUT:
            return None
        return _winapi.GetExitCodeProcess(self.process)

    def stop(self):
        if not kernel.TerminateJobObject(self.job, 1):
            raise ctypes.WinError(ctypes.get_last_error())
        deadline = time.monotonic() + 5
        accounting = JobAccounting()
        while True:
            if not kernel.QueryInformationJobObject(self.job, 1, ctypes.byref(accounting),
                                                   ctypes.sizeof(accounting), None):
                raise ctypes.WinError(ctypes.get_last_error())
            if not accounting.active:
                return
            if time.monotonic() >= deadline:
                raise RuntimeError('Abbruch der Windows-Auftragsgruppe ausstehend')
            time.sleep(.01)

    def close(self):
        try:
            if _winapi.WaitForSingleObject(self.process, 5000) == _winapi.WAIT_TIMEOUT:
                raise RuntimeError('Abschluss des Windows-Prozesses ausstehend')
        finally:
            self.handles.close()
