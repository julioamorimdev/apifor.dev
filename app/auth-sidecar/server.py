#!/usr/bin/env python3
"""
auth-sidecar — dirige o `claude setup-token` (OAuth da assinatura Claude) num
PTY e grava as credenciais por conta em CLAUDE_CONFIG_DIR=/data/contas/<id>.

O `claude setup-token` usa UI de terminal (Ink) — exige um TTY real. Aqui
alocamos um pseudo-terminal, capturamos a URL de autorização que o CLI imprime
(hyperlink OSC-8), e quando o usuário cola o código de volta escrevemos no PTY.
Ao sair, a presença de <dir>/.credentials.json indica sucesso.

HTTP (stdlib, sem deps):
  POST   /accounts/{id}/start   -> {url}            inicia o fluxo, devolve URL OAuth
  POST   /accounts/{id}/code    {code} -> {ok,who}  envia o código colado
  POST   /accounts/{id}/cancel  -> {ok}             aborta o fluxo em andamento
  GET    /accounts/{id}         -> {connected,who}  status
  DELETE /accounts/{id}         -> {ok}             desconecta (remove credenciais)
  GET    /accounts              -> {data:[...]}     lista contas conectadas
  GET    /healthz               -> {ok}
"""
import fcntl
import json
import os
import pty
import re
import select
import shutil
import signal
import struct
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONTAS_DIR = os.environ.get("CONTAS_DIR", "/data/contas")
PORT = int(os.environ.get("PORT", "8090"))

# OSC-8 hyperlink: ESC ] 8 ; params ; URI  ST(ESC \)|BEL  — capturamos a URI.
OSC8 = re.compile(rb"\x1b\]8;[^;]*;(https://[^\x1b\x07]+)(?:\x1b\\|\x07)")
# URL crua (fallback quando o terminal quebra/não emite OSC-8 limpo).
RAW_URL = re.compile(rb"https://[^\s\x1b\x07\"']*oauth/authorize[^\s\x1b\x07\"']*")
AUTHORIZE = b"oauth/authorize"


def _extract_url(buf: bytes) -> str | None:
    """URL de autorização completa (com state=) do buffer: OSC-8 ou URL crua.
    Exige `state=` p/ não devolver URL truncada num chunk parcial (PKCE)."""
    for m in OSC8.finditer(buf):
        u = m.group(1)
        if AUTHORIZE in u and b"state=" in u:
            return u.decode("utf-8", "replace")
    best = None
    for m in RAW_URL.finditer(buf):
        u = m.group(0)
        if b"state=" in u and (best is None or len(u) > len(best)):
            best = u  # a mais longa tende a ser a completa
    return best.decode("utf-8", "replace") if best else None

# fluxos em andamento: id -> {"pid":int, "fd":int, "buf":bytes}
_flows: dict[str, dict] = {}
_lock = threading.Lock()


def conta_dir(acc_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", acc_id)
    return os.path.join(CONTAS_DIR, safe or "default")


def cred_path(acc_id: str) -> str:
    return os.path.join(conta_dir(acc_id), ".credentials.json")


def who(acc_id: str) -> str | None:
    """E-mail/identidade da conta, se as credenciais expuserem algo legível."""
    try:
        data = json.loads(open(cred_path(acc_id)).read())
        o = data.get("claudeAiOauth") or {}
        return o.get("account", {}).get("email") or o.get("subscriptionType") or "conta Claude"
    except Exception:
        return None


def token_path(acc_id: str) -> str:
    return os.path.join(conta_dir(acc_id), "oauth_token")


def is_connected(acc_id: str) -> bool:
    return os.path.exists(cred_path(acc_id)) or os.path.exists(token_path(acc_id))


# token impresso pelo `claude setup-token` (formato sk-ant-oat…).
TOKEN_RE = re.compile(r"sk-ant-oat[0-9A-Za-z]*-[A-Za-z0-9_-]{20,}")


def _capture_token(buf: bytes) -> str | None:
    """Extrai o token sk-ant-oat… da saída do CLI (escapes/box removidos)."""
    txt = buf.decode("utf-8", "replace")
    txt = re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x1b\\|\x07)?", "", txt)
    txt = re.sub(r"[^\x20-\x7e]+", " ", txt)  # remove box-drawing/controle
    m = TOKEN_RE.findall(txt)
    if not m:
        return None
    return max(m, key=len)  # a ocorrência completa


