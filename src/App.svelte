<script>
  let input = '';
  let imageUrl = '';
  let title = '';
  let author = '';
  let loading = false;
  let error = '';
  let sourceLabel = '';
  let imageStatus = '';

  const isInstagramUrl = (value) => {
    try {
      const url = new URL(value);
      return /(^|\.)instagram\.com$/i.test(url.hostname) && /^\/(p|reel|tv)\//i.test(url.pathname);
    } catch {
      return false;
    }
  };

  const normalizeUrl = (value) => String(value || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/\\u003D/g, '=');

  const isImageUrl = (url) => {
    try {
      const parsed = new URL(url);
      return /(^|\.)fbcdn\.net$|(^|\.)cdninstagram\.com$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  };

  const scoreImageUrl = (url) => {
    if (!isImageUrl(url)) return -Infinity;
    const value = url.toLowerCase();
    let score = 100;
    if (/display_url/.test(value)) score += 500;
    if (/s320x320|s480x480|s640x640|s750x750|s150x150/.test(value)) score -= 1000;
    if (/s1080x1080|s1440x1440|s2560x2560|s3200x3200/.test(value)) score += 300;
    if (/thumbnail|profile|avatar/.test(value)) score -= 700;
    if (/jpg|jpeg|webp|png/.test(value)) score += 50;
    return score;
  };

  const extractCandidates = (html) => {
    if (typeof html !== 'string' || !html) return [];
    const candidates = [];
    const patterns = [
      /display_url\\?"\s*:\s*\\?"(https:[^"\\]+)/gi,
      /\\?"url\\?"\s*:\s*\\?"(https:[^"\\]+)[^}]{0,500}?\\?"width\\?"\s*:\s*(\d+)[^}]{0,120}?\\?"height\\?"\s*:\s*(\d+)/gi,
      /https:\\/\\/[^"'\\\\\s<>]+/gi
    ];

    for (const match of html.matchAll(patterns[0])) candidates.push({ url: normalizeUrl(match[1]), score: 1000 });
    for (const match of html.matchAll(patterns[1])) {
      const area = Number(match[2]) * Number(match[3]);
      candidates.push({ url: normalizeUrl(match[1]), score: 900 + Math.min(area / 100000, 500) });
    }
    for (const match of html.matchAll(patterns[2])) candidates.push({ url: normalizeUrl(match[0]), score: 0 });

    return [...new Map(candidates.map((item) => [item.url, item])).values()]
      .filter((item) => isImageUrl(item.url))
      .map((item) => ({ ...item, score: item.score + scoreImageUrl(item.url) }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.url);
  };

  const loadable = (url) => new Promise((resolve) => {
    if (!url) return resolve(false);
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth >= 900 && image.naturalHeight >= 900);
    image.onerror = () => resolve(false);
    image.src = url;
  });

  async function extract() {
    error = '';
    imageUrl = '';
    title = '';
    author = '';
    sourceLabel = '';
    imageStatus = '';
    const value = input.trim();

    if (!isInstagramUrl(value)) {
      error = '공개 Instagram 게시물 링크를 입력해 주세요.';
      return;
    }

    loading = true;
    imageStatus = '원본 이미지 후보를 분석하고 있어요';

    try {
      const params = new URLSearchParams({ url: value, meta: 'true', html: 'true' });
      const response = await fetch(`https://api.microlink.io/?${params}`);
      if (!response.ok) throw new Error('metadata request failed');

      const payload = await response.json();
      const data = payload?.data ?? {};
      const fallbackImage = normalizeUrl(data.image?.url || data.image || '');
      title = data.title || 'Instagram photo';
      author = data.author || data.siteName || 'Instagram';

      const candidates = extractCandidates(data.html);
      const ordered = [...candidates, fallbackImage].filter(Boolean);
      let best = '';

      for (const candidate of ordered.slice(0, 12)) {
        if (await loadable(candidate)) {
          best = candidate;
          break;
        }
      }

      imageUrl = best || ordered[0] || '';
      if (!imageUrl) throw new Error('image not found');

      sourceLabel = candidates.length ? '고해상도 후보 선택됨' : '미리보기 이미지';
      imageStatus = '';
    } catch {
      imageStatus = '';
      error = '이미지를 찾지 못했습니다. 공개 게시물인지 확인하거나 잠시 후 다시 시도해 주세요.';
    } finally {
      loading = false;
    }
  }

  async function download() {
    if (!imageUrl) return;
    imageStatus = '사진을 준비하고 있어요';
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `instagram-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      imageStatus = '저장 준비가 완료됐어요';
    } catch {
      imageStatus = '브라우저에서 원본 이미지를 열었어요';
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  }
</script>

<svelte:head>
  <meta name="apple-mobile-web-app-capable" content="yes" />
</svelte:head>

<main class="page">
  <section class="card">
    <div class="brand">
      <div class="brand-mark">IS</div>
      <div>
        <p class="eyebrow">PUBLIC MEDIA TOOL</p>
        <h1>InstaSave</h1>
      </div>
    </div>

    <div class="hero-copy">
      <h2>사진을 붙여 넣고,<br /><span>더 선명하게 저장하세요.</span></h2>
      <p>공개 Instagram 게시물에서 고해상도 이미지 후보를 찾아 미리 보고 저장합니다.</p>
    </div>

    <form on:submit|preventDefault={extract} class="form">
      <label for="url">Instagram 게시물 링크</label>
      <div class="input-row">
        <input id="url" bind:value={input} type="url" inputmode="url" autocomplete="off" placeholder="https://www.instagram.com/p/..." />
        <button class="primary" type="submit" disabled={loading}>
          <span>{loading ? '분석 중' : '추출'}</span>
          {#if !loading}<span aria-hidden="true">↗</span>{/if}
        </button>
      </div>
    </form>

    {#if loading}
      <div class="progress" aria-live="polite"><span></span>{imageStatus}</div>
    {/if}

    {#if error}<div class="error" role="alert">{error}</div>{/if}

    {#if imageUrl}
      <article class="result">
        <div class="result-badge">{sourceLabel}</div>
        <div class="preview-wrap"><img class="preview" src={imageUrl} alt={title} /></div>
        <div class="result-info">
          <div class="result-meta">
            <p class="result-title">{title}</p>
            <p class="result-author">{author}</p>
          </div>
          <button class="download" on:click={download}>사진 저장 <span aria-hidden="true">↓</span></button>
        </div>
        {#if imageStatus}<p class="status">{imageStatus}</p>{/if}
      </article>
    {/if}

    <div class="footer-note">
      <span>✦</span>
      <p>공개된 콘텐츠와 다운로드 권한이 있는 콘텐츠만 이용하세요.</p>
    </div>
  </section>
</main>
