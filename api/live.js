// GET /api/live → 4개 지역의 실시간 날씨 (OpenWeatherMap)
// 환경변수: OPENWEATHER_API_KEY (필수)
const { AREA_COORDS } = require('./tool');

module.exports = async function handler(req, res) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return res.status(500).json({ error: '서버에 OPENWEATHER_API_KEY가 설정되지 않았습니다.' });

  try {
    const entries = await Promise.all(
      Object.entries(AREA_COORDS).map(async ([area, c]) => {
        const url =
          'https://api.openweathermap.org/data/2.5/weather' +
          `?lat=${c.lat}&lon=${c.lon}&units=metric&lang=kr&appid=${key}`;
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || `OpenWeather 오류 (${r.status})`);
        return [area, {
          temp_c: Math.round(j.main.temp),
          feels_like_c: Math.round(j.main.feels_like),
          humidity: j.main.humidity,
          wind_ms: j.wind.speed,
          description: j.weather[0].description,
          icon: j.weather[0].icon,
        }];
      })
    );
    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).json(Object.fromEntries(entries));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
