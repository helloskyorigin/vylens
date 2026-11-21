/* VYLENS theme: dark by default, accessible user preference everywhere. */
(() => {
  'use strict';
  const key='vylens:theme';
  let chosen='dark';
  try {
    const stored=localStorage.getItem(key);
    if(stored==='dark'||stored==='light')chosen=stored;
  } catch {}
  const apply = mode => {
    document.documentElement.dataset.theme=mode;
    document.documentElement.style.colorScheme=mode;
    document.querySelectorAll('.theme-toggle').forEach(button=>{
      button.setAttribute('aria-label',mode==='dark'?'Switch to light mode':'Switch to dark mode');
      button.setAttribute('aria-pressed',String(mode==='dark'));
      button.title=mode==='dark'?'Switch to light mode':'Switch to dark mode';
      const text=button.querySelector('.theme-toggle-label');
      const glyph=button.querySelector('.theme-toggle-glyph');
      if(text)text.textContent=mode==='dark'?'Light mode':'Dark mode';
      if(glyph)glyph.textContent=mode==='dark'?'☀':'☾';
    });
    const themeMeta=document.querySelector('meta[name="theme-color"]');
    if(themeMeta)themeMeta.content=mode==='dark'?'#111610':'#ffffff';
  };
  apply(chosen);
  document.addEventListener('DOMContentLoaded',()=>{
    const navigation=document.querySelector(
      '.page-header .floating-nav,.analysis-header .analysis-nav,.nav-wrap .site-nav');
    if(!navigation)return;
    if(!navigation.querySelector('.theme-toggle')){
      const button=document.createElement('button');
      button.type='button';button.className='theme-toggle';
      button.innerHTML='<span class="theme-toggle-glyph" aria-hidden="true">☀</span><span class="theme-toggle-label">Light mode</span>';
      button.addEventListener('click',()=>{
        chosen=document.documentElement.dataset.theme==='dark'?'light':'dark';
        try{localStorage.setItem(key,chosen)}catch{}
        apply(chosen);
      });
      navigation.append(button);
    }
    apply(chosen);
  });
})();
