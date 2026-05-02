# NeuroWatch

Creator-focused web app: the **landing** is served at `/`, and **NeuroWatch Studio** is at `/studio`. Upload a 10-90 second video, run [TRIBE v2](https://huggingface.co/facebook/tribev2) when available (or a demo-safe proxy), and get a pre-upload editing report with hook score, stale sections, top moments, a suggested 15-second cut, and timestamped creator advice.

## Quick start (UI + demo-safe NeuroWatch report)

Python **3.9+** works for the demo-safe app. From repo root:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
export TRIBE_DEMO=1
.venv/bin/python -m uvicorn main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173` for the landing page or `http://localhost:5173/studio` for the upload dashboard. With `TRIBE_DEMO=1`, the API uses synthetic brain-style traces so you can test the full creator workflow without the full model stack.

`GET http://127.0.0.1:8000/api/health` reports the active backend mode:

- `demo`: local demo-safe proxy
- `remote_tribe`: local FastAPI forwarding uploads to a GPU TRIBE backend
- `local_tribe`: local machine attempting real TRIBE inference

## Real TRIBE v2 via remote GPU (recommended)

Do **not** copy the whole TRIBE v2 repository into this app. NeuroWatch keeps only a tiny adapter in [`backend/tribe_runner.py`](backend/tribe_runner.py) and expects real TRIBE v2 to be installed on a remote GPU runtime.

### 1. Start a GPU runtime

Use Colab with a GPU runtime (T4 or better). Real TRIBE v2 requires Python **3.10+**, large model downloads, and Hugging Face access to gated model dependencies.

### 2. Install only what the remote runtime needs

In Colab:

```bash
apt-get update
apt-get install -y git-lfs ffmpeg
git lfs install

git clone https://github.com/Doppy258/eureka-hacks.git
cd eureka-hacks/backend

python -m pip install -r requirements.txt
python -m pip install "git+https://github.com/facebookresearch/tribev2.git"
huggingface-cli login
```

Use a Hugging Face **read** token and make sure you have accepted access terms for gated model dependencies such as LLaMA 3.2.

### 3. Run the remote TRIBE backend

Still on Colab/GPU:

```bash
unset TRIBE_DEMO
export TRIBE_DEVICE=cuda
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Expose port `8000` with ngrok or Cloudflare Tunnel. The URL you need on your Mac must end with `/api/analyze`, for example:

```bash
export REMOTE_TRIBE_URL="https://YOUR-TUNNEL-HOST/api/analyze"
```

### 4. Run the local Mac app as a lightweight bridge

On your Mac:

```bash
cd /Users/lucas/Documents/eureka-hacks/backend
source .venv/bin/activate
unset TRIBE_DEMO
export REMOTE_TRIBE_URL="https://YOUR-TUNNEL-HOST/api/analyze"
.venv/bin/python -m uvicorn main:app --reload --port 8000
```

In another terminal:

```bash
cd /Users/lucas/Documents/eureka-hacks/frontend
npm run dev
```

Flow: browser → local FastAPI saves the upload → local FastAPI forwards the file to Colab → Colab runs TRIBE v2 → local FastAPI adds the NeuroWatch creator report → browser displays the dashboard.

## 8 GB Mac (or any low-RAM machine) + Google Colab GPU

**Yes:** keep the **Vite UI + lightweight FastAPI on your Mac**, run **TRIBE on Colab** (or any GPU box), and bridge them with a tunnel.

1. **On Colab:** create a GPU runtime (e.g. T4), install this repo’s backend + TRIBE (`pip install -r requirements.txt` and the TRIBE git install), `huggingface-cli login`, then start the same API:

   ```bash
   cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
   ```

2. **Expose port 8000 to the internet.** The supported path in this repo is **[ngrok](https://ngrok.com/)** (official agent): see [`notebooks/colab_tribe_backend.ipynb`](notebooks/colab_tribe_backend.ipynb) (cells **4b** + **5**) which installs ngrok via **apt** on Colab, runs `ngrok config add-authtoken …`, then `ngrok http 8000`, and prints `export REMOTE_TRIBE_URL="https://…/api/analyze"`.

   Alternatively you can use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) (`cloudflared tunnel --url http://127.0.0.1:8000`) if you prefer; you still need an **HTTPS** URL ending in `/api/analyze` for the Mac backend.

3. **On your Mac** (do **not** set `REMOTE_TRIBE_URL` inside Colab—that would loop). Only the Mac backend uses the tunnel:

   ```bash
   export REMOTE_TRIBE_URL="https://YOUR-TUNNEL-HOST/api/analyze"
   unset TRIBE_DEMO
   cd backend && source .venv/bin/activate
   pip install -r requirements.txt   # includes httpx for forwarding
   python -m uvicorn main:app --reload --port 8000
   ```

   Flow: browser → Mac API saves the upload → Mac **forwards the file** to Colab → Colab runs TRIBE → JSON comes back → Mac still **serves the video** from disk at `/api/video/{job_id}`.

4. **Caveats:** Colab free sessions **disconnect**; tunnel URLs **change** unless you pay/configure a fixed domain; first inference is **slow**; upload a **short** clip while testing. Increase wait time if needed: `REMOTE_TRIBE_TIMEOUT_SEC=7200`.

`GET /api/health` on the Mac reports `"mode": "remote_tribe"` when `REMOTE_TRIBE_URL` is set.

### Google Colab extension (VS Code / Cursor)

The official **Colab** extension runs notebook code on **Colab GPUs**, but it still does **not** expose a public HTTP URL by itself. Use the repo notebook to start **uvicorn + ngrok** on the Colab VM, then paste the printed URL into `REMOTE_TRIBE_URL` on your Mac:

- Notebook: [`notebooks/colab_tribe_backend.ipynb`](notebooks/colab_tribe_backend.ipynb)

1. Install the **Colab** extension, open that notebook from this repo, choose a **Colab GPU** kernel, run all cells **in order** (through cell 5).
2. Add a Colab **Secret** named **`HF_TOKEN`** (HF read token) so the HF cell is instant; or paste when prompted. Optional: set `TRIBE_HF_LOGIN=1` only if you need slow `huggingface_hub.login()` Hub validation. Enter **ngrok** authtoken when prompted ([Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken); **rotate** any token ever pasted into chat or committed to git).
3. Edit `REPO_URL` in the notebook to your GitHub fork (or use the zip path described in the notebook).

The Mac backend adds `ngrok-skip-browser-warning` automatically when the remote URL looks like ngrok, so forwarded uploads are less likely to hit the free-tier interstitial.

### Ngrok helper (any machine where the agent runs)

If `ngrok http 8000` is running locally, you can print the same export line from ngrok’s inspect API (`http://127.0.0.1:4040`):

```bash
python scripts/ngrok_print_analyze_url.py
```

## Full TRIBE v2 inference

1. Accept the gated [Llama 3.2](https://huggingface.co/meta-llama/Llama-3.2-3B) license on Hugging Face and create a read token.
2. `huggingface-cli login` (or set `HF_TOKEN` / `HUGGING_FACE_HUB_TOKEN` in the environment).
3. Install TRIBE v2 from source on the GPU runtime (see the [model card](https://huggingface.co/facebook/tribev2) for dependencies; GPU strongly recommended):

   ```bash
   pip install "git+https://github.com/facebookresearch/tribev2.git"
   ```

4. Run the backend **without** `TRIBE_DEMO` (unset it if you exported it earlier). Optional env: `TRIBE_CACHE`, `TRIBE_REPO`, `TRIBE_DEVICE`, `TRIBE_UPLOAD_DIR`, `CORS_ORIGINS`.

`ffprobe` (from FFmpeg) improves reported duration when metadata is missing.

### Apple Silicon (M1 / M2 / M3)

Yes, you can run TRIBE on a Mac: PyTorch uses **MPS** (Metal). This repo resolves `TRIBE_DEVICE=auto` to **`mps`** when CUDA is unavailable and MPS is available (TRIBE upstream `auto` is CUDA-or-CPU only).

```bash
export TRIBE_DEVICE=auto   # or explicitly: mps | cpu | cuda
# If some ops fail on MPS, try:
# export PYTORCH_ENABLE_MPS_FALLBACK=1
```

Expect **large downloads** (checkpoint + Llama / V-JEPA / Wav2Vec stacks), **long first inference**, and **high RAM / unified memory** pressure (16 GB is tight; 24 GB+ is more comfortable). If MPS errors persist, fall back to `TRIBE_DEVICE=cpu` (slower but more compatible).

### Making “feedback” match the real model output

- The **timeline and charts** are already driven by **real TRIBE predictions** whenever `mode` is `tribe` (not demo / not fallback).
- The **bullet-point prose** is still **heuristic**: it summarizes peaks, flatness, and sector means. It is **not** a clinical readout and **not** “what a person’s brain did.”
- To make prose more **grounded**, you’d typically: (1) aggregate vertices with a **surface atlas** (e.g. Schaefer / Yeo on fsaverage5) and name networks from that table, and/or (2) feed **structured numeric summaries** into an LLM with strict instructions and citations to the paper—still interpretive, but tied to named systems.

Pull requests welcome if you want atlas-based region labels wired into this app.

## License note

TRIBE v2 is [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). This wrapper does not change upstream terms.
