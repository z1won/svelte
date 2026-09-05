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
    .replace(/\\u003D/g, '=')
    .replace(/\\u003F/g, '?');

  const isImageUrl = (url) => {
    try {
      const parsed = new URL(url);
      return /(^|\.)fbcdn\.net$|(^|\.)cdninstagram\.com$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  };

  const addUrl = (set, value) => {
    const url = normalizeUrl(value).trim();
    if (isImageUrl(url)) set.add(url);
  };

  const addSrcset = (set, value) => {
    if (typeof value !== 'string') return;
    for (const part of value.split(',')) {
      const url = part.trim().split(/\s+/)[0];
      addUrl(set, url);
    }
  };

  const collectFromHtml = (html) => {
    const urls = new Set();
    if (typeof html !== 'string' || !html) return urls;

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const img of doc.querySelectorAll('img')) {
        addUrl(urls, img.getAttribute('src'));
        addSrcset(urls, img.getAttribute('srcset'));
      }
      for (const meta of doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')) {
        addUrl(urls, meta.getAttribute('content'));
      }
    } catch {
      // Fall back to escaped URL scanning below.
    }

    const decoded = html
      .replace(/\\u0026/g, '&')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');
    const matches = decoded.match(/https?:\/\/[^\"'<>\s\\]+/gi) || [];
    for (const match of matches) addUrl(urls, match);

    return urls;
  };

  const collectFromValue = (value, urls) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (isImageUrl(normalizeUrl(value))) addUrl(urls, value);
      addSrcset(urls, value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collectFromValue(item, urls);
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value)) collectFromValue(item, urls);
    }
  };

  const getCandidateUrls = (data) => {
    const urls = collectFromHtml(data?.html);
    collectFromValue(data?.images, urls);
    collectFromValue(data?.image, urls);
    return [...urls].slice(0, 30);
  };

  const probeImage = (url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });

  const formatResolution = (width, height) => width && height ? `${width.toLocaleString()} × ${height.toLocaleString()} px` : '';

  function handleImageLoad(event) {
    imageWidth = event.currentTarget.naturalWidth || 0;
    imageHeight = event.currentTarget.naturalHeight || 0;
  }

  async function extract() {
    error = '';
    imageUrl = '';
    title = '';
    author = '';
    sourceLabel = '';
    imageStatus = '';
    imageWidth = 0;
    imageHeight = 0;
    const value = input.trim();

    if (!isInstagramUrl(value)) {
      error = '공개 Instagram 게시물 링크를 입력해 주세요.';
      return;
    }

    loading = true;
    imageStatus = 'Instagram 이미지 후보를 수집하고 실제 해상도를 확인하고 있어요';

    try {
      const params = new URLSearchParams({
        url: value,
        meta: 'true',
        html: 'true',
        'images.selector': 'img',
        'images.attribute': 'srcset'
      });
      const response = await fetch(`https://api.microlink.io/?${params}`);
      if (!response.ok) throw new Error('metadata request failed');

      const payload = await response.json();
      const data = payload?.data ?? {};
      title = data.title || 'Instagram photo';
      author = data.author || data.siteName || 'Instagram';

      const candidates = getCandidateUrls(data);
      const fallbackImage = normalizeUrl(data.image?.url || data.image || '');
      if (isImageUrl(fallbackImage)) candidates.push(fallbackImage);

      const uniqueCandidates = [...new Set(candidates)].slice(0, 20);
      const probed = (await Promise.all(uniqueCandidates.map(probeImage))).filter(Boolean);
      probed.sort((a, b) => (b.width * b.height) - (a.width * a.height));

      const best = probed[0];
      if (!best) throw new Error('image not found');

      imageUrl = best.url;
      imageWidth = best.width;
      imageHeight = best.height;
      sourceLabel = best.width >= 1080 || best.height >= 1080 ? '고해상도 원본 후보' : '확인된 이미지';
      imageStatus = formatResolution(best.width, best.height);
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
      imageStatus = formatResolution(imageWidth, imageHeight);
    } catch {
      imageStatus = '브라우저에서 이미지를 열었어요';
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
      <h2>사진을 붙여 넣고,<br /><span>실제 해상도를 확인하세요.</span></h2>
      <p>후보 이미지를 실제로 로드해 가장 큰 해상도를 선택합니다. 결과 카드에서 저장되는 이미지의 픽셀 크기도 바로 확인할 수 있어요.</p>
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
        <div class="preview-wrap">
          <img class="preview" src={imageUrl} alt={title} on:load={handleImageLoad} />
          {#if imageWidth && imageHeight}
            <div class="resolution-pill">{formatResolution(imageWidth, imageHeight)}</div>
          {/if}
        </div>
        <div class="result-info">
          <div class="result-meta">
            <p class="result-title">{title}</p>
            <p class="result-author">{author}</p>
            {#if imageWidth && imageHeight}
              <p class="resolution">실제 이미지 · {formatResolution(imageWidth, imageHeight)}</p>
            {/if}
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
