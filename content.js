const DEFAULT_SYSTEM_PROMPT = `あなたは専門的な医療アシスタントです。
提供されたテキストおよび医師と患者（または患者家族）の会話の文字起こしから、以下のSOAP形式の診療録を生成してください。会話内にない情報は無理に捏造せず、記載しないでください。また、患者のプライバシー情報（氏名、住所など）は匿名化してください。

# 出力形式
すでに入力されているテキストの上部（S)より上の部分）に以下の内容が記載されている場合、要約できるところは要約して可能な限りそのまま残す。
- ＃で始まる病名リスト
- 臨床経過
- 検査結果
次にすでに入力されているテキストと文字起こしの内容を踏まえて以下を出力する。
S)（Subjective: 主訴・主観的所見）
患者の訴えを概ねありのまま記述する
O)（Objective: 客観的所見）
バイタルサイン、身体診察所見、検査結果、医師が観察した状態
A)（Assessment: 評価・診断）
診断・見立てや病態の評価
P)（Plan: 計画）
治療計画・処方：
検査予定：
患者への指導・アドバイス：
次回受診の目安：
最下部には本日の担当医師の署名（苗字のみ）を記載する。

# 制約事項
- 挨拶やあいづちは出力内容に含めない。（「こんにちは」「お大事にしてください」「うんうん」など）
- カルテ上部のプロブレムリスト（プロブレムリストという項目見出しは不要）、臨床経過（臨床経過という項目見出しは不要）、検査結果は日付ごとに改行する。
- プロブレムリスト、臨床経過、検査結果、SOAPなどの構造化されたカルテではなくメモ書きのみである場合、S)より上の部分にはテキストを残さない。
- すでに入力されているテキストのP)の部分は可能な限り残しつつ今回新たに加わった部分や変更のあった部分について修正してください。
- 医療専門用語を使用する。
- 簡潔かつ論理的にまとめる。
- 会話の要点のみを抽出する。
- Sは患者が発言した内容のみとするが、「」は使用しない。
- Markdown記法は使用せずプレーンテキストで出力する。
- 「。」はなるべく使用せず適宜改行を入れて診療録として簡潔に読みやすくする。
- 健康保険情報や処方箋の内容は出力に含めない。
- 日付付きの病名は保険病名なのでプロブレムリストに含めない（出力には反映させない）。
- 今回新たに重要な医学的なイベント（発作があった、処方を変更した、入院をした、手術をしたなど）が明らかになった場合はカルテ上部の臨床経過に日付付きで簡潔に日付ごとに1行ずつ追記する。
- 今回脳波検査の所見や採血の結果が新たに明らかになった場合はカルテ上部の検査結果に日付付きで所見や結果を1行ずつ追記する。

# 過去カルテの参照
過去カルテが提供されている場合:
- その記法・表記スタイル・略語・表現パターンを分析し、同じスタイルで出力する
- S)より上のセクション（臨床経過、検査結果など）が冗長になっている場合、重要情報を保持しつつ適切にサマライズして可読性を高める`;

// ---- CLIUS design tokens ----
const C = {
  navy:       '#252b47',
  navyMid:    '#464e78',
  blue:       '#7397ec',
  bluePale:   '#ebf4f7',
  bluePale2:  '#d8e9ef',
  white:      '#ffffff',
  bg:         '#f6f6f6',
  border:     '#d0dce8',
  borderLight:'#ededed',
  text:       '#222222',
  textSub:    '#4a4a4a',
  red:        '#ff3b48',
  font:       "'Noto Sans JP', sans-serif",
};

