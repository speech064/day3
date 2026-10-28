// 관광지 이름으로 위키백과/위키미디어 커먼즈에서 자유 라이선스 사진을 찾는 스크립트
// 사용법: 브라우저에서 https://ko.wikipedia.org 아무 문서를 연 뒤 개발자 도구 콘솔에 붙여넣기
//         (CORS 때문에 같은 위키미디어 도메인에서 실행해야 함). 결과 JSON을 jeju_spots.json에 반영한다.
// 규칙: ① 한국어 위키백과 문서의 대표 사진 → ② 없으면 Commons 파일 검색(파일명에 이름 포함)
//       ③ CC 계열 / 퍼블릭 도메인 / 공공누리 1유형만 사용, 사진이 없으면 비워 둔다.
(async () => {
  const NAMES = ["성산일출봉","동문재래시장","서귀포매일올레시장","함덕해수욕장","협재해수욕장","이호테우해변","한라산국립공원","사려니숲길","비자림","한라산 영실코스","섭지코지","송악산","산방산","만장굴","오설록티뮤지엄","우도","카멜리아힐","용머리해안","곽지해수욕장","김녕해수욕장","새별오름","휴애리자연생활공원","대포주상절리대","중문색달해변","표선해수욕장","광치기해변","금능해수욕장","한림공원","금오름","용눈이오름","1100고지","녹산로유채꽃길","천지연폭포","쇠소깍","아쿠아플라넷제주","제주돌문화공원","판포포구","용두암","제주절물자연휴양림","산방산탄산온천","월정리해변","산양큰엉곶","한라수목원","제주동백수목원","신화월드","도두봉","외돌개","정방폭포","사계해수욕장","거문오름","서귀포치유의숲","가파도","마라도","비양도","제주목관아","본태박물관","바이나흐튼크리스마스박물관","국립제주박물관","아르떼뮤지엄 제주","제주민속오일시장","윗세오름","산굼부리","어승생악","서우봉","다랑쉬오름","군산오름","물영아리오름","수월봉","신창풍차해안도로","한담해안산책로","코난비치","삼양해수욕장","세화해변","천제연폭포","엉또폭포","비밀의숲","돌코리숲","곶자왈도립공원","대왕수천예래생태공원","붉은오름자연휴양림","청수곶자왈","동백포레스트","환상숲곶자왈공원","교래자연휴양림","종달리수국길","제주민속자연사박물관","넥슨컴퓨터박물관","제주해녀박물관","제주항공우주박물관","에코랜드테마파크","제주아트서커스","스누피가든","9.81파크","이시돌목장","삼성혈","성읍민속마을","제주4·3평화공원","항몽유적지","관덕정","약천사"];
  const ALIAS = {"한라산 영실코스":"영실","대포주상절리대":"주상절리대","오설록티뮤지엄":"오설록","제주목관아":"제주 목 관아","제주민속오일시장":"제주 오일장","환상숲곶자왈공원":"환상숲 곶자왈 공원","대왕수천예래생태공원":"예래생태공원","신창풍차해안도로":"신창 풍차 해안도로","휴애리자연생활공원":"휴애리","제주절물자연휴양림":"절물자연휴양림","제주돌문화공원":"제주 돌문화공원","제주아트서커스":"아트서커스","제주동백수목원":"동백수목원"};
  const norm = (s) => s.replace(/[\s·\-\(\)_]/g, '').toLowerCase();
  const strip = (h) => (h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const okLicense = (l) => /^(CC |Public domain|PD|KOGL Type 1)/i.test(l || '');
  const api = async (host, params) =>
    (await fetch(`https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', origin: '*', ...params }))).json();

  // ① 위키백과 문서 대표 사진 (제목 정확 일치 → 못 찾으면 검색 1건, 이름이 겹칠 때만 채택)
  const wiki = {};
  for (let i = 0; i < NAMES.length; i += 40) {
    const chunk = NAMES.slice(i, i + 40), titles = chunk.map((n) => ALIAS[n] || n);
    const q = (await api('ko.wikipedia.org', { action: 'query', prop: 'pageimages', piprop: 'name', redirects: '1', titles: titles.join('|') })).query || {};
    const map = {}; [...(q.normalized || []), ...(q.redirects || [])].forEach((x) => (map[x.from] = x.to));
    const byTitle = {}; Object.values(q.pages || {}).forEach((p) => (byTitle[p.title] = p));
    chunk.forEach((n, k) => { let t = titles[k]; t = map[t] || t; t = map[t] || t; const p = byTitle[t]; if (p && !('missing' in p) && p.pageimage) wiki[n] = { file: p.pageimage, how: 'wiki:' + p.title }; });
  }
  for (const n of NAMES.filter((x) => !wiki[x])) {
    const key = norm(ALIAS[n] || n);
    const j = await api('ko.wikipedia.org', { action: 'query', generator: 'search', gsrsearch: (ALIAS[n] || n) + ' 제주', gsrlimit: '3', prop: 'pageimages', piprop: 'name' });
    const hit = Object.values((j.query || {}).pages || {}).sort((a, b) => a.index - b.index)
      .find((p) => { const t = norm(p.title); return p.pageimage && t.length >= 3 && (t.includes(key) || key.includes(t)); });
    if (hit) wiki[n] = { file: hit.pageimage, how: 'wiki:' + hit.title };
  }

  // Commons 메타데이터(썸네일 800px, 작가, 라이선스)
  const meta = {};
  const files = Object.values(wiki).map((w) => 'File:' + w.file);
  for (let i = 0; i < files.length; i += 40) {
    const j = await api('commons.wikimedia.org', { action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '800', titles: files.slice(i, i + 40).join('|') });
    Object.values((j.query || {}).pages || {}).forEach((p) => { if (p.imageinfo) meta[p.title] = p.imageinfo[0]; });
  }
  const found = {};
  NAMES.forEach((n) => { const w = wiki[n]; if (!w) return; const t = 'File:' + w.file.replace(/_/g, ' '); if (meta[t]) found[n] = { info: meta[t], file: t, how: w.how }; });

  // ② 문서가 없는 곳은 Commons 파일 검색
  for (const n of NAMES.filter((x) => !found[x])) {
    const key = norm(ALIAS[n] || n);
    const j = await api('commons.wikimedia.org', { action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: ALIAS[n] || n, gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '800' });
    const hit = Object.values((j.query || {}).pages || {}).sort((a, b) => a.index - b.index)
      .filter((p) => p.imageinfo && /image\/(jpeg|png)/.test(p.imageinfo[0].mime))
      .find((p) => norm(p.title).includes(key));
    if (hit) found[n] = { info: hit.imageinfo[0], file: hit.title, how: 'commons' };
  }

  // ③ 라이선스 필터 후 결과 정리 (없으면 키 자체를 만들지 않음)
  const out = {};
  Object.entries(found).forEach(([n, c]) => {
    const em = c.info.extmetadata || {}, lic = (em.LicenseShortName || {}).value;
    if (!okLicense(lic) || !c.info.thumburl) return;
    out[n] = { image: c.info.thumburl, image_credit: `${strip((em.Artist || {}).value).slice(0, 60) || 'Wikimedia Commons'} · ${lic}`, image_source: c.info.descriptionurl, _file: c.file.slice(5), _how: c.how };
  });
  console.log(Object.keys(out).length + ' / ' + NAMES.length);
  return out;
})();
