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

const DEFAULT_PROMPTS = [
  { id: 'default', name: '標準SOAP（てんかん専門）', content: DEFAULT_SYSTEM_PROMPT }
];

let prompts = [];
let selectedIndex = 0;

// ---- Load saved settings ----
// API key: chrome.storage.sync (follows Google account across devices)
// Prompts:  chrome.storage.local (too large for sync quota)
chrome.storage.sync.get(['claudeApiKey', 'deepgramApiKey', 'claudeModel'], (syncResult) => {
  if (syncResult.claudeApiKey) setKeyStatus('✅ APIキーが設定されています', true);
  if (syncResult.deepgramApiKey) setDgKeyStatus('✅ APIキーが設定されています', true);
  if (syncResult.claudeModel) document.getElementById('sel-model').value = syncResult.claudeModel;
});
chrome.storage.local.get(['prompts', 'referralPrompt'], (result) => {
  prompts = (result.prompts && result.prompts.length > 0) ? result.prompts : DEFAULT_PROMPTS;
  renderList();
  selectPrompt(0);
  if (result.referralPrompt) document.getElementById('referral-prompt').value = result.referralPrompt;
});

// ---- Prompt list rendering ----
function renderList() {
  const list = document.getElementById('prompt-list');
  list.innerHTML = '';
  prompts.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'prompt-item' + (i === selectedIndex ? ' active' : '');
    item.textContent = p.name;
    item.addEventListener('click', () => selectPrompt(i));
    list.appendChild(item);
  });
}

function selectPrompt(index) {
  selectedIndex = index;
  const p = prompts[index];
  if (!p) return;
  document.getElementById('prompt-name').value = p.name;
  document.getElementById('prompt-content').value = p.content;
  renderList();
}

// ---- API key ----
document.getElementById('btn-save-key').addEventListener('click', () => {
  const key = document.getElementById('api-key').value.trim();
  if (!key) { setKeyStatus('APIキーを入力してください', false); return; }
  chrome.storage.sync.set({ claudeApiKey: key }, () => {
    document.getElementById('api-key').value = '';
    setKeyStatus('✅ APIキーを保存しました（Googleアカウントに同期されます）', true);
  });
});

function setKeyStatus(msg, ok) {
  const el = document.getElementById('key-status');
  el.textContent = msg;
  el.className = 'status ' + (ok ? 'ok' : 'error');
}

// ---- Deepgram API key ----
document.getElementById('btn-save-dg-key').addEventListener('click', () => {
  const key = document.getElementById('dg-key').value.trim();
  if (!key) { setDgKeyStatus('APIキーを入力してください', false); return; }
  chrome.storage.sync.set({ deepgramApiKey: key }, () => {
    document.getElementById('dg-key').value = '';
    setDgKeyStatus('✅ Deepgram APIキーを保存しました（Googleアカウントに同期されます）', true);
  });
});

function setDgKeyStatus(msg, ok) {
  const el = document.getElementById('dg-key-status');
  el.textContent = msg;
  el.className = 'status ' + (ok ? 'ok' : 'error');
}

// ---- Model selection ----
document.getElementById('btn-save-model').addEventListener('click', () => {
  const model = document.getElementById('sel-model').value;
  chrome.storage.sync.set({ claudeModel: model }, () => {
    const el = document.getElementById('model-status');
    el.textContent = '✅ 保存しました';
    el.className = 'status ok';
    setTimeout(() => { el.textContent = ''; }, 2000);
  });
});

// ---- Referral prompt ----
document.getElementById('btn-save-referral-prompt').addEventListener('click', () => {
  const content = document.getElementById('referral-prompt').value.trim();
  chrome.storage.local.set({ referralPrompt: content || null }, () => {
    const el = document.getElementById('referral-prompt-status');
    el.textContent = '✅ 保存しました';
    setTimeout(() => { el.textContent = ''; }, 2000);
  });
});

document.getElementById('btn-reset-referral-prompt').addEventListener('click', () => {
  if (!confirm('デフォルトのプロンプトに戻しますか？')) return;
  chrome.storage.local.remove('referralPrompt', () => {
    document.getElementById('referral-prompt').value = '';
    const el = document.getElementById('referral-prompt-status');
    el.textContent = '✅ デフォルトに戻しました';
    setTimeout(() => { el.textContent = ''; }, 2000);
  });
});

