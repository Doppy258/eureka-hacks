from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np


def _b64(a: np.ndarray) -> str:
    return base64.b64encode(a.tobytes(order="C")).decode("ascii")


def main() -> None:
    """
    One-time exporter for an fsaverage5 cortical surface mesh (both hemispheres).

    This script downloads FreeSurfer fsaverage surfaces via nilearn, converts them
    to a compact JSON format with base64-encoded typed arrays, and writes:
      backend/static/fsaverage5_mesh.json

    Install deps (one-time):
      pip install nilearn nibabel
    """
    try:
        from nilearn.datasets import fetch_surf_fsaverage
        from nibabel import load as nib_load
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Missing optional deps. Install with:\n  pip install nilearn nibabel\n\n"
            f"Import error: {e}"
        ) from e

    fsavg = fetch_surf_fsaverage("fsaverage5")

    def read_gifti_surf(path: str) -> tuple[np.ndarray, np.ndarray]:
        img = nib_load(path)
        if not hasattr(img, "darrays") or len(img.darrays) < 2:
            raise RuntimeError(f"Unexpected GIFTI surface: {path}")
        coords = np.asarray(img.darrays[0].data, dtype=np.float32, order="C")
        faces = np.asarray(img.darrays[1].data, dtype=np.int32, order="C")
        if coords.ndim != 2 or coords.shape[1] != 3:
            raise RuntimeError(f"Unexpected coords shape {coords.shape} for {path}")
        if faces.ndim != 2 or faces.shape[1] != 3:
            raise RuntimeError(f"Unexpected faces shape {faces.shape} for {path}")
        return coords, faces

    lh_v, lh_f = read_gifti_surf(fsavg["pial_left"])
    rh_v, rh_f = read_gifti_surf(fsavg["pial_right"])

    out = {
        "name": "fsaverage5",
        "format_version": 1,
        "dtype_vertices": "float32",
        "dtype_faces": "int32",
        "vertex_count_per_hemi": int(lh_v.shape[0]),
        "lh": {"vertices_b64": _b64(lh_v), "faces_b64": _b64(lh_f)},
        "rh": {"vertices_b64": _b64(rh_v), "faces_b64": _b64(rh_f)},
    }

    target = Path(__file__).resolve().parents[1] / "static" / "fsaverage5_mesh.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out), encoding="utf-8")
    print(f"Wrote {target} ({target.stat().st_size / (1024 * 1024):.2f} MB)")


if __name__ == "__main__":
    main()

