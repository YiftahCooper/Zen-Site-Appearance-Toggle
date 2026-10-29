import unittest
from restore_readiness import RestoredIconReadiness

class ReadinessTests(unittest.TestCase):
    def state(self, **changes):
        return dict(pending=False, loading=False, newDocument=True,
                    documentId='replacement-1', documentURL='https://github.com/octocat/Hello-World',
                    stockSource=True, hasNativeSource=True, **changes)

    def test_missing_source_resets_earlier_restored_signal(self):
        ready=RestoredIconReadiness('https://github.com/octocat/Hello-World')
        self.assertFalse(ready.observe(self.state()))
        blank=self.state();blank.update(stockSource=False,hasNativeSource=False)
        self.assertFalse(ready.observe(blank))
        self.assertEqual([ready.observe(self.state()) for _ in range(3)],[False,False,True])

    def test_each_native_readiness_condition_is_required(self):
        for key,value in [('pending',True),('loading',True),('newDocument',False),('documentId',None),('documentURL','about:blank'),('stockSource',False),('hasNativeSource',False)]:
            ready=RestoredIconReadiness('https://github.com/octocat/Hello-World')
            state=self.state();state[key]=value
            self.assertFalse(any(ready.observe(state) for _ in range(5)),key)

    def test_samples_from_different_documents_do_not_accumulate(self):
        ready=RestoredIconReadiness('https://github.com/octocat/Hello-World')
        for index in range(5):
            state=self.state();state['documentId']=str(index)
            self.assertFalse(ready.observe(state))

    def test_contrast_failure_is_not_hidden_by_readiness(self):
        ready=RestoredIconReadiness('https://github.com/octocat/Hello-World')
        state=self.state();state.update(filter='opacity(0.7)',marker=None)
        self.assertTrue([ready.observe(state) for _ in range(3)][-1])

if __name__=='__main__':unittest.main()
