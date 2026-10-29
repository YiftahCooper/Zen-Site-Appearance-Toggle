"""Restore the pinned public Sine fixture; never installs Sine or starts Zen."""
import argparse,hashlib,json,pathlib,stat,urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]

def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only',action='store_true',help='Verify existing files without network access or writes')
    args=parser.parse_args()
    spec=json.loads((ROOT/'tools/sine-fixture.json').read_text(encoding='utf-8'))
    target=ROOT/'.backup-scratch/sine-fixture'
    for item in spec['files']:
        rel=pathlib.PurePosixPath(item['path'])
        if rel.is_absolute() or '..' in rel.parts or rel.parts[0]!='src':raise RuntimeError('Unsafe fixture path')
        dest=target.joinpath(*rel.parts)
        for parent in [dest,*dest.parents]:
            if parent==ROOT:break
            if parent.exists() and parent.stat(follow_symlinks=False).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:raise RuntimeError('Fixture path contains a link')
        if dest.exists():
            if blob(dest.read_bytes())!=item['gitBlobSHA1']:raise RuntimeError('Existing fixture differs: '+item['path']+'; preserve it before choosing a fresh fixture')
            continue
        if args.check_only:raise FileNotFoundError('Missing fixture: '+item['path'])
        url='https://raw.githubusercontent.com/'+spec['repository']+'/'+spec['commit']+'/'+item['path']
        with urllib.request.urlopen(url,timeout=30) as response:data=response.read()
        if blob(data)!=item['gitBlobSHA1']:raise RuntimeError('Downloaded fixture hash mismatch: '+item['path'])
        dest.parent.mkdir(parents=True,exist_ok=True)
        with dest.open('xb') as output:output.write(data)
    print('Pinned Sine fixture: '+str(len(spec['files']))+' files match '+spec['commit'])

if __name__=='__main__':main()
