/**
 * src/utils/formatter.js
 * 多格式字幕与 AI 文稿转换引擎
 */
(function () {
  /**
   * 将浮点秒数格式化为 [MM:SS] 或 [HH:MM:SS]
   */
  function formatReadableTime(seconds) {
    const totalSec = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  /**
   * 将浮点秒数格式化为标准 SRT 时间戳 HH:MM:SS,mmm
   */
  function formatSrtTime(seconds) {
    const safeSec = Math.max(0, Number(seconds) || 0);
    const hrs = Math.floor(safeSec / 3600);
    const mins = Math.floor((safeSec % 3600) / 60);
    const secs = Math.floor(safeSec % 60);
    const ms = Math.round((safeSec - Math.floor(safeSec)) * 1000);
    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)},${pad3(ms)}`;
  }

  /**
   * 1. 转换为纯文本 (TXT)
   * @param {Array} body - [{ from, to, content }]
   * @param {Object} options - { mergeParagraphs: boolean, pauseThreshold: number }
   */
  function toPlainText(body, aiConclusion, options = { mergeParagraphs: true, pauseThreshold: 1.1 }) {
    if (!Array.isArray(body) || body.length === 0) {
      if (aiConclusion) return renderAiConclusionText(aiConclusion);
      return '';
    }

    if (!options.mergeParagraphs) {
      return body.map((item) => (item.content || '').trim()).filter(Boolean).join('\n');
    }

    // 智能自然段合并：根据停顿间隔 > pauseThreshold 或段落字数达到 180 字自动分段
    const paragraphs = [];
    let currentPara = '';
    const punctRegex = /[。！？.!?;；，,、]$/;

    for (let i = 0; i < body.length; i++) {
      const text = (body[i].content || '').trim();
      if (!text) continue;

      if (!currentPara) {
        currentPara = text;
      } else {
        const prevTo = Number(body[i - 1]?.to || 0);
        const currFrom = Number(body[i]?.from || 0);
        const gap = currFrom - prevTo;

        if (gap >= (options.pauseThreshold || 1.1) || currentPara.length >= 180) {
          if (!punctRegex.test(currentPara)) currentPara += '。';
          paragraphs.push(currentPara);
          currentPara = text;
        } else {
          const separator = punctRegex.test(currentPara) ? '' : '，';
          currentPara += separator + text;
        }
      }
    }
    if (currentPara) {
      if (!punctRegex.test(currentPara)) currentPara += '。';
      paragraphs.push(currentPara);
    }

    return paragraphs.join('\n\n');
  }

  function renderAiConclusionText(aiConclusion) {
    const lines = [];
    if (aiConclusion.summary) {
      lines.push(`【AI 核心摘要】\n${aiConclusion.summary}\n`);
    }
    if (Array.isArray(aiConclusion.outline) && aiConclusion.outline.length > 0) {
      lines.push('【分段提纲】');
      aiConclusion.outline.forEach((sec, idx) => {
        lines.push(`${idx + 1}. [${formatReadableTime(sec.timestamp)}] ${sec.title}`);
        (sec.part_outline || []).forEach((point) => {
          lines.push(`   - [${formatReadableTime(point.timestamp)}] ${point.content}`);
        });
      });
    }
    return lines.join('\n');
  }

  /**
   * 2. 转换为标准 SRT 字幕格式
   */
  function toSRT(body) {
    if (!Array.isArray(body) || body.length === 0) return '';
    return body
      .map((item, idx) => {
        const start = formatSrtTime(item.from);
        const end = formatSrtTime(item.to ?? (item.from + 2));
        const content = (item.content || '').trim();
        return `${idx + 1}\n${start} --> ${end}\n${content}`;
      })
      .join('\n\n');
  }

  /**
   * 3. 转换为带时间戳与双链元数据的 Markdown (适配 Obsidian / Notion)
   */
  function toMarkdown(body, meta = {}, aiConclusion = null) {
    const baseUrl = `https://www.bilibili.com/video/${meta.bvid || ''}?p=${meta.p || 1}`;
    const lines = [
      '---',
      `title: "${(meta.title || '').replace(/"/g, '\\"')}"`,
      `bvid: "${meta.bvid || ''}"`,
      `part: "P${meta.p || 1} - ${(meta.partTitle || '').replace(/"/g, '\\"')}"`,
      `author: "${(meta.ownerName || '').replace(/"/g, '\\"')}"`,
      `url: "${baseUrl}"`,
      `extracted_at: "${new Date().toISOString()}"`,
      '---',
      '',
      `# ${meta.title || 'Bilibili 视频文稿'}`,
      `> **UP主**：${meta.ownerName || '未知'} | **BV号**：\`${meta.bvid || ''}\` | **分P**：P${meta.p || 1} (${meta.partTitle || ''}) | [原视频链接](${baseUrl})`,
      ''
    ];

    if (aiConclusion && (aiConclusion.summary || (aiConclusion.outline && aiConclusion.outline.length > 0))) {
      lines.push('## AI 视频总结与章节大纲');
      if (aiConclusion.summary) {
        lines.push(`**核心摘要**：${aiConclusion.summary}\n`);
      }
      if (Array.isArray(aiConclusion.outline) && aiConclusion.outline.length > 0) {
        aiConclusion.outline.forEach((sec) => {
          const secTime = Math.floor(Number(sec.timestamp) || 0);
          lines.push(`### [${formatReadableTime(secTime)}](${baseUrl}&t=${secTime}) ${sec.title}`);
          (sec.part_outline || []).forEach((pt) => {
            const ptTime = Math.floor(Number(pt.timestamp) || 0);
            lines.push(`- **[${formatReadableTime(ptTime)}](${baseUrl}&t=${ptTime})** ${pt.content}`);
          });
          lines.push('');
        });
      }
    }

    if (Array.isArray(body) && body.length > 0) {
      lines.push('## 逐句时间戳文稿');
      body.forEach((item) => {
        const sec = Math.floor(Number(item.from) || 0);
        const timeTag = formatReadableTime(item.from);
        lines.push(`- **[${timeTag}](${baseUrl}&t=${sec})** ${(item.content || '').trim()}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 4. 转换为 AI 提示词优化格式 (Prompt-Ready)
   */
  function toAiPrompt(body, meta = {}, aiConclusion = null) {
    const durationStr = formatReadableTime(meta.duration || 0);
    const header = [
      '你是一位专业的知识提炼与深度内容分析师。请基于以下 B 站（Bilibili）视频的完整时间轴文稿，为我生成一份结构严谨、细节翔实的深度总结报告。',
      '',
      '### 输出要求：',
      '1. **核心主旨（Executive Summary）**：用 200 字以内概括视频解决的核心问题与结论。',
      '2. **结构化逻辑脉络（带时间戳）**：按视频推进逻辑划分章节，保留关键节点的 `[MM:SS]` 时间戳并提炼核心论据、数据与推导过程。',
      '3. **关键概念 / 实操要点清单**：提取视频中提到的专业术语、工具、代码或行动指南。',
      '4. **金句与洞察**：摘录最具启发性的原话或高维观点。',
      '',
      '---',
      '### 视频元数据：',
      `- **视频标题**：${meta.title || ''} (P${meta.p || 1}: ${meta.partTitle || ''})`,
      `- **UP主**：${meta.ownerName || '未知'}`,
      `- **视频时长**：${durationStr}`,
      `- **视频链接**：https://www.bilibili.com/video/${meta.bvid || ''}?p=${meta.p || 1}`
    ];

    if (aiConclusion?.summary) {
      header.push(`- **B站官方AI摘要参考**：${aiConclusion.summary}`);
    }

    header.push('', '---', '### 视频时间轴文稿正文：', '');

    const transcriptLines = Array.isArray(body) && body.length > 0
      ? body.map((item) => `[${formatReadableTime(item.from)}] ${(item.content || '').trim()}`)
      : [renderAiConclusionText(aiConclusion || {})];

    return header.concat(transcriptLines).join('\n');
  }

  /**
   * 5. 转换为原始 JSON 格式
   */
  function toRawJson(body, meta = {}, aiConclusion = null, activeTrack = null) {
    return JSON.stringify(
      {
        meta,
        activeTrack,
        subtitleCount: Array.isArray(body) ? body.length : 0,
        subtitles: body || [],
        aiConclusion: aiConclusion || null
      },
      null,
      2
    );
  }

  window.BiliScriptFormatter = {
    formatReadableTime,
    formatSrtTime,
    toPlainText,
    toSRT,
    toMarkdown,
    toAiPrompt,
    toRawJson
  };
})();
