/* VYLENS PDF downloader: pure browser-generated file, not window.print(). */
(() => {
  'use strict';
  const cleaned=(value)=>String(value??'')
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"')
    .replace(/[\u2013\u2014\u2212]/g,'-').replace(/\u2022/g,'-')
    .replace(/\u2026/g,'...')
    .replace(/₹/g,'INR ').replace(/€/g,'EUR ').replace(/£/g,'GBP ')
    .replace(/¥/g,'JPY ').replace(/₩/g,'KRW ').replace(/₽/g,'RUB ')
    .replace(/₿/g,'BTC ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\x20-\x7e]/g,'?').replace(/\s+/g,' ').trim();
  const escaped=s=>cleaned(s).replace(/[\\()]/g,'\\$&');
  const safeName=s=>cleaned(s).toLowerCase().replace(/[^a-z0-9.-]+/g,'-')
    .replace(/^-+|-+$/g,'').slice(0,65)||'report';
  const build=()=>{
    const reportEl=document.getElementById('fiveReport');
    if(!reportEl)return null;
    const text=(sel,root=reportEl)=>root.querySelector(sel)?.textContent?.trim()||'';
    const list=(sel,root=reportEl)=>Array.from(root.querySelectorAll(sel));
    const W=595,H=842,M=44,MAX=W-2*M;
    const pages=[];let commands=[],y=H-68,page=0;
    const draw=(str,x,at,size=10,bold=false,color='0.21 0.27 0.20')=>{
      commands.push(color+' rg');
      commands.push('BT /'+(bold?'F2':'F1')+' '+size+
        ' Tf 1 0 0 1 '+x.toFixed(2)+' '+at.toFixed(2)+' Tm ('+escaped(str)+') Tj ET');
    };
    const rule=(Y)=>commands.push('0.87 0.90 0.85 RG 0.6 w '+M+' '+Y+
      ' m '+(W-M)+' '+Y+' l S');
    function pageStart(){
      if(page)pages.push(commands.join('\n'));
      page++;commands=[];y=H-70;
      commands.push('0.74 0.94 0.37 rg '+M+' '+(H-39)+' 28 5 re f');
      draw('VYLENS',M+36,H-39,16,true,'0.09 0.13 0.08');
      draw('CONVERSION REPORT',W-M-142,H-39,8,true,'0.43 0.51 0.40');
      rule(H-50);
    }
    function wrap(value,size=10,indent=0){
      const input=cleaned(value);if(!input)return [];
      const max=Math.max(18,Math.floor((MAX-indent)/(size*0.51)));
      const out=[];let cur='';
      for(let word of input.split(' ')){
        while(word.length>max){
          if(cur){out.push(cur);cur='';}
          out.push(word.slice(0,max-1)+'-');word=word.slice(max-1);
        }
        if(!cur)cur=word;
        else if((cur+' '+word).length<=max)cur+=' '+word;
        else{out.push(cur);cur=word;}
      }
      if(cur)out.push(cur);
      return out;
    }
    function paragraph(value,{size=10,bold=false,indent=0,gap=6,color='0.24 0.31 0.23'}={}){
      for(const line of wrap(value,size,indent)){
        if(y-size*1.55<55)pageStart();
        draw(line,M+indent,y,size,bold,color);y-=size*1.55;
      }
      y-=gap;
    }
    function section(title){
      if(y<133)pageStart();
      y-=6;paragraph(title,{size:14,bold:true,gap:10,color:'0.08 0.13 0.08'});
      rule(y+5);y-=14;
    }
    function entry(title,details){
      if(y<120)pageStart();
      paragraph(title,{size:11,bold:true,gap:7,color:'0.13 0.19 0.12'});
      details.filter(Boolean).forEach(s=>paragraph(s,{size:9.5,indent:9,gap:7}));
      y-=5;
    }
    let savedReport=null;
    try{savedReport=JSON.parse(sessionStorage.getItem('vylens:result')||'null');}catch{}
    const subject=String(savedReport?.subject||
      document.getElementById('reportSubject')?.textContent||'Public offer');
    const current=savedReport?.conversion?.version===1&&
      !!document.getElementById('signalReport');
    if(current){
      // The PDF reads exactly the same scan, not an older hidden dashboard.
      // Keep EVERY supported finding even when the compact UI shows only five.
      const report=savedReport;
      const data=report.conversion;
      const blockers=Array.isArray(data.blockers)?data.blockers.filter(x=>x&&x.title):[];
      const strengths=Array.isArray(data.strengths)?data.strengths.filter(x=>x&&x.title):[];
      const fixes=Array.isArray(data.fixKit)?data.fixKit.filter(x=>x&&x.kind==='copy'&&x.content):[];
      const unverified=Array.isArray(data.unverified)?data.unverified.filter(Boolean):[];
      const assessment=data.assessment?.version===1?data.assessment:null;
      const score=assessment?
        (Number.isFinite(assessment.overall)?assessment.overall:null):
        null;
      const unique=[],seen=new Set();
      blockers.forEach(item=>{
        const key=String(item.fingerprint||item.id||[item.stage,item.title].join('|')).toLowerCase();
        if(seen.has(key))return;
        seen.add(key);unique.push(item);
      });
      pageStart();
      paragraph(subject,{size:11,bold:true,color:'0.34 0.43 0.30'});
      paragraph('Your Conversion Report',{size:21,bold:true,gap:11,color:'0.08 0.12 0.08'});
      paragraph('Checked: '+String(report.checkedAt||'Not recorded').slice(0,10)+
        '   Type: '+(report.mode==='product'?'Digital product':'Website'),
        {size:9,gap:14,color:'0.38 0.46 0.37'});
      section(report.mode==='product'&&data.kind==='product+offer'?
        '1. Public Sales-Page Assessment':'1. Overall Offer Assessment');
      paragraph(score===null?'Score: Not enough evidence to assess':
        (report.mode==='product'?'Public sales-page offer score: ':'Estimated offer score: ')+score+' / 100',
        {size:13,bold:true,gap:9});
      paragraph(report.mode==='product'?
        'Any number shown assesses only available public offer evidence, not the quality of the delivered product, actual sales or buyer behavior.':
        'A review of available public offer evidence, NOT recorded sales or buyer behavior.',
        {size:9,gap:10});
      // Preserve the substantive offer context used by the current evaluator.
      // All descriptions below are excerpts from the inspected public pages.
      const understood=data.offerUnderstanding?.version===1?data.offerUnderstanding:null;
      if(understood){
        section('What We Could Understand About This Offer');
        if(understood.headline)paragraph('Headline: '+understood.headline,{size:9.5,gap:8});
        if(understood.prices?.length)paragraph('Visible price: '+understood.prices.join(' / '),{size:9.5,gap:8});
        const facts=[
          ['Buyer outcome',understood.outcomeExamples],
          ['Benefits',understood.benefitExamples],
          ['Included items',understood.includedExamples]
        ];
        for(const [label,items] of facts){
          if(!Array.isArray(items)||!items.length)continue;
          paragraph(label+' observed:',{size:10,bold:true,gap:6});
          items.slice(0,5).forEach(item=>
            paragraph('- '+String(item.text||'')+' ('+String(item.page||'/')+')',{size:9,gap:7}));
        }
        paragraph('Specific offer proof visible: '+(understood.proofSeen?'Yes, proof-like copy was present (authenticity not verified)':'Not confirmed')+
          '. Purchase conditions near buying action: '+(understood.termsNearAction?'Visible':'Not confirmed')+'.',
          {size:9,gap:9});
      }
      const sigNames={clarity:'Offer Clarity',value:'Value for Money',
        trust:'Buyer Trust',action:'Buying Process',purchase:'Purchase Confidence'};
      section('2. Your Buyer Signals');
      if(assessment&&Array.isArray(assessment.signals)){
        assessment.signals.forEach(item=>{
          const name=sigNames[item.key]||item.key||'Signal';
          const value=Number.isFinite(item.score)?item.score+' / 100':'Not checked';
          entry(name+' - '+value,[String(item.explanation||'').slice(0,260)]);
        });
      }else{
        paragraph('Older report: a score for these areas was not recorded.');
      }
      section("3. What's Stopping Buyers?");
      if(!unique.length)paragraph('No specific buyer obstacle was established in the completed checks.');
      unique.forEach((item,i)=>{
        const places=Array.isArray(item.affectedPages)&&item.affectedPages.length?
          item.affectedPages.slice(0,24).join(', '):item.location||'';
        entry((i+1)+'. '+item.title,[
          'Priority: '+String(item.priority||'review'),
          item.confidence==='observed'?'Seen during inspection':'Possible concern - verify',
          item.evidence?'Evidence: '+item.evidence:'',
          places?'Where: '+places:'',
        ]);
      });
      section('4. Why People May Hesitate');
      const questions=new Set();
      unique.forEach((item,i)=>{
        const q=String(item.buyerQuestion||item.buyerConcern||'').trim();
        if(!q||questions.has(q.toLowerCase()))return;
        questions.add(q.toLowerCase());
        paragraph((i+1)+'. '+q,{size:10,gap:8});
      });
      if(!questions.size)paragraph('No specific buyer concern was established from the available evidence.');
      paragraph('These are possible concerns inferred from the website, not quotes from real buyers.',
        {size:9,gap:9,color:'0.37 0.44 0.34'});
      section('5. Exactly What to Change');
      const fixables=unique.filter(item=>item.fix);
      if(!fixables.length)paragraph('There was not enough evidence to recommend a specific change.');
      fixables.forEach((item,i)=>entry((i+1)+'. '+item.title,[
        item.fix?'Change: '+item.fix:'',
        item.verify?'Check: '+item.verify:''
      ]));
      section('6. Better Copy and Rewrites');
      // Include only grounded copy suggestions, never a technical repair
      // mislabeled as new marketing wording.
      const proposed=new Map();
      unique.forEach(item=>{
        if(item.copyTo)proposed.set(String(item.copyTo).toLowerCase(),{
          title:'Suggested button wording',content:item.copyTo});
      });
      fixes.forEach(item=>proposed.set(String(item.content).toLowerCase(),item));
      if(!proposed.size)paragraph('No ready-to-use wording was supported by this scan.');
      [...proposed.values()].forEach((item,i)=>entry((i+1)+'. '+
        String(item.title||item.label||'Suggested wording'),[
          item.content, 'Check that the wording accurately describes the real offer.'
        ]));
      section('7. Your Priority Action Plan');
      if(!fixables.length)paragraph('No evidence-based action plan was available.');
      fixables.forEach((item,i)=>paragraph((i+1)+'. '+item.fix,{
        size:9.5,gap:8
      }));
      section("8. What's Already Working");
      if(!strengths.length)paragraph('No positive finding was confirmed in the completed checks.');
      strengths.forEach((item,i)=>entry((i+1)+'. '+item.title,[
        item.evidence||'',item.location?'Page: '+item.location:''
      ]));
      section('9. What Could Not Be Checked');
      if(!unverified.length)paragraph('No additional recorded limitations.');
      unverified.forEach(note=>paragraph('- '+note,{size:9,gap:7}));
      const ai=data.aiReview;
      if(ai?.status==='completed'&&Array.isArray(ai.signals)&&ai.signals.length){
        section('10. AI Evidence Review (Suggestions, Not Confirmed Problems)');
        paragraph('Suggestions interpreted from specific public observations'+
          (report.mode==='product'?' and limited locally extracted file findings':'')+
          '. AI did not verify purchases, buyer decisions, or actual lost sales.',
          {size:9,gap:9});
        ai.signals.slice(0,5).forEach((item,i)=>entry((i+1)+'. '+String(item.title||'Suggested review'),[
          item.evidence?'Captured evidence: '+item.evidence:'',
          item.location?'Source: '+item.location:'',
          item.fix?'Suggested change: '+item.fix:'',
          item.verify?'Verify: '+item.verify:''
        ]));
      }
      const coverage=report.mode==='product'?
        (report.salesPageCoverage||null):(report.coverage||{});
      if(report.mode==='product'){
        paragraph(coverage?
          'Public sales-page coverage: '+String(coverage.inspected||0)+
          ' pages opened; '+String(coverage.rendered||0)+' with browser evidence. '+
          (coverage.mode==='source-only'?'Only HTML source could be assessed.':'Rendered offer review attempted.'):
          'No public sales-page audit was supplied. Only the product file was inspected locally.',
          {size:9,gap:9});
      }else{
        paragraph('Coverage: '+String(coverage.inspected??0)+' pages checked. '+
          String(coverage.rendered??0)+' with browser evidence. '+
          String(coverage.sourceOnly??0)+' with source-only information.',
          {size:9,gap:9});
      }
      // The five report sections stay focused on buying decisions. The optional
      // appendix keeps the other recorded scan work discoverable in the PDF.
      const extraIssues=Array.isArray(report.issues)?report.issues.filter(x=>x&&x.title):[];
      const scanChecks=Array.isArray(report.checks)?report.checks.filter(x=>x&&x.name):[];
      if(extraIssues.length||scanChecks.length){
        section('Appendix: Other Recorded Page Checks');
        paragraph('These are extra site observations, not automatically reasons someone would not buy.',
          {size:9,gap:10,color:'0.40 0.46 0.39'});
      }
      if(extraIssues.length){
        paragraph(extraIssues.length+' additional site observations',
          {size:11,bold:true,gap:10});
        extraIssues.forEach((issue,i)=>entry((i+1)+'. '+issue.title,[
          'Page: '+String(issue.location||'Public page'),
          issue.evidence?'Observed: '+issue.evidence:'',
          issue.fix?'Suggested check: '+issue.fix:''
        ]));
      }
      if(scanChecks.length){
        paragraph(scanChecks.length+' recorded inspection checks',
          {size:11,bold:true,gap:9});
        scanChecks.forEach((check,i)=>{
          paragraph((i+1)+'. '+check.name+' - '+String(check.status||'unverified'),
            {size:8.5,gap:3});
          if(check.status==='attention'||check.status==='unverified')
            paragraph(String(check.detail||''),{size:8,indent:11,gap:8});
        });
      }
    }else{
      pageStart();
    paragraph(subject,{size:11,bold:true,color:'0.34 0.43 0.30'});
    paragraph('Your Conversion Report',{size:22,bold:true,gap:14,color:'0.08 0.12 0.08'});
    section('1. Overall Assessment');
    const status=text('.evidence-summary-status')||'Evidence review';
    paragraph(status+'    Potential blockers: '+text('.five-problems-value'),{size:13,bold:true,gap:10});
    paragraph(text('.evidence-summary-detail')||text('.five-score-description'));
    const positives=list('#seven-strengths .seven-strength');
    section('2. '+(text('#five-blockers .five-panel-title')||'Buying Obstacles'));
    const blockers=list('#five-blockers .five-finding');
    if(!blockers.length)paragraph(text('#five-blockers .ten-empty')||text('#five-blockers .five-empty')||'No verified finding.');
    blockers.forEach((item,i)=>{
      const details=list('.five-detail-line',item).map(el=>{
        const label=text('strong',el),value=text('span',el);
        return label&&value?label+' — '+value:el.textContent;
      });
      entry((i+1)+'. '+text('.five-row-title',item),[text('.seven-location',item)||text('.five-location',item),text('.seven-confidence',item),...details]);
    });
    section('3. Your Improvement Plan');
    const steps=list('#five-action-plan .five-plan-row');
    if(!steps.length)paragraph(text('#five-action-plan .ten-empty strong')||'No priority fixes were supported.');
    steps.forEach((item,i)=>paragraph((i+1)+'. '+text('.five-plan-text strong',item),{size:10,gap:8}));
    let savedKit=[];
    try{
      const report=JSON.parse(sessionStorage.getItem('vylens:result')||'null');
      savedKit=Array.isArray(report?.conversion?.fixKit)?report.conversion.fixKit:[];
    }catch{}
    if(!savedKit.length){
      savedKit=list('#five-changes .five-kit-item').map(item=>({
        label:text('.five-kit-asset-type',item),content:text('.five-kit-content',item)
      }));
    }
    if(savedKit.length){
      paragraph('Conversion Fix Kit - copyable wording and actionable instructions',
        {size:10,bold:true,gap:9});
      savedKit.slice(0,20).forEach((item,i)=>{
        paragraph((i+1)+'. '+String(item.label||'Fix')+
          ' - '+String(item.content||''),
          {size:9.5,gap:8,indent:8});
        if(item.verify)paragraph('Verify: '+String(item.verify),
          {size:8.5,gap:5,indent:12});
      });
    }
    section("4. What's Working");
    if(!positives.length)paragraph('No positive finding was verified in the supported checks.');
    positives.forEach((item,i)=>entry((i+1)+'. '+text('strong',item),[
      text('p',item),text('small',item)]));
    section('5. Recheck Comparison');
    const compare=list('#seven-comparison .seven-compare-stat');
    if(compare.length){
      compare.forEach(item=>paragraph(text('strong',item)+' - '+text('span',item),{size:10,gap:8}));
      list('#seven-comparison .seven-change-list').forEach(group=>{
        entry(text('strong',group),list('p',group).map(item=>item.textContent));
      });
    }else paragraph(text('#seven-comparison .seven-empty')||'No comparable previous scan.');
    paragraph(text('#seven-comparison .seven-comparison-note'),{size:9,gap:9});
    section('6. Buyer Journey Review');
    list('#seven-journey .seven-stage').forEach((item,i)=>entry((i+1)+'. '+text('h3',item),[
      text('.seven-stage-status',item),text('p',item)]));
    // Replay is a public DOM observation, not an actual recorded user path.
    let replay=null;
    try{
      replay=JSON.parse(sessionStorage.getItem('vylens:result')||'null')?.conversion?.buyerReplay;
    }catch{}
    if(replay?.version===1){
      paragraph('Buyer Journey Replay - observed public path (not a visitor recording)',
        {size:10,bold:true,gap:8});
      for(const view of ['desktop','mobile']){
        if(!Array.isArray(replay[view]))continue;
        paragraph(view==='desktop'?'Desktop view':'Mobile view',
          {size:10,bold:true,gap:6,color:'0.28 0.46 0.18'});
        replay[view].slice(0,4).forEach(item=>{
          paragraph(String(item.title||'Step')+' - '+String(item.description||'')+
            (item.place?' ('+item.place+')':'')+
            ' ['+String(item.status||'unknown')+']',{size:9,gap:6,indent:8});
        });
      }
    }
    section("7. What Couldn't Be Verified");
    list('#seven-limitations .seven-limit-body p').forEach(item=>
      paragraph('- '+item.textContent,{size:9.5,gap:9}));
    }
    pages.push(commands.join('\n'));
    pages.forEach((s,i)=>{
      const footer=['0.87 0.90 0.85 RG 0.6 w '+M+' 47 m '+(W-M)+' 47 l S',
        '0.41 0.47 0.39 rg',
        'BT /F1 8 Tf 1 0 0 1 '+M+' 32 Tm (VYLENS buyer-focused report) Tj ET',
        'BT /F1 8 Tf 1 0 0 1 '+(W-M-75)+' 32 Tm (Page '+(i+1)+' of '+pages.length+') Tj ET'];
      pages[i]=s+'\n'+footer.join('\n');
    });
    const objects=[
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count '+pages.length+' /Kids ['+
        pages.map((_,i)=>(5+2*i)+' 0 R').join(' ')+'] >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];
    pages.forEach((stream,i)=>{
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '+
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+
        (6+i*2)+' 0 R >>');
      objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');
    });
    let result='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const positions=[0];
    objects.forEach((body,index)=>{
      positions.push(result.length);
      result+=(index+1)+' 0 obj\n'+body+'\nendobj\n';
    });
    const startxref=result.length;
    result+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
    positions.slice(1).forEach(pos=>{
      result+=String(pos).padStart(10,'0')+' 00000 n \n';
    });
    result+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+
      startxref+'\n%%EOF';
    // One character equals one byte after ASCII normalization.
    const bytes=Uint8Array.from(result,ch=>ch.charCodeAt(0)&255);
    const name='vylens-'+safeName(subject)+'-'+new Date().toISOString().slice(0,10)+'.pdf';
    return {bytes,name};
  };
  function save(){
    try{
      const pdf=build();
      if(!pdf)throw Error('No report available');
      const url=URL.createObjectURL(new Blob([pdf.bytes],{type:'application/pdf'}));
      const link=document.createElement('a');
      link.href=url;link.download=pdf.name;
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){
      console.warn('VYLENS PDF download error',e?.message||'unknown');
      const nav=document.getElementById('navDownload');
      if(nav)nav.title='PDF download failed. Please try again.';
    }
  }
  window.VylensPdfDownload={save,build};
  // Capture before old nav click forwarding can reach the legacy print handler.
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?
      event.target.closest('#navDownload,#fiveBottomDownload,#savePdf'):null;
    if(!target||!document.body.classList.contains('five-report-ui'))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    save();
  },true);
})();