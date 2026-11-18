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
for f in ['styles.css','inspect.css','analysis.css','report.css']:
  css=tinycss2.parse_stylesheet((root/f).read_text(), skip_whitespace=True,skip_comments=True)
  failures=[c for c in css if c.type=='error']
  if failures:errors.append(f'{f}: parse errors {failures}')
  print(f'{f}: {len(css)} CSS rules')
for f in ['script.js','analysis.js','audit-core.js','results.js','api/inspect.mjs']:
  p=subprocess.run(['node','--check',str(root/f)],capture_output=True,text=True)
  if p.returncode:errors.append(f'{f}: {p.stderr[:250]}')
  print(f'{f}:', 'JavaScript syntax OK' if not p.returncode else 'FAILED')

p=subprocess.run(['node','qa_scanner.mjs'],cwd=root,capture_output=True,text=True)
if p.returncode:errors.append('Scanner fixture: '+p.stderr)
else:print(p.stdout.strip())
print('QA RESULT:', 'PASS' if not errors else '\n'+'\n'.join(errors))
if errors:exit(1)