// ---- New prompt ----
document.getElementById('btn-new-prompt').addEventListener('click', () => {
  prompts.push({ id: Date.now().toString(), name: '新しいプロンプト', content: '' });
  savePrompts();
  selectPrompt(prompts.length - 1);
});

// ---- Delete prompt ----
document.getElementById('btn-delete-prompt').addEventListener('click', () => {
  if (prompts.length <= 1) { alert('最低1件のプロンプトが必要です。'); return; }
  if (!confirm(`「${prompts[selectedIndex].name}」を削除しますか？`)) return;
  prompts.splice(selectedIndex, 1);
  savePrompts();
  selectPrompt(Math.min(selectedIndex, prompts.length - 1));
});

// ---- Save prompt ----
document.getElementById('btn-save-prompt').addEventListener('click', () => {
  const name = document.getElementById('prompt-name').value.trim();
  const content = document.getElementById('prompt-content').value.trim();
  if (!name) { alert('プロンプト名を入力してください'); return; }
  prompts[selectedIndex] = { ...prompts[selectedIndex], name, content };
  savePrompts();
  renderList();
  const el = document.getElementById('prompt-status');
  el.textContent = '✅ 保存しました';
  setTimeout(() => { el.textContent = ''; }, 2000);
});

function savePrompts() {
  chrome.storage.local.set({ prompts });
}

// ---- Export ----
document.getElementById('btn-export').addEventListener('click', () => {
  // Gather from both storage areas
  chrome.storage.sync.get(['claudeApiKey', 'deepgramApiKey', 'claudeModel'], (syncResult) => {
    chrome.storage.local.get(['prompts', 'referralPrompt'], (localResult) => {
      const config = {
        version: '1.1',
        exportedAt: new Date().toISOString(),
        claudeApiKey: syncResult.claudeApiKey || '',
        deepgramApiKey: syncResult.deepgramApiKey || '',
        claudeModel: syncResult.claudeModel || 'claude-sonnet-4-6',
        prompts: localResult.prompts || DEFAULT_PROMPTS,
        referralPrompt: localResult.referralPrompt || '',
      };
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soapscribe-config_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSyncStatus('✅ エクスポートしました');
    });
  });
});

// ---- Import ----
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('inp-import-file').click();
});

document.getElementById('inp-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const config = JSON.parse(ev.target.result);
      if (!config.version || !config.prompts) throw new Error('設定ファイルの形式が正しくありません');

      // API key → sync storage, prompts → local storage
      chrome.storage.local.set({ prompts: config.prompts }, () => {
        prompts = config.prompts;
        renderList();
        selectPrompt(0);
      });
      if (config.claudeApiKey) {
        chrome.storage.sync.set({ claudeApiKey: config.claudeApiKey }, () => {
          setKeyStatus('✅ APIキーを読み込みました', true);
        });
      }
      if (config.deepgramApiKey) {
        chrome.storage.sync.set({ deepgramApiKey: config.deepgramApiKey }, () => {
          setDgKeyStatus('✅ Deepgram APIキーを読み込みました', true);
        });
      }
      if (config.claudeModel) {
        chrome.storage.sync.set({ claudeModel: config.claudeModel });
        document.getElementById('sel-model').value = config.claudeModel;
      }
      if (config.referralPrompt) {
        chrome.storage.local.set({ referralPrompt: config.referralPrompt });
        document.getElementById('referral-prompt').value = config.referralPrompt;
      }
      setSyncStatus(`✅ インポート完了（プロンプト ${config.prompts.length} 件${config.claudeApiKey ? '・Claudeキー' : ''}${config.deepgramApiKey ? '・Deepgramキー' : ''}）`);
    } catch (err) {
      setSyncStatus('❌ 読み込み失敗: ' + err.message, true);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

function setSyncStatus(msg, isError = false) {
  const el = document.getElementById('sync-status');
  el.textContent = msg;
  el.className = 'status ' + (isError ? 'error' : 'ok');
  setTimeout(() => { el.textContent = ''; }, 4000);
}
