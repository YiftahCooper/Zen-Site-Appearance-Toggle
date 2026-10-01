import json, socket, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROFILE = None
PORT = 28793

class Client:
    def __init__(self):
        if PROFILE is None:
            raise RuntimeError('Caller must specify the exact disposable profile before connecting')
        self.sock = socket.create_connection(('127.0.0.1', PORT), timeout=5)
        self.sock.settimeout(45)
        self.buffer = b''
        self.seq = 0
        self.hello = self.read()
        session = self.command('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {}}})
        self.command('Marionette:SetContext', {'value': 'chrome'})
        identity = self.execute('return {profile:Services.dirsvc.get("ProfD",Ci.nsIFile).path,version:Services.appinfo.version,gecko:Services.appinfo.platformVersion,pid:Services.appinfo.processID};')
        if Path(identity['profile']).resolve() != PROFILE.resolve():
            self.sock.close()
            raise RuntimeError('Refusing to control unexpected profile')
        self.identity = identity

    def read(self):
        while b':' not in self.buffer:
            part = self.sock.recv(65536)
            if not part: raise EOFError('Marionette disconnected')
            self.buffer += part
        count, self.buffer = self.buffer.split(b':', 1)
        count = int(count)
        while len(self.buffer) < count:
            part = self.sock.recv(65536)
            if not part: raise EOFError('Marionette disconnected')
            self.buffer += part
        packet, self.buffer = self.buffer[:count], self.buffer[count:]
        return json.loads(packet)

    def command(self, name, params=None):
        self.seq += 1
        packet = json.dumps([0,self.seq,name,params or {}],separators=(',',':')).encode()
        self.sock.sendall(str(len(packet)).encode()+b':'+packet)
        response = self.read()
        if response[:2] != [1,self.seq]: raise RuntimeError(response)
        if response[2]: raise RuntimeError(response[2])
        return response[3]

    def execute(self, script, args=None):
        result = self.command('WebDriver:ExecuteScript', {'script':script,'args':args or [],'newSandbox':False,'sandbox':'system'})
        return result.get('value')

    def close(self):
        self.command('WebDriver:DeleteSession')
        self.sock.close()

if __name__ == '__main__':
    client = Client()
    try:
        script = Path(sys.argv[1]).read_text(encoding='utf-8') if len(sys.argv)>1 else 'return {tabs:gBrowser.tabs.length,workspaces:document.querySelectorAll("zen-workspace").length,folderAPI:typeof gZenFolders?.createFolder};'
        result = {'identity':client.identity,'result':client.execute(script)}
        print(json.dumps(result,indent=2))
    finally: client.close()
