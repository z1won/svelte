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

  const isInstagramUrl = (value) => {
    try {
      const url = new URL(value);
      return /(^|\.)instagram\.com$/i.test(url.hostname) && /^\/(p|reel|tv)\//i.test(url.pathname);
    } catch { return false; }
  };

  const normalizeUrl = (value) => String(value || '')
    .replace(/\\u0026/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
    .replace(/&amp;/g, '&').replace(/\\u003D/g, '=').replace(/\\u003F/g, '?').replace(/\\u0025/gi, '%');

  const validMediaUrl = (value) => {
    try {
      const u = new URL(normalizeUrl(value));
      return /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$|(^|\.)fbsbx\.com$|(^|\.)instagram\.com$/i.test(u.hostname);
    } catch { return false; }
  };

  const size = (item) => (item.width || 0) * (item.height || 0);
  const resolution = (w, h) => w && h ? `${w.toLocaleString()} × ${h.toLocaleString()} px` : '해상도 확인 중';
  const fileExt = (url) => /\.(png|webp|avif)(?:[?#]|$)/i.test(url) ? url.match(/\.(png|webp|avif)/i)[1] : 'jpg';

  const collectScripts = `async({page})=>page.evaluate(()=>{const a=[],ok=u=>/^https?:\\/\\/(?:[^/]+\\.)?(?:cdninstagram|fbcdn|instagram|fbsbx)\\./i.test(u);const w=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(w);return}if(typeof v!='object')return;for(const[k,x]of Object.entries(v)){if((k=='display_url'||k=='display_src'||k=='thumbnail_src')&&typeof x=='string'&&ok(x))a.push({url:x,width:v.dimensions?.width||v.width||0,height:v.dimensions?.height||v.height||0});if(k=='image_versions2'&&x?.candidates)w(x.candidates);else if(k=='candidates'&&Array.isArray(x))w(x);else w(x)}};document.querySelectorAll('script[data-sjs],script[type="application/ld+json"]').forEach(s=>{try{w(JSON.parse(s.textContent))}catch{}});return a})`;

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { input = text.trim(); copied = true; setTimeout(() => copied = false, 1400); }
    } catch {}
  }

  async function extract() {
    error = ''; status = ''; media = []; selected = 0; title = ''; author = ''; tried = '';
    const value = input.trim();
    if (!isInstagramUrl(value)) { error = 'Instagram 게시물 링크 형식이 아니에요.'; tried = '/p, /reel, /tv 링크를 사용해 주세요.'; return; }
    loading = true; status = 'Instagram 내부 미디어 데이터를 분석하고 있어요'; tried = '페이지 JSON · 이미지 후보 · 임베드 경로 순서로 확인';
    try {
      const params = new URLSearchParams({ url: value, meta: 'false', function: collectScripts });
      const response = await fetch(`https://api.microlink.io/?${params}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
      const fn = payload?.data?.function || {};
      const raw = Array.isArray(fn) ? fn : [];
      const extra = [];
      const pageMeta = payload?.data?.images || payload?.data?.image;
      const push = (item) => {
        const url = normalizeUrl(item?.url || item).trim();
        if (!validMediaUrl(url)) return;
        const width = Number(item?.width) || 0;
        const height = Number(item?.height) || 0;
        extra.push({ url, width, height });
      };
      raw.forEach(push);
      if (Array.isArray(pageMeta)) pageMeta.forEach(push); else if (pageMeta) push(pageMeta);
      const unique = new Map();
      for (const item of extra) {
        const old = unique.get(item.url);
        if (!old || size(item) > size(old)) unique.set(item.url, item);
      }
      const all = [...unique.values()].sort((a, b) => size(b) - size(a));
      if (!all.length) throw new Error('no media');
      const groups = [];
      for (const item of all) {
        const existing = groups.find(g => Math.abs((g.width || 0) - item.width) < 4 && Math.abs((g.height || 0) - item.height) < 4);
        if (!existing) groups.push(item);
      }
      media = groups.slice(0, 12);
      selected = 0;
      title = 'Instagram 게시물';
      author = 'Instagram';
      status = `${media.length}개의 고해상도 후보를 확인했어요`;
      tried = '';
    } catch {
      error = 'Instagram 미디어 데이터를 가져오지 못했어요.';
      tried = '공개 게시물만 지원하며, Instagram이 로그인/접근 제한을 표시하면 추출할 수 없습니다.';
    } finally { loading = false; }
  }

  const current = () => media[selected] || null;

  async function save(item, index = selected) {
    if (!item?.url) return;
    status = '이미지를 저장하고 있어요';
    try {
      const response = await fetch(item.url, { mode: 'cors' });
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href; anchor.download = `instagram-${String(index + 1).padStart(2, '0')}-${Date.now()}.${fileExt(item.url)}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(href);
      status = resolution(item.width, item.height);
    } catch {
      status = '브라우저에서 원본 이미지를 열었어요';
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  }

  function openOriginal() {
    const item = current();
    if (item) window.open(item.url, '_blank', 'noopener,noreferrer');
  }
</script>

<svelte:head>
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#08080a" />
</svelte:head>

<main class="page">
  <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
  <section class="shell">
    <header class="topbar">
      <div class="brand"><div class="brand-mark"><span>IS</span></div><div class="brand-name">InstaSave</div></div>
      <div class="availability"><i></i> PUBLIC MEDIA</div>
    </header>

    <div class="hero">
      <div class="hero-kicker"><span>01</span> INSTAGRAM MEDIA EXTRACTOR</div>
      <h1>사진 한 장부터<br /><em>캐러셀까지 한 번에.</em></h1>
      <p>게시물의 공개 미디어 데이터를 분석해 가능한 가장 큰 이미지 후보를 찾아냅니다.<br class="desktop" /> 여러 장의 게시물도 선택해서 각각 저장할 수 있어요.</p>
    </div>

    <section class="extract-card">
      <div class="card-topline"><div><span class="step-dot">1</span><span>게시물 링크</span></div><button type="button" class="paste" on:click={pasteLink}>{copied ? '붙여넣음 ✓' : '클립보드 붙여넣기'}</button></div>
      <form on:submit|preventDefault={extract}>
        <div class="input-shell">
          <span class="input-icon">↗</span>
          <input bind:value={input} type="url" inputmode="url" autocomplete="off" aria-label="Instagram 게시물 링크" placeholder="instagram.com/p/..." />
          {#if input}<button type="button" class="clear" aria-label="입력 지우기" on:click={() => input = ''}>×</button>{/if}
          <button class="primary" type="submit" disabled={loading}><span>{loading ? '분석 중' : '미디어 찾기'}</span><b>→</b></button>
        </div>
      </form>
      <div class="helper"><span>✦</span> 공개 게시물 / 릴스만 지원 · 로그인 및 비공개 콘텐츠는 처리하지 않습니다.</div>
    </section>

    {#if loading}<div class="progress"><div class="loader"><span></span><span></span><span></span></div><div><strong>{status}</strong><small>{tried}</small></div></div>{/if}
    {#if error}<div class="error"><div class="error-icon">!</div><div class="error-copy"><strong>{error}</strong><span>{tried}</span></div><button type="button" on:click={extract}>다시 시도 ↗</button></div>{/if}

    {#if media.length}
      {@const item = current()}
      <article class="result">
        <div class="result-head"><div><span class="live-dot"></span> {media.length > 1 ? `MEDIA ${selected + 1} / ${media.length}` : 'RESULT'}</div><span>ORIGINAL CANDIDATE</span></div>
        <div class="preview-wrap"><img class="preview" src={item.url} alt={title} /><div class="image-overlay"></div><div class="resolution-pill"><span>RESOLUTION</span>{resolution(item.width, item.height)}</div></div>
        <div class="result-info">
          <div class="result-meta"><p class="result-title">{title}</p><p class="result-author">{author}</p><p class="resolution">✓ 공개 페이지에서 확인된 이미지 후보</p></div>
          <div class="actions"><button class="secondary" on:click={openOriginal}>원본 열기</button><button class="download" on:click={() => save(item)}><span>사진 저장</span><b>↓</b></button></div>
        </div>
        {#if media.length > 1}
          <div class="gallery-strip" aria-label="게시물 이미지 선택">
            {#each media as candidate, index}
              <button class:active={index === selected} class="thumb" on:click={() => selected = index} aria-label={`${index + 1}번째 이미지`}><img src={candidate.url} alt="" loading="lazy" /><span>{index + 1}</span></button>
            {/each}
          </div>
        {/if}
        {#if status}<p class="status">{status}</p>{/if}
      </article>
    {/if}

    <footer class="footer"><div class="trust"><span>✦</span><p>다운로드 권한이 있는 공개 콘텐츠만 저장하세요.</p></div><div class="footer-links"><span>HIGH RES</span><span>CAROUSEL</span><span>NO LOGIN</span></div></footer>
  </section>
</main>
