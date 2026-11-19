import io,zipfile,base64,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).parent
buf=io.BytesIO()
with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('START HERE.txt','Welcome to this digital kit.\n'+('Open the templates and use the checklist.\n'*10))
 z.writestr('templates/checklist.md','# Checklist\n- Open file\n- Customize\n')
ZIP=base64.b64encode(buf.getvalue()).decode()
zip_empty=io.BytesIO()
with zipfile.ZipFile(zip_empty,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('empty-folder/','')
EMPTY=base64.b64encode(zip_empty.getvalue()).decode()
zip_long=io.BytesIO()
with zipfile.ZipFile(zip_long,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('nested/'+'a'*310+'/../escape.txt','Unsafe entry name after 300 characters')
LONG_NAME=base64.b64encode(zip_long.getvalue()).decode()
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page()
 page.set_content('<html><body>Product engine testing</body></html>')
 page.add_script_tag(content=(ROOT/'audit-core.js').read_text())
 def run(name,script):
  val=page.evaluate(script)
  print(name,json.dumps(val)[:600]);return val
 good=run('Markdown clear',"""async () => { const f=new File(['# Getting Started\\n\\n## Step One\\nFill in the details and export your file.'],'guide.md',{type:'text/markdown'}); let r=await VylensCore.productReview(f);return {checks:r.checksRun,issues:r.issues.map(x=>x.title),passes:r.checks.filter(x=>x.status==='passed').length};}""")
 assert good['checks']>=4 and good['passes']>0
 observed=run('Neutral observation',"""async () => {const r=await VylensCore.productReview(new File(['A short text note without section markers.'],'note.md'));return r.checks.find(x=>x.name==='Section heading markers').status;}""")
 assert observed=='observed',observed
 placeholder=run('Template markers',"""async () => { const f=new File(['# A TEMPLATE\\nTODO insert your company here.'],'template.md');let r=await VylensCore.productReview(f);return r.issues.map(x=>[x.title,x.severity]);}""")
 assert all(x[1]=='note' for x in placeholder)
 z=run('ZIP with guide',f"""async () => {{let a=Uint8Array.from(atob('{ZIP}'),c=>c.charCodeAt(0));let f=new File([a],'bundle.zip');let r=await VylensCore.productReview(f);return {{checks:r.checksRun,critical:r.issues.filter(x=>x.severity==='critical').length,detail:r.checks.filter(x=>x.name==='Instructions readability')}};}}""")
 assert z['critical']==0 and z['checks']>=7
 ze=run('Empty archive',f"""async () => {{let a=Uint8Array.from(atob('{EMPTY}'),c=>c.charCodeAt(0));let r=await VylensCore.productReview(new File([a],'empty.zip'));return r.issues.map(x=>[x.title,x.severity]);}}""")
 assert any(sev=='critical' for _,sev in ze)
 long_path=run('ZIP long traversal path',f"""async () => {{let a=Uint8Array.from(atob('{LONG_NAME}'),c=>c.charCodeAt(0));let r=await VylensCore.productReview(new File([a],'long-path.zip'));return r.issues.map(x=>x.title);}}""")
 assert 'Unsafe paths inside ZIP' in long_path,long_path
 paths=run('ZIP path normalization', r"""() => ['../escape.txt', String.raw`..\escape.txt`, String.raw`C:\temp\data.txt`, 'C:relative.txt', String.raw`\\server\share\x`, String.raw`assets\..\x`].map(x=>[x,VylensCore._test.unsafeZipPath(x)])""")
 assert all(x[1] for x in paths), paths
 ordinary=run('Normal ZIP path',"() => VylensCore._test.unsafeZipPath('templates/checklist.md')")
 assert ordinary is False
 svgpng=run('Image validation',"""async () => {const canvas=document.createElement('canvas');canvas.width=120;canvas.height=120;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const f=new File([blob],'icon.png',{type:'image/png'});let r=await VylensCore.productReview(f);return {detail:r.meta,checks:r.checksRun,notes:r.issues.map(x=>x.severity)};}""")
 assert '120' in svgpng['detail'] and svgpng['checks']>=3
 print('PASS: real Markdown/TXT structure, neutral observations, ZIP directory + guide extraction, long-name traversal defense, empty ZIP critical, image dimension scan')
 b.close()