def _store_token(acc_id: str, token: str) -> None:
    """Grava o token: oauth_token (uso via CLAUDE_CODE_OAUTH_TOKEN) +
    .credentials.json (claudeAiOauth.accessToken, p/ leitores compatíveis)."""
    d = conta_dir(acc_id)
    os.makedirs(d, exist_ok=True)
    with open(token_path(acc_id), "w") as f:
        f.write(token)
    os.chmod(token_path(acc_id), 0o600)
    creds = {"claudeAiOauth": {"accessToken": token, "scopes": ["user:inference"],
                               "subscriptionType": "subscription"}}
    with open(cred_path(acc_id), "w") as f:
        json.dump(creds, f)
    os.chmod(cred_path(acc_id), 0o600)


def _drain(flow: dict) -> None:
    """Lê o PTY continuamente p/ o claude (UI Ink) nunca bloquear escrevendo.
    Acumula em flow['buf'] e sinaliza flow['done'] quando o processo sai."""
    fd = flow["fd"]
    while not flow["stop"].is_set():
        try:
            r, _, _ = select.select([fd], [], [], 0.5)
        except (OSError, ValueError):
            break
        if fd in r:
            try:
                chunk = os.read(fd, 8192)
            except OSError:
                break
            if not chunk:
                break
            with flow["buflock"]:
                flow["buf"] += chunk
        else:
            # nada a ler: confere se o processo terminou
            try:
                wpid, _ = os.waitpid(flow["pid"], os.WNOHANG)
                if wpid == flow["pid"]:
                    break
            except ChildProcessError:
                break
    flow["done"].set()


def start_flow(acc_id: str) -> dict:
    """Spawna `claude setup-token` num PTY, captura a URL OAuth e deixa uma
    thread drenando a saída (senão o CLI bloqueia e nunca lê o código)."""
    cancel_flow(acc_id)  # garante um fluxo por conta
    d = conta_dir(acc_id)
    os.makedirs(d, exist_ok=True)
    env = dict(os.environ)
    env["CLAUDE_CONFIG_DIR"] = d
    env["BROWSER"] = "true"   # impede tentativa de abrir navegador local
    env["COLUMNS"] = "400"    # PTY bem largo: a URL (~290 chars) cabe numa linha só
    env["LINES"] = "50"
    env["TERM"] = env.get("TERM") or "xterm-256color"
    env.pop("DISPLAY", None)

    pid, fd = pty.fork()
    if pid == 0:  # filho
        try:
            os.execvpe("claude", ["claude", "setup-token"], env)
        except Exception:
            os._exit(127)

    # PTY bem largo — sem isso o claude quebra a URL em linhas e a captura falha.
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 400, 0, 0))
    except Exception:
        pass

    buf = b""
    deadline = time.time() + 30
    url = None
    while time.time() < deadline:
        r, _, _ = select.select([fd], [], [], 1.0)
        if fd in r:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
            url = _extract_url(buf)
            if url:
                break
    if not url:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
        raise RuntimeError("não foi possível obter a URL de autorização do claude CLI")

    flow = {
        "pid": pid, "fd": fd, "buf": buf,
        "buflock": threading.Lock(),
        "stop": threading.Event(),
        "done": threading.Event(),
    }
    flow["thread"] = threading.Thread(target=_drain, args=(flow,), daemon=True)
    flow["thread"].start()  # passa a drenar daqui pra frente
    with _lock:
        _flows[acc_id] = flow
    return {"url": url}


def normalize_code(s: str) -> str:
    """Aceita `code#state`, só `code`, ou a URL de callback inteira
    (platform.claude.com/oauth/code/callback?code=..&state=..) e devolve o
    que o `claude setup-token` espera: `code#state`."""
    from urllib.parse import urlparse, parse_qs
    s = (s or "").strip()
    if s.startswith("http"):
        q = parse_qs(urlparse(s).query)
        code = (q.get("code") or [""])[0]
        state = (q.get("state") or [""])[0]
        if code and state:
            return code + "#" + state
        return code or s
    return s


