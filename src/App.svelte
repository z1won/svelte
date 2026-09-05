<script>
  let input = '';
  let media = [];
  let selected = 0;
  let loading = false;
  let error = '';
  let status = '';
  let copied = false;
  let stage = '';

  const isInstagramUrl = (value) => {
    try { const u = new URL(value); return /(^|\.)instagram\.com$/i.test(u.hostname) && /^\/(p|reel|reels|tv)\//i.test(u.pathname); }
    catch { return false; }
  };
  const isVideoUrl = (value) => {
    try { const u = new URL(value); return /(^|\.)instagram\.com$/i.test(u.hostname) && /^\/(reel|reels|tv)\//i.test(u.pathname); }
    catch { return false; }
  };
  const normalizeUrl = (value) => String(value || '').replace(/\\u0026/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\u003D/g, '=').replace(/\\u003F/g, '?').replace(/\\u0025/gi, '%');
  const validUrl = (value) => {
    try { const u = new URL(normalizeUrl(value)); return /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$|(^|\.)fbsbx\.com$/i.test(u.hostname); }
    catch { return false; }
  };
  const area = (x) => (x.width || 0) * (x.height || 0);
  const resolution = (w, h) => w && h ? `${w.toLocaleString()} × ${h.toLocaleString()} px` : '해상도 확인 중';
  const ext = (url, kind) => kind === 'video' ? 'mp4' : (/\.(png|webp|avif)(?:[?#]|$)/i.test(url) ? url.match(/\.(png|webp|avif)/i)[1] : 'jpg');

  const collectMedia = `async({page})=>page.evaluate(()=>{const a=[],add=(u,k='image',w=0,h=0)=>{u=String(u||'').replace(/\\u0026/g,'&').replace(/\\u002F/gi,'/').replace(/\\\//g,'/');try{if(/^https?:\/\/(?:[^/]+\.)?(?:cdninstagram|fbcdn|fbsbx)\./i.test(u))a.push({url:u,kind:k,width:+w||0,height:+h||0})}catch{}};const scan=t=>{for(const m of t.matchAll(/"video_url":"([^"]+)"/g))add(m[1],'video');for(const m of t.matchAll(/"video_versions"\s*:\s*\[([\s\S]*?)\]/g))for(const v of m[1].matchAll(/"url"\s*:\s*"([^"]+)"/g))add(v[1],'video');for(const m of t.matchAll(/"display_url":"([^"]+)"/g))add(m[1],'image')};document.querySelectorAll('script').forEach(s=>scan(s.textContent||''));document.querySelectorAll('video').forEach(v=>add(v.currentSrc||v.src,'video',v.videoWidth,v.videoHeight));document.querySelectorAll('img').forEach(i=>add(i.currentSrc||i.src,'image',i.naturalWidth,i.naturalHeight));return a})`;

  const collectGraphqlVideos = `async({page})=>page.evaluate(async()=>{let s=location.pathname.split('/').filter(Boolean)[1],A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',n=0;for(let c of s)n=n*64+A.indexOf(c);let h=document.documentElement.innerHTML,t=(h.match(/id="__eqmc"[^>]*>.*?"l":"([^"]+)/)||h.match(/\["LSD",\[\],\{"token":"([^"]+)/)||[])[1];if(!t)return[];let r=await fetch('/api/graphql',{method:'POST',headers:{'X-FB-Friendly-Name':'PolarisLoggedOutDesktopWWWPostRootContentQuery','X-FB-LSD':t},body:new URLSearchParams({lsd:t,fb_api_caller_class:'RelayModern',fb_api_req_friendly_name:'PolarisLoggedOutDesktopWWWPostRootContentQuery',variables:JSON.stringify({media_id:String(n)}),doc_id:'27130156389949648'})}),p=await r.json(),o=[],w=x=>{if(!x||typeof x!='object')return;if(Array.isArray(x))return x.forEach(w);if(x.video_versions)x.video_versions.forEach(v=>o.push({url:v.url,kind:'video',width:v.width,height:v.height}));Object.values(x).forEach(w)};w(p);return o})`;

  async function pasteLink() {
    try { const text = await navigator.clipboard.readText(); if (text) { input = text.trim(); copied = true; setTimeout(() => copied = false, 1400); } } catch {}
  }

  async function requestExtraction(url, mode = 'page') {
    const target = mode === 'embed' ? `${url.replace(/\/?([?#].*)?$/, '')}/embed/` : url;
    const fn = mode === 'graphql' ? collectGraphqlVideos : collectMedia;
    const params = new URLSearchParams({ url: target, meta: 'true', function: fn });
    const response = await fetch(`https://api.microlink.io/?${params}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || `Microlink HTTP ${response.status}`);
    const out = [];
    const push = (value, forcedKind = '') => {
      const raw = value?.url || value?.src || value;
      const urlValue = normalizeUrl(raw).trim();
      if (!validUrl(urlValue)) return;
      const kind = forcedKind || value?.kind || (/\.(mp4|m3u8)(?:[?#]|$)/i.test(urlValue) ? 'video' : 'image');
      out.push({ url: urlValue, width: +value?.width || 0, height: +value?.height || 0, kind });
    };
    (Array.isArray(payload?.data?.function) ? payload.data.function : []).forEach(push);
    [payload?.data?.video, payload?.data?.videos, payload?.data?.image, payload?.data?.images].flat().filter(Boolean).forEach(x => push(x, x?.kind === 'video' ? 'video' : ''));
    const unique = new Map();
    for (const item of out) { const key = `${item.kind}|${item.url.split('?')[0]}`; const old = unique.get(key); if (!old || area(item) > area(old)) unique.set(key, item); }
    return [...unique.values()].sort((a, b) => (b.kind === 'video') - (a.kind === 'video') || area(b) - area(a));
  }

  async function extract() {
    error = ''; status = ''; media = []; selected = 0; stage = '';
    const value = input.trim();
    const videoRequest = isVideoUrl(value);
    if (!isInstagramUrl(value)) { error = 'Instagram 링크 형식이 아니에요.'; stage = '/p, /reel, /reels, /tv 링크를 사용해 주세요.'; return; }
    loading = true;
    status = videoRequest ? '릴스 원본 스트림을 확인하고 있어요' : '공개 미디어를 분석하고 있어요';
    stage = videoRequest ? '1. 공개 페이지 → 2. GraphQL video_versions → 3. 공개 임베드' : '원본 후보를 찾는 중';
    try {
      let found = await requestExtraction(value, 'page');
      if (videoRequest && !found.some(x => x.kind === 'video')) {
        status = 'Instagram GraphQL에서 실제 동영상 주소를 확인하고 있어요';
        stage = 'GraphQL · video_versions';
        found = [...await requestExtraction(value, 'graphql'), ...found];
      }
      if (videoRequest && !found.some(x => x.kind === 'video')) {
        status = '공개 임베드에서 동영상 주소를 다시 확인하고 있어요';
        stage = 'Embed · video source';
        found = [...await requestExtraction(value, 'embed'), ...found];
      }
      const videos = found.filter(x => x.kind === 'video');
      if (!found.length || (videoRequest && !videos.length)) throw new Error('video-not-found');
      media = found.slice(0, 20);
      selected = 0;
      status = `${media.length}개 미디어 확인 · ${videos.length ? `${videos.length}개 동영상` : '이미지'}`;
      stage = videos.length ? '✓ 실제 동영상 스트림 확인 완료' : '✓ 이미지 후보 확인 완료';
    } catch (e) {
      error = videoRequest ? '릴스 동영상 원본을 찾지 못했어요.' : 'Instagram 공개 미디어를 찾지 못했어요.';
      stage = videoRequest ? '썸네일은 성공으로 처리하지 않았어요. 공개 릴스 접근 제한 또는 Instagram 응답 변경일 수 있어요.' : '로그인/비공개 콘텐츠는 추출할 수 없습니다.';
    } finally { loading = false; }
  }

  const current = () => media[selected] || null;
  async function save(item, index = selected) {
    if (!item?.url) return;
    status = `${item.kind === 'video' ? '동영상' : '이미지'}를 저장하고 있어요`;
    try {
      const response = await fetch(item.url, { mode: 'cors' });
      if (!response.ok) throw 0;
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `instagram-${String(index + 1).padStart(2, '0')}-${Date.now()}.${ext(item.url, item.kind)}`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      status = `${item.kind === 'video' ? '동영상' : '사진'} 저장 완료 · ${resolution(item.width, item.height)}`;
    } catch { status = '원본 주소를 새 탭에서 열었어요'; window.open(item.url, '_blank', 'noopener,noreferrer'); }
  }
  function openOriginal() { const item = current(); if (item) window.open(item.url, '_blank', 'noopener,noreferrer'); }
</script>

<svelte:head>
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#08080a" />
</svelte:head>

<main class="page">
  <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
  <section class="shell">
    <header class="topbar"><div class="brand"><div class="brand-mark"><span>IS</span></div><div class="brand-name">InstaSave</div></div><div class="availability"><i></i> PUBLIC MEDIA</div></header>
    <div class="hero"><div class="hero-kicker"><span>01</span> INSTAGRAM MEDIA EXTRACTOR</div><h1>공개 미디어를<br/><em>빠르게 저장하세요.</em></h1><p>사진, 캐러셀, 공개 릴스까지 한 링크에서 확인합니다.<br class="desktop"/> 릴스는 썸네일이 아니라 실제 동영상 스트림만 성공으로 처리해요.</p></div>
    <section class="extract-card"><div class="card-topline"><div><span class="step-dot">1</span><span>Instagram 링크</span></div><button type="button" class="paste" on:click={pasteLink}>{copied ? '붙여넣음 ✓' : '클립보드 붙여넣기'}</button></div>
      <form on:submit|preventDefault={extract}><div class="input-shell"><span class="input-icon">↗</span><input bind:value={input} type="url" inputmode="url" autocomplete="off" aria-label="Instagram 링크" placeholder="instagram.com/p/... 또는 /reel/..."/>{#if input}<button type="button" class="clear" aria-label="입력 지우기" on:click={() => input = ''}>×</button>{/if}<button class="primary" type="submit" disabled={loading}><span>{loading ? '분석 중' : '미디어 찾기'}</span><b>→</b></button></div></form>
      <div class="helper"><span>✦</span> 릴스는 실제 동영상 우선 · 공개 게시물 · 캐러셀 지원 · 로그인/비공개 콘텐츠 제외</div>
    </section>
    {#if loading}<div class="progress"><div class="loader"><span></span><span></span><span></span></div><div><strong>{status}</strong><small>{stage}</small></div></div>{/if}
    {#if error}<div class="error"><div class="error-icon">!</div><div class="error-copy"><strong>{error}</strong><span>{stage}</span></div><button type="button" on:click={extract}>다시 시도 ↗</button></div>{/if}
    {#if media.length}
      {@const item = current()}
      <article class="result"><div class="result-head"><div><span class="live-dot"></span> {item.kind === 'video' ? 'VIDEO' : 'MEDIA'} {selected + 1} / {media.length}</div><span class:video-label={item.kind === 'video'}>{item.kind === 'video' ? 'ORIGINAL VIDEO' : 'IMAGE CANDIDATE'}</span></div>
        <div class="preview-wrap">{#if item.kind === 'video'}<video class="preview video" src={item.url} controls playsinline preload="metadata"></video><div class="video-badge">▶ ORIGINAL STREAM</div>{:else}<img class="preview" src={item.url} alt="Instagram media"/>{/if}<div class="image-overlay"></div><div class="resolution-pill"><span>{item.kind === 'video' ? 'VIDEO' : 'RESOLUTION'}</span>{resolution(item.width, item.height)}</div></div>
        <div class="result-info"><div class="result-meta"><p class="result-title">Instagram 공개 미디어</p><p class="result-author">원본 후보 {selected + 1}</p><p class="resolution">✓ {item.kind === 'video' ? '실제 동영상 스트림' : '공개 이미지'} 확인 완료</p></div><div class="actions"><button class="secondary" on:click={openOriginal}>원본 열기</button><button class="download" on:click={() => save(item)}><span>{item.kind === 'video' ? '동영상 저장' : '사진 저장'}</span><b>↓</b></button></div></div>
        {#if media.length > 1}<div class="gallery-strip" aria-label="미디어 선택">{#each media as candidate, index}<button type="button" class:active={index === selected} class:video-thumb={candidate.kind === 'video'} class="thumb" on:click={() => selected = index} aria-label={`${index + 1}번째 ${candidate.kind === 'video' ? '동영상' : '이미지'}`}><img src={candidate.kind === 'video' ? (media.find(x => x.kind === 'image')?.url || '') : candidate.url} alt="" loading="lazy"/><span>{candidate.kind === 'video' ? '▶' : index + 1}</span></button>{/each}</div>{/if}
        {#if status}<p class="status">{status}</p>{/if}
      </article>
    {/if}
    <footer class="footer"><div class="trust"><span>✦</span><p>다운로드 권한이 있는 공개 콘텐츠만 저장하세요.</p></div><div class="footer-links"><span>HIGH RES</span><span>CAROUSEL</span><span>PHOTO + VIDEO</span></div></footer>
  </section>
</main>

<style>
.actions{display:flex;gap:8px;flex:0 0 auto}.secondary{min-height:42px;padding:0 13px;border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#bbbcc5;background:#17171d;font-size:11px;font-weight:800}.secondary:hover{background:#202027}.download{min-height:42px!important}.video-label{color:#c8b8ff!important}.gallery-strip{display:flex;gap:8px;overflow-x:auto;padding:0 15px 15px;scrollbar-width:none}.gallery-strip::-webkit-scrollbar{display:none}.thumb{position:relative;width:64px;height:64px;flex:0 0 64px;padding:0;overflow:hidden;border:1px solid #292930;border-radius:11px;background:#111116;opacity:.62;transition:.2s}.thumb:hover{opacity:.9}.thumb.active{opacity:1;border-color:#9a7bff;box-shadow:0 0 0 2px rgba(154,123,255,.18)}.thumb.video-thumb{border-color:rgba(154,123,255,.35)}.thumb img{width:100%;height:100%;object-fit:cover}.thumb span{position:absolute;left:5px;bottom:4px;min-width:17px;padding:2px 4px;border-radius:5px;color:#fff;background:rgba(0,0,0,.65);font-size:8px;font-weight:800}.video{width:100%;height:auto;max-height:68svh;background:#050507}.video-badge{position:absolute;left:11px;top:11px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:#fff;background:rgba(8,8,11,.72);backdrop-filter:blur(10px);font-size:8px;font-weight:800;letter-spacing:.08em}@media(max-width:600px){.result-info{align-items:stretch;flex-direction:column}.actions{width:100%}.secondary,.download{flex:1}.gallery-strip{padding-bottom:13px}}@media(max-width:380px){.actions{flex-direction:column}.secondary,.download{width:100%}}
</style>