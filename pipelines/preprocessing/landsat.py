"""Landsat Collection 2 Level-2 helpers (Landsat 8/9 only: do not mix sensors).

Scale factors and QA_PIXEL bit meanings come from the USGS Collection 2 Level-2
Science Product Guide. Re-verify them there if you change products.
"""
import numpy as np

# QA_PIXEL bits (Landsat 8/9)
FILL, DILATED, CIRRUS, CLOUD, SHADOW, SNOW, CLEAR, WATER = (1 << i for i in range(8))
BAD = FILL | DILATED | CIRRUS | CLOUD | SHADOW | SNOW


def qa_masks(qa: np.ndarray) -> dict[str, np.ndarray]:
    qa = qa.astype(np.uint16)
    return {
        "fill": (qa & FILL) > 0,
        "clear": (qa & BAD) == 0,   # no fill, cloud, dilated cloud, cirrus, shadow or snow
        "water": (qa & WATER) > 0,
    }


def reflectance(dn: np.ndarray) -> np.ndarray:
    """Surface reflectance = DN * 0.0000275 - 0.2. DN 0 = no data; out-of-range -> NaN."""
    r = dn.astype("float64") * 0.0000275 - 0.2
    r[(dn == 0) | (r < 0) | (r > 1)] = np.nan
    return r


def lst_celsius(dn: np.ndarray) -> np.ndarray:
    """Surface temperature (K) = DN * 0.00341802 + 149.0. DN 0 = no data.
    Implausible values (outside 240-350 K) -> NaN. This is LAND SURFACE temperature, not air temperature."""
    k = dn.astype("float64") * 0.00341802 + 149.0
    k[(dn == 0) | (k < 240) | (k > 350)] = np.nan
    return k - 273.15
