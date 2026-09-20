import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from db import Database


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.db = Database(db_path=self.tmp / "test.db", refs_dir=self.tmp / "refs")
        self.db.init()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_create_and_get_profile(self):
        profile_id, created_at = self.db.create_profile("Jules")
        row = self.db.get_profile(profile_id)
        self.assertEqual(row["name"], "Jules")
        self.assertEqual(row["created_at"], created_at)

    def test_list_profiles_reports_swipe_counts(self):
        p1, _ = self.db.create_profile("Jules")
        p2, _ = self.db.create_profile("Sam")
        self.db.add_swipe(p1, "0108775015", liked=True)
        self.db.add_swipe(p1, "0110065001", liked=False)

        rows = {r["profile_id"]: r["n_swipes"] for r in self.db.list_profiles()}
        self.assertEqual(rows[p1], 2)
        self.assertEqual(rows[p2], 0)

    def test_reference_photos_round_trip_embeddings(self):
        profile_id, _ = self.db.create_profile("Jules")
        vec_a = np.random.default_rng(0).normal(size=512).astype(np.float32)
        vec_b = np.random.default_rng(1).normal(size=512).astype(np.float32)

        ref_id_a, rel_path_a = self.db.add_reference_photo(profile_id, vec_a)
        ref_id_b, rel_path_b = self.db.add_reference_photo(profile_id, vec_b)

        self.assertEqual(rel_path_a, f"{profile_id}/{ref_id_a}.jpg")
        self.assertEqual(rel_path_b, f"{profile_id}/{ref_id_b}.jpg")
        self.assertEqual(self.db.count_reference_photos(profile_id), 2)
        stacked = self.db.get_reference_embeddings(profile_id)
        self.assertEqual(stacked.shape, (2, 512))
        np.testing.assert_allclose(stacked[0], vec_a)
        np.testing.assert_allclose(stacked[1], vec_b)

    def test_no_reference_photos_returns_empty_matrix(self):
        profile_id, _ = self.db.create_profile("Jules")
        stacked = self.db.get_reference_embeddings(profile_id)
        self.assertEqual(stacked.shape, (0, 0))

    def test_swipes_never_repeat_and_are_excludable(self):
        profile_id, _ = self.db.create_profile("Jules")
        self.db.add_swipe(profile_id, "A1", liked=True)
        self.db.add_swipe(profile_id, "A2", liked=False)

        self.assertEqual(self.db.get_swiped_article_ids(profile_id), {"A1", "A2"})
        self.assertEqual(self.db.get_liked_article_ids(profile_id), ["A1"])
        self.assertEqual(self.db.get_disliked_article_ids(profile_id), ["A2"])
        self.assertEqual(self.db.count_swipes(profile_id), 2)
        self.assertEqual(self.db.count_liked(profile_id), 1)

    def test_re_swiping_same_article_overwrites_verdict(self):
        profile_id, _ = self.db.create_profile("Jules")
        self.db.add_swipe(profile_id, "A1", liked=True)
        self.db.add_swipe(profile_id, "A1", liked=False)

        self.assertEqual(self.db.count_swipes(profile_id), 1)
        self.assertEqual(self.db.get_disliked_article_ids(profile_id), ["A1"])

    def test_persists_across_reopen(self):
        profile_id, _ = self.db.create_profile("Jules")
        self.db.add_swipe(profile_id, "A1", liked=True)

        reopened = Database(db_path=self.tmp / "test.db", refs_dir=self.tmp / "refs")
        self.assertTrue(reopened.profile_exists(profile_id))
        self.assertEqual(reopened.count_swipes(profile_id), 1)


if __name__ == "__main__":
    unittest.main()
