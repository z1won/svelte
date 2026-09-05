<script>
  let input = '';
  let imageUrl = '';
  let title = '';
  let author = '';
  let loading = false;
  let error = '';

  const isInstagramUrl = (value) => {
    try {
      const url = new URL(value);
      return /(^|\.)instagram\.com$/i.test(url.hostname) && /^\/(p|reel|tv)\//i.test(url.pathname);
    } catch {
      return false;
    }
  };

  async function extract() {
    error = '';
    imageUrl = '';
    title = '';
    author = '';

    const value = input.trim();
    if (!isInstagramUrl(value)) {
      error = '공개 Instagram 게시물 링크를 입력해 주세요.';
      return;
    }

    loading = true;
    try {
      const api = `https://api.microlink.io/?url=${encodeURIComponent(value)}&meta=true`;
      const response = await fetch(api);
      if (!response.ok) throw new Error('metadata request failed');

      const payload = await response.json();
      const data = payload?.data ?? {};
      const image = data.image?.url || data.image;

      if (!image) {
        throw new Error('image not found');
      }

      imageUrl = image;
      title = data.title || 'Instagram photo';
      author = data.author || data.siteName || 'Instagram';
    } catch {
      error = '이미지를 찾지 못했습니다. 공개 게시물인지 확인하거나 잠시 후 다시 시도해 주세요.';
    } finally {
      loading = false;
    }
  }

  async function download() {
    if (!imageUrl) return;

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
    } catch {
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

    <p class="lead">공개 Instagram 게시물의 사진을 찾아<br />미리 보고 저장하세요.</p>

    <form on:submit|preventDefault={extract} class="form">
      <label for="url">Instagram 링크</label>
      <div class="input-row">
        <input id="url" bind:value={input} type="url" inputmode="url" autocomplete="off" placeholder="https://www.instagram.com/p/..." />
        <button class="primary" type="submit" disabled={loading}>
          {loading ? '찾는 중…' : '추출'}
        </button>
      </div>
    </form>

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}

    {#if imageUrl}
      <article class="result">
        <div class="preview-wrap">
          <img class="preview" src={imageUrl} alt={title} />
        </div>
        <div class="result-info">
          <div>
            <p class="result-title">{title}</p>
            <p class="result-author">{author}</p>
          </div>
          <button class="download" on:click={download}>사진 저장</button>
        </div>
      </article>
    {/if}

    <p class="notice">공개된 콘텐츠와 다운로드 권한이 있는 콘텐츠만 이용하세요.</p>
  </section>
</main>
