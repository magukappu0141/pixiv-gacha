// ============================================================
// ピクシブ百科事典ガチャ - app.js v3
// ============================================================
const PROXY_BASE = 'https://pixiv-gacha-proxy.vercel.app';

const RC = [
  { n:'C',   l:'コモン',             cl:'var(--c)',   w:50,  minIllust:0 },
  { n:'UC',  l:'アンコモン',         cl:'var(--uc)',  w:25,  minIllust:500 },
  { n:'R',   l:'レア',               cl:'var(--r)',   w:13,  minIllust:3000 },
  { n:'SR',  l:'スーパーレア',       cl:'var(--sr)',  w:7,   minIllust:10000 },
  { n:'SSR', l:'SSレア',             cl:'var(--ssr)', w:3.5, minIllust:30000 },
  { n:'UR',  l:'ウルトラレア',       cl:'var(--ur)',  w:1.2, minIllust:80000 },
  { n:'LR',  l:'レジェンドレア',     cl:'var(--lr)',  w:0.3, minIllust:200000 },
];
const RO = { C:0, UC:1, R:2, SR:3, SSR:4, UR:5, LR:6 };

// カード交換のポイントコスト（レア度別）
const EXCHANGE_COST = { C:5, UC:15, R:30, SR:60, SSR:120, UR:250, LR:500 };

const FL = [
  "pixivの片隅で静かに輝く、知る人ぞ知る記事。",
  "多くの絵師たちに愛されてきた、不朽の概念。",
  "深い考察と愛が詰まった、ファン必読の記事。",
  "タグの海から浮かび上がった、奇跡の一枚。",
  "創作の源泉。この記事なしに同人は語れない。",
  "閲覧数が示す、ピクシブ百科事典の看板記事。",
  "幾多の編集を経て完成した、至高の解説。",
  "百科事典に刻まれた、インターネット文化の記憶。",
  "全ての創作者に捧げる、知識と情熱の結晶。",
  "二次創作の可能性を無限に広げる、魔法の言葉。",
];

let S = { col:[], pc:0, pk:10, mx:10, lt:Date.now(), br:{w:0,l:0,d:0}, r18:false, r18only:false, ultraBonus:false, ultraBonusAt:0, pts:0, cardLocks:{}, cardWinStreaks:{} };
try { const v = localStorage.getItem('pxg5'); if(v) { const parsed = JSON.parse(v); S = {...S, ...parsed}; if (typeof S.pts !== 'number') S.pts = 0; if (!S.cardLocks) S.cardLocks = {}; if (!S.cardWinStreaks) S.cardWinStreaks = {};
  // 旧goldenBonusからの移行
  if (parsed.goldenBonus) { S.ultraBonus = true; delete S.goldenBonus; }
  if (parsed.goldenBonusAt) { S.ultraBonusAt = parsed.goldenBonusAt; delete S.goldenBonusAt; }
} } catch(e) {}

// 期限切れのロックを掃除
function cleanExpiredLocks() {
  const now = Date.now();
  for (const name in S.cardLocks) {
    if (S.cardLocks[name] <= now) {
      delete S.cardLocks[name];
      delete S.cardWinStreaks[name];
    }
  }
}
cleanExpiredLocks();

// 予測検索用キャッシュ（グローバル）
let exSugCache = new Set();

// 同名カードの重複を統合（最高レア度のものを残す）
function dedupeCollection() {
  const best = new Map();
  for (const c of S.col) {
    const existing = best.get(c.name);
    if (!existing || RO[c.rar] > RO[existing.rar] || (RO[c.rar] === RO[existing.rar] && c.atk > existing.atk)) {
      best.set(c.name, c);
    }
  }
  S.col = [...best.values()].sort((a, b) => b.ts - a.ts);
}
dedupeCollection();

function save() { dedupeCollection(); try { localStorage.setItem('pxg5', JSON.stringify(S)); } catch(e) {} }

let cur = [], ci = 0;
const sfxFlip = document.getElementById('sfxFlip');
function playFlip() { if(sfxFlip){ sfxFlip.currentTime=0; sfxFlip.play().catch(()=>{}); } }

function initR18Toggle() {
  const sw = document.getElementById('r18Switch');
  if (!sw) return;
  sw.checked = S.r18;
  sw.addEventListener('change', () => { S.r18 = sw.checked; save(); });
}

// ============================================================
// レア度判定（イラスト投稿数ベース重視）
// ============================================================
function determineRarity(views, contentLength, illustCount) {
  const ic = illustCount || 0;

  // ============================================================
  // レア度はイラスト投稿数で決定
  // 投稿数が多い＝pixivで人気＝高レア度
  // ============================================================
  // LR  : 200,000件以上（初音ミク、東方Project級）
  // UR  : 80,000件以上（鬼滅の刃、原神級）
  // SSR : 30,000件以上（チェンソーマン、ブルーアーカイブ級）
  // SR  : 10,000件以上（人気キャラ・ペアタグ級）
  // R   : 3,000件以上（準人気キャラ・マイナー作品級）
  // UC  : 500件以上（ニッチなタグ級）
  // C   : 500件未満

  let rarity = 'C';
  if (ic >= 200000) rarity = 'LR';
  else if (ic >= 80000) rarity = 'UR';
  else if (ic >= 30000) rarity = 'SSR';
  else if (ic >= 10000) rarity = 'SR';
  else if (ic >= 3000)  rarity = 'R';
  else if (ic >= 500)   rarity = 'UC';

  // ±1段階のランダム揺れ（10%の確率で1段階UP、5%の確率で1段階DOWN）
  // 完全にイラスト投稿数だけだとガチャ感がなくなるので小さな運要素を残す
  const rarOrder = ['C','UC','R','SR','SSR','UR','LR'];
  const idx = rarOrder.indexOf(rarity);
  const luck = Math.random();
  if (luck < 0.10 && idx < 6) rarity = rarOrder[idx + 1];       // 10%で1段階UP
  else if (luck > 0.95 && idx > 0) rarity = rarOrder[idx - 1];  // 5%で1段階DOWN

  return rarity;
}

function calcStats(views, contentLength, rarity, illustCount) {
  const mult = RO[rarity] + 1;
  const ic = illustCount || 0;
  // ATK: イラスト投稿数がメイン + 閲覧数がサブ
  const atkBase = Math.log10(Math.max(ic, 1)) * 200 + Math.log10(Math.max(views, 10)) * 80;
  // DEF: 記事の充実度（文字数）
  const defBase = Math.log10(Math.max(contentLength, 100)) * 120;
  const atk = Math.floor(atkBase * mult * (0.85 + Math.random() * 0.3));
  const def = Math.floor(defBase * mult * (0.85 + Math.random() * 0.3));
  return { atk, def };
}

// ============================================================
// ARTICLE FETCHING
// ============================================================
async function fetchRandomArticles(count) {
  const owned = getOwnedNames();
  if (!PROXY_BASE) return await fetchFromDicDirectly(count, owned);
  try {
    const fetchCount = count + Math.min(owned.size, 20);
    const r18val = S.r18only ? 2 : S.r18 ? 1 : 0;
    const resp = await fetch(`${PROXY_BASE}/random?count=${fetchCount}&r18=${r18val}`);
    if (!resp.ok) throw new Error('Proxy error');
    const data = await resp.json();
    return (data.articles || []).filter(a => !owned.has(a.name)).slice(0, count);
  } catch(e) {
    console.warn('Proxy fetch failed:', e);
    return await fetchFromDicDirectly(count, owned);
  }
}

function getOwnedNames() { return new Set(S.col.map(c => c.name)); }