def submit_code(acc_id: str, code: str) -> dict:
    """Escreve o código no PTY (a thread de drenagem cuida da leitura) e
    espera o CLI gravar as credenciais ou o processo terminar."""
    with _lock:
        flow = _flows.get(acc_id)
    if not flow:
        raise RuntimeError("nenhum fluxo de conexão em andamento — clique em Conectar de novo")
    fd = flow["fd"]
    text = normalize_code(code).encode()
    try:
        os.write(fd, text)          # 1) digita o código
        time.sleep(0.5)             # 2) deixa a UI Ink registrar o texto
        os.write(fd, b"\r")         # 3) Enter como evento próprio (senão não submete)
    except OSError as e:
        _reap(acc_id)
        raise RuntimeError("fluxo encerrado; reinicie a conexão (" + str(e) + ")")

    deadline = time.time() + 45
    err_seen = False
    enter_retries = 0
    last_enter = time.time()
    while time.time() < deadline:
        with flow["buflock"]:
            recent = bytes(flow["buf"][-4000:])
        # sucesso: o `setup-token` IMPRIME o token (não grava arquivo) — captura
        tok = _capture_token(recent)
        if tok:
            _store_token(acc_id, tok)
            _reap(acc_id)
            return {"ok": True, "who": who(acc_id)}
        if is_connected(acc_id):  # caso algum fluxo grave arquivo
            _reap(acc_id)
            return {"ok": True, "who": who(acc_id)}
        # falha rápida: o CLI mostrou erro de OAuth (código inválido / PKCE)
        if b"OAuth error" in recent or b"Press Enter to retry" in recent or b"status code 4" in recent:
            err_seen = True
            break
        # se nada reagiu em ~5s e ainda estamos no prompt, reenvia Enter
        if time.time() - last_enter > 5 and enter_retries < 3 and b"Paste code here" in recent:
            try:
                os.write(fd, b"\r")
            except OSError:
                break
            enter_retries += 1
            last_enter = time.time()
        if flow["done"].wait(0.4):  # processo saiu
            break
    # última chance: token pode ter aparecido no fim
    with flow["buflock"]:
        full = bytes(flow["buf"])
    tok = _capture_token(full)
    if tok:
        _store_token(acc_id, tok)
        _reap(acc_id)
        return {"ok": True, "who": who(acc_id)}
    raw = full[-800:]
    _reap(acc_id)
    tail = re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x1b\\|\x07)?|\r", " ", raw.decode("utf-8", "replace"))
    tail = re.sub(r"[^\x20-\x7e]+", " ", tail)
    tail = re.sub(r"\s+", " ", tail).strip()
    m = re.search(r"(OAuth error[^.]*\d{3}|status code \d{3})", tail)
    detail = m.group(1) if m else (tail[-180:] if tail else "sem resposta do CLI")
    hint = " — verifique se autorizou a MESMA janela aberta agora (não reabra/reconecte antes de colar)." if err_seen else ""
    raise RuntimeError("código rejeitado ou expirado: " + detail + hint)


def cancel_flow(acc_id: str) -> None:
    with _lock:
        flow = _flows.pop(acc_id, None)
    _kill(flow)


def _kill(flow: dict | None) -> None:
    if not flow:
        return
    flow.get("stop", threading.Event()).set()
    try:
        os.kill(flow["pid"], signal.SIGTERM)
    except Exception:
        pass
    t = flow.get("thread")
    if t:
        t.join(timeout=2)
    try:
        os.close(flow["fd"])
    except Exception:
        pass
    try:
        os.waitpid(flow["pid"], os.WNOHANG)
    except Exception:
        pass


def _reap(acc_id: str) -> None:
    with _lock:
        flow = _flows.pop(acc_id, None)
    _kill(flow)


def disconnect(acc_id: str) -> dict:
    cancel_flow(acc_id)
    shutil.rmtree(conta_dir(acc_id), ignore_errors=True)
    return {"ok": True}


def list_accounts() -> dict:
    out = []
    try:
        for name in sorted(os.listdir(CONTAS_DIR)):
            if is_connected(name):
                out.append({"id": name, "connected": True, "who": who(name)})
    except FileNotFoundError:
        pass
    return {"data": out}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return {}

    def log_message(self, *a):  # silencia log padrão
        pass

    def do_GET(self):
        if self.path == "/healthz":
            return self._send(200, {"ok": True})
        if self.path == "/accounts":
            return self._send(200, list_accounts())
        m = re.match(r"^/accounts/([^/]+)$", self.path)
        if m:
            acc = m.group(1)
            return self._send(200, {"connected": is_connected(acc), "who": who(acc)})
        self._send(404, {"error": "not_found"})

    def do_POST(self):
        try:
            m = re.match(r"^/accounts/([^/]+)/(start|code|cancel)$", self.path)
            if not m:
                return self._send(404, {"error": "not_found"})
            acc, action = m.group(1), m.group(2)
            if action == "start":
                return self._send(200, start_flow(acc))
            if action == "code":
                code = (self._body().get("code") or "").strip()
                if not code:
                    return self._send(400, {"error": "bad_request", "message": "código vazio"})
                return self._send(200, submit_code(acc, code))
            if action == "cancel":
                cancel_flow(acc)
                return self._send(200, {"ok": True})
        except Exception as e:
            return self._send(500, {"error": "internal", "message": str(e)})

    def do_DELETE(self):
        m = re.match(r"^/accounts/([^/]+)$", self.path)
        if m:
            return self._send(200, disconnect(m.group(1)))
        self._send(404, {"error": "not_found"})


if __name__ == "__main__":
    os.makedirs(CONTAS_DIR, exist_ok=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
