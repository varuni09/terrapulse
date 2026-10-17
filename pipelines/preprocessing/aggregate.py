import numpy as np


def aggregate_by_cell(ids, values, valid, eligible, n_cells):
    """Per-cell statistics over valid pixels.

    ids: int raster of cell indices (-1 = outside every cell)
    valid: pixels usable for this metric; eligible: pixels that COULD be valid (land, has data)
    Returns arrays: mean, median, p90, n_valid, n_eligible. Cells with no valid pixels get NaN, never 0.
    """
    ids = ids.ravel()
    values = values.ravel()
    inside = ids >= 0
    eligible = eligible.ravel() & inside
    valid = valid.ravel() & eligible & np.isfinite(values)

    n_elig = np.bincount(ids[eligible], minlength=n_cells)
    n_valid = np.bincount(ids[valid], minlength=n_cells)
    mean = np.full(n_cells, np.nan)
    median = np.full(n_cells, np.nan)
    p90 = np.full(n_cells, np.nan)

    vi, vv = ids[valid], values[valid]
    order = np.argsort(vi, kind="stable")
    vi, vv = vi[order], vv[order]
    bounds = np.searchsorted(vi, np.arange(n_cells + 1))
    for c in range(n_cells):
        s, e = bounds[c], bounds[c + 1]
        if e > s:
            seg = vv[s:e]
            mean[c], median[c], p90[c] = seg.mean(), np.median(seg), np.percentile(seg, 90)
    return mean, median, p90, n_valid, n_elig
