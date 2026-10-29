import unittest
import copy
import native_google_results as proof

class PaletteProof(unittest.TestCase):
    def test_translucent_black_over_white_does_not_prove_dark(self):
        self.assertFalse(proof.rendered({'dark':True,'pcs':['2'],'backgrounds':['rgba(0,0,0,0.01)','rgb(255,255,255)']},True))
    def test_observed_opaque_palettes_still_qualify(self):
        for dark,color in [(True,'rgb(34,36,42)'),(False,'rgb(255,255,255)')]:
            self.assertTrue(proof.rendered({'dark':dark,'pcs':['2' if dark else '1'],'backgrounds':[color,'rgba(0,0,0,0)']},dark))
    def test_challenge_is_classified_before_toolbar_error(self):
        self.assertEqual(proof.operation_status({'challenged':True},{'error':'Website settings did not finish loading'}),'blocked-by-google-challenge')
        self.assertEqual(proof.operation_status({'challenged':False},{'error':'Wrong palette'}),'failed')
        self.assertEqual(proof.operation_status({'challenged':False},{'error':None}),'ready')

class PriorSearchProof(unittest.TestCase):
    def fixture(self):
        names=['Search has the requested real results page','Search remains on real results after saved-choice application']
        for mode in ['light','dark','light']:
            names+=['Search renders '+mode,'Search preserves real search results and result type','Search leaves browser default Dark']
        sample={'stage':'Search light','origin':'https://www.google.com','path':'/search','query':'flowers','images':False,'search':True,'results':True,'dark':False,'pcs':['1'],'backgrounds':['rgb(255,255,255)']}
        return {'sourceSHA256':'fixture-sha','checks':[{'name':n,'pass':True} for n in names],'samples':[copy.deepcopy(sample),copy.deepcopy(sample)]}
    def test_completed_search_can_be_reused_despite_later_images_failure(self):
        r=self.fixture();r['checks'].append({'name':'Images has the requested real results page','pass':False});r['status']='failed'
        proof.verify_prior_search(r,'fixture-sha')
    def test_failed_or_incomplete_search_cannot_be_skipped(self):
        for kind in ['false','missing','reordered']:
            r=self.fixture()
            if kind=='false':r['checks'][5]['pass']=False
            if kind=='missing':r['checks'].pop()
            if kind=='reordered':r['checks'][2],r['checks'][3]=r['checks'][3],r['checks'][2]
            with self.assertRaises(RuntimeError):proof.verify_prior_search(r,'fixture-sha')
    def test_different_package_or_bad_light_sample_cannot_be_reused(self):
        with self.assertRaises(RuntimeError):proof.verify_prior_search(self.fixture(),'changed-sha')
        for kind in ['wrong-route','wrong-palette','missing']:
            r=self.fixture()
            if kind=='wrong-route':r['samples'][0]['path']='/sorry/index'
            if kind=='wrong-palette':r['samples'][0]['backgrounds']=['rgb(34,34,34)']
            if kind=='missing':r['samples'].pop()
            with self.assertRaises(RuntimeError):proof.verify_prior_search(r,'fixture-sha')

if __name__=='__main__':unittest.main()
