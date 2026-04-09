const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { spawn } = require('child_process');

const TOOL_BASE_PATH = '/video-silence-remover';
const TOOL_ROOT = path.join(__dirname, 'public', 'video-silence-remover');
const TEMPLATE_DIR = path.join(TOOL_ROOT, 'templates');
const SCRIPT_PATH = path.join(TOOL_ROOT, 'video-remove-silence.py');
const WORK_ROOT = path.join(TOOL_ROOT, '_web_uploads');
const INCOMING_ROOT = path.join(WORK_ROOT, '_incoming');
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const JOB_ID_PATTERN = /^[a-f0-9]{32}$/;
const PYTHON_BIN = process.env.VIDEO_SILENCE_REMOVER_PYTHON_BIN
  || (process.platform === 'win32' ? 'python' : 'python3');
const FFPROBE_BIN = process.env.VIDEO_SILENCE_REMOVER_FFPROBE_BIN || 'ffprobe';
const MAX_LOG_LENGTH = 5000;
const PROGRESS_WEIGHTS = {
  extract: { base: 0, span: 5 },
  detect: { base: 5, span: 14 },
  process: { base: 22, span: 74 },
  merge: { base: 96, span: 3 },
};

const jobs = new Map();

fs.mkdirSync(INCOMING_ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, INCOMING_ROOT),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `Desteklenmeyen uzantı: ${ext || 'bilinmiyor'}`));
      return;
    }
    cb(null, true);
  },
});

function safeStem(name) {
  const stem = path.parse(name || '').name || 'video';
  return stem.replace(/[^\w.-]/g, '_').slice(0, 120) || 'video';
}

function getJobPaths(jobId) {
  const workDir = path.join(WORK_ROOT, jobId);
  const inputDir = path.join(workDir, 'input');
  return { workDir, inputDir };
}

function guessOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}_result${parsed.ext}`);
}

function getVideoMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
  }[ext] || 'video/mp4';
}

function scrubPipelineLog(text) {
  if (!text) {
    return '';
  }

  const cleaned = text
    .split(/\r?\n/)
    .filter((line) => !line.includes('__PROGRESS__'))
    .filter((line) => {
      const trimmed = line.trim().replace(/^_+/, '').trim();
      return !(trimmed.startsWith('{') && trimmed.includes('"phase"') && trimmed.includes('"current"'));
    })
    .join('\n')
    .trim();

  if (cleaned.length <= MAX_LOG_LENGTH) {
    return cleaned;
  }

  return cleaned.slice(-MAX_LOG_LENGTH);
}

function progressFromScript(phase, current, total) {
  const weight = PROGRESS_WEIGHTS[phase] || { base: 0, span: 100 };
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.min(Math.max(0, Number(current) || 0), safeTotal);
  const pct = weight.base + weight.span * (safeCurrent / safeTotal);
  return Math.min(99, Math.max(0, Math.round(pct)));
}

function estimateEtaSeconds(videoDurationSec, inputPath) {
  if (!Number.isFinite(videoDurationSec) || videoDurationSec <= 0) {
    return null;
  }

  let sizeMb = 0;
  try {
    if (inputPath && fs.existsSync(inputPath)) {
      sizeMb = fs.statSync(inputPath).size / (1024 * 1024);
    }
  } catch (_error) {
    sizeMb = 0;
  }

  const raw = videoDurationSec * 0.2 + Math.max(0, sizeMb) * 0.45 + 18;
  let eta = Math.max(28, raw);
  eta = Math.min(eta, Math.max(videoDurationSec * 0.85 + 120, videoDurationSec * 0.35 + 300));
  return eta;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function getVideoDurationSeconds(filePath) {
  const { stdout } = await runCommand(FFPROBE_BIN, [
    '-loglevel', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    filePath,
  ]);

  const parsed = JSON.parse(stdout);
  const videoStream = Array.isArray(parsed.streams)
    ? parsed.streams.find((stream) => stream.codec_type === 'video')
    : null;

  if (!videoStream) {
    return null;
  }

  if (videoStream.duration != null) {
    const duration = Number(videoStream.duration);
    return Number.isFinite(duration) ? duration : null;
  }

  const taggedDuration = videoStream.tags && videoStream.tags.DURATION;
  if (!taggedDuration) {
    return null;
  }

  const parts = String(taggedDuration).split(':').map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
}

function markJobCancelled(job) {
  job.status = 'cancelled';
  job.phase = 'cancelled';
  job.message = 'İptal edildi.';
}

async function finalizeSuccessfulJob(job, inputPath, outputPath, inputDurationSec) {
  let outputDurationSec = null;
  try {
    outputDurationSec = await getVideoDurationSeconds(outputPath);
  } catch (_error) {
    outputDurationSec = null;
  }

  let outputSizeBytes = null;
  try {
    outputSizeBytes = fs.statSync(outputPath).size;
  } catch (_error) {
    outputSizeBytes = null;
  }

  job.status = 'done';
  job.phase = 'complete';
  job.message = 'Hazır.';
  job.output_name = path.basename(outputPath);
  job.output_path = outputPath;
  job.finished_at = Date.now() / 1000;
  job.input_duration_sec = inputDurationSec;
  job.output_duration_sec = outputDurationSec;
  job.duration_saved_sec = (
    Number.isFinite(inputDurationSec) && Number.isFinite(outputDurationSec)
      ? Math.max(0, inputDurationSec - outputDurationSec)
      : null
  );
  job.output_size_bytes = outputSizeBytes;
}

function runPipeline(jobId, inputPath, extraArgs) {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  if (job.cancel_requested) {
    markJobCancelled(job);
    return;
  }

  Promise.resolve()
    .then(async () => {
      let inputDurationSec = null;
      try {
        inputDurationSec = await getVideoDurationSeconds(inputPath);
      } catch (_error) {
        inputDurationSec = null;
      }

      job.status = 'running';
      job.phase = 'processing';
      job.message = 'Video işleniyor…';
      job.started_at = Date.now() / 1000;
      job.video_duration_sec = inputDurationSec;
      job.eta_seconds = estimateEtaSeconds(inputDurationSec, inputPath);

      if (job.cancel_requested) {
        markJobCancelled(job);
        return;
      }

      const child = spawn(PYTHON_BIN, [SCRIPT_PATH, inputPath, ...extraArgs], {
        cwd: TOOL_ROOT,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      job.proc = child;

      const outputLines = [];
      let stdoutBuffer = '';
      let combinedOutput = '';

      const pushOutputLine = (line) => {
        const text = String(line || '').trim();
        if (!text) {
          return;
        }

        outputLines.push(text);
        if (outputLines.length > 400) {
          outputLines.shift();
        }

        if (text.startsWith('__PROGRESS__ ')) {
          try {
            const payload = JSON.parse(text.slice('__PROGRESS__ '.length));
            job.phase = String(payload.phase || 'processing');
            job.message = String(payload.message || 'Video işleniyor…');
            job.progress_percent_script = progressFromScript(payload.phase, payload.current, payload.total);
          } catch (_error) {
            // Geçersiz ilerleme satırlarını yok say.
          }
        }
      };

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        combinedOutput += text;
        stdoutBuffer += text;

        let newlineIndex = stdoutBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
          pushOutputLine(stdoutBuffer.slice(0, newlineIndex));
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          newlineIndex = stdoutBuffer.indexOf('\n');
        }
      });

      child.stderr.on('data', (chunk) => {
        combinedOutput += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        delete job.proc;
        job.status = 'error';
        job.phase = 'failed';
        job.message = 'İşlem başlatılamadı.';
        job.detail = error && error.code === 'ENOENT'
          ? `${PYTHON_BIN} komutu bulunamadı. Sunucuda Python 3 kurulu olmalı.`
          : (error.message || 'Bilinmeyen hata.');
      });

      child.on('close', async (code) => {
        delete job.proc;

        if (stdoutBuffer.trim()) {
          pushOutputLine(stdoutBuffer);
          stdoutBuffer = '';
        }

        if (job.cancel_requested) {
          markJobCancelled(job);
          return;
        }

        const outputPath = guessOutputPath(inputPath);
        if (code !== 0 || !fs.existsSync(outputPath)) {
          job.status = 'error';
          job.phase = 'failed';
          job.message = 'İşlem başarısız oldu.';
          job.detail = scrubPipelineLog(combinedOutput || outputLines.join('\n')) || 'Bilinmeyen hata.';
          return;
        }

        try {
          await finalizeSuccessfulJob(job, inputPath, outputPath, job.video_duration_sec);
        } catch (error) {
          job.status = 'error';
          job.phase = 'failed';
          job.message = 'Hata oluştu.';
          job.detail = error.message || 'Bilinmeyen hata.';
        }
      });

      if (job.cancel_requested && job.proc) {
        job.proc.kill('SIGTERM');
      }
    })
    .catch((error) => {
      delete job.proc;
      job.status = 'error';
      job.phase = 'failed';
      job.message = 'Hata oluştu.';
      job.detail = error.message || 'Bilinmeyen hata.';
    });
}

function getJob(jobId) {
  if (!JOB_ID_PATTERN.test(jobId)) {
    return { error: 'Geçersiz iş.', statusCode: 400 };
  }

  const job = jobs.get(jobId);
  if (!job) {
    return { error: 'İş bulunamadı.', statusCode: 404 };
  }

  return { job };
}

function registerVideoSilenceRemover(app) {
  app.use(TOOL_BASE_PATH, (req, res, next) => {
    const relativePath = decodeURIComponent(req.path || '/').replace(/^\/+/, '');
    const blocked = (
      relativePath === 'ffprobe.py'
      || relativePath === 'video-remove-silence.py'
      || relativePath === 'web_server.py'
      || relativePath === 'requirements-web.txt'
      || relativePath === '.gitignore'
      || relativePath === 'LICENSE'
      || relativePath.startsWith('__pycache__/')
      || relativePath.startsWith('templates/')
      || relativePath.startsWith('_web_uploads/')
    );

    if (blocked) {
      res.status(404).end();
      return;
    }

    next();
  });

  app.get(TOOL_BASE_PATH, (_req, res) => {
    res.redirect(301, `${TOOL_BASE_PATH}/`);
  });

  app.get([`${TOOL_BASE_PATH}/`, `${TOOL_BASE_PATH}/index.html`], (_req, res) => {
    res.sendFile(path.join(TEMPLATE_DIR, 'index.html'));
  });

  app.get(`${TOOL_BASE_PATH}/background.webp`, (_req, res) => {
    res.type('image/webp');
    res.sendFile(path.join(TEMPLATE_DIR, 'background.webp'));
  });

  app.get(`${TOOL_BASE_PATH}/wave-sound.png`, (_req, res) => {
    res.type('image/x-icon');
    res.sendFile(path.join(TEMPLATE_DIR, 'wave-sound.png'));
  });

  app.get(`${TOOL_BASE_PATH}/hakkimizda.html`, (_req, res) => {
    res.sendFile(path.join(TEMPLATE_DIR, 'hakkimizda.html'));
  });

  app.get(`${TOOL_BASE_PATH}/gizlilik-politikasi.html`, (_req, res) => {
    res.sendFile(path.join(TEMPLATE_DIR, 'gizlilik-politikasi.html'));
  });

  app.get(`${TOOL_BASE_PATH}/cerez-politikasi.html`, (_req, res) => {
    res.sendFile(path.join(TEMPLATE_DIR, 'cerez-politikasi.html'));
  });

  app.get(`${TOOL_BASE_PATH}/api/health`, (_req, res) => {
    res.json({
      ok: fs.existsSync(SCRIPT_PATH),
      hasScript: fs.existsSync(SCRIPT_PATH),
      pythonBin: PYTHON_BIN,
      ffprobeBin: FFPROBE_BIN,
    });
  });

  app.post(`${TOOL_BASE_PATH}/api/process`, (req, res) => {
    upload.single('file')(req, res, async (error) => {
      if (error) {
        if (req.file && req.file.path) {
          fs.rm(req.file.path, { force: true }, () => {});
        }

        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ error: 'Dosya boyutu 4 GB sınırını aşıyor.' });
            return;
          }

          if (error.field && error.code === 'LIMIT_UNEXPECTED_FILE') {
            res.status(400).json({ error: error.field });
            return;
          }
        }

        res.status(400).json({ error: error.message || 'Dosya yüklenemedi.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Dosya yok.' });
        return;
      }

      const ext = path.extname(req.file.originalname || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        fs.rm(req.file.path, { force: true }, () => {});
        res.status(400).json({ error: `Desteklenmeyen uzantı: ${ext || 'bilinmiyor'}` });
        return;
      }

      const jobId = crypto.randomBytes(16).toString('hex');
      const { workDir, inputDir } = getJobPaths(jobId);
      const inputPath = path.join(inputDir, `${safeStem(req.file.originalname)}${ext}`);

      try {
        fs.mkdirSync(inputDir, { recursive: true });
        fs.renameSync(req.file.path, inputPath);
      } catch (moveError) {
        fs.rm(workDir, { recursive: true, force: true }, () => {});
        fs.rm(req.file.path, { force: true }, () => {});
        res.status(500).json({ error: `Kayıt hatası: ${moveError.message}` });
        return;
      }

      const extraArgs = [];
      const thresholdLevel = req.body.threshold_level;
      const thresholdDuration = req.body.threshold_duration;

      if (thresholdLevel != null && String(thresholdLevel).trim() !== '') {
        const normalized = String(thresholdLevel).trim().replace(',', '.');
        const value = Number(normalized);
        if (!Number.isFinite(value)) {
          fs.rm(workDir, { recursive: true, force: true }, () => {});
          res.status(400).json({ error: 'Geçersiz sayı: threshold_level' });
          return;
        }
        if (value > 0 || value < -70) {
          fs.rm(workDir, { recursive: true, force: true }, () => {});
          res.status(400).json({ error: 'Ses eşiği -70 ile 0 arasında olmalıdır.' });
          return;
        }
        extraArgs.push('--threshold-level', normalized);
      }

      if (thresholdDuration != null && String(thresholdDuration).trim() !== '') {
        const normalized = String(thresholdDuration).trim().replace(',', '.');
        const value = Number(normalized);
        if (!Number.isFinite(value)) {
          fs.rm(workDir, { recursive: true, force: true }, () => {});
          res.status(400).json({ error: 'Geçersiz sayı: threshold_duration' });
          return;
        }
        if (value < 0 || value > 100) {
          fs.rm(workDir, { recursive: true, force: true }, () => {});
          res.status(400).json({ error: 'Minimum sessizlik süresi 0 ile 100 saniye arasında olmalıdır.' });
          return;
        }
        extraArgs.push('--threshold-duration', normalized);
      }

      jobs.set(jobId, {
        status: 'queued',
        phase: 'queued',
        message: 'Sırada…',
        created: Date.now() / 1000,
        input_name: req.file.originalname,
        cancel_requested: false,
      });

      runPipeline(jobId, inputPath, extraArgs);
      res.json({ job_id: jobId });
    });
  });

  app.get(`${TOOL_BASE_PATH}/api/status/:jobId`, (req, res) => {
    const { job, error, statusCode } = getJob(req.params.jobId);
    if (!job) {
      res.status(statusCode).json({ error });
      return;
    }

    const startedAt = job.started_at || job.created;
    const now = Date.now() / 1000;
    const elapsed = startedAt ? Math.max(0, now - Number(startedAt)) : null;
    const eta = Number.isFinite(job.eta_seconds) ? Number(job.eta_seconds) : null;
    let remaining = null;
    let progressPercent = job.progress_percent_script;
    let etaExceeded = false;

    if (progressPercent == null && job.status === 'running' && elapsed != null && eta != null && eta > 0) {
      remaining = Math.max(0, eta - elapsed);
      progressPercent = Math.min(99, Math.max(0, Math.round((100 * elapsed) / eta)));
      etaExceeded = elapsed > eta;
    }

    res.json({
      status: job.status,
      phase: job.phase,
      message: job.message,
      detail: job.detail,
      output_name: job.output_name,
      elapsed_seconds: elapsed != null ? Number(elapsed.toFixed(1)) : null,
      remaining_seconds: remaining != null ? Number(remaining.toFixed(1)) : null,
      progress_percent: progressPercent,
      eta_known: eta != null && job.progress_percent_script == null,
      eta_exceeded: etaExceeded,
      input_duration_sec: job.input_duration_sec ?? null,
      output_duration_sec: job.output_duration_sec ?? null,
      duration_saved_sec: job.duration_saved_sec ?? null,
      output_size_bytes: job.output_size_bytes ?? null,
    });
  });

  app.post(`${TOOL_BASE_PATH}/api/cancel/:jobId`, (req, res) => {
    const { job, error, statusCode } = getJob(req.params.jobId);
    if (!job) {
      res.status(statusCode).json({ error });
      return;
    }

    if (!['queued', 'running'].includes(job.status)) {
      res.status(400).json({ error: 'Bu iş iptal edilemez.' });
      return;
    }

    job.cancel_requested = true;
    if (job.proc) {
      job.proc.kill('SIGTERM');
    }

    res.json({ ok: true });
  });

  app.get(`${TOOL_BASE_PATH}/api/download/:jobId`, (req, res) => {
    const { job, error, statusCode } = getJob(req.params.jobId);
    if (!job) {
      res.status(statusCode).json({ error });
      return;
    }

    if (job.status !== 'done' || !job.output_path || !fs.existsSync(job.output_path)) {
      res.status(400).json({ error: 'Dosya hazır değil.' });
      return;
    }

    res.download(job.output_path, job.output_name || path.basename(job.output_path));
  });

  app.get(`${TOOL_BASE_PATH}/api/preview/:jobId`, (req, res) => {
    const { job, error, statusCode } = getJob(req.params.jobId);
    if (!job) {
      res.status(statusCode).json({ error });
      return;
    }

    if (job.status !== 'done' || !job.output_path || !fs.existsSync(job.output_path)) {
      res.status(400).json({ error: 'Dosya hazır değil.' });
      return;
    }

    res.type(getVideoMime(job.output_path));
    res.sendFile(job.output_path);
  });
}

module.exports = {
  registerVideoSilenceRemover,
};
