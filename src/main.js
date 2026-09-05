import './style.css';
import App from './App.svelte';
import { mount } from 'svelte';

const collectCarouselImages = `async({page})=>page.evaluate(async()=>{let s=location.pathname.split('/').filter(Boolean)[1],A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',n=0;for(let c of s)n=n*64+A.indexOf(c);let h=document.documentElement.innerHTML,t=(h.match(/id="__eqmc"[^>]*>.*?"l":"([^"]+)/)||h.match(/\["LSD",\[\],\{"token":"([^"]+)/)||[])[1];if(!t)return[];let r=await fetch('/api/graphql',{method:'POST',headers:{'X-FB-Friendly-Name':'PolarisLoggedOutDesktopWWWPostRootContentQuery','X-FB-LSD':t},body:new URLSearchParams({lsd:t,fb_api_caller_class:'RelayModern',fb_api_req_friendly_name:'PolarisLoggedOutDesktopWWWPostRootContentQuery',variables:JSON.stringify({media_id:String(n)}),doc_id:'27130156389949648'})}),p=await r.json(),o=[],w=x=>{if(!x||typeof x!='object')return;if(Array.isArray(x))return x.forEach(w);if(x.image_versions2?.candidates)x.image_versions2.candidates.forEach(v=>o.push({url:v.url,kind:'image',width:v.width,height:v.height}));Object.values(x).forEach(w)};w(p);return o})`;

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const requestUrl = typeof input === 'string' ? input : input?.url;
  if (requestUrl?.startsWith('https://api.microlink.io/')) {
    const proxyUrl = new URL(requestUrl);
    const target = proxyUrl.searchParams.get('url');
    if (target) {
      try {
        const instagramUrl = new URL(target);
        if (/^\/p\//i.test(instagramUrl.pathname) && instagramUrl.searchParams.has('img_index')) {
          proxyUrl.searchParams.set('function', collectCarouselImages);
          return nativeFetch(proxyUrl.toString(), init);
        }
      } catch {}
    }
  }
  return nativeFetch(input, init);
};

const app = mount(App, { target: document.getElementById('app') });

const showCarouselHint = (index) => {
  document.querySelector('.deep-link-hint')?.remove();
  const hint = document.createElement('div');
  hint.className = 'deep-link-hint';
  hint.textContent = `${index}번째 이미지 링크로 인식했어요 · 해당 이미지가 자동 선택됩니다`;
  Object.assign(hint.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: '9999',
    padding: '11px 16px', borderRadius: '999px', background: 'rgba(20,20,24,.94)',
    color: '#fff', fontSize: '13px', fontWeight: '700', letterSpacing: '-.02em',
    boxShadow: '0 12px 32px rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.12)',
    whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 32px)', overflow: 'hidden', textOverflow: 'ellipsis'
  });
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 2400);
};

const selectDeepLinkedImage = () => {
  const input = document.querySelector('input[aria-label="Instagram 링크"]');
  if (!input) return;
  try {
    const url = new URL(input.value.trim());
    const index = Number(url.searchParams.get('img_index'));
    if (!Number.isInteger(index) || index < 1) return;
    showCarouselHint(index);
    let tries = 0;
    const pick = () => {
      const button = document.querySelectorAll('.gallery-strip .thumb')[index - 1];
      if (button) { button.click(); return; }
      if (++tries < 30) setTimeout(pick, 150);
    };
    setTimeout(pick, 250);
  } catch {}
};

document.addEventListener('submit', (event) => {
  if (event.target instanceof HTMLFormElement) selectDeepLinkedImage();
});

export default app;
