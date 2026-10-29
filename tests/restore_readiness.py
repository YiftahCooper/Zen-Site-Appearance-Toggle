"""Native favicon fixture readiness; never treats rendering success as readiness."""

class RestoredIconReadiness:
    def __init__(self, url):
        self.url = url
        self.document = None
        self.samples = 0

    def observe(self, state):
        ready = (not state['pending'] and not state['loading']
                 and state['newDocument'] and bool(state['documentId'])
                 and state['documentURL'] == self.url
                 and state['stockSource'] and state['hasNativeSource'])
        if not ready:
            self.document = None
            self.samples = 0
            return False
        if state['documentId'] != self.document:
            self.document = state['documentId']
            self.samples = 0
        self.samples += 1
        return self.samples >= 3
