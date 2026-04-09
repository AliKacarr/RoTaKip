#!/usr/bin/env python3
"""
Localhost web arayüzü: video yükle, video-remove-silence.py ile işle, sonucu indir.
video-remove-silence.py veya ffprobe.py değiştirilmez.
"""

import os
import json
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Optional, Tuple

from flask import Flask, abort, jsonify, render_template, request, send_file, send_from_directory

import ffprobe

BASE_DIR = Path(__file__).resolve().parent
SCRIPT_PATH = BASE_DIR / "video-remove-silence.py"
UPLOAD_ROOT = BASE_DIR / "_web_uploads"
MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024  # 4 GB

ALLOWED_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}

# Yalnızca arayüzde sunulan parametreler; diğerleri video-remove-silence.py varsayılanlarında kalır.
ALLOWED_FLOAT_KEYS = {
    "threshold_level": "--threshold-level",
    "threshold_duration": "--threshold-duration",
}

jobs_lock = threading.Lock()
jobs: dict = {}

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES


def _safe_stem(name: str) -> str:
    stem = Path(name).stem
    stem = re.sub(r"[^\w\-.]", "_", stem)
    return stem[:120] or "video"


def _job_paths(job_id: str) -> Tuple[Path, Path]:
    work = UPLOAD_ROOT / job_id
    return work, work / "input"


def _guess_output_path(input_path: Path) -> Path:
    name, ext = os.path.splitext(str(input_path))
    return Path(f"{name}_result{ext}")


def _estimate_eta_seconds(
    video_duration_sec: Optional[float], input_path: Optional[Path] = None
) -> Optional[float]:
    """Yerel işlem süresi tahmini: video süresi ve dosya boyutu (çözünürlük/bitrate ile ilişkili).

    Eski 3.5x süre + 90 sn tabanı çoğu dosyada gerçek süreden fazlaydı; tahmin süre ve MB ile
    ölçeklenir, üst sınır uzun videolarda makul kalır.
    """
    if video_duration_sec is None or video_duration_sec <= 0:
        return None
    d = float(video_duration_sec)
    size_mb = 0.0
    if input_path is not None:
        try:
            if input_path.is_file():
                size_mb = input_path.stat().st_size / (1024 * 1024)
        except OSError:
            size_mb = 0.0

    # Süre terimi: tipik iş yükü gerçek zamanın belirli bir oranı; boyut: decode/encode ek yükü
    raw = d * 0.2 + max(0.0, size_mb) * 0.45 + 18.0
    eta = max(28.0, raw)
    # Üst sınır: çok uzun videolarda aşırı kısa tahmini engelle
    eta = min(eta, max(d * 0.85 + 120.0, d * 0.35 + 300.0))
    return float(eta)


def _scrub_pipeline_log(text: str) -> str:
    """Hata detayında ilerleme satırlarını gösterme (stdout ile birleşince çok uzun oluyor)."""
    if not text:
        return ""
    lines = []
    for ln in text.splitlines():
        if "__PROGRESS__" in ln:
            continue
        s = ln.strip().lstrip("_").strip()
        if s.startswith("{") and '"phase"' in s and '"current"' in s:
            continue
        lines.append(ln)
    out = "\n".join(lines).strip()
    if len(out) > 5000:
        out = out[-5000:]
    return out


def _progress_from_script(phase: str, current: int, total: int) -> int:
    weights = {
        # Fazlar arasında boşluk bırakmıyoruz; böylece yüzde sıçraması azalır.
        "extract": (0, 5),
        "detect": (5, 14),
        "process": (22, 74),
        "merge": (96, 3),
    }
    base, span = weights.get(phase, (0, 100))
    total = max(1, int(total))
    current = min(max(0, int(current)), total)
    local_pct = current / total
    return int(min(99, max(0, round(base + span * local_pct))))