async function fetchFromDicDirectly(count, owned) {
  const articles = [];
  const sources = [
    `https://dic.pixiv.net/hot_articles?json=1&page=${Math.floor(Math.random()*20)+1}`,
    `https://dic.pixiv.net/standards?json=1&page=${Math.floor(Math.random()*50)+1}`,
    `https://dic.pixiv.net/new_articles?json=1&page=${Math.floor(Math.random()*30)+1}`,
  ];
  for (const url of sources) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const items = data.articles || data.items || data;
      if (Array.isArray(items)) {
        for (const item of items) {
          const name = item.title || item.name || item.article_name || '';
          if (name && !owned.has(name)) {
            articles.push({ name, desc: item.summary || item.abstract || '', views: item.views || Math.floor(Math.random() * 50000), contentLength: item.content_length || Math.floor(Math.random() * 20000) });
          }
        }
      }
    } catch(e) {}
  }
  return articles.length === 0 ? generateFallbackArticles(count) : articles.sort(() => Math.random() - 0.5).slice(0, count);
}

function generateFallbackArticles(count) {
  const owned = getOwnedNames();
  const FALLBACK_NAMES = ["鬼滅の刃","呪術廻戦","進撃の巨人","SPY×FAMILY","チェンソーマン","葬送のフリーレン","ワンピース","ドラゴンボール","NARUTO","BLEACH","新世紀エヴァンゲリオン","名探偵コナン","ジョジョの奇妙な冒険","HUNTER×HUNTER","Fate/Grand Order","ポケットモンスター","マリオ","ゼルダの伝説","原神","マインクラフト","エルデンリング","初音ミク","ピカチュウ","五条悟","竈門炭治郎","ルフィ","博麗霊夢","東方Project","ホロライブ","にじさんじ","兎田ぺこら","千本桜","スラムダンク","ドラえもん","千と千尋の神隠し","もののけ姫","となりのトトロ","君の名は。","セーラームーン","プリキュア","ウマ娘プリティーダービー","刀剣乱舞","ブルーアーカイブ","魔法少女まどか☆マギカ","Fate/stay night","ぼっち・ざ・ろっく!","銀魂","涼宮ハルヒの憂鬱","ラブライブ!","薬屋のひとりごと","ダンジョン飯","リコリス・リコイル","UNDERTALE","NieR:Automata","メイドインアビス","織田信長","新選組","コミケ","ツンデレ","ヤンデレ","領域展開","悪魔の実","スタンド","写輪眼","ドラゴン","吸血鬼","妖怪","擬人化","異世界転生","フランドール・スカーレット","チルノ","霧雨魔理沙","十六夜咲夜","星街すいせい","葛葉","宝鐘マリン","雷電将軍","鍾離","胡桃","マキマ","フリーレン","アーニャ・フォージャー","リヴァイ","煉獄杏寿郎","セイバー","レム","2B","後藤ひとり","ギルガメッシュ","諦めたらそこで試合終了ですよ","だが断る","海馬瀬人","ボーカロイド","鏡音リン・レン","重音テト","ラピュタ","艦これ","モンスターハンター","バイオハザード","ペルソナ5","星のカービィ","大乱闘スマッシュブラザーズ","ファイナルファンタジー","ゴールデンカムイ","ブルーロック","キングダム","ワンパンマン","ガールズ&パンツァー","このすば","ヴァイオレット・エヴァーガーデン","転生したらスライムだった件","推しの子","怪獣8号","ソードアート・オンライン"];
  const FALLBACK_IC = {"東方Project":400000,"ドラゴンボール":120000,"ワンピース":150000,"NARUTO":180000,"ポケットモンスター":300000,"初音ミク":500000,"セーラームーン":80000,"ドラえもん":60000,"鬼滅の刃":200000,"呪術廻戦":150000,"進撃の巨人":100000,"Fate/Grand Order":250000,"原神":300000,"ウマ娘プリティーダービー":180000,"ホロライブ":120000,"ブルーアーカイブ":200000,"SPY×FAMILY":60000,"チェンソーマン":80000,"ジョジョの奇妙な冒険":100000,"HUNTER×HUNTER":40000,"魔法少女まどか☆マギカ":100000,"艦これ":300000,"刀剣乱舞":200000,"推しの子":50000,"五条悟":80000,"博麗霊夢":150000};
  const available = FALLBACK_NAMES.filter(n => !owned.has(n)).sort(() => Math.random() - 0.5);
  return available.slice(0, count).map(name => {
    const ic = FALLBACK_IC[name] || Math.floor(Math.random() * 30000) + 100;
    return { name, desc: '', views: Math.floor(Math.random() * 200000) + 100, contentLength: Math.floor(Math.random() * 80000) + 500, illustCount: ic };
  });
}

// ============================================================
// CARD CREATION
// ============================================================
function articleToCard(article, guaranteedMinRarity) {
  let ic = article.illustCount || 0;
  let rarity = determineRarity(article.views, article.contentLength, ic);
  if (guaranteedMinRarity && RO[rarity] < RO[guaranteedMinRarity]) rarity = guaranteedMinRarity;
  // illustCountが0のままだとカード表示が0件になるので、レア度から推定
  if (ic <= 0) {
    const ranges = { LR:[200000,500000], UR:[80000,200000], SSR:[30000,80000], SR:[10000,30000], R:[3000,10000], UC:[500,3000], C:[50,500] };
    const [min, max] = ranges[rarity] || [50, 500];
    ic = Math.floor(min + Math.random() * (max - min));
  }
  const stats = calcStats(article.views, article.contentLength, rarity, ic);
  const flav = RO[rarity] >= 4 ? FL[Math.floor(Math.random() * FL.length)] : null;
  // 予測検索キャッシュに追加
  if (article.name) exSugCache.add(article.name);
  return { id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), name: article.name, desc: article.desc || `ピクシブ百科事典の記事「${article.name}」`, rar: rarity, rl: RC[RO[rarity]].l, atk: stats.atk, def: stats.def, flav, ts: Date.now(), views: article.views, contentLength: article.contentLength, illustCount: ic };
}

function getImgURL(name) {
  return PROXY_BASE ? `${PROXY_BASE}/image?name=${encodeURIComponent(name)}` : `https://dic.pixiv.net/images/thumb/${encodeURIComponent(name)}.jpg`;
}

function cardHTML(c, w, clickable) {
  const ri = RO[c.rar], width = w || 310;
  const link = `https://dic.pixiv.net/a/${encodeURIComponent(c.name)}`;
  const onclick = clickable !== false ? `onclick="window.open('${link.replace(/'/g,"\\'")}','_blank')"` : '';
  const cursor = clickable !== false ? 'cursor:pointer;' : '';
  let desc = c.desc || '';
  const maxLen = c.flav ? 55 : 80;
  if (desc.length > maxLen) desc = desc.substring(0, maxLen) + '…';
  const flavHTML = c.flav ? `<div class="flav">「${c.flav}」</div>` : '';
  const rarStyle = c.rar === 'LR'
    ? 'background:linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00cc00,#0088ff,#8800ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:900'
    : `color:${RC[ri].cl}`;
  const ic = c.illustCount || 0;
  return `<div class="card card-${c.rar}" style="width:${width}px;${cursor}" ${onclick}>
    <div class="c-hd"><span class="c-rar" style="${rarStyle}">${c.rar}</span><span class="c-nm">${c.name}</span></div>
    <div class="c-img" style="width:${width}px">
      <img src="${getImgURL(c.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" referrerpolicy="no-referrer" loading="lazy">
      <div class="c-fallback" style="display:none"><span class="c-fname">${c.name}</span></div>
    </div>
    <div class="c-desc">${desc}${flavHTML}</div>
    <div class="c-stats">
      <div class="c-st"><div class="c-stl atk">ATK</div><div class="c-stv atk">${c.atk.toLocaleString()}</div></div>
      <div class="c-st"><div class="c-stl def">DEF</div><div class="c-stv def">${c.def.toLocaleString()}</div></div>
    </div>
    <div class="c-illust-row"><span class="c-illust-label">🎨 イラスト投稿数</span><span class="c-illust-val">${ic.toLocaleString()} 件</span></div>
  </div>`;
}

