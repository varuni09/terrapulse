import numpy as np
from pipelines.indices.ndvi import ndvi


def test_basic_value():
    r = ndvi(np.array([0.5]), np.array([0.1]))
    assert np.isclose(r[0], 0.4 / 0.6)


def test_zero_denominator_is_nan():
    assert np.isnan(ndvi(np.array([0.0]), np.array([0.0]))[0])


def test_invalid_mask_is_nan():
    r = ndvi(np.array([0.5, 0.5]), np.array([0.1, 0.1]), np.array([True, False]))
    assert not np.isnan(r[0]) and np.isnan(r[1])


def test_range():
    rng = np.random.default_rng(0)
    r = ndvi(rng.uniform(0, 1, 1000), rng.uniform(0, 1, 1000))
    assert np.nanmin(r) >= -1 and np.nanmax(r) <= 1