def _run_pipeline(job_id: str, input_path: Path, extra_args: list[str]) -> None:
    with jobs_lock:
        j0 = jobs.get(job_id)
        if not j0:
            return
        if j0.get("cancel_requested"):
            j0["status"] = "cancelled"
            j0["phase"] = "cancelled"
            j0["message"] = "İptal edildi."
            return

    started = time.time()
    video_dur = None
    try:
        video_dur = ffprobe.get_duration(str(input_path))
    except Exception:
        video_dur = None
    eta = _estimate_eta_seconds(video_dur, input_path)

    with jobs_lock:
        j1 = jobs.get(job_id)
        if not j1:
            return
        if j1.get("cancel_requested"):
            j1["status"] = "cancelled"
            j1["phase"] = "cancelled"
            j1["message"] = "İptal edildi."
            return
        j1["status"] = "running"
        j1["phase"] = "processing"
        j1["message"] = "Video işleniyor…"
        j1["started_at"] = started
        j1["video_duration_sec"] = video_dur
        j1["eta_seconds"] = eta

    cmd = [sys.executable, str(SCRIPT_PATH), str(input_path)] + extra_args
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"

    popen_kw: dict = dict(
        cwd=str(BASE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        bufsize=1,
    )
    if sys.platform == "win32":
        popen_kw["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    proc = subprocess.Popen(cmd, **popen_kw)

    with jobs_lock:
        j2 = jobs.get(job_id)
        if not j2:
            try:
                proc.terminate()
                proc.wait(timeout=30)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
            return
        if j2.get("cancel_requested"):
            try:
                proc.terminate()
                proc.wait(timeout=30)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
            j2["status"] = "cancelled"
            j2["phase"] = "cancelled"
            j2["message"] = "İptal edildi."
            return
        j2["proc"] = proc

    output_lines: list[str] = []
    timed_out = False
    deadline = time.time() + 60 * 60 * 6
    try:
        while True:
            if time.time() > deadline:
                timed_out = True
                try:
                    proc.kill()
                except Exception:
                    pass
                break
            line = proc.stdout.readline() if proc.stdout else ""
            if line:
                txt = line.strip()
                output_lines.append(txt)
                if txt.startswith("__PROGRESS__ "):
                    try:
                        payload = json.loads(txt[len("__PROGRESS__ "):])
                        phase = str(payload.get("phase") or "processing")
                        cur = int(payload.get("current") or 0)
                        total = int(payload.get("total") or 1)
                        msg = str(payload.get("message") or "Video işleniyor…")
                        with jobs_lock:
                            jp = jobs.get(job_id)
                            if jp and not jp.get("cancel_requested"):
                                jp["phase"] = phase
                                jp["message"] = msg
                                jp["progress_percent_script"] = _progress_from_script(phase, cur, total)
                    except Exception:
                        pass
                continue
            if proc.poll() is not None:
                break
            time.sleep(0.05)
        if proc.stdout:
            rest = proc.stdout.read() or ""
            for ln in rest.splitlines():
                output_lines.append(ln.strip())
        proc.wait(timeout=30)
    except Exception:
        pass
    finally:
        with jobs_lock:
            jf = jobs.get(job_id)
            if jf:
                jf.pop("proc", None)

    stdout = "\n".join(output_lines)
    stderr = ""
    if timed_out:
        with jobs_lock:
            jt = jobs.get(job_id)
            if jt and not jt.get("cancel_requested"):
                jt["status"] = "error"
                jt["phase"] = "failed"
                jt["message"] = "Zaman aşımı."
                jt["detail"] = "İşlem çok uzun sürdü."
        return

    with jobs_lock:
        jc = jobs.get(job_id)
        if not jc:
            return
        if jc.get("cancel_requested"):
            jc["status"] = "cancelled"
            jc["phase"] = "cancelled"
            jc["message"] = "İptal edildi."
            return

    out_path = _guess_output_path(input_path)
    err_text = (stderr or "") + (stdout or "")
    try:
        if proc.returncode != 0 or not out_path.is_file():
            with jobs_lock:
                jobs[job_id]["status"] = "error"
                jobs[job_id]["phase"] = "failed"
                jobs[job_id]["message"] = "İşlem başarısız oldu."
                scrubbed = _scrub_pipeline_log(err_text)
                jobs[job_id]["detail"] = scrubbed if scrubbed else "Bilinmeyen hata."
            return

        output_dur = None
        try:
            output_dur = ffprobe.get_duration(str(out_path))
        except Exception:
            output_dur = None

        input_dur = video_dur
        saved_sec = None
        if input_dur is not None and output_dur is not None:
            saved_sec = max(0.0, float(input_dur) - float(output_dur))

        output_size_bytes = None
        try:
            output_size_bytes = int(out_path.stat().st_size)
        except OSError:
            output_size_bytes = None

        with jobs_lock:
            jobs[job_id]["status"] = "done"
            jobs[job_id]["phase"] = "complete"
            jobs[job_id]["message"] = "Hazır."
            jobs[job_id]["output_name"] = out_path.name
            jobs[job_id]["output_path"] = str(out_path.resolve())
            jobs[job_id]["finished_at"] = time.time()
            jobs[job_id]["input_duration_sec"] = input_dur
            jobs[job_id]["output_duration_sec"] = output_dur
            jobs[job_id]["duration_saved_sec"] = saved_sec
            jobs[job_id]["output_size_bytes"] = output_size_bytes
    except Exception as exc:
        with jobs_lock:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["phase"] = "failed"
            jobs[job_id]["message"] = "Hata oluştu."
            jobs[job_id]["detail"] = str(exc)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/background.webp")
def template_background_webp():
    """templates/background.webp — politika sayfalarındaki arka plan görseli."""
    tf = Path(app.root_path) / (app.template_folder or "templates")
    if not (tf / "background.webp").is_file():
        abort(404)
    return send_from_directory(
        str(tf), "background.webp", mimetype="image/webp"
    )


@app.route("/hakkimizda.html")
def page_hakkimizda():
    return render_template("hakkimizda.html")


@app.route("/gizlilik-politikasi.html")
def page_gizlilik_politikasi():
    return render_template("gizlilik-politikasi.html")


@app.route("/cerez-politikasi.html")
def page_cerez_politikasi():
    return render_template("cerez-politikasi.html")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": SCRIPT_PATH.is_file()})


@app.route("/api/process", methods=["POST"])
def process():
    if "file" not in request.files:
        return jsonify({"error": "Dosya yok."}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Dosya adı boş."}), 400

    ext = Path(f.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"error": f"Desteklenmeyen uzantı: {ext}"}), 400

    job_id = uuid.uuid4().hex
    work_dir, input_dir = _job_paths(job_id)
    work_dir.mkdir(parents=True, exist_ok=True)
    stem = _safe_stem(f.filename)
    input_path = input_dir / f"{stem}{ext}"
    input_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        f.save(str(input_path))
    except Exception as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        return jsonify({"error": f"Kayıt hatası: {exc}"}), 500

    extra_args: list[str] = []
    for key, flag in ALLOWED_FLOAT_KEYS.items():
        val = request.form.get(key)
        if val is None or val == "":
            continue
        val_norm = val.replace(",", ".")
        try:
            num = float(val_norm)
        except ValueError:
            shutil.rmtree(work_dir, ignore_errors=True)
            return jsonify({"error": f"Geçersiz sayı: {key}"}), 400
        if key == "threshold_level":
            if num > 0 or num < -70:
                shutil.rmtree(work_dir, ignore_errors=True)
                return jsonify({"error": "Ses eşiği -70 ile 0 arasında olmalıdır."}), 400
        if key == "threshold_duration":
            if num < 0 or num > 100:
                shutil.rmtree(work_dir, ignore_errors=True)
                return jsonify(
                    {"error": "Minimum sessizlik süresi 0 ile 100 saniye arasında olmalıdır."}
                ), 400
        extra_args += [flag, val_norm]

    with jobs_lock:
        jobs[job_id] = {
            "status": "queued",
            "phase": "queued",
            "message": "Sırada…",
            "created": time.time(),
            "input_name": f.filename,
            "cancel_requested": False,
        }

    t = threading.Thread(target=_run_pipeline, args=(job_id, input_path, extra_args), daemon=True)
    t.start()

    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>", methods=["GET"])
def status(job_id):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        return jsonify({"error": "Geçersiz iş."}), 400
    with jobs_lock:
        j = jobs.get(job_id)
    if not j:
        return jsonify({"error": "İş bulunamadı."}), 404

    now = time.time()
    started_at = j.get("started_at") or j.get("created")
    elapsed = None
    if started_at:
        elapsed = max(0.0, now - float(started_at))

    eta = j.get("eta_seconds")
    remaining = None
    progress_percent = j.get("progress_percent_script")
    eta_exceeded = False
    if progress_percent is None and j.get("status") == "running" and elapsed is not None and eta is not None:
        eta_f = float(eta)
        remaining = max(0.0, eta_f - elapsed)
        progress_percent = int(min(99, max(0, round(100.0 * elapsed / eta_f))))
        eta_exceeded = elapsed > eta_f

    payload = {
        "status": j.get("status"),
        "phase": j.get("phase"),
        "message": j.get("message"),
        "detail": j.get("detail"),
        "output_name": j.get("output_name"),
        "elapsed_seconds": round(elapsed, 1) if elapsed is not None else None,
        "remaining_seconds": round(remaining, 1) if remaining is not None else None,
        "progress_percent": progress_percent,
        "eta_known": (eta is not None) and (j.get("progress_percent_script") is None),
        "eta_exceeded": eta_exceeded,
        "input_duration_sec": j.get("input_duration_sec"),
        "output_duration_sec": j.get("output_duration_sec"),
        "duration_saved_sec": j.get("duration_saved_sec"),
        "output_size_bytes": j.get("output_size_bytes"),
    }
    return jsonify(payload)


@app.route("/api/cancel/<job_id>", methods=["POST"])
def cancel_job(job_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        return jsonify({"error": "Geçersiz iş."}), 400
    with jobs_lock:
        j = jobs.get(job_id)
        if not j:
            return jsonify({"error": "İş bulunamadı."}), 404
        st = j.get("status")
        if st not in ("queued", "running"):
            return jsonify({"error": "Bu iş iptal edilemez."}), 400
        j["cancel_requested"] = True
        proc = j.get("proc")
    if proc is not None:
        try:
            proc.terminate()
        except Exception:
            pass
    return jsonify({"ok": True})


@app.route("/api/download/<job_id>", methods=["GET"])
def download(job_id):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        return jsonify({"error": "Geçersiz iş."}), 400
    with jobs_lock:
        j = jobs.get(job_id)
    if not j or j.get("status") != "done":
        return jsonify({"error": "Dosya hazır değil."}), 400
    path = j.get("output_path")
    if not path or not Path(path).is_file():
        return jsonify({"error": "Dosya bulunamadı."}), 404
    name = j.get("output_name") or Path(path).name
    return send_file(path, as_attachment=True, download_name=name)


def _video_mime(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".mp4": "video/mp4",
        ".m4v": "video/x-m4v",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
    }.get(ext, "video/mp4")


@app.route("/api/preview/<job_id>", methods=["GET"])
def preview_output(job_id: str):
    """İşlenmiş videoyu tarayıcıda oynatmak için (inline)."""
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        return jsonify({"error": "Geçersiz iş."}), 400
    with jobs_lock:
        j = jobs.get(job_id)
    if not j or j.get("status") != "done":
        return jsonify({"error": "Dosya hazır değil."}), 400
    path = j.get("output_path")
    if not path or not Path(path).is_file():
        return jsonify({"error": "Dosya bulunamadı."}), 404
    return send_file(
        path,
        mimetype=_video_mime(path),
        as_attachment=False,
        conditional=True,
    )


def main():
    if not SCRIPT_PATH.is_file():
        print("Hata: video-remove-silence.py bulunamadı:", SCRIPT_PATH, file=sys.stderr)
        sys.exit(1)
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    print("Tarayıcı: http://127.0.0.1:5050")
    app.run(host="127.0.0.1", port=5050, debug=False, threaded=True)


if __name__ == "__main__":
    main()
