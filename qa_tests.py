from pathlib import Path
from bs4 import BeautifulSoup
import tinycss2
import subprocess, json

root=Path(__file__).parent
errors=[]
for f in ['index.html','inspect.html','results.html','privacy.html','terms.html','refunds.html','cookies.html','contact.html','disclaimer.html']:
  soup=BeautifulSoup((root/f).read_text(), 'html.parser')
  ids=[x.get('id') for x in soup.select('[id]')]
  if len(ids)!=len(set(ids)): errors.append(f'{f}: duplicate IDs')
  for el in soup.select('[href],[src]'):
    loc=el.get('href') or el.get('src') or ''
    if loc.startswith(('./','../')):
      dest=(root/f).parent/loc.split('#')[0].split('?')[0]
      if not dest.exists():errors.append(f'{f}: missing {loc}')
  print(f'{f}: {len(ids)} IDs, {len(soup.select("a"))} links')
for f in ['styles.css','inspect.css','analysis.css']:
  css=tinycss2.parse_stylesheet((root/f).read_text(), skip_whitespace=True,skip_comments=True)
  failures=[c for c in css if c.type=='error']
  if failures:errors.append(f'{f}: parse errors {failures}')
  print(f'{f}: {len(css)} CSS rules')
for f in ['script.js','analysis.js','audit-core.js','results.js','api/inspect.mjs']:
  p=subprocess.run(['node','--check',str(root/f)],capture_output=True,text=True)
  if p.returncode:errors.append(f'{f}: {p.stderr[:250]}')
  print(f'{f}:', 'JavaScript syntax OK' if not p.returncode else 'FAILED')

script=r'''
const {validateURL,isPublicIP,review}=(await import('./api/inspect.mjs'))._test;
const privateIPs=['127.0.0.1','10.0.0.5','192.168.1.1','169.254.169.254','172.20.1.1','100.64.0.1','::1','fc00::1','fe80::1','2001:db8::1','::ffff:127.0.0.1'];
const publicIPs=['1.1.1.1','8.8.8.8','2606:4700:4700::1111'];
for(const ip of privateIPs){if(isPublicIP(ip))throw Error('Unsafe IP allowed '+ip)}
for(const ip of publicIPs){if(!isPublicIP(ip))throw Error('Public IP blocked '+ip)}
for(const url of ['http://localhost','http://127.0.0.1','http://10.1.2.3','http://example.com:8080','http://user:pass@example.com','file:///etc/passwd','http://example.local']){
 let blocked=false;try{validateURL(url)}catch{blocked=true}if(!blocked)throw Error('Unsafe URL allowed '+url)
}
const good='<html lang="en"><head><title>Example Project - Landing page for makers</title><meta name="description" content="Details"/><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><h1>Real heading</h1><button>Get started</button><img src="x" alt="decorative" /></body></html>';
const bad='<html><head></head><body><img src="hero"/><p>Hello</p></body></html>';
const a=review(good,'https://example.com');if(a.issues.length)throw Error('False positives on clean fixture '+JSON.stringify(a));
const b=review(bad,'https://example.com');if(b.issues.length<4)throw Error('Expected evidence-based findings');
console.log('server-safe URL checks:',privateIPs.length+publicIPs.length+7,'passed; fixture findings:',b.issues.length);
'''
(root/'qa_security.mjs').write_text(script)
p=subprocess.run(['node','qa_security.mjs'],cwd=root,capture_output=True,text=True)
if p.returncode:errors.append('Security fixture: '+p.stderr)
else:print(p.stdout.strip())
print('QA RESULT:', 'PASS' if not errors else '\n'+'\n'.join(errors))
if errors:exit(1)
