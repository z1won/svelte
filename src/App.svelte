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

  async function extract() {
    error = ''; imageUrl = ''; title = ''; author = ''; sourceLabel = ''; imageStatus = ''; imageWidth = 0; imageHeight = 0; candidateCount = 0; attemptLabel = '';
    const value = input.trim();
    if (!isInstagramUrl(value)) { error = '공개 Instagram 게시물 링크를 입력해 주세요.'; return; }
    loading = true; imageStatus = 'Instagram 공개 페이지를 확인하고 있어요';
    try {
      const cleanUrl = value.split(/[?#]/)[0].replace(/\/$/, '');
      const browserFunction = `async ({page}) => { const grab=()=>page.evaluate(()=>({title:document.title,images:[...document.images].flatMap(i=>[i.currentSrc,i.src,i.srcset,i.getAttribute('data-src'),i.getAttribute('data-srcset')]),meta:[...document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')].map(m=>m.content),bg:[...document.querySelectorAll('[style*="background-image"]')].map(e=>e.style.backgroundImage),resources:performance.getEntriesByType('resource').map(r=>r.name).filter(u=>/\\.(jpe?g|png|webp|avif)(?:[?#]|$)|cdninstagram|fbcdn|fbsbx/i.test(u))})); let r=await grab(); if(!r.images.length&&!r.meta.length&&!r.resources.length){await page.goto('${cleanUrl}/embed/',{waitUntil:'domcontentloaded',timeout:12000}).catch(()=>{}); await new Promise(x=>setTimeout(x,2500)); r=await grab()} return r }`;
      const params = new URLSearchParams({ url: value, meta: 'false', function: browserFunction });
      attemptLabel = '1차 페이지 확인 · 공개 임베드까지 자동 재시도';
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
      imageStatus = `${uniqueCandidates.length}개 후보의 실제 해상도를 확인하고 있어요`;
      const probed = (await Promise.all(uniqueCandidates.map(probeImage))).filter(Boolean).sort((a,b)=>(b.width*b.height)-(a.width*a.height));
      const best = probed[0];
      if (!best) throw new Error('image candidate unavailable');
      imageUrl = best.url; imageWidth = best.width; imageHeight = best.height;
      sourceLabel = best.width >= 1080 || best.height >= 1080 ? '공개 임베드에서 확인한 고해상도 이미지' : '확인된 이미지';
      imageStatus = formatResolution(best.width, best.height);
      attemptLabel = '';
    } catch {
      imageStatus = ''; error = 'Instagram이 자동 접근에 이미지 주소를 제공하지 않았습니다.'; attemptLabel = '공개 게시물·임베드 두 경로를 확인했지만 이미지 후보가 없었어요.';
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
    } catch { imageStatus = '브라우저에서 이미지를 열었어요'; window.open(imageUrl, '_blank', 'noopener,noreferrer'); }
  }
</script>

<svelte:head><meta name="apple-mobile-web-app-capable" content="yes" /></svelte:head>

<main class="page">
  <section class="card">
    <div class="brand"><div class="brand-mark">IS</div><div><p class="eyebrow">PUBLIC MEDIA TOOL</p><h1>InstaSave</h1></div></div>
    <div class="hero-copy"><h2>사진을 붙여 넣고,<br /><span>실제 해상도를 확인하세요.</span></h2><p>Instagram 공개 페이지와 공식 임베드 경로를 차례로 확인해 이미지 주소를 찾습니다.</p></div>
    <form on:submit|preventDefault={extract} class="form"><label for="url">Instagram 게시물 링크</label><div class="input-row"><input id="url" bind:value={input} type="url" inputmode="url" autocomplete="off" placeholder="https://www.instagram.com/p/..." /><button class="primary" type="submit" disabled={loading}><span>{loading ? '확인 중' : '추출'}</span>{#if !loading}<span aria-hidden="true">↗</span>{/if}</button></div></form>
    {#if loading}<div class="progress" aria-live="polite"><span></span><div><strong>{imageStatus}</strong>{#if attemptLabel}<small>{attemptLabel}</small>{/if}</div></div>{/if}
    {#if error}<div class="error" role="alert"><div><strong>{error}</strong><span>{attemptLabel}</span></div><button type="button" on:click={extract}>다시 시도</button></div>{/if}
    {#if imageUrl}<article class="result"><div class="result-badge">{sourceLabel}</div><div class="preview-wrap"><img class="preview" src={imageUrl} alt={title} on:load={handleImageLoad} />{#if imageWidth && imageHeight}<div class="resolution-pill">{formatResolution(imageWidth, imageHeight)}</div>{/if}</div><div class="result-info"><div class="result-meta"><p class="result-title">{title}</p><p class="result-author">{author}</p>{#if imageWidth && imageHeight}<p class="resolution">실제 이미지 · {formatResolution(imageWidth, imageHeight)}</p>{/if}</div><button class="download" on:click={download}>사진 저장 <span aria-hidden="true">↓</span></button></div>{#if imageStatus}<p class="status">{imageStatus}</p>{/if}</article>{/if}
    <div class="footer-note"><span>✦</span><p>공개된 콘텐츠와 다운로드 권한이 있는 콘텐츠만 이용하세요.</p></div>
  </section>
</main>
