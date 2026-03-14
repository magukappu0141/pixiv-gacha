// ============================================================
// ピクシブ百科事典ガチャ - app.js v2
// ============================================================
const PROXY_BASE = 'https://pixiv-gacha-proxy.vercel.app';

const RC = [
  { n:'C',   l:'コモン',             cl:'var(--c)',   w:50,  minViews:0,     minLen:0 },
  { n:'UC',  l:'アンコモン',         cl:'var(--uc)',  w:25,  minViews:500,   minLen:1000 },
  { n:'R',   l:'レア',               cl:'var(--r)',   w:13,  minViews:2000,  minLen:3000 },
  { n:'SR',  l:'スーパーレア',       cl:'var(--sr)',  w:7,   minViews:8000,  minLen:8000 },
  { n:'SSR', l:'SSレア',             cl:'var(--ssr)', w:3.5, minViews:20000, minLen:15000 },
  { n:'UR',  l:'ウルトラレア',       cl:'var(--ur)',  w:1.2, minViews:50000, minLen:30000 },
  { n:'LR',  l:'レジェンドレア',     cl:'var(--lr)',  w:0.3, minViews:100000,minLen:50000 },
];
const RO = { C:0, UC:1, R:2, SR:3, SSR:4, UR:5, LR:6 };

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

let S = { col:[], pc:0, pk:10, mx:10, lt:Date.now(), br:{w:0,l:0,d:0}, r18:false, r18only:false };
try { const v = localStorage.getItem('pxg5'); if(v) S = {...S, ...JSON.parse(v)}; } catch(e) {}

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

function determineRarity(views, contentLength, illustCount) {
  const roll = Math.random() * 100;
  let baseRarity;
  if (roll < 0.3)       baseRarity = 'LR';
  else if (roll < 1.5)  baseRarity = 'UR';
  else if (roll < 5)    baseRarity = 'SSR';
  else if (roll < 12)   baseRarity = 'SR';
  else if (roll < 25)   baseRarity = 'R';
  else if (roll < 50)   baseRarity = 'UC';
  else                   baseRarity = 'C';

  // 品質スコア = 閲覧数 + 記事文字数÷5 + イラスト投稿数×2
  const ic = illustCount || 0;
  const qualityScore = views + contentLength / 5 + ic * 2;

  // イラスト投稿数が多い場合、レア度を上げるボーナス
  // 10000件以上→1段階UP、50000件以上→2段階UP
  let bonus = 0;
  if (ic >= 50000) bonus = 2;
  else if (ic >= 10000) bonus = 1;

  // 品質が足りないと降格
  if (baseRarity === 'LR'  && qualityScore < 100000) baseRarity = 'UR';
  if (baseRarity === 'UR'  && qualityScore < 50000)  baseRarity = 'SSR';
  if (baseRarity === 'SSR' && qualityScore < 20000)  baseRarity = 'SR';
  if (baseRarity === 'SR'  && qualityScore < 5000)   baseRarity = 'R';

  // イラスト投稿数ボーナスで昇格（LRは超えない）
  const rarOrder = ['C','UC','R','SR','SSR','UR','LR'];
  if (bonus > 0) {
    const idx = rarOrder.indexOf(baseRarity);
    const newIdx = Math.min(idx + bonus, 6); // LR=6が上限
    baseRarity = rarOrder[newIdx];
  }

  return baseRarity;
}