if (!document.getElementById('soap-voice-tool')) {

  const W = 360, H = 610;
  const L = Math.max(0, window.innerWidth - W - 20);
  const T = Math.max(0, window.innerHeight - H - 20);

  const container = document.createElement('div');
  container.id = 'soap-voice-tool';
  container.style.cssText = `
    position: fixed; left: ${L}px; top: ${T}px;
    width: ${W}px; height: ${H}px;
    background: ${C.white}; border: 1px solid ${C.border}; border-radius: 8px;
    z-index: 2147483647; box-shadow: 0 4px 20px rgba(37,43,71,0.18);
    font-family: ${C.font}; color: ${C.text};
    resize: both; overflow: hidden;
    min-width: 300px; min-height: 440px;
    display: flex; flex-direction: column;
  `;

  // btn() generates consistent pill-button style strings
  const btn = (bg, color, extra = '') =>
    `background:${bg};color:${color};border:none;border-radius:2em;cursor:pointer;font-weight:bold;font-family:${C.font};${extra}`;

  const btnOutline = (color, extra = '') =>
    `background:${C.bg};color:${color};border:1px solid ${C.border};border-radius:2em;cursor:pointer;font-family:${C.font};${extra}`;

  container.innerHTML = `
    <div id="sh" style="display:flex;justify-content:space-between;align-items:center;
      background:${C.navy};padding:10px 12px;cursor:move;border-radius:7px 7px 0 0;flex-shrink:0;">
      <h4 id="sh-title" style="margin:0;font-size:13px;color:${C.white};pointer-events:none;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;
        font-family:${C.font};font-weight:bold;letter-spacing:0.03em;">SoapScribe</h4>
      <div style="display:flex;align-items:center;gap:4px;">
        <button id="sh-start" title="診察開始"
          style="background:none;border:none;font-size:16px;cursor:pointer;color:${C.white};">🔴</button>
        <button id="sh-stop" title="診察終了"
          style="background:none;border:none;font-size:16px;cursor:pointer;color:${C.white};display:none;">⏹️</button>
        <button id="sh-min" title="最小化"
          style="background:none;border:none;font-size:15px;font-weight:bold;cursor:pointer;color:${C.white};padding:0 2px;">－</button>
        <button id="sh-close" title="閉じる"
          style="background:none;border:none;font-size:15px;cursor:pointer;color:${C.white};padding:0 2px;">✖</button>
      </div>
    </div>

    <div id="sc" style="padding:10px 12px;display:flex;flex-direction:column;flex-grow:1;overflow-y:auto;gap:7px;">

      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        <select id="sel-prompt" style="flex:1;padding:5px 8px;font-size:12px;
          border:1px solid ${C.border};border-radius:3px;color:${C.text};
          background:${C.white};font-family:${C.font};">
          <option>読込中...</option>
        </select>
        <button id="btn-settings" title="設定を開く" style="padding:5px 10px;
          background:${C.bluePale};border:1px solid ${C.border};border-radius:3px;
          font-size:13px;cursor:pointer;color:${C.navyMid};">⚙️</button>
      </div>

      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <button id="tog-past" style="flex:1;padding:5px 10px;
          background:${C.bluePale};border:1px solid ${C.border};border-radius:3px;
          font-size:12px;color:${C.navyMid};cursor:pointer;text-align:left;font-family:${C.font};">
          📋 過去カルテ参照</button>
        <span id="past-badge" style="font-size:11px;color:${C.blue};white-space:nowrap;font-family:${C.font};"></span>
        <button id="btn-refetch" title="再取得" style="padding:4px 8px;
          background:${C.bluePale};border:1px solid ${C.border};border-radius:3px;
          font-size:12px;cursor:pointer;color:${C.navyMid};">🔄</button>
      </div>
      <div id="area-past" style="display:none;background:${C.bluePale};padding:8px;
        border-radius:4px;border:1px solid ${C.bluePale2};flex-shrink:0;">
        <div style="font-size:11px;color:${C.textSub};margin-bottom:4px;font-family:${C.font};">
          直近の過去カルテを自動取得します。記法・スタイルの参照に使用します。</div>
        <textarea id="inp-past-chart" style="width:100%;height:90px;box-sizing:border-box;
          font-size:11px;padding:6px;border:1px solid ${C.border};border-radius:3px;
          resize:vertical;line-height:1.5;font-family:${C.font};color:${C.text};"
          placeholder="過去カルテが自動取得されます..."></textarea>
        <button id="btn-clear-past" style="margin-top:4px;width:100%;padding:4px;
          ${btnOutline(C.textSub)}font-size:11px;">クリア</button>
      </div>

      <button id="btn-start" style="width:100%;padding:10px;font-size:13px;
        ${btn(C.red, C.white)}flex-shrink:0;">🔴 診察開始（録音）</button>
      <button id="btn-stop" style="width:100%;padding:10px;font-size:13px;
        ${btn(C.navyMid, C.white)}display:none;flex-shrink:0;">⏹️ 診察終了</button>
      <button id="btn-generate" style="width:100%;padding:10px;font-size:13px;
        ${btn(C.blue, C.white)}display:none;flex-shrink:0;">🤖 SOAPを生成（Claude）</button>
      <button id="btn-retry" style="width:100%;padding:8px;font-size:12px;
        ${btnOutline(C.navyMid)}display:none;flex-shrink:0;">🔄 再生成する</button>

      <div style="flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <button id="tog-transcript" style="flex:1;padding:5px 10px;
            background:${C.bluePale};border:1px solid ${C.border};border-radius:3px;
            font-size:12px;color:${C.navyMid};cursor:pointer;text-align:left;font-family:${C.font};">
            📝 文字起こし</button>
          <span id="transcript-badge" style="font-size:11px;color:${C.blue};white-space:nowrap;font-family:${C.font};"></span>
        </div>
        <div id="area-transcript" style="display:none;">
          <textarea id="txt-transcript" style="width:100%;min-height:75px;box-sizing:border-box;
            font-size:12px;padding:7px;border:1px solid ${C.border};border-radius:3px;
            resize:vertical;line-height:1.5;font-family:${C.font};color:${C.text};"
            placeholder="診察を開始すると文字起こしがリアルタイムで表示されます..."></textarea>
        </div>
      </div>

      <div style="flex-grow:1;display:flex;flex-direction:column;min-height:130px;">
        <div style="font-size:11px;color:${C.textSub};margin-bottom:3px;font-family:${C.font};">
          🏥 生成されたSOAP</div>
        <textarea id="txt-soap" style="flex-grow:1;width:100%;min-height:130px;box-sizing:border-box;
          font-size:12px;padding:7px;border:1px solid ${C.border};border-radius:3px;
          resize:none;line-height:1.5;font-family:${C.font};color:${C.text};"
          placeholder="生成されたSOAPがここに表示されます..."></textarea>
      </div>

      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button id="btn-append" style="flex:1;padding:10px 5px;font-size:12px;
          ${btn(C.blue, C.white)}">▼ カルテへ追記</button>
        <button id="btn-overwrite" style="flex:1;padding:10px 5px;font-size:12px;
          ${btn(C.navyMid, C.white)}">▲ カルテを上書き</button>
      </div>

    </div>
  `;

  document.body.appendChild(container);

  const header      = container.querySelector('#sh');
  const headerTitle = container.querySelector('#sh-title');
  const contentDiv  = container.querySelector('#sc');
  const miniStart   = container.querySelector('#sh-start');
  const miniStop    = container.querySelector('#sh-stop');
  const minBtn      = container.querySelector('#sh-min');
  const closeBtn    = container.querySelector('#sh-close');
  const selPrompt   = container.querySelector('#sel-prompt');
  const btnSettings = container.querySelector('#btn-settings');
  const togPast     = container.querySelector('#tog-past');
  const pastBadge   = container.querySelector('#past-badge');
  const btnRefetch  = container.querySelector('#btn-refetch');
  const areaPast    = container.querySelector('#area-past');
  const inpPast     = container.querySelector('#inp-past-chart');
  const btnClear    = container.querySelector('#btn-clear-past');
  const btnStart    = container.querySelector('#btn-start');
  const btnStop     = container.querySelector('#btn-stop');
  const btnGenerate = container.querySelector('#btn-generate');
  const btnRetry    = container.querySelector('#btn-retry');
  const txtTrans    = container.querySelector('#txt-transcript');
  const txtSoap     = container.querySelector('#txt-soap');
  const togTranscript   = container.querySelector('#tog-transcript');
  const areaTranscript  = container.querySelector('#area-transcript');
  const transcriptBadge = container.querySelector('#transcript-badge');
  const btnAppend   = container.querySelector('#btn-append');
  const btnOverwrite = container.querySelector('#btn-overwrite');

  let isRecording = false;
  let isMinimized = false;
  let prevH = `${H}px`, prevW = `${W}px`;
  let finalTranscript = '';
  let micStream = null, tabStream = null, audioCtx = null;
  let mediaRecorder = null, dgSocket = null;

  // ---- Initialise ----
  loadPrompts();
  fetchPastCharts();

  // Start minimized
  isMinimized = true;
  contentDiv.style.display = 'none';
  container.style.minHeight = '0';
  container.style.height = 'auto';
  container.style.resize = 'none';
  minBtn.textContent = '＋';

  // ---- Prompt selector ----
  function loadPrompts() {
    chrome.storage.local.get(['prompts', 'activePromptId'], (result) => {
      const list = (result.prompts && result.prompts.length > 0)
        ? result.prompts
        : [{ id: 'default', name: '標準SOAP（てんかん専門）', content: DEFAULT_SYSTEM_PROMPT }];
      const activeId = result.activePromptId || list[0].id;

      selPrompt.innerHTML = '';
      list.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        opt.selected = p.id === activeId;
        selPrompt.appendChild(opt);
      });
    });
  }

  selPrompt.addEventListener('change', () => {
    chrome.storage.local.set({ activePromptId: selPrompt.value });
  });

  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  togTranscript.addEventListener('click', () => {
    areaTranscript.style.display = areaTranscript.style.display !== 'none' ? 'none' : 'block';
  });

  // ---- Past chart auto-fetch ----
  function fetchPastCharts() {
    pastBadge.textContent = '取得中...';
    setTimeout(() => {
      const text = extractPastChartsFromDOM();
      if (text) {
        inpPast.value = text;
        const count = (text.match(/---/g) || []).length + 1;
        pastBadge.textContent = `${count}件取得済み`;
      } else {
        pastBadge.textContent = '';
      }
    }, 1500);
  }

  function extractPastChartsFromDOM() {
    const cells = document.querySelectorAll('app-chart-history-cell');
    if (!cells.length) return null;

    const entries = [];
    Array.from(cells).slice(0, 5).forEach(cell => {
      const timeEl = cell.querySelector('header time');
      const date = timeEl ? timeEl.textContent.trim() : '';
      const soapEl = cell.querySelector('.complaint');
      if (!soapEl) return;
      const text = soapEl.innerText.trim();
      if (!text) return;
      entries.push(date ? `【${date}】\n${text}` : text);
    });

    return entries.length > 0 ? entries.join('\n\n---\n\n') : null;
  }

  togPast.addEventListener('click', () => {
    areaPast.style.display = areaPast.style.display !== 'none' ? 'none' : 'block';
  });

  btnRefetch.addEventListener('click', () => {
    inpPast.value = '';
    fetchPastCharts();
  });

  btnClear.addEventListener('click', () => {
    inpPast.value = '';
    pastBadge.textContent = '';
  });

  // ---- Prevent chart focus loss ----
  container.addEventListener('mousedown', (e) => {
    const rect = container.getBoundingClientRect();
    if (e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20) return;
    if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
    }
  });

  // ---- Minimize ----
  minBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    if (isMinimized) {
      prevH = container.style.height || `${H}px`;
      prevW = container.style.width  || `${W}px`;
      contentDiv.style.display = 'none';
      container.style.minHeight = '0';
      container.style.height = 'auto';
      container.style.resize = 'none';
    } else {
      contentDiv.style.display = 'flex';
      container.style.minHeight = '440px';
      container.style.height = prevH;
      container.style.width  = prevW;
      container.style.resize = 'both';
    }
    minBtn.textContent = isMinimized ? '＋' : '－';
  });

  closeBtn.addEventListener('click', () => { stopRecording(); container.remove(); });
  miniStart.addEventListener('click', () => btnStart.click());
  miniStop.addEventListener('click',  () => btnStop.click());

  // ---- Drag ----
  let dragging = false, ox, oy;
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    const r = container.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    container.style.left = (e.clientX - ox) + 'px';
    container.style.top  = (e.clientY - oy) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  // ---- Recording (Deepgram streaming) ----
  btnStart.addEventListener('click', async () => {
    const syncResult = await new Promise(r => chrome.storage.sync.get(['deepgramApiKey'], r));
    const dgKey = syncResult.deepgramApiKey;
    if (!dgKey) {
      alert('Deepgram APIキーが未設定です。⚙️ 設定から入力してください。');
      return;
    }

    finalTranscript = '';
    txtTrans.value = '';
    txtSoap.value = '';
    btnRetry.style.display = 'none';

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      tabStream = await navigator.mediaDevices.getDisplayMedia({
        audio: { suppressLocalAudioPlayback: false },
        video: true
      });
    } catch (e) {
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
        alert('音声の取得に失敗しました: ' + e.message);
      }
      return;
    }

    tabStream.getVideoTracks().forEach(t => t.stop());

    audioCtx = new AudioContext({ sampleRate: 16000 });
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaStreamSource(micStream).connect(dest);
    const audioTracks = tabStream.getAudioTracks();
    if (audioTracks.length > 0) {
      audioCtx.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest);
    }

    dgSocket = new WebSocket(
      'wss://api.deepgram.com/v1/listen?language=ja&model=nova-2&punctuate=true&interim_results=true',
      ['token', dgKey]
    );

    dgSocket.onopen = () => {
      mediaRecorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && dgSocket && dgSocket.readyState === WebSocket.OPEN) {
          dgSocket.send(e.data);
        }
      };
      mediaRecorder.start(250);
      isRecording = true;
      btnStart.style.display = 'none'; btnStop.style.display = 'block';
      miniStart.style.display = 'none'; miniStop.style.display = 'block';
      headerTitle.textContent = '🎙️ 診察中...';
    };

    dgSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const t = data.channel?.alternatives?.[0]?.transcript;
        if (!t) return;
        if (data.is_final) {
          finalTranscript += (finalTranscript ? ' ' : '') + t;
          txtTrans.value = finalTranscript;
        } else {
          txtTrans.value = finalTranscript + (finalTranscript ? ' ' : '') + `【認識中】${t}`;
        }
        txtTrans.scrollTop = txtTrans.scrollHeight;
      } catch (_) {}
    };

    dgSocket.onerror = () => {
      stopRecording();
      showError('Deepgram接続エラー。APIキーを確認してください。');
      resetToIdle();
    };
  });

  btnStop.addEventListener('click', () => {
    stopRecording();
    txtTrans.value = finalTranscript.trim();
    const charCount = finalTranscript.trim().length;
    if (charCount > 0) transcriptBadge.textContent = `${charCount}文字`;
    resetToIdle();
    generateSOAP();
  });

  function stopRecording() {
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    mediaRecorder = null;
    if (dgSocket) { dgSocket.close(); dgSocket = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (tabStream) { tabStream.getTracks().forEach(t => t.stop()); tabStream = null; }
  }

  function resetToIdle() {
    isRecording = false;
    btnStart.style.display = 'block'; btnStop.style.display = 'none';
    miniStart.style.display = 'block'; miniStop.style.display = 'none';
    headerTitle.textContent = 'SoapScribe';
  }

  // ---- SOAP generation ----
  btnGenerate.addEventListener('click', generateSOAP);
  btnRetry.addEventListener('click', generateSOAP);

  function generateSOAP() {
    const transcript = txtTrans.value.trim();
    if (!transcript) { alert('文字起こしが空です。先に診察を行うか、テキストを入力してください。'); return; }

    btnGenerate.style.display = 'none';
    btnRetry.style.display = 'none';
    headerTitle.textContent = '生成中...';
    txtSoap.value = 'Claude AIが診察録を生成しています。しばらくお待ちください...';

    if (isMinimized) {
      contentDiv.style.display = 'flex';
      container.style.minHeight = '440px';
      container.style.height = prevH;
      container.style.width = prevW;
      container.style.resize = 'both';
      isMinimized = false;
      minBtn.textContent = '－';
    }

    chrome.storage.local.get(['prompts'], (result) => {
      const prompts = result.prompts || [];
      const selected = prompts.find(p => p.id === selPrompt.value);
      const systemPrompt = selected?.content || DEFAULT_SYSTEM_PROMPT;

      const existingText = (getChartEditor()?.innerText || '').trim();
      const pastChart = inpPast.value.trim();

      let userMessage = '';
      if (pastChart)    userMessage += `【過去カルテ（記法・スタイル参照用）】\n${pastChart}\n\n`;
      if (existingText) userMessage += `【現在のカルテ既存記載】\n${existingText}\n\n`;
      userMessage += `【本日の診察の文字起こし】\n${transcript}`;

      chrome.runtime.sendMessage(
        { action: 'callClaudeAPI', systemPrompt, userMessage },
        (response) => {
          if (chrome.runtime.lastError) {
            showError(chrome.runtime.lastError.message);
          } else if (response.error) {
            showError(response.error);
          } else {
            txtSoap.value = response.text.trim();
            headerTitle.textContent = '✓ 完了 — SoapScribe';
          }
          btnRetry.style.display = 'block';
        }
      );
    });
  }

  function showError(msg) {
    txtSoap.value = 'エラー: ' + msg;
    headerTitle.textContent = 'エラー';
  }

  function getChartEditor() {
    const editor = document.querySelector('.wysiwyg-editor-content[contenteditable="true"]');
    if (editor) return editor;
    let el = document.activeElement;
    if (el?.tagName === 'IFRAME') {
      try { el = el.contentDocument?.activeElement; } catch (e) {}
    }
    return (el && !container.contains(el)) ? el : null;
  }

  function insertToActiveField(mode) {
    const text = txtSoap.value;
    if (!text || text.includes('生成しています')) { alert('挿入するテキストがありません。'); return; }

    const el = getChartEditor();
    if (!el) { alert('カルテの入力欄をクリックしてカーソルを置いてから、もう一度押してください。'); return; }

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = mode === 'overwrite' ? text : (el.value ? el.value + '\n\n' + text : text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.isContentEditable) {
      const html = text.replace(/\n/g, '<br>');
      el.innerHTML = mode === 'overwrite' ? html : (el.innerHTML ? el.innerHTML + '<br><br>' + html : html);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  btnAppend.addEventListener('click',    () => insertToActiveField('append'));
  btnOverwrite.addEventListener('click', () => insertToActiveField('overwrite'));
}
