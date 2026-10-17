import numpy as np
from pipelines.preprocessing.landsat import qa_masks, reflectance, lst_celsius, CLOUD, WATER, FILL, SHADOW
from pipelines.preprocessing.aggregate import aggregate_by_cell


def test_qa_masks():
    qa = np.array([0, CLOUD, WATER, FILL, SHADOW, 64], dtype=np.uint16)
    m = qa_masks(qa)
    assert list(m["clear"]) == [True, False, True, False, False, True]
    assert list(m["water"]) == [False, False, True, False, False, False]
    assert list(m["fill"]) == [False, False, False, True, False, False]


def test_lst_conversion_and_nodata():
    dn = np.array([0, 44000, 1])
    out = lst_celsius(dn)
    assert np.isnan(out[0]) and np.isnan(out[2])
    assert np.isclose(out[1], 44000 * 0.00341802 + 149.0 - 273.15)
    assert 20 < out[1] < 40  # plausible tropical surface temperature


def test_reflectance_range():
    r = reflectance(np.array([0, 20000, 65000]))
    assert np.isnan(r[0]) and np.isnan(r[2]) and 0 < r[1] < 1


def test_aggregate_missing_is_nan_not_zero():
    ids = np.array([[0, 0, 1, 1], [0, 0, 1, 1]])
    vals = np.array([[10., 20., 30., 40.], [10., 20., 30., 40.]])
    valid = np.array([[1, 1, 0, 0], [1, 1, 0, 0]], dtype=bool)
    elig = np.ones_like(valid)
    mean, med, p90, nv, ne = aggregate_by_cell(ids, vals, valid, elig, 2)
    assert mean[0] == 15 and np.isnan(mean[1])
    assert list(nv) == [4, 0] and list(ne) == [4, 4]


def test_aggregate_ignores_outside_cells():
    ids = np.array([[-1, 0]])
    mean, *_ = aggregate_by_cell(ids, np.array([[99., 5.]]), np.ones((1, 2), bool), np.ones((1, 2), bool), 1)
    assert mean[0] == 5
