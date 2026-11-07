/**
 * src/injected/page-probe.js
 * 运行于页面 MAIN World：负责嗅探 BVID/AID/CID、拦截 SPA 切P路由、执行 WBI 签名与同源 API 请求
 */
(function () {
  if (window.__BILI_SCRIPT_PROBE_INITIALIZED__) return;
  window.__BILI_SCRIPT_PROBE_INITIALIZED__ = true;

  // ==================== 1. 纯 JS 轻量 MD5 与 WBI 签名算法 ====================
  function md5(string) {
    function rotateLeft(lValue, iShiftBits) {
      return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }
    function addUnsigned(lX, lY) {
      const lX8 = lX & 0x80000000;
      const lY8 = lY & 0x80000000;
      const lX4 = lX & 0x40000000;
      const lY4 = lY & 0x40000000;
      const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
      if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
      if (lX4 | lY4) {
        if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
        else return lResult ^ 0x40000000 ^ lX8 ^ lY8;
      } else return lResult ^ lX8 ^ lY8;
    }
    function F(x, y, z) { return (x & y) | (~x & z); }
    function G(x, y, z) { return (x & z) | (y & ~z); }
    function H(x, y, z) { return x ^ y ^ z; }
    function I(x, y, z) { return y ^ (x | ~z); }
    function FF(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function GG(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function HH(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function II(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function convertToWordArray(str) {
      let lWordCount;
      const lMessageLength = str.length;
      const lNumberOfWordsTemp1 = lMessageLength + 8;
      const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
      const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
      const lWordArray = Array(lNumberOfWords - 1);
      let lBytePosition = 0;
      let lByteCount = 0;
      while (lByteCount < lMessageLength) {
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = (lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition));
        lByteCount++;
      }
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
      lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
      lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
      return lWordArray;
    }
    function wordToHex(lValue) {
      let wordToHexValue = '', wordToHexValueTemp = '', lByte, lCount;
      for (lCount = 0; lCount <= 3; lCount++) {
        lByte = (lValue >>> (lCount * 8)) & 255;
        wordToHexValueTemp = '0' + lByte.toString(16);
        wordToHexValue = wordToHexValue + wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2);
      }
      return wordToHexValue;
    }
    function utf8Encode(str) {
      return unescape(encodeURIComponent(str));
    }
    const x = convertToWordArray(utf8Encode(string));
    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
    const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    const S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    for (let k = 0; k < x.length; k += 16) {
      const AA = a, BB = b, CC = c, DD = d;
      a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478); d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
      c = FF(c, d, a, b, x[k + 2], S13, 0x242070db); b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
      a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf); d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
      c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
      a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8); d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
      c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1); b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
      a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122); d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
      c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e); b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
      a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562); d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
      c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51); b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
      a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d); d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
      c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681); b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
      a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6); d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
      c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87); b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
      a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905); d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
      c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9); b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
      a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
      c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122); b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
      a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44); d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
      c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60); b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
      a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6); d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
      c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085); b = HH(b, c, d, a, x[k + 6], S34, 0x04881d05);
      a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039); d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
      c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8); b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
      a = II(a, b, c, d, x[k + 0], S41, 0xf4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
      c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7); b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
      a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3); d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
      c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d); b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
      a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f); d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
      c = II(c, d, a, b, x[k + 6], S43, 0xa3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
      a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82); d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
      c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb); b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
      a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
    }
    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
  }

  const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
  ];

  let cachedWbiKeys = null;
  let cachedIsLoggedIn = false;

  async function getWbiKeys() {
    if (cachedWbiKeys && Date.now() - cachedWbiKeys.ts < 3600 * 1000) {
      return cachedWbiKeys;
    }
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      credentials: 'include'
    });
    const json = await res.json();
    cachedIsLoggedIn = Boolean(json?.data?.isLogin);
    const imgUrl = json?.data?.wbi_img?.img_url || '';
    const subUrl = json?.data?.wbi_img?.sub_url || '';
    const imgKey = imgUrl.slice(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.'));
    const subKey = subUrl.slice(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.'));
    const rawWbiKey = imgKey + subKey;
    let mixinKey = '';
    MIXIN_KEY_ENC_TAB.forEach((n) => {
      if (rawWbiKey[n]) mixinKey += rawWbiKey[n];
    });
    mixinKey = mixinKey.slice(0, 32);
    cachedWbiKeys = { mixinKey, ts: Date.now(), isLoggedIn: cachedIsLoggedIn };
    return cachedWbiKeys;
  }

  async function encWbi(params) {
    const { mixinKey } = await getWbiKeys();
    const wts = Math.round(Date.now() / 1000);
    const chrFilter = /[!'()*]/g;
    const query = [];
    const newParams = { ...params, wts };
    Object.keys(newParams)
      .sort()
      .forEach((key) => {
        const val = String(newParams[key]).replace(chrFilter, '');
        query.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
      });
    const queryStr = query.join('&');
    const wRid = md5(queryStr + mixinKey);
    return `${queryStr}&w_rid=${wRid}`;
  }

  // ==================== 2. 视频元数据与多P参数嗅探 ====================
  function getUrlParamP() {
    const searchParams = new URLSearchParams(window.location.search);
    const p = parseInt(searchParams.get('p') || '1', 10);
    return Number.isNaN(p) || p < 1 ? 1 : p;
  }

  function extractBvidFromUrl() {
    const match = window.location.pathname.match(/\/video\/(BV[a-zA-Z0-9]{10})/i);
    if (match) return match[1];
    const searchBvid = new URLSearchParams(window.location.search).get('bvid');
    return searchBvid || '';
  }

  async function resolveCurrentVideoMeta() {
    const p = getUrlParamP();
    const state = window.__INITIAL_STATE__ || {};
    const videoData = state.videoData || {};
    let bvid = videoData.bvid || state.bvid || extractBvidFromUrl();
    let aid = videoData.aid || state.aid;
    let title = videoData.title || document.title.replace(/_哔哩哔哩_bilibili$/, '');
    let ownerMid = videoData?.owner?.mid || state?.upData?.mid || '';
    let ownerName = videoData?.owner?.name || state?.upData?.name || '';
    let pages = Array.isArray(videoData.pages) ? videoData.pages : [];
    let duration = videoData.duration || 0;

    // 若 __INITIAL_STATE__ 尚未就绪或与当前 URL 的 BVID 不一致，主动请求 view 接口兜底
    if (!aid || !pages.length || (bvid && videoData.bvid && bvid !== videoData.bvid)) {
      if (bvid) {
        try {
          const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            credentials: 'include'
          });
          const viewJson = await viewRes.json();
          if (viewJson.code === 0 && viewJson.data) {
            aid = viewJson.data.aid;
            bvid = viewJson.data.bvid;
            title = viewJson.data.title;
            ownerMid = viewJson.data.owner?.mid || ownerMid;
            ownerName = viewJson.data.owner?.name || ownerName;
            pages = viewJson.data.pages || [];
            duration = viewJson.data.duration || duration;
          }
        } catch (err) {
          console.warn('[BiliScriptExtract] Fallback view API error:', err);
        }
      }
    }

    const currentPageObj = pages[p - 1] || pages[0] || {};
    const cid = currentPageObj.cid || state.cid || videoData.cid;
    const partTitle = currentPageObj.part || `P${p}`;
    const partDuration = currentPageObj.duration || duration;

    return {
      bvid,
      aid,
      cid,
      p,
      title,
      partTitle,
      totalPages: pages.length || 1,
      pages: pages.map((item) => ({
        page: item.page,
        cid: item.cid,
        part: item.part,
        duration: item.duration
      })),
      ownerMid,
      ownerName,
      duration: partDuration,
      url: window.location.href
    };
  }

  // ==================== 3. 请求字幕列表与 AI 总结接口 ====================
  async function fetchVideoTranscriptBundle(customCid, customP) {
    const meta = await resolveCurrentVideoMeta();
    if (customCid) meta.cid = customCid;
    if (customP) meta.p = customP;

    if (!meta.bvid || !meta.cid || !meta.aid) {
      return { ok: false, error: '无法解析当前视频的 BVID 或 CID，请刷新页面重试。', meta };
    }

    const wbiInfo = await getWbiKeys();
    meta.isLoggedIn = wbiInfo.isLoggedIn;

    // 并发请求：1. 播放器字幕接口 (/x/player/wbi/v2)  2. AI 总结大纲接口 (/x/web-interface/view/conclusion/get)
    const playerQuery = await encWbi({ aid: meta.aid, bvid: meta.bvid, cid: meta.cid });
    const conclusionQuery = await encWbi({
      bvid: meta.bvid,
      cid: meta.cid,
      up_mid: meta.ownerMid || 0
    });

    const [playerSettled, conclusionSettled] = await Promise.allSettled([
      fetch(`https://api.bilibili.com/x/player/wbi/v2?${playerQuery}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`https://api.bilibili.com/x/web-interface/view/conclusion/get?${conclusionQuery}`, { credentials: 'include' }).then((r) => r.json())
    ]);

    let rawSubtitles = [];
    if (playerSettled.status === 'fulfilled' && playerSettled.value?.code === 0) {
      rawSubtitles = playerSettled.value?.data?.subtitle?.subtitles || [];
    }

    // 规范化字幕列表并按优先级排序（人工中文字幕优先于 AI 自动生成字幕）
    const subtitleTracks = rawSubtitles
      .filter((item) => item && item.subtitle_url)
      .map((item) => {
        let url = item.subtitle_url;
        if (url.startsWith('//')) url = 'https:' + url;
        else if (url.startsWith('http://')) url = url.replace('http://', 'https://');
        const isAi = item.lan?.startsWith('ai-') || item.type === 1;
        return {
          id: item.id_str || String(item.id),
          lan: item.lan,
          lanDoc: item.lan_doc || item.lan,
          url,
          isAi
        };
      })
      .sort((a, b) => {
        if (a.isAi !== b.isAi) return a.isAi ? 1 : -1;
        const aZh = a.lan.includes('zh') ? 0 : 1;
        const bZh = b.lan.includes('zh') ? 0 : 1;
        return aZh - bZh;
      });

    let aiConclusion = null;
    if (conclusionSettled.status === 'fulfilled' && conclusionSettled.value?.code === 0) {
      const modelResult = conclusionSettled.value?.data?.model_result;
      if (modelResult && (modelResult.summary || (modelResult.outline && modelResult.outline.length > 0) || (modelResult.subtitle && modelResult.subtitle.length > 0))) {
        aiConclusion = {
          resultType: modelResult.result_type,
          summary: modelResult.summary || '',
          outline: modelResult.outline || [],
          aiSubtitleBullets: modelResult.subtitle?.[0]?.part_subtitle || []
        };
      }
    }

    return {
      ok: true,
      meta,
      subtitleTracks,
      aiConclusion
    };
  }

  // ==================== 4. 跨上下文通信与 SPA 路由监听 ====================
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'BILI_SCRIPT_CONTENT') return;
    const { action, requestId, payload } = event.data;

    if (action === 'FETCH_BUNDLE') {
      try {
        const result = await fetchVideoTranscriptBundle(payload?.cid, payload?.p);
        window.postMessage({
          source: 'BILI_SCRIPT_PROBE',
          requestId,
          action: 'FETCH_BUNDLE_RESULT',
          payload: result
        }, '*');
      } catch (err) {
        window.postMessage({
          source: 'BILI_SCRIPT_PROBE',
          requestId,
          action: 'FETCH_BUNDLE_RESULT',
          payload: { ok: false, error: err?.message || '未知异常' }
        }, '*');
      }
    } else if (action === 'SEEK_VIDEO') {
      const videoEl = document.querySelector('video');
      if (videoEl && typeof payload?.seconds === 'number') {
        videoEl.currentTime = payload.seconds;
        videoEl.play().catch(() => {});
      }
    }
  });

  // 劫持 history.pushState / replaceState 实现 SPA 切P与换视频 100% 感知
  let lastFingerprint = '';
  async function checkRouteChange(triggerReason) {
    const meta = await resolveCurrentVideoMeta();
    const fingerprint = `${meta.bvid}_${meta.cid}_${meta.p}`;
    if (fingerprint !== lastFingerprint && meta.bvid && meta.cid) {
      lastFingerprint = fingerprint;
      window.postMessage({
        source: 'BILI_SCRIPT_PROBE',
        action: 'ROUTE_CHANGED',
        payload: { triggerReason, meta }
      }, '*');
    }
  }

  const rawPushState = history.pushState;
  history.pushState = function (...args) {
    const ret = rawPushState.apply(this, args);
    setTimeout(() => checkRouteChange('pushState'), 150);
    return ret;
  };

  const rawReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const ret = rawReplaceState.apply(this, args);
    setTimeout(() => checkRouteChange('replaceState'), 150);
    return ret;
  };

  window.addEventListener('popstate', () => {
    setTimeout(() => checkRouteChange('popstate'), 150);
  });

  // 定时指纹巡检兜底（应对播放器内部无路由变动切P）
  setInterval(() => checkRouteChange('poll'), 1000);
})();