function calcStats(views, contentLength, rarity, illustCount) {
  const mult = RO[rarity] + 1;
  const ic = illustCount || 0;
  const atkBase = Math.log10(Math.max(views, 10)) * 200 + Math.log10(Math.max(ic, 1)) * 50;
  const defBase = Math.log10(Math.max(contentLength, 100)) * 120;
  const atk = Math.floor(atkBase * mult * (0.8 + Math.random() * 0.4));
  const def = Math.floor(defBase * mult * (0.8 + Math.random() * 0.4));
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
  const FALLBACK_NAMES = ["鬼滅の刃","呪術廻戦","進撃の巨人","SPY×FAMILY","チェンソーマン","葬送のフリーレン","ワンピース","ドラゴンボール","NARUTO","BLEACH","新世紀エヴァンゲリオン","名探偵コナン","ジョジョの奇妙な冒険","HUNTER×HUNTER","Fate/Grand Order","ポケットモンスター","マリオ","ゼルダの伝説","原神","マインクラフト","エルデンリング","初音ミク","ピカチュウ","五条悟","竈門炭治郎","ルフィ","博麗霊夢","東方Project","ホロライブ","にじさんじ","兎田ぺこら","千本桜","スラムダンク","ドラえもん","千と千尋の神隠し","もののけ姫","となりのトトロ","君の名は。","セーラームーン","プリキュア","ウマ娘プリティーダービー","刀剣乱舞","ブルーアーカイブ","魔法少女まどか☆マギカ","Fate/stay night","ぼっち・ざ・ろっく!","銀魂","涼宮ハルヒの憂鬱","ラブライブ!","薬屋のひとりごと","ダンジョン飯","リコリス・リコイル","UNDERTALE","NieR:Automata","メイドインアビス","織田信長","新選組","コミケ","ツンデレ","ヤンデレ","領域展開","悪魔の実","スタンド","写輪眼","ドラゴン","吸血鬼","妖怪","擬人化","異世界転生","フランドール・スカーレット","チルノ","霧雨魔理沙","十六夜咲夜","星街すいせい","葛葉","宝鐘マリン","雷電将軍","鍾離","胡桃","マキマ","フリーレン","アーニャ・フォージャー","リヴァイ","煉獄杏寿郎","セイバー","レム","2B","後藤ひとり","ギルガメッシュ","諦めたらそこで試合終了ですよ","だが断る","海馬瀬人","ボーカロイド","鏡音リン・レン","重音テト","ラピュタ","艦これ","モンスターハンター","バイオハザード","ペルソナ5","星のカービィ","大乱闘スマッシュブラザーズ","ファイナルファンタジー","ゴールデンカムイ","ブルーロック","キングダム","ワンパンマン","ガールズ&パンツァー","このすば","ヴァイオレット・エヴァーガーデン","転生したらスライムだった件"];
  const available = FALLBACK_NAMES.filter(n => !owned.has(n)).sort(() => Math.random() - 0.5);
  return available.slice(0, count).map(name => ({ name, desc: '', views: Math.floor(Math.random() * 200000) + 100, contentLength: Math.floor(Math.random() * 80000) + 500 }));
}

