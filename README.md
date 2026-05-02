# TRIBE Studio

Web app: the **landing** (marketing page) is served at `/`, and **TRIBE Studio** (upload, timeline, feedback) is at `/studio`. Upload a video, run [TRIBE v2](https://huggingface.co/facebook/tribev2) (when installed), view a timeline of coarse predicted cortical sectors, and optional heuristic feedback.

## Quick start (UI + demo timeline)

Python **3.11+** recommended. From repo root:

```bash
cd backend && python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TRIBE_DEMO=1
python -m uvicorn main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`. With `TRIBE_DEMO=1`, the API uses synthetic brain-style traces so you can test the UI without the full model stack.

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

`GET /api/health` on the Mac reports `"remote_inference": true` when `REMOTE_TRIBE_URL` is set.

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
3. Install TRIBE v2 from source (see the [model card](https://huggingface.co/facebook/tribev2) for dependencies; GPU strongly recommended):

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
