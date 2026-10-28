// find_spots / get_weather 도구 정의 + 실행 + (GET) 테스트용 엔드포인트
const data = require('../jeju_spots_legacy.json');

const AREAS = ['동쪽', '서쪽', '서귀포', '제주시'];
const MAX_SPOTS = 8;

// 날씨 조회용 대표 좌표 (Open-Meteo, 키 불필요)
const AREA_COORDS = {
  동쪽: { lat: 33.46, lon: 126.88 },
  서쪽: { lat: 33.36, lon: 126.28 },
  서귀포: { lat: 33.2541, lon: 126.5601 },
  제주시: { lat: 33.4996, lon: 126.5312 },
};

const WEATHER_CODES = {
  0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림',
  45: '안개', 48: '짙은 안개',
  51: '약한 이슬비', 53: '이슬비', 55: '강한 이슬비',
  61: '약한 비', 63: '비', 65: '강한 비',
  71: '약한 눈', 73: '눈', 75: '강한 눈',
  80: '약한 소나기', 81: '소나기', 82: '강한 소나기',
  95: '뇌우', 96: '우박 동반 뇌우', 99: '강한 우박 동반 뇌우',
};

function toBool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function findSpots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area는 ${AREAS.join(', ')} 중 하나여야 합니다.` };
  }
  const want = toBool(indoor);
  const pool = data.spots.filter(
    (s) => s.area.startsWith(area) && (want === undefined || s.indoor === want)
  );
  const spots = shuffle(pool).slice(0, MAX_SPOTS).map((s) => ({
    name: s.name,
    area: s.area,
    indoor: s.indoor,
    description: s.type,
  }));
  return { total_matched: pool.length, spots };
}

async function getWeather({ area } = {}) {
  const c = AREA_COORDS[area];
  if (!c) return { error: `area는 ${AREAS.join(', ')} 중 하나여야 합니다.` };
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${c.lat}&longitude=${c.lon}` +
    '&current=temperature_2m,precipitation,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
    '&timezone=Asia%2FSeoul&forecast_days=1';
  const res = await fetch(url);
  if (!res.ok) return { error: `Open-Meteo 응답 오류 (${res.status})` };
  const w = await res.json();
  const d = w.daily;
  const rainProb = d.precipitation_probability_max[0];
  const code = w.current.weather_code;
  const rainy = rainProb >= 50 || w.current.precipitation > 0 || (code >= 51 && code <= 99);
  return {
    area,
    condition: WEATHER_CODES[code] || `코드 ${code}`,
    temperature_c: w.current.temperature_2m,
    wind_speed_kmh: w.current.wind_speed_10m,
    precipitation_mm: w.current.precipitation,
    today: {
      min_c: d.temperature_2m_min[0],
      max_c: d.temperature_2m_max[0],
      rain_probability_pct: rainProb,
      uv_index_max: d.uv_index_max[0],
      sunrise: d.sunrise[0],
      sunset: d.sunset[0],
    },
    indoor_recommended: rainy,
  };
}

// Claude 도구 설명 (name / description / input_schema)
const tools = [
  {
    name: 'find_spots',
    description:
      '제주도 관광지 목록(jeju_spots_legacy.json)에서 지역과 실내/야외 조건에 맞는 장소를 최대 8곳 찾아 이름·지역·실내 여부·설명을 돌려준다. ' +
      '목록 밖 장소는 없다. 결과에 없는 장소는 추천하거나 지어내지 말 것. 결과가 비어 있으면 없다고 답한다.',
    input_schema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          enum: AREAS,
          description: '검색할 지역 (동쪽, 서쪽, 서귀포, 제주시 중 하나)',
        },
        indoor: {
          type: 'boolean',
          description: 'true면 실내만, false면 야외만. 생략하면 둘 다.',
        },
      },
      required: ['area'],
    },
  },
  {
    name: 'get_weather',
    description:
      'Open-Meteo로 제주 지역의 오늘 날씨(현재 상태, 기온, 강수확률, 자외선, 일출/일몰)를 조회한다. ' +
      '비가 오거나 강수확률이 높으면 indoor_recommended가 true로 나온다. 장소를 고르기 전에 호출해 실내/야외를 정하는 데 쓴다.',
    input_schema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          enum: AREAS,
          description: '날씨를 볼 지역 (동쪽, 서쪽, 서귀포, 제주시 중 하나)',
        },
      },
      required: ['area'],
    },
  },
];

async function runTool(name, input) {
  if (name === 'find_spots') return findSpots(input);
  if (name === 'get_weather') return getWeather(input);
  return { error: `알 수 없는 도구: ${name}` };
}

// GET /api/tool?tool=find_spots&area=제주시&indoor=true
async function handler(req, res) {
  const q = req.query || {};
  const name = q.tool || 'find_spots';
  try {
    const result = await runTool(name, { area: q.area, indoor: q.indoor });
    res.status(result.error ? 400 : 200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

module.exports = handler;
module.exports.findSpots = findSpots;
module.exports.getWeather = getWeather;
module.exports.runTool = runTool;
module.exports.tools = tools;
module.exports.AREAS = AREAS;
module.exports.AREA_COORDS = AREA_COORDS;
