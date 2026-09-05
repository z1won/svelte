<script>
  let input = '';
  let imageUrl = '';
  let title = '';
  let author = '';
  let loading = false;
  let error = '';
  let sourceLabel = '';
  let imageStatus = '';
  let imageWidth = 0;
  let imageHeight = 0;
  let candidateCount = 0;
  let attemptLabel = '';
  let copied = false;

  const isInstagramUrl = (value) => {
    try {
      const url = new URL(value);
      return /(^|\.)instagram\.com$/i.test(url.hostname) && /^\/(p|reel|tv)\//i.test(url.pathname);
    } catch { return false; }
  };

  const normalizeUrl = (value) => String(value || '')
    .replace(/\\u0026/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
    .replace(/&amp;/g, '&').replace(/\\u003D/g, '=').replace(/\\u003F/g, '?').replace(/\\u0025/gi, '%');

  const isImageUrl = (value) => {
    try {
      const parsed = new URL(normalizeUrl(value));
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      return /(^|\.)fbcdn\.net$|(^|\.)cdninstagram\.com$|(^|\.)instagram\.com$|(^|\.)fbsbx\.com$/i.test(host)
        || /\.(jpe?g|png|webp|avif)(?:$|\?)/i.test(path)
        || parsed.search.includes('stp=dst-');
    } catch { return false; }
  };

  const addUrl = (set, value) => {
    const url = normalizeUrl(value).trim();
    if (/^https?:\/\//i.test(url) && isImageUrl(url)) set.add(url);
  };

  const addSrcset = (set, value) => {
    if (typeof value !== 'string') return;
    for (const part of value.split(',')) addUrl(set, part.trim().split(/\s+/)[0]);
  };

  const collectFromValue = (value, urls) => {
    if (!value) return;
    if (typeof value === 'string') { addUrl(urls, value); addSrcset(urls, value); return; }
    if (Array.isArray(value)) { for (const item of value) collectFromValue(item, urls); return; }
    if (typeof value === 'object') for (const item of Object.values(value)) collectFromValue(item, urls);
  };

  const probeImage = (url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });

  const formatResolution = (width, height) => width && height ? `${width.toLocaleString()} × ${height.toLocaleString()} px` : '';
  const handleImageLoad = (event) => { imageWidth = event.currentTarget.naturalWidth || 0; imageHeight = event.currentTarget.naturalHeight || 0; };

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { input = text.trim(); copied = true; setTimeout(() => copied = false, 1400); }
    } catch { input = input || 'https://www.instagram.com/p/...'; }
  }

  async function extract() {
    error = ''; imageUrl = ''; title = ''; author = ''; sourceLabel = ''; imageStatus = ''; imageWidth = 0; imageHeight = 0; candidateCount = 0; attemptLabel = '';
    const value = input.trim();
    if (!isInstagramUrl(value)) { error = 'Instagram 게시물 링크 형식이 아니에요.'; attemptLabel = 'instagram.com/p, /reel, /tv 링크를 사용해 주세요.'; return; }
    loading = true; imageStatus = '공개 페이지에서 이미지 정보를 확인하고 있어요';
    try {
      const cleanUrl = value.split(/[?#]/)[0].replace(/\/$/, '');
      const browserFunction = `async ({page}) => { const grab=()=>page.evaluate(()=>({title:document.title,images:[...document.images].flatMap(i=>[i.currentSrc,i.src,i.srcset,i.getAttribute('data-src'),i.getAttribute('data-srcset')]),meta:[...document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')].map(m=>m.content),bg:[...document.querySelectorAll('[style*="background-image"]')].map(e=>e.style.backgroundImage),resources:performance.getEntriesByType('resource').map(r=>r.name).filter(u=>/\\.(jpe?g|png|webp|avif)(?:[?#]|$)|cdninstagram|fbcdn|fbsbx/i.test(u))})); let r=await grab(); if(!r.images.length&&!r.meta.length&&!r.resources.length){await page.goto('${cleanUrl}/embed/',{waitUntil:'domcontentloaded',timeout:12000}).catch(()=>{}); await new Promise(x=>setTimeout(x,2500)); r=await grab()} return r }`;
      const params = new URLSearchParams({ url: value, meta: 'false', function: browserFunction });
      attemptLabel = '페이지 확인 · 공개 임베드 경로까지 자동 확인';
      const response = await fetch(`https://api.microlink.io/?${params}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
      const fn = payload?.data?.function || {};
      title = fn.title || 'Instagram photo'; author = 'Instagram';
      const urls = new Set();
      collectFromValue(fn.images, urls); collectFromValue(fn.meta, urls); collectFromValue(fn.bg, urls); collectFromValue(fn.resources, urls);
      collectFromValue(payload?.data?.images, urls); collectFromValue(payload?.data?.image, urls);
      const candidates = [...urls]; candidateCount = candidates.length;
      const uniqueCandidates = [...new Set(candidates)].slice(0, 80);
      if (!uniqueCandidates.length) throw new Error('image candidate unavailable');
      imageStatus = `${uniqueCandidates.length}개 후보의 실제 해상도를 비교하고 있어요`;
      const probed = (await Promise.all(uniqueCandidates.map(probeImage))).filter(Boolean).sort((a,b)=>(b.width*b.height)-(a.width*a.height));
      const best = probed[0];
      if (!best) throw new Error('image candidate unavailable');
      imageUrl = best.url; imageWidth = best.width; imageHeight = best.height;
      sourceLabel = best.width >= 1080 || best.height >= 1080 ? '고해상도 이미지 확인됨' : '이미지 확인됨';
      imageStatus = formatResolution(best.width, best.height);
      attemptLabel = '';
    } catch {
      imageStatus = ''; error = '이미지 주소를 확인하지 못했어요.'; attemptLabel = '공개 게시물과 임베드 경로를 확인했지만 이미지 후보가 없었어요.';
    } finally { loading = false; }
  }

  async function download() {
    if (!imageUrl) return;
    imageStatus = '사진을 준비하고 있어요';
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `instagram-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      imageStatus = formatResolution(imageWidth, imageHeight);
    } catch { imageStatus = '새 탭에서 이미지를 열었어요'; window.open(imageUrl, '_blank', 'noopener,noreferrer'); }
  }
</script>

<svelte:head>
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#09090b" />
</svelte:head>

<main class="page">
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>

  <section class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><span>IS</span></div>
        <div class="brand-name">InstaSave</div>
      </div>
      <div class="availability"><i></i> PUBLIC ONLY</div>
    </header>

    <div class="hero">
      <div class="hero-kicker"><span>01</span> IMAGE EXTRACTOR</div>
      <h1>링크 하나로<br /><em>깔끔하게 저장.</em></h1>
      <p>공개 Instagram 게시물에서 확인 가능한 이미지 주소를 찾고,<br class="desktop" /> 실제 로드되는 해상도를 비교해 가장 큰 이미지를 보여드립니다.</p>
    </div>

    <section class="extract-card">
      <div class="card-topline"><div><span class="step-dot">1</span><span>게시물 링크</span></div><button type="button" class="paste" on:click={pasteLink}>{copied ? '붙여넣음 ✓' : '클립보드 붙여넣기'}</button></div>
      <form on:submit|preventDefault={extract}>
        <div class="input-shell" class:has-value={input}>
          <span class="input-icon" aria-hidden="true">↗</span>
          <input id="url" bind:value={input} type="url" inputmode="url" autocomplete="off" aria-label="Instagram 게시물 링크" placeholder="instagram.com/p/..." />
          {#if input}<button type="button" class="clear" aria-label="입력 지우기" on:click={() => input = ''}>×</button>{/if}
          <button class="primary" type="submit" disabled={loading}><span>{loading ? '분석 중' : '추출 시작'}</span><b aria-hidden="true">→</b></button>
        </div>
      </form>
      <div class="helper"><span>⌁</span> 공개 게시물 / 릴스만 지원 · 로그인이나 비공개 콘텐츠는 처리하지 않습니다.</div>
    </section>

    {#if loading}
      <div class="progress" aria-live="polite"><div class="loader"><span></span><span></span><span></span></div><div><strong>{imageStatus}</strong>{#if attemptLabel}<small>{attemptLabel}</small>{/if}</div></div>
    {/if}

    {#if error}
      <div class="error" role="alert">
        <div class="error-icon">!</div>
        <div class="error-copy"><strong>{error}</strong><span>{attemptLabel}</span></div>
        <button type="button" on:click={extract}>다시 시도 <b>↗</b></button>
      </div>
    {/if}

    {#if imageUrl}
      <article class="result">
        <div class="result-head"><div><span class="live-dot"></span> RESULT</div><span>{sourceLabel}</span></div>
        <div class="preview-wrap"><img class="preview" src={imageUrl} alt={title} on:load={handleImageLoad} /><div class="image-overlay"></div>{#if imageWidth && imageHeight}<div class="resolution-pill"><span>RESOLUTION</span>{formatResolution(imageWidth, imageHeight)}</div>{/if}</div>
        <div class="result-info">
          <div class="result-meta"><p class="result-title">{title}</p><p class="result-author">{author}</p>{#if imageWidth && imageHeight}<p class="resolution">✓ 실제 로드 확인 · {formatResolution(imageWidth, imageHeight)}</p>{/if}</div>
          <button class="download" on:click={download}><span>사진 저장</span><b>↓</b></button>
        </div>
        {#if imageStatus}<p class="status">{imageStatus}</p>{/if}
      </article>
    {/if}

    <footer class="footer">
      <div class="trust"><span>✦</span><p>권한이 있는 공개 콘텐츠만 저장하세요.</p></div>
      <div class="footer-links"><span>FAST</span><span>PRIVATE BY DEFAULT</span><span>NO LOGIN</span></div>
    </footer>
  </section>
</main>