// ============================================================
// LUXURY RARE CARD EFFECTS (SSR以上)
// ============================================================
let rareAnimId = null;

function showRareEffect(rarity) {
  const overlay = document.getElementById('rareOverlay');
  const canvas = document.getElementById('rareCanvas');
  const text = document.getElementById('rareText');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  overlay.classList.add('active');

  const particles = [];
  let hue1, hue2, label, textClass;
  if (rarity === 'LR') { hue1 = 0; hue2 = 360; label = '✦ LEGEND RARE ✦'; textClass = 'lr-text'; }
  else if (rarity === 'UR') { hue1 = 0; hue2 = 30; label = '✦ ULTRA RARE ✦'; textClass = 'ur-text'; }
  else { hue1 = 40; hue2 = 60; label = '✦ SUPER SPECIAL RARE ✦'; textClass = 'ssr-text'; }

  for (let i = 0; i < 150; i++) {
    particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, size: 1 + Math.random() * 4, hue: hue1 + Math.random() * (hue2 - hue1), alpha: 0.3 + Math.random() * 0.7, life: 0 });
  }
  const rays = [];
  for (let i = 0; i < 12; i++) rays.push({ angle: (Math.PI * 2 / 12) * i, speed: 0.002 + Math.random() * 0.003, width: 0.02 + Math.random() * 0.04, alpha: 0.1 + Math.random() * 0.2 });

  let frame = 0;
  const maxFrames = rarity === 'LR' ? 180 : rarity === 'UR' ? 150 : 120;

  function animate() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const progress = frame / maxFrames;

    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.6);
    grd.addColorStop(0, `hsla(${hue1}, 80%, 50%, ${0.15 * Math.sin(frame * 0.05)})`);
    grd.addColorStop(0.5, `hsla(${hue2}, 60%, 30%, ${0.08 * Math.sin(frame * 0.03)})`);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);

    rays.forEach(r => {
      r.angle += r.speed;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(r.angle);
      ctx.beginPath(); ctx.moveTo(0, 0);
      const len = canvas.width * 0.8;
      ctx.lineTo(len * Math.cos(-r.width), len * Math.sin(-r.width));
      ctx.lineTo(len * Math.cos(r.width), len * Math.sin(r.width));
      ctx.closePath();
      const rayGrd = ctx.createLinearGradient(0, 0, len, 0);
      rayGrd.addColorStop(0, `hsla(${hue1 + 20}, 80%, 70%, ${r.alpha * Math.min(progress * 3, 1)})`);
      rayGrd.addColorStop(1, 'transparent');
      ctx.fillStyle = rayGrd; ctx.fill(); ctx.restore();
    });

    particles.forEach(p => {
      p.life++; p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      const twinkle = 0.5 + 0.5 * Math.sin(p.life * 0.1 + p.hue);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * twinkle, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${p.alpha * twinkle * Math.min(progress * 4, 1)})`; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3 * twinkle, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${p.alpha * 0.15 * twinkle})`; ctx.fill();
    });

    if (frame > 20 && frame < 60) {
      const rp = (frame - 20) / 40;
      ctx.beginPath(); ctx.arc(cx, cy, rp * canvas.width * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue1}, 90%, 80%, ${(1 - rp) * 0.6})`; ctx.lineWidth = 3; ctx.stroke();
    }

    if (frame < maxFrames) rareAnimId = requestAnimationFrame(animate);
  }
  animate();

  setTimeout(() => { text.textContent = label; text.className = `rare-text ${textClass} show`; }, 500);

  const closeTime = rarity === 'LR' ? 3500 : rarity === 'UR' ? 3000 : 2500;
  const closeHandler = () => { closeRareEffect(); overlay.removeEventListener('click', closeHandler); };
  overlay.addEventListener('click', closeHandler);
  setTimeout(closeHandler, closeTime);
}

function closeRareEffect() {
  document.getElementById('rareOverlay').classList.remove('active');
  document.getElementById('rareText').className = 'rare-text';
  if (rareAnimId) { cancelAnimationFrame(rareAnimId); rareAnimId = null; }
}

// ============================================================
// GACHA
// ============================================================
let isLoading = false;

async function openPack() {
  if (S.pk <= 0 || isLoading) return;
  isLoading = true;
  const tapText = document.querySelector('.pk-tap');
  const btn = document.querySelector('.pk-img');
  if (tapText) tapText.textContent = '読み込み中...';
  if (btn) btn.style.opacity = '0.5';

  try {
    S.pk--; S.pc++;
    const isUltra = S.ultraBonus === true;
    const isGold = !isUltra && (S.pc % 10 === 0);
    if (S.ultraBonus) { S.ultraBonus = false; save(); }
    const packOImg = document.getElementById('packOImg');
    if (packOImg) packOImg.src = isUltra ? 'pix_ultra.png' : isGold ? 'pix_gold.png' : 'pix.png';

    const articles = await fetchRandomArticles(5);
    const usedNames = new Set(articles.map(a => a.name));
    // ウルトラパック: 3枚UR以上確定 / 金パック: 最後の1枚SR以上確定
    const minRarity = isUltra ? 'UR' : (isGold ? 'SR' : null);
    const cards = articles.map((a, i) => {
      if (isUltra && i < 3) return articleToCard(a, 'UR');
      if (isGold && i === 4) return articleToCard(a, 'SR');
      return articleToCard(a);
    });
    // 足りない場合はフォールバック（重複しないように）
    if (cards.length < 5) {
      const fb = generateFallbackArticles(10);
      for (const a of fb) {
        if (cards.length >= 5) break;
        if (usedNames.has(a.name)) continue;
        usedNames.add(a.name);
        cards.push(articleToCard(a));
      }
    }

    cards.forEach(c => { c.isNew = true; S.col.unshift(c); });
    dedupeCollection();
    save(); cur = cards; ci = 0;

    const br = Math.max(...cards.map(c => RO[c.rar]));
    const bestRarity = cards.find(c => RO[c.rar] === br).rar;

    document.getElementById('packO').classList.add('active');

    setTimeout(() => {
      document.getElementById('packO').classList.remove('active');

      if (br >= 4) {
        showRareEffect(bestRarity);
        setTimeout(() => {
          showFl(br >= 6 ? 'flr' : br >= 5 ? 'fur' : 'fssr');
          showRA(RC[br].l, RC[br].cl);
          spawnP(br >= 5 ? 60 : 40);
          document.getElementById('packView').style.display = 'none';
          document.getElementById('cardViewer').style.display = 'block';
          playFlip(); renderViewer();
        }, bestRarity === 'LR' ? 3500 : bestRarity === 'UR' ? 3000 : 2500);
      } else {
        if (br >= 3) { showFl('fg'); showRA(RC[br].l, RC[br].cl); spawnP(20); }
        document.getElementById('packView').style.display = 'none';
        document.getElementById('cardViewer').style.display = 'block';
        playFlip(); renderViewer();
      }
    }, 1000);
  } catch(e) {
    console.error('Pack open error:', e);
    S.pk++; S.pc--;
    alert('記事の取得に失敗しました。もう一度お試しください。');
  } finally {
    isLoading = false;
    if (tapText) tapText.textContent = '▲ タップで開ける ▲';
    if (btn) btn.style.opacity = '1';
    updPk();
  }
}

function backToPack() {
  document.getElementById('packView').style.display = 'block';
  document.getElementById('cardViewer').style.display = 'none';
}

// ============================================================
// CARD VIEWER
// ============================================================
function renderViewer() {
  document.getElementById('cvM').innerHTML = cardHTML(cur[ci], 310);
  document.getElementById('cvPg').textContent = `${ci + 1}/5`;
  document.getElementById('cvPr').disabled = ci === 0;
  document.getElementById('cvNx').disabled = ci === 4;

  requestAnimationFrame(() => {
    const frontCard = document.querySelector('#cvM .card');
    const cardH = frontCard ? frontCard.offsetHeight : 460;

    const backs = document.getElementById('cvBacks'); backs.innerHTML = '';
    cur.slice(ci + 1).slice(0, 4).forEach((c, i) => {
      const el = document.createElement('div');
      el.className = `cv-back-card bk-${c.rar}`;
      el.style.cssText = `right:${i*6}px;top:${4+i*4}px;transform:rotate(${2+i*1.5}deg);opacity:${0.6-i*0.12};z-index:${4-i};height:${cardH}px;background:#1a1a2e;`;
      backs.appendChild(el);
    });

    const done = document.getElementById('cvDone'); if(done){done.innerHTML = '';
    cur.slice(0, ci).slice(-4).reverse().forEach((c, i) => {
      const el = document.createElement('div');
      el.className = `cv-done-card bk-${c.rar}`;
      el.style.cssText = `left:${i*6}px;top:${4+i*4}px;transform:rotate(${-2-i*1.5}deg);opacity:${0.6-i*0.12};z-index:${4-i};height:${cardH}px;background:#1a1a2e;`;
      done.appendChild(el);
    });}
  });
}

