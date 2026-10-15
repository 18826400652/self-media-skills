# bd 怎么找浏览器：项目配置 browser-draft.config.json 的 cdpPort / 环境变量 BD_CDP_PORT 优先于 DevToolsActivePort 文件。
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BD = Path(__file__).resolve().parents[1] / "bin" / "bd"
WS = "ws://127.0.0.1:{port}/devtools/browser/abc"


def serve():
    """假的浏览器调试端口：/json/version 返回 webSocketDebuggerUrl"""
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"webSocketDebuggerUrl": WS.format(port=self.server.server_port)}).encode()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def fake_harness(tmp_path):
    """假的 browser-harness：打印 bd 传给它的连接环境变量"""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    f = bin_dir / "browser-harness"
    f.write_text('#!/usr/bin/env bash\necho "WS=$BU_CDP_WS NAME=$BU_NAME"\n')
    f.chmod(0o755)
    return bin_dir


def run_tabs(tmp_path, cwd, extra_env=None):
    env = {k: v for k, v in os.environ.items() if k not in ("BU_CDP_WS", "BD_CDP_PORT", "BU_NAME")}
    env["PATH"] = f"{fake_harness(tmp_path)}:{env['PATH']}"
    env["BD_PORT_FILE"] = str(tmp_path / "没有这个文件")
    env.update(extra_env or {})
    return subprocess.run(["bash", str(BD), "tabs"], cwd=cwd, env=env, capture_output=True, text=True)


def test_project_config_port(tmp_path):
    srv = serve()
    project = tmp_path / "project"
    (project / "sub").mkdir(parents=True)
    (project / "browser-draft.config.json").write_text(json.dumps({"cdpPort": srv.server_port}))
    r = run_tabs(tmp_path, project / "sub")
    assert r.returncode == 0, r.stderr
    assert f"WS={WS.format(port=srv.server_port)}" in r.stdout
    assert "NAME=browser-draft" in r.stdout
    srv.shutdown()


def test_env_port_overrides_config(tmp_path):
    srv = serve()
    r = run_tabs(tmp_path, tmp_path, {"BD_CDP_PORT": str(srv.server_port)})
    assert r.returncode == 0, r.stderr
    assert f"WS={WS.format(port=srv.server_port)}" in r.stdout
    srv.shutdown()


def test_configured_port_not_listening_fails_clearly(tmp_path):
    (tmp_path / "browser-draft.config.json").write_text(json.dumps({"cdpPort": 1}))
    r = run_tabs(tmp_path, tmp_path)
    assert r.returncode == 1
    assert "1 端口" in r.stderr