// ============================================================
// CARD CREATION
// ============================================================
function articleToCard(article, guaranteedMinRarity) {
  const ic = article.illustCount || 0;
  let rarity = determineRarity(article.views, article.contentLength, ic);
  if (guaranteedMinRarity && RO[rarity] < RO[guaranteedMinRarity]) rarity = guaranteedMinRarity;
  const stats = calcStats(article.views, article.contentLength, rarity, ic);
  const flav = RO[rarity] >= 4 ? FL[Math.floor(Math.random() * FL.length)] : null;
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
  // 説明文を80文字以内に切り詰め（フレーバーテキストがある場合はさらに短く）
  let desc = c.desc || '';
  const maxLen = c.flav ? 55 : 80;
  if (desc.length > maxLen) desc = desc.substring(0, maxLen) + '…';
  const flavHTML = c.flav ? `<div class="flav">「${c.flav}」</div>` : '';
  return `<div class="card card-${c.rar}" style="width:${width}px;${cursor}" ${onclick}>
    <div class="c-hd"><span class="c-rar" style="color:${RC[ri].cl}">${c.rar}</span><span class="c-nm">${c.name}</span></div>
    <div class="c-img" style="width:${width}px">
      <img src="${getImgURL(c.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" referrerpolicy="no-referrer" loading="lazy">
      <div class="c-fallback" style="display:none"><span class="c-fname">${c.name}</span></div>
    </div>
    <div class="c-desc">${desc}${flavHTML}</div>
    <div class="c-stats">
      <div class="c-st"><div class="c-stl atk">ATK</div><div class="c-stv atk">${c.atk.toLocaleString()}</div></div>
      <div class="c-st"><div class="c-stl def">DEF</div><div class="c-stv def">${c.def.toLocaleString()}</div></div>
    </div></div>`;
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
  if (rarity === 'LR') { hue1 = 260; hue2 = 310; label = '✦ LEGEND RARE ✦'; textClass = 'lr-text'; }
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

    // Background glow
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.6);
    grd.addColorStop(0, `hsla(${hue1}, 80%, 50%, ${0.15 * Math.sin(frame * 0.05)})`);
    grd.addColorStop(0.5, `hsla(${hue2}, 60%, 30%, ${0.08 * Math.sin(frame * 0.03)})`);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Light rays
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

    // Particles
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

    // Expanding ring
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
    const isGold = S.pc % 10 === 0;
    const packOImg = document.getElementById('packOImg');
    if (packOImg) packOImg.src = isGold ? 'pix_gold.png' : 'pix.png';

    const articles = await fetchRandomArticles(5);
    const cards = articles.map((a, i) => articleToCard(a, (isGold && i === 4) ? 'SR' : null));
    while (cards.length < 5) cards.push(articleToCard(generateFallbackArticles(1)[0]));

    cards.forEach(c => { c.isNew = true; S.col.unshift(c); });
    dedupeCollection();
    save(); cur = cards; ci = 0;

    const br = Math.max(...cards.map(c => RO[c.rar]));
    const bestRarity = cards.find(c => RO[c.rar] === br).rar;

    document.getElementById('packO').classList.add('active');

    setTimeout(() => {
      document.getElementById('packO').classList.remove('active');

      if (br >= 4) { // SSR以上 → 豪華演出
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

    // 右側: 未開封カード
    const backs = document.getElementById('cvBacks'); backs.innerHTML = '';
    cur.slice(ci + 1).slice(0, 4).forEach((c, i) => {
      const el = document.createElement('div');
      el.className = `cv-back-card bk-${c.rar}`;
      el.style.cssText = `right:${i*6}px;top:${4+i*4}px;transform:rotate(${2+i*1.5}deg);opacity:${0.6-i*0.12};z-index:${4-i};height:${cardH}px;background:#1a1a2e;`;
      backs.appendChild(el);
    });

    // 左側: 開封済みカード
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
  document.getElementById('pG').textContent = ng === 10 ? '金パックまであと10回' : `金パックまであと${ng}回`;
  const pkImg = document.querySelector('.pk-img');
  if (pkImg) pkImg.src = (ng === 1) ? 'pix_gold.png' : 'pix.png';
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
  dedupeCollection(); // 表示前に必ず重複排除
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
// HP制ターンバトルシステム
// ============================================================
let selectedBattleCardId = null;
let battleState = null;

function renderBattleSelect() {
  const grid = document.getElementById('bSelGrid');
  const btn = document.getElementById('battleBtn');
  const rec = document.getElementById('baRecord');
  selectedBattleCardId = null;
  if (btn) btn.disabled = true;
  if (rec) rec.textContent = `戦績: ${S.br.w}勝 ${S.br.l}敗 ${S.br.d||0}分`;

  if (S.col.length === 0) { grid.innerHTML = '<div style="color:var(--dim);padding:20px">カードがありません</div>'; return; }
  const seen = new Set();
  const unique = S.col.filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
  grid.innerHTML = unique.slice(0, 50).map(c => {
    const ri = RO[c.rar];
    return `<div class="b-sel-card card-${c.rar}" data-id="${c.id}" onclick="selectBattleCard('${c.id}',this)">
    <div class="b-sel-rar" style="color:${RC[ri].cl}">${c.rar}</div>
    <div class="b-sel-name">${c.name}</div>
    <div class="b-sel-info">ATK:${c.atk.toLocaleString()}</div></div>`;
  }).join('');
}

function selectBattleCard(id, el) {
  document.querySelectorAll('.b-sel-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedBattleCardId = id;
  document.getElementById('battleBtn').disabled = false;
}

function calcHP(card) {
  const rarMult = { C: 1, UC: 1.2, R: 1.5, SR: 2, SSR: 2.5, UR: 3, LR: 4 };
  return Math.floor((card.atk + card.def) * (rarMult[card.rar] || 1) * 0.5);
}

async function startBattle() {
  if (!selectedBattleCardId) return;
  const pc = S.col.find(c => c.id === selectedBattleCardId);
  if (!pc) return;

  const btn = document.getElementById('battleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '対戦相手を探しています...'; }

  let ec;
  try {
    // プロキシから持っていないカードを取得
    const owned = getOwnedNames();
    const r18val = S.r18only ? 2 : S.r18 ? 1 : 0;
    const resp = await fetch(`${PROXY_BASE}/random?count=3&r18=${r18val}`);
    if (resp.ok) {
      const data = await resp.json();
      const candidates = (data.articles || []).filter(a => !owned.has(a.name));
      if (candidates.length > 0) {
        ec = articleToCard(candidates[Math.floor(Math.random() * candidates.length)]);
      }
    }
  } catch(e) { console.warn('Enemy fetch failed:', e); }

  // フォールバック: プロキシ失敗時はローカルリストから
  if (!ec) {
    const owned = getOwnedNames();
    const fallbacks = generateFallbackArticles(10).filter(a => !owned.has(a.name));
    if (fallbacks.length > 0) {
      ec = articleToCard(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
    } else {
      // 本当に全部持っている場合は適当に生成
      ec = articleToCard(generateFallbackArticles(1)[0]);
    }
  }

  const playerMaxHP = calcHP(pc), enemyMaxHP = calcHP(ec);

  battleState = { player: pc, enemy: ec, turn: 1, playerHP: playerMaxHP, enemyHP: enemyMaxHP, playerMaxHP, enemyMaxHP, skillCD: 0, enemySkillCD: 0, defending: false, log: [] };

  document.getElementById('bSelectPhase').style.display = 'none';
  document.getElementById('bBattlePhase').style.display = 'block';
  document.getElementById('bfResult').style.display = 'none';
  document.getElementById('bfActions').style.display = '';
  document.getElementById('bfLog').innerHTML = '';

  document.getElementById('bfPlayerCard').innerHTML = `<img src="${getImgURL(pc.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" referrerpolicy="no-referrer"><div class="bf-card-fallback" style="display:none">${pc.name.substring(0,4)}</div>`;
  document.getElementById('bfEnemyCard').innerHTML = `<img src="${getImgURL(ec.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" referrerpolicy="no-referrer"><div class="bf-card-fallback" style="display:none">${ec.name.substring(0,4)}</div>`;
  document.getElementById('bfPlayerName').textContent = `${pc.name} (${pc.rar})`;
  document.getElementById('bfEnemyName').textContent = `${ec.name} (${ec.rar})`;

  updateBattleHP(); updateTurnDisplay(); updateSkillButton();
  addBattleLog(`⚔️ バトル開始！ ${pc.name} VS ${ec.name}`, 'log-turn');
  if (btn) { btn.disabled = false; btn.textContent = 'バトル開始！'; }
}

function updateBattleHP() {
  const bs = battleState;
  const pPct = Math.max(0, bs.playerHP / bs.playerMaxHP * 100);
  const ePct = Math.max(0, bs.enemyHP / bs.enemyMaxHP * 100);
  const pBar = document.getElementById('bfPlayerHP'), eBar = document.getElementById('bfEnemyHP');
  pBar.style.width = pPct + '%'; eBar.style.width = ePct + '%';
  pPct < 25 ? pBar.classList.add('low') : pBar.classList.remove('low');
  ePct < 25 ? eBar.classList.add('low') : eBar.classList.remove('low');
  document.getElementById('bfPlayerHPText').textContent = `HP: ${Math.max(0,bs.playerHP).toLocaleString()} / ${bs.playerMaxHP.toLocaleString()}`;
  document.getElementById('bfEnemyHPText').textContent = `HP: ${Math.max(0,bs.enemyHP).toLocaleString()} / ${bs.enemyMaxHP.toLocaleString()}`;
}

function updateTurnDisplay() { document.getElementById('bfTurn').textContent = `ターン ${battleState.turn}`; }

function updateSkillButton() {
  const skillBtn = document.querySelector('.act-skill');
  if (!skillBtn) return;
  if (battleState.skillCD > 0) { skillBtn.disabled = true; skillBtn.classList.add('cooldown'); skillBtn.setAttribute('data-cd', `${battleState.skillCD}T`); }
  else { skillBtn.disabled = false; skillBtn.classList.remove('cooldown'); skillBtn.removeAttribute('data-cd'); }
}

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
  popup.textContent = type === 'heal-dmg' ? `+${amount}` : `-${amount}`;
  popup.style.left = (rect.left + rect.width / 2 - 30) + 'px';
  popup.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1200);
  if (type !== 'heal-dmg') { targetEl.classList.add('shake'); setTimeout(() => targetEl.classList.remove('shake'), 400); }
}

function battleAction(action) {
  if (!battleState || battleState.playerHP <= 0 || battleState.enemyHP <= 0) return;
  if (action === 'skill' && battleState.skillCD > 0) return; // CD中は何もしない（ボタンdisable前にチェック）
  const bs = battleState, pc = bs.player, ec = bs.enemy;
  document.querySelectorAll('.bf-act-btn').forEach(b => b.disabled = true);
  addBattleLog(`── ターン ${bs.turn} ──`, 'log-turn');
  bs.defending = false;

  switch (action) {
    case 'attack': {
      const dmg = Math.floor(pc.atk * (0.15 + Math.random() * 0.1));
      bs.enemyHP -= dmg;
      addBattleLog(`${pc.name} の攻撃！ ${dmg.toLocaleString()} ダメージ！`, 'log-atk');
      showDamagePopup('enemy', dmg, 'atk-dmg'); break;
    }
    case 'defend': { bs.defending = true; addBattleLog(`${pc.name} は防御の構えを取った！`, 'log-def'); break; }
    case 'skill': {
      const dmg = Math.floor((pc.atk + pc.def * 0.5) * (0.25 + Math.random() * 0.15));
      bs.enemyHP -= dmg; bs.skillCD = 3;
      addBattleLog(`${pc.name} のスキル発動！ ${dmg.toLocaleString()} の大ダメージ！`, 'log-skill');
      showDamagePopup('enemy', dmg, 'skill-dmg'); break;
    }
    case 'heal': {
      const heal = Math.floor(pc.def * (0.12 + Math.random() * 0.08));
      bs.playerHP = Math.min(bs.playerMaxHP, bs.playerHP + heal);
      addBattleLog(`${pc.name} はHPを ${heal.toLocaleString()} 回復した！`, 'log-heal');
      showDamagePopup('player', heal, 'heal-dmg'); break;
    }
  }
  updateBattleHP();
  if (bs.enemyHP <= 0) { setTimeout(() => finishBattle('win'), 800); return; }
  setTimeout(() => enemyTurn(), 800);
}

function enemyTurn() {
  const bs = battleState, pc = bs.player, ec = bs.enemy;
  const hpPct = bs.enemyHP / bs.enemyMaxHP;
  let action;
  if (hpPct < 0.25 && Math.random() < 0.5) action = 'heal';
  else if (bs.enemySkillCD <= 0 && Math.random() < 0.25) action = 'skill';
  else if (Math.random() < 0.15) action = 'defend';
  else action = 'attack';

  switch (action) {
    case 'attack': {
      const dmg = Math.floor(ec.atk * (0.15 + Math.random() * 0.1) * (bs.defending ? 0.5 : 1));
      bs.playerHP -= dmg;
      addBattleLog(`${ec.name} の攻撃！ ${dmg.toLocaleString()} ダメージ${bs.defending ? '（防御で半減！）' : '！'}`, 'log-atk');
      showDamagePopup('player', dmg, 'atk-dmg');
      if (bs.defending) {
        const counter = Math.floor(pc.atk * 0.08);
        bs.enemyHP -= counter;
        addBattleLog(`${pc.name} の反撃！ ${counter.toLocaleString()} ダメージ！`, 'log-def');
        setTimeout(() => showDamagePopup('enemy', counter, 'atk-dmg'), 300);
      }
      break;
    }
    case 'skill': {
      const dmg = Math.floor((ec.atk + ec.def * 0.5) * (0.25 + Math.random() * 0.15) * (bs.defending ? 0.5 : 1));
      bs.playerHP -= dmg; bs.enemySkillCD = 3;
      addBattleLog(`${ec.name} のスキル発動！ ${dmg.toLocaleString()} の大ダメージ${bs.defending ? '（防御で半減！）' : '！'}`, 'log-skill');
      showDamagePopup('player', dmg, 'skill-dmg'); break;
    }
    case 'heal': {
      const heal = Math.floor(ec.def * (0.12 + Math.random() * 0.08));
      bs.enemyHP = Math.min(bs.enemyMaxHP, bs.enemyHP + heal);
      addBattleLog(`${ec.name} はHPを ${heal.toLocaleString()} 回復した！`, 'log-heal');
      showDamagePopup('enemy', heal, 'heal-dmg'); break;
    }
    case 'defend': { addBattleLog(`${ec.name} は防御の構えを取った！`, 'log-def'); break; }
  }
  updateBattleHP();
  if (bs.playerHP <= 0) { setTimeout(() => finishBattle('lose'), 600); return; }
  if (bs.enemyHP <= 0) { setTimeout(() => finishBattle('win'), 600); return; }

  bs.turn++;
  if (bs.skillCD > 0) bs.skillCD--;
  if (bs.enemySkillCD > 0) bs.enemySkillCD--;
  updateTurnDisplay();
  if (bs.turn > 30) { setTimeout(() => finishBattle('draw'), 600); return; }
  // 全ボタンを有効化してからスキルだけCDチェック
  document.querySelectorAll('.bf-act-btn').forEach(b => b.disabled = false);
  updateSkillButton();
}

function finishBattle(result) {
  const bs = battleState, pc = bs.player, ec = bs.enemy;
  document.getElementById('bfActions').style.display = 'none';
  const resultDiv = document.getElementById('bfResult');
  const resultText = document.getElementById('bfResultText');
  const resultDetail = document.getElementById('bfResultDetail');
  resultDiv.style.display = 'block';
  let detail = `<div>ターン数: ${bs.turn}</div>`;

  if (result === 'win') {
    resultText.textContent = '🎉 WIN!'; resultText.className = 'bf-result-text win';
    S.br.w++; spawnP(30);
    ec.isNew = true; ec.ts = Date.now(); S.col.unshift(ec);
    dedupeCollection();
    detail += `<div style="font-size:.95rem;color:var(--txt);margin:8px 0">${pc.name} が ${ec.name} に勝ちました！</div>`;
    detail += `<div class="b-gain">+ ${ec.name} (${ec.rar}) を獲得！</div>`;
  } else if (result === 'lose') {
    resultText.textContent = '💀 LOSE...'; resultText.className = 'bf-result-text lose';
    S.br.l++;
    const idx = S.col.findIndex(c => c.id === pc.id);
    if (idx !== -1) S.col.splice(idx, 1);
    detail += `<div style="font-size:.95rem;color:var(--txt);margin:8px 0">${ec.name} が ${pc.name} に勝ちました...</div>`;
    detail += `<div class="b-lose-card">- ${pc.name} (${pc.rar}) を没収された...</div>`;
  } else {
    resultText.textContent = '🤝 DRAW'; resultText.className = 'bf-result-text'; resultText.style.color = 'var(--dim)';
    S.br.d = (S.br.d || 0) + 1;
    detail += `<div style="font-size:.95rem;color:var(--dim);margin:8px 0">${pc.name} と ${ec.name} は引き分けました</div>`;
  }
  detail += `<div style="margin-top:8px;font-size:.82rem">戦績: ${S.br.w}勝 ${S.br.l}敗 ${S.br.d||0}分</div>`;
  resultDetail.innerHTML = detail;
  save();
}

function endBattle() {
  document.getElementById('bBattlePhase').style.display = 'none';
  document.getElementById('bSelectPhase').style.display = 'block';
  battleState = null; renderBattleSelect();
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
// コナミコマンド R18オンリーモード
// PC: ↑↑↓↓←→←→BA (キーボード)
// スマホ: 上上下下左右左右スワイプ → A,Bボタン表示 → A,B順押し
// ============================================================
(function(){
  const KONAMI_KEYS = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  const KONAMI_SWIPES = ['up','up','down','down','left','right','left','right'];
  let keySeq = [];
  let swipeSeq = [];
  let swStartX = 0, swStartY = 0;
  let abPhase = false; // スマホ用: スワイプ完了後のA,B入力待ち

  // キーボード版
  document.addEventListener('keydown', function(e) {
    // ガチャ画面でのみ有効（カードビューアー非表示時）
    if (document.getElementById('cardViewer').style.display !== 'none') return;
    if (document.querySelector('.ho.active') || document.querySelector('.do.active')) return;

    const key = e.key.toLowerCase();
    keySeq.push(e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? e.key : key);
    if (keySeq.length > 10) keySeq.shift();

    if (keySeq.length === 10 && keySeq.every((k, i) => k === KONAMI_KEYS[i])) {
      keySeq = [];
      activateR18Only();
    }
  });

  // スマホ スワイプ検出
  document.addEventListener('touchstart', function(e) {
    if (abPhase) return;
    swStartX = e.touches[0].clientX;
    swStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (abPhase) return;
    // カードビューアー表示中はスキップ（カードめくりと競合）
    if (document.getElementById('cardViewer').style.display !== 'none') return;

    const dx = e.changedTouches[0].clientX - swStartX;
    const dy = e.changedTouches[0].clientY - swStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    if (absDx < 30 && absDy < 30) return; // タップは無視

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
          if (abSeq[0] === 'A' && abSeq[1] === 'B') {
            overlay.remove();
            abPhase = false;
            activateR18Only();
          } else {
            abSeq = [];
            overlay.remove();
            abPhase = false;
          }
        }
      });
      return btn;
    };

    overlay.appendChild(makeBtn('A'));
    overlay.appendChild(makeBtn('B'));

    // ×ボタン
    const close = document.createElement('button');
    close.textContent = '✕';
    close.style.cssText = 'position:absolute;top:20px;right:20px;background:none;border:none;color:rgba(255,255,255,.5);font-size:1.5rem;cursor:pointer;';
    close.addEventListener('click', () => { overlay.remove(); abPhase = false; });
    overlay.appendChild(close);

    document.body.appendChild(overlay);
  }

  function activateR18Only() {
    if (S.r18only) {
      // 解除
      S.r18only = false;
      S.r18 = false;
      save();
      showKonamiNotification('R-18オンリーモード解除', '#0096fa');
    } else {
      // 発動
      S.r18only = true;
      S.r18 = true;
      save();
      showKonamiNotification('🔞 R-18 ONLY MODE 🔞', '#ff4757');
    }
    const sw = document.getElementById('r18Switch');
    if (sw) sw.checked = S.r18;
  }

  function showKonamiNotification(text, color) {
    const notif = document.createElement('div');
    notif.textContent = text;
    notif.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:1.8rem;font-weight:900;color:${color};z-index:1000;pointer-events:none;text-shadow:0 0 30px ${color};animation:konamiPop 2s ease forwards;white-space:nowrap;`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
  }

  // CSS for konami animation
  const style = document.createElement('style');
  style.textContent = `@keyframes konamiPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}40%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-55%) scale(1.1)}}`;
  document.head.appendChild(style);

  // R18オンリーモードのインジケーター
  if (S.r18only) {
    const ind = document.createElement('div');
    ind.style.cssText = 'position:fixed;bottom:8px;left:8px;font-size:.6rem;color:rgba(255,71,87,.5);z-index:99;pointer-events:none;';
    ind.textContent = '🔞 R18 ONLY';
    document.body.appendChild(ind);
  }
})();