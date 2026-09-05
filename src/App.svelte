<script>
  let input = '';
  let media = [];
  let selected = 0;
  let title = '';
  let author = '';
  let loading = false;
  let error = '';
  let status = '';
  let copied = false;
  let tried = '';

  const isInstagramUrl = (value) => { try { const u = new URL(value); return /(^|\.)instagram\.com$/i.test(u.hostname) && /^\/(p|reel|tv|reels)\//i.test(u.pathname); } catch { return false; } };
  const normalizeUrl = (value) => String(value || '').replace(/\\u0026/g,'&').replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\u003D/g,'=').replace(/\\u003F/g,'?').replace(/\\u0025/gi,'%');
  const validUrl = (value) => { try { const u = new URL(normalizeUrl(value)); return /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$|(^|\.)fbsbx\.com$/i.test(u.hostname); } catch { return false; } };
  const area = (x) => (x.width || 0) * (x.height || 0);
  const resolution = (w,h) => w && h ? `${w.toLocaleString()} × ${h.toLocaleString()} px` : '해상도 확인 중';
  const ext = (url, kind='image') => kind === 'video' ? 'mp4' : (/\.(png|webp|avif)(?:[?#]|$)/i.test(url) ? url.match(/\.(png|webp|avif)/i)[1] : 'jpg');

  const collectMedia = `async({page})=>page.evaluate(()=>{const a=[],ok=u=>/^https?:\\/\\/(?:[^/]+\\.)?(?:cdninstagram|fbcdn|fbsbx)\\./i.test(u),add=(u,w=0,h=0,k='image')=>{if(typeof u=='string'&&ok(u))a.push({url:u,width:+w||0,height:+h||0,kind:k})},walk=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v!='object')return;for(const[k,x]of Object.entries(v)){if((k==='display_url'||k==='display_src'||k==='thumbnail_src')&&typeof x==='string')add(x,v.dimensions?.width||v.width,v.dimensions?.height,'image');if(k==='video_url'&&typeof x==='string')add(x,v.dimensions?.width||v.width,v.dimensions?.height,'video');if(k==='video_versions'&&Array.isArray(x))x.forEach(z=>add(z?.url,z?.width,z?.height,'video'));if(k==='image_versions2'&&x?.candidates)walk(x.candidates);if(k==='candidates'&&Array.isArray(x))walk(x);else if(typeof x==='object')walk(x)}};document.querySelectorAll('script[data-sjs],script[type="application/ld+json"]').forEach(s=>{try{walk(JSON.parse(s.textContent))}catch{}});document.querySelectorAll('img').forEach(i=>add(i.currentSrc||i.src,i.naturalWidth,i.naturalHeight,'image'));document.querySelectorAll('video').forEach(v=>add(v.currentSrc||v.src,v.videoWidth,v.videoHeight,'video'));return a})`;

  async function pasteLink(){try{const t=await navigator.clipboard.readText();if(t){input=t.trim();copied=true;setTimeout(()=>copied=false,1400)}}catch{}}

  async function requestExtraction(url, useEmbed=false){
    const target = useEmbed ? `${url.replace(/\/?([?#].*)?$/,'')}/embed/` : url;
    const params = new URLSearchParams({url:target,meta:'true',function:collectMedia});
    const r = await fetch(`https://api.microlink.io/?${params}`);
    const p = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(p?.message || `HTTP ${r.status}`);
    const out=[]; const push=(x)=>{const u=normalizeUrl(x?.url||x).trim();if(validUrl(u))out.push({url:u,width:+x?.width||0,height:+x?.height||0,kind:x?.kind||'image'});};
    (Array.isArray(p?.data?.function)?p.data.function:[]).forEach(push);
    ;[p?.data?.image,p?.data?.images].flat().filter(Boolean).forEach(push);
    const unique=new Map(); for(const x of out){const k=x.kind+'|'+x.url.split('?')[0];const old=unique.get(k);if(!old||area(x)>area(old))unique.set(k,x)}
    return [...unique.values()].sort((a,b)=>area(b)-area(a));
  }

  async function extract(){
    error='';status='';media=[];selected=0;title='';author='';tried='';
    const value=input.trim();
    if(!isInstagramUrl(value)){error='Instagram 링크 형식이 아니에요.';tried='/p, /reel, /reels, /tv 링크를 사용해 주세요.';return}
    loading=true;status='공개 미디어를 분석하고 있어요';tried='페이지 데이터 → DOM 미디어 → 공개 임베드 순서로 확인';
    try{
      let found=await requestExtraction(value,false);
      if(!found.length){status='공개 임베드에서 미디어를 한 번 더 확인하고 있어요';found=await requestExtraction(value,true)}
      if(!found.length)throw new Error('no media');
      media=found.slice(0,20);selected=0;title='Instagram 공개 미디어';author=new URL(value).pathname.split('/')[1]?.toUpperCase()||'Instagram';
      const videos=media.filter(x=>x.kind==='video').length;status=`${media.length}개 미디어 확인 · ${videos ? `${videos}개 동영상` : '이미지'}`;tried='';
    }catch(e){error='Instagram 공개 미디어를 찾지 못했어요.';tried='Instagram이 로그인/접근 제한을 반환하면 공개 링크라도 추출할 수 없습니다. 잠시 후 다시 시도해 주세요.'}
    finally{loading=false}
  }

  const current=()=>media[selected]||null;
  async function save(item,index=selected){if(!item?.url)return;status=`${item.kind==='video'?'동영상':'이미지'}를 저장하고 있어요`;try{const r=await fetch(item.url,{mode:'cors'});if(!r.ok)throw 0;const b=await r.blob(),h=URL.createObjectURL(b),a=document.createElement('a');a.href=h;a.download=`instagram-${String(index+1).padStart(2,'0')}-${Date.now()}.${ext(item.url,item.kind)}`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(h);status=`${item.kind==='video'?'동영상':'사진'} 저장 완료 · ${resolution(item.width,item.height)}`}catch{status='브라우저에서 원본을 열었어요';window.open(item.url,'_blank','noopener,noreferrer')}}
  function openOriginal(){const x=current();if(x)window.open(x.url,'_blank','noopener,noreferrer')}
</script>

<svelte:head><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="theme-color" content="#08080a"/></svelte:head>

<main class="page"><div class="ambient ambient-one"></div><div class="ambient ambient-two"></div><section class="shell">
  <header class="topbar"><div class="brand"><div class="brand-mark"><span>IS</span></div><div class="brand-name">InstaSave</div></div><div class="availability"><i></i> PUBLIC MEDIA</div></header>
  <div class="hero"><div class="hero-kicker"><span>01</span> INSTAGRAM MEDIA EXTRACTOR</div><h1>공개 미디어를<br/><em>빠르게 저장하세요.</em></h1><p>사진, 캐러셀, 공개 릴스까지 한 링크에서 확인합니다.<br class="desktop"/> 가능한 경우 원본에 가까운 미디어 후보를 우선 표시해요.</p></div>
  <section class="extract-card"><div class="card-topline"><div><span class="step-dot">1</span><span>Instagram 링크</span></div><button type="button" class="paste" on:click={pasteLink}>{copied?'붙여넣음 ✓':'클립보드 붙여넣기'}</button></div>
    <form on:submit|preventDefault={extract}><div class="input-shell"><span class="input-icon">↗</span><input bind:value={input} type="url" inputmode="url" autocomplete="off" aria-label="Instagram 링크" placeholder="instagram.com/p/..."/>{#if input}<button type="button" class="clear" aria-label="입력 지우기" on:click={()=>input=''}>×</button>{/if}<button class="primary" type="submit" disabled={loading}><span>{loading?'분석 중':'미디어 찾기'}</span><b>→</b></button></div></form>
    <div class="helper"><span>✦</span> 공개 게시물 · 캐러셀 · 릴스 지원 · 로그인/비공개 콘텐츠는 제외</div>
  </section>
  {#if loading}<div class="progress"><div class="loader"><span></span><span></span><span></span></div><div><strong>{status}</strong><small>{tried}</small></div></div>{/if}
  {#if error}<div class="error"><div class="error-icon">!</div><div class="error-copy"><strong>{error}</strong><span>{tried}</span></div><button type="button" on:click={extract}>다시 시도 ↗</button></div>{/if}
  {#if media.length}{@const item=current()}<article class="result"><div class="result-head"><div><span class="live-dot"></span> {item.kind==='video'?'VIDEO':'MEDIA'} {selected+1} / {media.length}</div><span>{item.kind==='video'?'VIDEO CANDIDATE':'IMAGE CANDIDATE'}</span></div>
    <div class="preview-wrap">{#if item.kind==='video'}<video class="preview video" src={item.url} controls playsinline preload="metadata" poster={media.find(x=>x.kind==='image')?.url}></video>{:else}<img class="preview" src={item.url} alt={title}/>{/if}<div class="image-overlay"></div><div class="resolution-pill"><span>{item.kind==='video'?'VIDEO':'RESOLUTION'}</span>{resolution(item.width,item.height)}</div></div>
    <div class="result-info"><div class="result-meta"><p class="result-title">{title}</p><p class="result-author">{author}</p><p class="resolution">✓ 공개 페이지에서 확인된 {item.kind==='video'?'동영상':'이미지'} 후보</p></div><div class="actions"><button class="secondary" on:click={openOriginal}>원본 열기</button><button class="download" on:click={()=>save(item)}><span>{item.kind==='video'?'동영상 저장':'사진 저장'}</span><b>↓</b></button></div></div>
    {#if media.length>1}<div class="gallery-strip" aria-label="미디어 선택">{#each media as candidate,index}<button type="button" class:active={index===selected} class="thumb" on:click={()=>selected=index} aria-label={`${index+1}번째 ${candidate.kind==='video'?'동영상':'이미지'}`}><img src={candidate.kind==='video'?(media.find(x=>x.kind==='image')?.url||''):candidate.url} alt="" loading="lazy"/><span>{candidate.kind==='video'?'▶':index+1}</span></button>{/each}</div>{/if}
    {#if status}<p class="status">{status}</p>{/if}
  </article>{/if}
  <footer class="footer"><div class="trust"><span>✦</span><p>다운로드 권한이 있는 공개 콘텐츠만 저장하세요.</p></div><div class="footer-links"><span>HIGH RES</span><span>CAROUSEL</span><span>PHOTO + VIDEO</span></div></footer>
</section></main>

<style>
.actions{display:flex;gap:8px;flex:0 0 auto}.secondary{min-height:42px;padding:0 13px;border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#bbbcc5;background:#17171d;font-size:11px;font-weight:800}.secondary:hover{background:#202027}.download{min-height:42px!important}.gallery-strip{display:flex;gap:8px;overflow-x:auto;padding:0 15px 15px;scrollbar-width:none}.gallery-strip::-webkit-scrollbar{display:none}.thumb{position:relative;width:64px;height:64px;flex:0 0 64px;padding:0;overflow:hidden;border:1px solid #292930;border-radius:11px;background:#111116;opacity:.62;transition:.2s}.thumb:hover{opacity:.9}.thumb.active{opacity:1;border-color:#9a7bff;box-shadow:0 0 0 2px rgba(154,123,255,.18)}.thumb img{width:100%;height:100%;object-fit:cover}.thumb span{position:absolute;left:5px;bottom:4px;min-width:17px;padding:2px 4px;border-radius:5px;color:#fff;background:rgba(0,0,0,.65);font-size:8px;font-weight:800}.video{width:100%;height:auto;max-height:68svh;background:#050507}.video::-webkit-media-controls-panel{background:linear-gradient(transparent,rgba(0,0,0,.7))}@media(max-width:600px){.result-info{align-items:stretch;flex-direction:column}.actions{width:100%}.secondary,.download{flex:1}.gallery-strip{padding-bottom:13px}}@media(max-width:380px){.actions{flex-direction:column}.secondary,.download{width:100%}}
</style>
