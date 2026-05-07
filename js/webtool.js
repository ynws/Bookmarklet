/**
 * 公式サイトから情報を取得する場合など、webデータに関する共通処理
 * 特定のツール機能に依存しない一般的な機能だけを管理する
 */

const MEDAL_IMAGE_URL = "https://eacache.s.konaminet.jp/game/popn/popn29/images/p/common/medal";
const STATUS_URL = "https://p.eagate.573.jp/game/popn/jamfizz/playdata/index.html"
const TOMO_URL = "https://p.eagate.573.jp/game/popn/jamfizz/p_friend/vs.html"
const TOMO_VSLV_URL = "https://p.eagate.573.jp/game/popn/jamfizz/p_friend/vs_lv.html?version=0&category=0&keyword="
const ERROR_MEDAL_ID = 0

/**
 * 取得したHTMLの文字コードを整える
 */
function resToText(res) {
  return res.arrayBuffer().then((buffer) => {
    if (res.headers.get("Content-Type").includes("UTF-8")) {
      return new TextDecoder().decode(buffer);
    } else {
      return new TextDecoder("Shift_JIS").decode(buffer)
    }
  })
}

/**
 * 一定時間処理を停止する
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 曲名の比較用に一部表記ゆれがある文字をトリム・置換する
// TODO: 表記ゆれ対応の改善 記号やカッコが半角・全角あってないケースが多い
// 既知の公式ミス？
// - 波線～が、2パターンある。どちらも無視する。
// - jam fizzで、曲名にある～が＼に置き換わってしまっている
// - Lv45 BLAZE∞BREEZE - WHITE LIE Version - の1つ目の"-"前に半角空白が2連続で入っている。1つとして扱う。
// - Lv46 スクリーンHyに後置空白が入っている。前後空白はトリムする
// - 曲ごとに全角空白と半角空白・全角！と半角!の使い分けがバラバラ。半角に統一する
function songtrim(s) {
  return s.trim().replaceAll("～","").replaceAll("〜","").replaceAll("＼","")
  .replaceAll("（","(").replaceAll("）",")")
  .replaceAll("  "," ").replaceAll("　"," ").replaceAll("！","!");
}

/**
 * ユーザー名を返す
 */
async function getUserName() {
    let domparser = new DOMParser();
    let status = await fetch(STATUS_URL)
        .then(resToText)
        .then((text) => domparser.parseFromString(text, "text/html"))
        .then((doc) => doc.querySelector("#status_table > div.st_box")
        );
    if(!status || status.children.length < 2){
        return null;
    }
    // ユーザ名はステータスboxの2つ目の要素に入っている
    return status.children[1].textContent;
}

/**
 * ポプともの一覧を返す(idと名前のリスト)
 */
async function getPoptomoList() {
    let domparser = new DOMParser();
    let users = await fetch(TOMO_URL)
        .then(resToText)
        .then((text) => domparser.parseFromString(text, "text/html"))
        .then((doc) => doc.querySelector('select[name="id"]')
        );
    if(!users || users.options.length <= 1){
        return null;
    }
    // ユーザ一覧の先頭は"未選択"なので、それ以外をリストにして返す
    return Array.from(users.options)
    .slice(1) // 先頭のoptionを除外
    .map(option => ({
        id: option.value,
        name: option.text
    }));
}

/**
 * ポプともレベル比較用のURLを返す
 */
function getTomoDiffUrl(id, lv, page){
    return `${TOMO_VSLV_URL}&page=${page}&lv=${lv}&id=${id}`;
}

/**
 * 公式サイトの特定の楽曲一覧URLから、その一覧が何ページあるか調べる
 * @param {*} url 
 * @returns 取得に失敗した場合は -1 を返す
 */
async function getMaxLvPageNum(url) {
  console.log("getMaxLvPageNum : " + url);
  let domparser = new DOMParser();
  // ページ末尾にある改ページ用のリストから、最大ページ番号を求める
  let pagelist = await fetch(url)
    .then(resToText)
    .then((text) => domparser.parseFromString(text, "text/html"))
    .then((doc) => doc.getElementById("s_page"))
  if (!pagelist || pagelist.children.length == 0) {
    console.log("getMaxLvPageNum : error");
    return -1;
  }
  console.log("getMaxLvPageNum : " + pagelist.children.length);
  return pagelist.children.length;
}