function cvNav(d) {
  const n = ci + d; if (n < 0 || n > 4) return;
  ci = n; playFlip(); renderViewer();
  const el = document.querySelector('#cvM .card');
  if (el) el.classList.add(d > 0 ? 'anim-r' : 'anim-l');
}

let tsx = 0;
document.addEventListener('touchstart', e => { tsx = e.touches[0].clientX }, { passive: true });
document.addEventListener('touchend', e => {
  if (document.getElementById('cardViewer').style.display === 'none') return;
  const d = e.changedTouches[0].clientX - tsx;
  if (Math.abs(d) > 50) cvNav(d < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('keydown', e => {
  if (document.getElementById('cardViewer').style.display !== 'none') {
    if (e.key === 'ArrowLeft') cvNav(-1);
    if (e.key === 'ArrowRight') cvNav(1);
  }
});

// ============================================================
// SHARE
// ============================================================
function copyRes() {
  const t = cur.map(c => `[${c.rar}] ${c.name} (ATK:${c.atk.toLocaleString()}/DEF:${c.def.toLocaleString()})`);
  navigator.clipboard.writeText(`ピクシブ百科事典ガチャ結果\n${t.join('\n')}\n#ピクシブ百科事典ガチャ`).then(() => alert('コピーしました！'));
}
function shareRes() {
  const t = cur.map(c => `[${c.rar}] ${c.name}`);
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`ピクシブ百科事典ガチャ結果\n${t.join('\n')}\n#ピクシブ百科事典ガチャ`)}`, '_blank');
}

// ============================================================
// PACK UI
// ============================================================
function updPk() {
  document.getElementById('pN').textContent = S.pk;
  const ng = 10 - S.pc % 10;
  const hasUltra = S.ultraBonus === true;
  document.getElementById('pG').textContent = hasUltra ? '🌈 ウルトラパック準備完了！' : ng === 10 ? '金パックまであと10回' : `金パックまであと${ng}回`;
  const pkImg = document.querySelector('.pk-img');
  if (pkImg) pkImg.src = hasUltra ? 'pix_ultra.png' : (ng === 1) ? 'pix_gold.png' : 'pix.png';
  // ポイント表示更新
  const ptsEl = document.getElementById('ptsDisplay');
  if (ptsEl) ptsEl.textContent = `${S.pts} pt`;
}

setInterval(() => {
  if (S.pk < S.mx) {
    const e = Date.now() - S.lt, l = 60000 - e % 60000, s = Math.ceil(l / 1000);
    document.getElementById('pT').textContent = `次の回復まで: ${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    if (e >= 60000) { S.pk = Math.min(S.mx, S.pk + Math.floor(e / 60000)); S.lt = Date.now(); save(); updPk(); }
  } else { document.getElementById('pT').textContent = 'パック満タン！'; }
}, 1000);

// ============================================================
// ZUKAN
// ============================================================
let zS = 'newest';
function sZ(t, b) { zS = t; document.querySelectorAll('.z-sort button').forEach(x => x.classList.remove('active')); if (b) b.classList.add('active'); renZ(); }

function renZ() {
  dedupeCollection();
  const g = document.getElementById('zGrid'), e = document.getElementById('zE');
  document.getElementById('zCnt').textContent = `${S.col.length}枚`;
  if (!S.col.length) { g.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  let s = [...S.col];
  if (zS === 'rarity') s.sort((a, b) => RO[b.rar] - RO[a.rar]);
  else if (zS === 'atk') s.sort((a, b) => b.atk - a.atk);
  else if (zS === 'name') s.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  g.innerHTML = s.slice(0, 200).map(c => `<div class="z-card card-${c.rar}" onclick="sDet('${c.id}')">
    <div class="z-ci"><img src="${getImgURL(c.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" referrerpolicy="no-referrer" loading="lazy"><span class="z-icon" style="display:none">${c.name.charAt(0)}</span><span class="z-badge bg-${c.rar}">${c.rar}</span></div>
    <div class="z-inf"><div class="z-nm">${c.name}</div><div class="z-sts"><span style="color:var(--red)">ATK ${c.atk.toLocaleString()}</span><span style="color:var(--accent)">DEF ${c.def.toLocaleString()}</span></div></div></div>`).join('');
}

// ============================================================
// DETAIL
// ============================================================
function sDet(id) {
  const c = S.col.find(x => x.id === id); if (!c) return;
  const o = document.getElementById('detO');
  o.innerHTML = `<div style="animation:dpop .35s cubic-bezier(.34,1.56,.64,1);position:relative" onclick="event.stopPropagation()">
    <button style="position:absolute;top:10px;right:14px;background:none;border:none;color:rgba(255,255,255,.6);font-size:1.5rem;cursor:pointer;z-index:5" onclick="cDet()">✕</button>
    ${cardHTML(c, 320, false)}
    <div style="padding:12px 16px;background:#111122;border-radius:0 0 14px 14px">
      <a class="d-link" href="https://dic.pixiv.net/a/${encodeURIComponent(c.name)}" target="_blank" rel="noopener">ピクシブ百科事典で見る</a>
    </div></div>`;
  o.classList.add('active');
}
function cDet() { document.getElementById('detO').classList.remove('active'); }

// ============================================================
// イラスト投稿数ベース バトルシステム
// ============================================================
let selectedBattleCardId = null;
let battleState = null;
let battleSortMode = 'rarity';

function renderBattleSelect() {
  cleanExpiredLocks();
  const grid = document.getElementById('bSelGrid');
  const btn = document.getElementById('battleBtn');
  const rec = document.getElementById('baRecord');
  selectedBattleCardId = null;
  if (btn) btn.disabled = true;
  if (rec) rec.textContent = `戦績: ${S.br.w}勝 ${S.br.l}敗 ${S.br.d||0}分`;

  // ポイント表示
  const ptsEl = document.getElementById('baPts');
  if (ptsEl) ptsEl.textContent = `ポイント: ${S.pts} pt`;

  if (S.col.length === 0) { grid.innerHTML = '<div style="color:var(--dim);padding:20px">カードがありません</div>'; return; }
  const seen = new Set();
  let unique = S.col.filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });

  // ソート
  if (battleSortMode === 'rarity') unique.sort((a, b) => RO[b.rar] - RO[a.rar] || b.atk - a.atk);
  else if (battleSortMode === 'atk') unique.sort((a, b) => b.atk - a.atk);
  else if (battleSortMode === 'name') unique.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  else if (battleSortMode === 'newest') unique.sort((a, b) => b.ts - a.ts);

  // ソートボタンのアクティブ状態更新
  document.querySelectorAll('.b-sort button').forEach(b => {
    b.classList.toggle('active', b.dataset.sort === battleSortMode);
  });

  grid.innerHTML = unique.slice(0, 50).map(c => {
    const ri = RO[c.rar];
    const lockUntil = S.cardLocks[c.name] || 0;
    const isLocked = lockUntil > Date.now();
    const lockRemain = isLocked ? Math.ceil((lockUntil - Date.now()) / 60000) : 0;
    const streak = S.cardWinStreaks[c.name] || 0;
    const streakText = streak > 0 ? `🔥${streak}連勝` : '';
    const lockClass = isLocked ? ' locked' : '';
    const lockLabel = isLocked ? `<div class="b-sel-lock">🔒 ${lockRemain}分</div>` : '';
    const onclick = isLocked ? '' : `onclick="selectBattleCard('${c.id}',this)"`;
    const bRarStyle = c.rar === 'LR'
      ? 'background:linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00cc00,#0088ff,#8800ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent'
      : `color:${RC[ri].cl}`;
    return `<div class="b-sel-card card-${c.rar}${lockClass}" data-id="${c.id}" ${onclick}>
    <div class="b-sel-rar" style="${bRarStyle}">${c.rar}</div>
    <div class="b-sel-name">${c.name}</div>
    <div class="b-sel-info">${streakText || 'ATK:'+c.atk.toLocaleString()}</div>${lockLabel}</div>`;
  }).join('');
}

