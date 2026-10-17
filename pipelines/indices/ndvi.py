import numpy as np


def ndvi(nir: np.ndarray, red: np.ndarray, valid: np.ndarray | None = None,
         eps: float = 1e-6) -> np.ndarray:
    """NDVI = (NIR - Red) / (NIR + Red).

    Inputs must be surface reflectance from the SAME sensor/product.
    Invalid pixels (valid == False) and near-zero denominators become NaN,
    never 0, so missing data stays missing.
    """
    nir = nir.astype("float64")
    red = red.astype("float64")
    denom = nir + red
    ok = np.abs(denom) > eps
    if valid is not None:
        ok &= valid.astype(bool)
    out = np.full(nir.shape, np.nan)
    out[ok] = (nir[ok] - red[ok]) / denom[ok]
    return out