// ページにスクリプトを追加する。すでにある場合は削除して作り直す
function addScript(scriptId, scriptContent) {
    const scriptElement = document.getElementById(scriptId);
    if (scriptElement) {
        scriptElement.parentNode.removeChild(scriptElement);
    }

    const script = document.createElement('script');
    script.type = "text/javascript";
    script.id = scriptId;
    script.innerHTML = scriptContent;
    document.head.appendChild(script);
}

/**
 * 画像ファイルを読み込んで返す
 */
async function loadImage(src) {
  console.log("load image : " + src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
    img.crossOrigin = "anonymous"; // 画像ダウンロード用
  });
}

// メダルのURLを元にメダル番号を振る
function medalurlToInt(murl) {
  const MEDAL_ID = {
    "a": 12, // 金
    "b": 11, // 銀★
    "c": 10,
    "d": 9,
    "e": 8,  // 銅★
    "f": 7,
    "g": 6,
    "h": 3,  // 黒★
    "i": 2,
    "j": 1,
    "k": 4,  // 緑
    "l": 5,  // オレンジ
    "none": ERROR_MEDAL_ID,
  };
  let alp = murl.replace(`${MEDAL_IMAGE_URL}/meda_`, "").replace(".png", "")
  return alp in MEDAL_ID ? MEDAL_ID[alp] : ERROR_MEDAL_ID;
}

// ランクのURLを元にランク番号を振る
// Note: 未クリアだとAA以上にならない仕様があるため、スコアから計算して出してはいけない
function rankurlToInt(murl) {
  const MEDAL_ID = {
    "s_plus": 12,
    "s": 11,
    "a3": 10,
    "a2_plus": 9,
    "a2": 8,
    "a1_plus": 7,
    "a1": 6,
    "b_plus": 5,
    "b": 4,
    "c": 3,
    "d": 2,
    "e": 1,
    "none": ERROR_MEDAL_ID,
  };
  let alp = murl.replace(`${MEDAL_IMAGE_URL}/rank_`, "").replace(".png", "")
  return alp in MEDAL_ID ? MEDAL_ID[alp] : ERROR_MEDAL_ID;
}

function isErrorMedalID(id) {
    return id == ERROR_MEDAL_ID;
}

function getErrorMedalID() {
    return ERROR_MEDAL_ID;
}

function medalIDsTotext(rank, medal) {
  return String(rank).padStart(2, '0') + String(medal).padStart(2, '0');
}

function medalIDsToImg(rank, medal, githuburl) {
  if (isErrorMedalID(rank) || isErrorMedalID(medal)) {
    return "";
  }
  return `<img src="${githuburl}/icon/s_${rank}.png" height="32px"><img src="${githuburl}/icon/c_${medal}.png" height="32px"></img>`
}

const MEDAL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const RANK_MEDAL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * 画像を非同期で読み込む共通ヘルパー
 * @param {string} src 画像URL
 * @returns {Promise<HTMLImageElement>}
 */
async function loadImage(src) {
  const img = new Image();
  img.src = src;
  img.crossOrigin = "anonymous"; // 画像ダウンロード用
  await img.decode();
  return img;
}

/**
 * 結果用メダル画像を読み込む
 * @param {string} baseurl メダル画像を保存している基準URL (通常は、このツールが入っているGithub PagesのURL)
 * @returns {Promise<HTMLImageElement[]>}
 */
function loadMedals(baseurl) {
  return Promise.all(
    MEDAL_IDS.map(id => loadImage(`${baseurl}/icon/c_${id}.png`))
  );
}

/**
 * クリアランク用メダル画像を読み込む
 * @param {string} baseurl メダル画像を保存している基準URL (通常は、このツールが入っているGithub PagesのURL)
 * @returns {Promise<HTMLImageElement[]>}
 */
function loadRankMedals(baseurl) {
  return Promise.all(
    RANK_MEDAL_IDS.map(id => loadImage(`${baseurl}/icon/s_${id}.png`))
  );
}