function sortBattle(mode, el) {
  battleSortMode = mode;
  renderBattleSelect();
}

function selectBattleCard(id, el) {
  document.querySelectorAll('.b-sel-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedBattleCardId = id;
  document.getElementById('battleBtn').disabled = false;
}

// イラスト投稿数をプロキシ経由で取得（0の場合はカードデータから推定）
async function fetchIllustCount(tagName, cardData) {
  try {
    const resp = await fetch(`${PROXY_BASE}/illustcount?tag=${encodeURIComponent(tagName)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.count > 0) return data.count;
    }
  } catch(e) { console.warn('illustcount fetch failed:', e); }

  // プロキシで取れなかった場合、カードデータから推定
  return estimateIllustCount(tagName, cardData);
}

// カードデータ/既知タグからイラスト投稿数を推定
function estimateIllustCount(tagName, cardData) {
  // よく知られたタグの推定値
  const KNOWN_TAGS = {
    "東方Project":400000,"初音ミク":500000,"ポケットモンスター":300000,"Fate/Grand Order":250000,
    "原神":300000,"艦これ":300000,"鬼滅の刃":200000,"ブルーアーカイブ":200000,"刀剣乱舞":200000,
    "NARUTO":180000,"ウマ娘プリティーダービー":180000,"呪術廻戦":150000,"ワンピース":150000,
    "博麗霊夢":150000,"ドラゴンボール":120000,"ホロライブ":120000,"進撃の巨人":100000,
    "魔法少女まどか☆マギカ":100000,"ジョジョの奇妙な冒険":100000,"セーラームーン":80000,
    "チェンソーマン":80000,"五条悟":80000,"SPY×FAMILY":60000,"ドラえもん":60000,
    "推しの子":50000,"HUNTER×HUNTER":40000,"葬送のフリーレン":30000,
    "UNDERTALE":25000,"NieR:Automata":30000,"ワンパンマン":15000,
    "怪獣8号":12000,"薬屋のひとりごと":20000,"ブルーロック":35000,
    "新世紀エヴァンゲリオン":90000,"プリキュア":80000,"ラブライブ!":120000,
    "銀魂":50000,"涼宮ハルヒの憂鬱":35000,"ぼっち・ざ・ろっく!":40000,
    "Re:ゼロから始める異世界生活":35000,"ソードアート・オンライン":50000,
    "マインクラフト":20000,"ペルソナ5":25000,"ファイナルファンタジー":40000,
    "星のカービィ":30000,"大乱闘スマッシュブラザーズ":15000,
    "にじさんじ":80000,"ゴールデンカムイ":30000,"キングダム":8000,
    "リコリス・リコイル":20000,"ダンジョン飯":15000,
  };

  if (KNOWN_TAGS[tagName]) {
    // 既知タグ: ±20%のランダム振れ
    const base = KNOWN_TAGS[tagName];
    return Math.floor(base * (0.8 + Math.random() * 0.4));
  }

  // カードのレア度から投稿数を推定（レア度はイラスト投稿数で決まるので逆算）
  if (cardData) {
    const rar = cardData.rar || 'C';
    const ranges = {
      LR:  [200000, 500000],
      UR:  [80000, 200000],
      SSR: [30000, 80000],
      SR:  [10000, 30000],
      R:   [3000, 10000],
      UC:  [500, 3000],
      C:   [50, 500],
    };
    const [min, max] = ranges[rar] || [50, 500];
    return Math.floor(min + Math.random() * (max - min));
  }

  // 何もない場合
  return 200 + Math.floor(Math.random() * 2000);
}

async function startBattle() {
  if (!selectedBattleCardId) return;
  const pc = S.col.find(c => c.id === selectedBattleCardId);
  if (!pc) return;

  const btn = document.getElementById('battleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '対戦相手を探しています...'; }

  // 同じレア度の敵を1体取得
  let ec = null;
  try {
    const owned = getOwnedNames();
    const r18val = S.r18only ? 2 : S.r18 ? 1 : 0;
    const resp = await fetch(`${PROXY_BASE}/random?count=5&r18=${r18val}`);
    if (resp.ok) {
      const data = await resp.json();
      const candidates = (data.articles || []).filter(a => !owned.has(a.name) && a.name !== pc.name);
      if (candidates.length > 0) {
        // ランダムに1つ選んで、同じレア度を強制
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        ec = articleToCard(pick, pc.rar);
        ec.rar = pc.rar; // 確実に同レア度にする
        ec.rl = RC[RO[pc.rar]].l;
      }
    }
  } catch(e) { console.warn('Enemy fetch failed:', e); }

  // フォールバック: 同じレア度で生成
  if (!ec) {
    const fallbacks = generateFallbackArticles(15);
    for (const fb of fallbacks) {
      if (fb.name === pc.name) continue;
      ec = articleToCard(fb, pc.rar);
      ec.rar = pc.rar;
      ec.rl = RC[RO[pc.rar]].l;
      break;
    }
    if (!ec) {
      ec = articleToCard(generateFallbackArticles(1)[0], pc.rar);
      ec.rar = pc.rar;
      ec.rl = RC[RO[pc.rar]].l;
    }
  }

  // バトルフィールド表示
  document.getElementById('bSelectPhase').style.display = 'none';
  document.getElementById('bBattlePhase').style.display = 'block';
  document.getElementById('bfResult').style.display = 'none';
  document.getElementById('bfLog').innerHTML = '';

  if (btn) { btn.disabled = false; btn.textContent = 'バトル開始！'; }

  // プレイヤーカード表示
  document.getElementById('bfPlayerCard').innerHTML = `<img src="${getImgURL(pc.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" referrerpolicy="no-referrer"><div class="bf-card-fallback" style="display:none">${pc.name.substring(0,4)}</div>`;
  document.getElementById('bfPlayerName').textContent = `${pc.name} (${pc.rar})`;

  // 敵表示
  document.getElementById('bfEnemyCard').innerHTML = `<img src="${getImgURL(ec.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" referrerpolicy="no-referrer"><div class="bf-card-fallback" style="display:none">${ec.name.substring(0,4)}</div>`;
  document.getElementById('bfEnemyName').textContent = `${ec.name} (${ec.rar})`;

  const enemyCountLabel = document.getElementById('bfEnemyCount');
  if (enemyCountLabel) enemyCountLabel.textContent = '';

  document.getElementById('bfPlayerHP').style.width = '50%';
  document.getElementById('bfEnemyHP').style.width = '50%';
  document.getElementById('bfPlayerHPText').textContent = '取得中...';
  document.getElementById('bfEnemyHPText').textContent = '取得中...';

  const bfTurn = document.getElementById('bfTurn');
  if (bfTurn) bfTurn.textContent = `${pc.rar} vs ${ec.rar}`;

  addBattleLog(`⚔️ ${pc.name} VS ${ec.name}`, 'log-turn');
  addBattleLog(`📊 イラスト投稿数を取得中...`, '');

  // 両者のイラスト投稿数を取得
  const [playerIC, enemyIC] = await Promise.all([
    fetchIllustCount(pc.name, pc),
    fetchIllustCount(ec.name, ec),
  ]);

  addBattleLog(`📊 ${pc.name}: ${playerIC.toLocaleString()} 件`, 'log-skill');
  addBattleLog(`📊 ${ec.name}: ${enemyIC.toLocaleString()} 件`, 'log-atk');

  // HPバー表示
  const maxIC = Math.max(playerIC, enemyIC, 1);
  document.getElementById('bfPlayerHP').style.width = Math.max(5, (playerIC / maxIC) * 100) + '%';
  document.getElementById('bfEnemyHP').style.width = Math.max(5, (enemyIC / maxIC) * 100) + '%';
  document.getElementById('bfPlayerHPText').textContent = `イラスト: ${playerIC.toLocaleString()} 件`;
  document.getElementById('bfEnemyHPText').textContent = `イラスト: ${enemyIC.toLocaleString()} 件`;

  battleState = { player: pc, enemy: ec, playerIC, enemyIC };

  // 1.5秒待ってから結果表示
  await new Promise(r => setTimeout(r, 1500));

  // 勝敗判定
  const won = playerIC > enemyIC;
  const draw = playerIC === enemyIC;
  const cardName = pc.name;

  const resultDiv = document.getElementById('bfResult');
  const resultText = document.getElementById('bfResultText');
  const resultDetail = document.getElementById('bfResultDetail');
  resultDiv.style.display = 'block';

  let detail = '';
  let pointsChange = 0;

  if (won) {
    pointsChange = 10;
    resultText.textContent = '🎉 WIN!'; resultText.className = 'bf-result-text win';
    S.br.w++; spawnP(30);
    S.pts += pointsChange;

    S.cardWinStreaks[cardName] = (S.cardWinStreaks[cardName] || 0) + 1;
    const streak = S.cardWinStreaks[cardName];

    addBattleLog(`🎉 ${pc.name} が ${ec.name} に勝ちました！`, 'log-heal');
    showDamagePopup('enemy', 'WIN', 'skill-dmg');
    const targetEl = document.querySelector('.bf-enemy');
    if (targetEl) { targetEl.classList.add('shake'); setTimeout(() => targetEl.classList.remove('shake'), 400); }

    detail += `<div style="font-size:1.1rem;color:var(--txt);margin:12px 0;font-weight:700">${pc.name} が ${ec.name} に勝ちました！</div>`;
    detail += `<div style="font-size:.85rem;color:var(--dim);margin:4px 0">${playerIC.toLocaleString()} 件 > ${enemyIC.toLocaleString()} 件</div>`;
    detail += `<div class="b-gain">+ ${pointsChange} ポイント獲得！</div>`;

    if (streak >= 3) {
      const LOCK_DURATION = 30 * 60 * 1000;
      S.cardLocks[cardName] = Date.now() + LOCK_DURATION;
      S.cardWinStreaks[cardName] = 0;
      detail += `<div style="margin-top:8px;padding:8px 14px;border-radius:8px;background:rgba(255,71,87,.15);color:var(--red);font-size:.82rem">🔒 ${cardName} は3連勝したため30分間バトル使用不可</div>`;
    } else if (streak >= 2) {
      detail += `<div style="margin-top:6px;font-size:.78rem;color:var(--orange)">🔥 ${cardName}: ${streak}連勝中（あと1勝でロック）</div>`;
    }
  } else if (draw) {
    resultText.textContent = '🤝 DRAW'; resultText.className = 'bf-result-text'; resultText.style.color = 'var(--dim)';
    S.br.d = (S.br.d || 0) + 1;
    addBattleLog(`🤝 ${pc.name} と ${ec.name} は引き分け！`, '');
    detail += `<div style="font-size:1.1rem;color:var(--dim);margin:12px 0;font-weight:700">${pc.name} と ${ec.name} は引き分け</div>`;
    detail += `<div style="font-size:.85rem;color:var(--dim);margin:4px 0">${playerIC.toLocaleString()} 件 = ${enemyIC.toLocaleString()} 件</div>`;
  } else {
    pointsChange = -5;
    resultText.textContent = '💀 LOSE...'; resultText.className = 'bf-result-text lose';
    S.br.l++;
    S.pts = Math.max(0, S.pts + pointsChange);
    S.cardWinStreaks[cardName] = 0;

    addBattleLog(`💀 ${pc.name} が ${ec.name} に負けました...`, 'log-atk');
    showDamagePopup('player', 'LOSE', 'atk-dmg');
    const targetEl = document.querySelector('.bf-player');
    if (targetEl) { targetEl.classList.add('shake'); setTimeout(() => targetEl.classList.remove('shake'), 400); }

    detail += `<div style="font-size:1.1rem;color:var(--txt);margin:12px 0;font-weight:700">${pc.name} が ${ec.name} に負けました...</div>`;
    detail += `<div style="font-size:.85rem;color:var(--dim);margin:4px 0">${playerIC.toLocaleString()} 件 < ${enemyIC.toLocaleString()} 件</div>`;
    detail += `<div class="b-lose-card">${pointsChange} ポイント...</div>`;
  }
  detail += `<div style="margin-top:8px;font-size:.82rem">所持ポイント: ${S.pts} pt</div>`;
  detail += `<div style="margin-top:4px;font-size:.82rem">戦績: ${S.br.w}勝 ${S.br.l}敗 ${S.br.d||0}分</div>`;
  resultDetail.innerHTML = detail;
  save();
  updPk();
}

function endBattle() {
  document.getElementById('bBattlePhase').style.display = 'none';
  document.getElementById('bSelectPhase').style.display = 'block';
  battleState = null; renderBattleSelect();
}

// ============================================================
// カード交換（ポイントで百科事典URLからカード生成）
// ============================================================
async function openExchange() {
  document.getElementById('exchangeO').classList.add('active');
  document.getElementById('exPts').textContent = `所持ポイント: ${S.pts} pt`;
  document.getElementById('exUrl').value = '';
  document.getElementById('exPreview').innerHTML = '';
  document.getElementById('exStatus').textContent = '';
  document.getElementById('exConfirmBtn').style.display = 'none';
  document.getElementById('exSuggestions').className = 'ex-suggestions';
  document.getElementById('exSuggestions').innerHTML = '';
  exSugHighlight = -1;
  // 予測検索用のキャッシュを準備
  if (exSugCache.size === 0) loadExSugCache();
}

// ============================================================
// 予測検索システム
// ============================================================
let exSugDebounceTimer = null;
let exSugHighlight = -1;
let exSugFetching = false;
let exSugRemoteResults = []; // プロキシから返ってきた候補

// 所持カードのリンク先を初期キャッシュとして読み込む
function loadExSugCache() {
  for (const c of S.col) exSugCache.add(c.name);
}

// プロキシの /suggest エンドポイントから候補を取得
async function fetchSuggestionsFromProxy(query) {
  if (exSugFetching) return;
  if (query.length < 2) return;

  exSugFetching = true;
  try {
    const resp = await fetch(`${PROXY_BASE}/suggest?q=${encodeURIComponent(query)}`);
    if (resp.ok) {
      const data = await resp.json();
      exSugRemoteResults = (data.suggestions || []).map(s => s.name).filter(Boolean);
      // キャッシュにも追加
      for (const name of exSugRemoteResults) exSugCache.add(name);
      // 候補を再描画
      showSuggestions(query);
    }
  } catch(e) {}
  exSugFetching = false;
}

// 入力変更時
function onExInputChange() {
  const input = document.getElementById('exUrl');
  const query = input.value.trim();
  exSugHighlight = -1;

  if (query.length < 1) {
    hideSuggestions();
    return;
  }

  // ローカルキャッシュから即座に候補を表示
  showSuggestions(query);

  // デバウンスでプロキシにも問い合わせ（ひらがな入力対応）
  clearTimeout(exSugDebounceTimer);
  exSugDebounceTimer = setTimeout(() => fetchSuggestionsFromProxy(query), 400);
}

function showSuggestions(query) {
  const sugEl = document.getElementById('exSuggestions');
  const q = query.toLowerCase();
  const qKata = hiraganaToKatakana(q);

  const owned = getOwnedNames();
  const matches = [];
  const seen = new Set();

  // 1. プロキシから返ってきたリモート候補（最優先）
  for (const name of exSugRemoteResults) {
    if (seen.has(name) || name === query) continue;
    seen.add(name);
    matches.push({ name, isOwned: owned.has(name), priority: 0 });
  }

  // 2. ローカルキャッシュから部分一致
  for (const name of exSugCache) {
    if (seen.has(name) || name === query) continue;
    const nameLower = name.toLowerCase();
    const nameKata = hiraganaToKatakana(nameLower);
    // ひらがな/カタカナ/漢字の部分一致
    if (nameLower.includes(q) || nameKata.includes(qKata) || nameLower.includes(qKata)) {
      seen.add(name);
      const isPrefix = nameLower.startsWith(q) || nameKata.startsWith(qKata);
      matches.push({ name, isOwned: owned.has(name), priority: isPrefix ? 1 : 2 });
    }
    if (matches.length >= 20) break;
  }

  // ソート: リモート候補 → 前方一致 → 部分一致。所持済みは後ろ
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.isOwned !== b.isOwned) return a.isOwned ? 1 : -1;
    return a.name.localeCompare(b.name, 'ja');
  });

  const display = matches.slice(0, 15);

  if (display.length === 0) {
    // 候補がない場合「検索中...」を表示（プロキシ待ち）
    if (exSugFetching && query.length >= 2) {
      sugEl.innerHTML = '<div class="ex-sug-item" style="color:var(--dim);cursor:default">🔍 検索中...</div>';
      sugEl.className = 'ex-suggestions active';
    } else {
      hideSuggestions();
    }
    return;
  }

  sugEl.innerHTML = display.map((m, i) => {
    const ownedBadge = m.isOwned ? '<span class="sug-owned">所持</span>' : '';
    const escapedName = m.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<div class="ex-sug-item" data-idx="${i}" onmousedown="selectSuggestion('${escapedName}')" onmouseenter="exSugHighlight=${i};highlightSug()">
      <span class="sug-name">${m.name}</span>${ownedBadge}
    </div>`;
  }).join('');
  sugEl.className = 'ex-suggestions active';
}

// ひらがな→カタカナ変換
function hiraganaToKatakana(str) {
  return str.replace(/[\u3040-\u309F]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function hideSuggestions() {
  const sugEl = document.getElementById('exSuggestions');
  sugEl.className = 'ex-suggestions';
  sugEl.innerHTML = '';
  exSugHighlight = -1;
}

function selectSuggestion(name) {
  document.getElementById('exUrl').value = name;
  hideSuggestions();
  previewExchange();
}

function onExKeydown(e) {
  const sugEl = document.getElementById('exSuggestions');
  const items = sugEl.querySelectorAll('.ex-sug-item');
  if (!items.length) {
    if (e.key === 'Enter') { previewExchange(); e.preventDefault(); }
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    exSugHighlight = Math.min(exSugHighlight + 1, items.length - 1);
    highlightSug();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    exSugHighlight = Math.max(exSugHighlight - 1, -1);
    highlightSug();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (exSugHighlight >= 0 && exSugHighlight < items.length) {
      const name = items[exSugHighlight].querySelector('.sug-name').textContent;
      selectSuggestion(name);
    } else {
      hideSuggestions();
      previewExchange();
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

function highlightSug() {
  const items = document.querySelectorAll('.ex-sug-item');
  items.forEach((item, i) => item.classList.toggle('highlighted', i === exSugHighlight));
  if (exSugHighlight >= 0 && items[exSugHighlight]) {
    items[exSugHighlight].scrollIntoView({ block: 'nearest' });
  }
}

// 入力欄外クリックで候補を閉じる
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ex-autocomplete-wrap')) hideSuggestions();
});

function closeExchange() {
  document.getElementById('exchangeO').classList.remove('active');
}

let exchangePreviewCard = null;

async function previewExchange() {
  const urlInput = document.getElementById('exUrl').value.trim();
  const status = document.getElementById('exStatus');
  const preview = document.getElementById('exPreview');
  const confirmBtn = document.getElementById('exConfirmBtn');

  let tagName = '';
  if (urlInput.includes('dic.pixiv.net/a/')) {
    const m = urlInput.match(/dic\.pixiv\.net\/a\/([^?#]+)/);
    if (m) tagName = decodeURIComponent(m[1]).replace(/\+/g, ' ');
  } else {
    tagName = urlInput;
  }

  if (!tagName) {
    status.textContent = '❌ 百科事典のURLまたは記事名を入力してください';
    status.style.color = 'var(--red)';
    return;
  }

  if (S.col.some(c => c.name === tagName)) {
    status.textContent = '⚠️ このカードは既に所持しています';
    status.style.color = 'var(--orange)';
    return;
  }

  status.textContent = '🔍 記事を取得中...';
  status.style.color = 'var(--dim)';

  try {
    const resp = await fetch(`${PROXY_BASE}/article?name=${encodeURIComponent(tagName)}`);
    if (!resp.ok) throw new Error('Fetch failed');
    const article = await resp.json();
    if (!article.name) throw new Error('Article not found');

    // 記事が実際に存在するかチェック（閲覧数0 & 説明文なし = 存在しない可能性大）
    if ((!article.desc || article.desc.length < 10) && (!article.views || article.views === 0) && (!article.contentLength || article.contentLength < 500)) {
      status.textContent = '❌ この記事は存在しないか、内容が不十分です';
      status.style.color = 'var(--red)';
      preview.innerHTML = '';
      confirmBtn.style.display = 'none';
      return;
    }

    const ic = await fetchIllustCount(tagName);
    article.illustCount = ic;

    const card = articleToCard(article);
    exchangePreviewCard = card;

    const cost = EXCHANGE_COST[card.rar] || 5;
    const canAfford = S.pts >= cost;

    preview.innerHTML = `<div style="transform:scale(0.85);transform-origin:top center">${cardHTML(card, 280, false)}</div>`;
    status.innerHTML = `交換コスト: <span style="color:${canAfford ? 'var(--green)' : 'var(--red)'}; font-weight:900">${cost} pt</span>（所持: ${S.pts} pt）${ic > 0 ? `<br>イラスト投稿数: ${ic.toLocaleString()} 件` : ''}`;
    status.style.color = 'var(--dim)';

    confirmBtn.style.display = canAfford ? '' : 'none';
    confirmBtn.textContent = `${cost} pt で交換する`;
    confirmBtn.onclick = () => confirmExchange(cost);

    if (!canAfford) {
      status.innerHTML += '<br><span style="color:var(--red)">ポイントが足りません</span>';
    }
  } catch(e) {
    status.textContent = '❌ 記事の取得に失敗しました';
    status.style.color = 'var(--red)';
    preview.innerHTML = '';
    confirmBtn.style.display = 'none';
  }
}

function confirmExchange(cost) {
  if (!exchangePreviewCard || S.pts < cost) return;

  S.pts -= cost;
  exchangePreviewCard.ts = Date.now();
  exchangePreviewCard.isNew = true;
  S.col.unshift(exchangePreviewCard);
  dedupeCollection();
  save();
  updPk();

  const status = document.getElementById('exStatus');
  status.innerHTML = `✅ <span style="color:var(--green);font-weight:700">${exchangePreviewCard.name}</span> を獲得しました！（残り: ${S.pts} pt）`;
  document.getElementById('exConfirmBtn').style.display = 'none';
  document.getElementById('exPts').textContent = `所持ポイント: ${S.pts} pt`;
  exchangePreviewCard = null;

  spawnP(20);
}

// ============================================================
// BATTLE UI helpers
// ============================================================
function addBattleLog(text, cls) {
  const log = document.getElementById('bfLog');
  const div = document.createElement('div'); div.className = cls || ''; div.textContent = text;
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}

function showDamagePopup(targetSide, amount, type) {
  const targetEl = document.querySelector(targetSide === 'enemy' ? '.bf-enemy' : '.bf-player');
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = `dmg-popup ${type}`;
  popup.textContent = typeof amount === 'number' ? (type === 'heal-dmg' ? `+${amount}` : `-${amount}`) : amount;
  popup.style.left = (rect.left + rect.width / 2 - 30) + 'px';
  popup.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1200);
}

// ============================================================
// NAV
// ============================================================
document.querySelectorAll('.ni').forEach(i => {
  i.addEventListener('click', () => {
    document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.scr').forEach(s => s.classList.remove('active'));
    i.classList.add('active');
    document.getElementById(`screen-${i.dataset.tab}`).classList.add('active');
    if (i.dataset.tab === 'zukan') renZ();
    if (i.dataset.tab === 'battle') renderBattleSelect();
    if (i.dataset.tab === 'gacha') backToPack();
  });
});

function toggleHelp() { document.getElementById('helpO').classList.toggle('active'); }

// ============================================================
// EFFECTS
// ============================================================
function showFl(t) { const e = document.getElementById('flashO'); e.className = `fov ${t}`; setTimeout(() => e.className = 'fov', 2000); }
function showRA(t, c) { const e = document.getElementById('raAnn'); e.textContent = `✦ ${t} ✦`; e.style.color = c; e.className = 'ra show'; setTimeout(() => e.className = 'ra', 1500); }
function spawnP(n) {
  const container = document.getElementById('particles');
  const colors = ['#ffd700','#ff6b81','#00d4ff','#a55eea','#2ed573','#ff9f43'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div'); p.className = 'par';
    p.style.left = '50%'; p.style.top = '50%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 600}px`);
    p.style.setProperty('--dy', `${(Math.random() - 0.5) * 600}px`);
    p.style.animationDelay = `${Math.random() * 0.3}s`;
    const sz = 3 + Math.random() * 5; p.style.width = sz + 'px'; p.style.height = sz + 'px';
    container.appendChild(p); setTimeout(() => p.remove(), 1500);
  }
}

// ============================================================
// INIT
// ============================================================
updPk(); initR18Toggle();
if (S.lt) {
  const r = Math.floor((Date.now() - S.lt) / 60000);
  if (r > 0 && S.pk < S.mx) { S.pk = Math.min(S.mx, S.pk + r); S.lt = Date.now(); save(); updPk(); }
}

// ============================================================
// コナミコマンド
// ============================================================
(function(){
  const KONAMI_KEYS = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  const KONAMI_SWIPES = ['up','up','down','down','left','right','left','right'];
  let keySeq = [];
  let swipeSeq = [];
  let swStartX = 0, swStartY = 0;
  let abPhase = false;

  document.addEventListener('keydown', function(e) {
    if (document.getElementById('cardViewer').style.display !== 'none') return;
    if (document.querySelector('.ho.active') || document.querySelector('.do.active')) return;

    const key = e.key.toLowerCase();
    keySeq.push(e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? e.key : key);
    if (keySeq.length > 10) keySeq.shift();

    if (keySeq.length === 10 && keySeq.every((k, i) => k === KONAMI_KEYS[i])) {
      keySeq = [];
      activateGoldenBonus();
    }
  });

  document.addEventListener('touchstart', function(e) {
    if (abPhase) return;
    swStartX = e.touches[0].clientX;
    swStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (abPhase) return;
    if (document.getElementById('cardViewer').style.display !== 'none') return;

    const dx = e.changedTouches[0].clientX - swStartX;
    const dy = e.changedTouches[0].clientY - swStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    if (absDx < 30 && absDy < 30) return;

    let dir = '';
    if (absDy > absDx) dir = dy < 0 ? 'up' : 'down';
    else dir = dx > 0 ? 'right' : 'left';

    swipeSeq.push(dir);
    if (swipeSeq.length > 8) swipeSeq.shift();

    if (swipeSeq.length === 8 && swipeSeq.every((d, i) => d === KONAMI_SWIPES[i])) {
      swipeSeq = [];
      showABButtons();
    }
  }, { passive: true });

  function showABButtons() {
    abPhase = true;
    let abSeq = [];
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;display:flex;justify-content:center;align-items:center;gap:40px;';

    const makeBtn = (label) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'width:80px;height:80px;border-radius:50%;border:3px solid #fff;background:rgba(255,255,255,.1);color:#fff;font-size:2rem;font-weight:900;font-family:inherit;cursor:pointer;transition:.15s;';
      btn.addEventListener('click', () => {
        btn.style.background = 'rgba(255,215,0,.3)';
        btn.style.borderColor = '#ffd700';
        abSeq.push(label);
        if (abSeq.length === 2) {
          if (abSeq[0] === 'B' && abSeq[1] === 'A') {
            overlay.remove();
            abPhase = false;
            activateGoldenBonus();
          } else {
            abSeq = [];
            overlay.remove();
            abPhase = false;
          }
        }
      });
      return btn;
    };

    overlay.appendChild(makeBtn('B'));
    overlay.appendChild(makeBtn('A'));

    const close = document.createElement('button');
    close.textContent = '✕';
    close.style.cssText = 'position:absolute;top:20px;right:20px;background:none;border:none;color:rgba(255,255,255,.5);font-size:1.5rem;cursor:pointer;';
    close.addEventListener('click', () => { overlay.remove(); abPhase = false; });
    overlay.appendChild(close);

    document.body.appendChild(overlay);
  }

  function activateGoldenBonus() {
    const now = Date.now();
    const lastUsed = S.ultraBonusAt || 0;
    const cooldown = 60 * 60 * 1000;

    if (now - lastUsed < cooldown) {
      const remaining = Math.ceil((cooldown - (now - lastUsed)) / 60000);
      showKonamiNotification(`次のウルトラパックまで ${remaining}分`, '#ff9f43');
      return;
    }

    S.ultraBonusAt = now;
    S.ultraBonus = true;
    save();
    spawnP(60);
    showKonamiNotification('🌈 ウルトラパック獲得！ 🌈', '#a78bfa');
  }

  function showKonamiNotification(text, color) {
    const notif = document.createElement('div');
    notif.textContent = text;
    notif.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:1.8rem;font-weight:900;color:${color};z-index:1000;pointer-events:none;text-shadow:0 0 30px ${color};animation:konamiPop 2s ease forwards;white-space:nowrap;`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
  }

  const style = document.createElement('style');
  style.textContent = `@keyframes konamiPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}40%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-55%) scale(1.1)}}`;
  document.head.appendChild(style);
})();