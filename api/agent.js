// POST /api/agent  { message }  → Claude가 find_spots / get_weather 를 스스로 호출해 추천
// 환경변수: ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (선택)
const { tools, runTool } = require('./tool');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_TURNS = 6;

const SYSTEM =
  '너는 제주도 여행 추천 도우미다. 사용자의 요청에서 지역(동쪽/서쪽/서귀포/제주시)을 파악하고, ' +
  '먼저 get_weather로 날씨를 확인한 뒤 그 결과(indoor_recommended)에 맞춰 find_spots의 indoor 조건을 정해 호출한다. ' +
  '사용자가 실내/야외를 직접 말했다면 그 의견을 우선한다. 지역이 불분명하면 제주시로 가정하고 그렇게 밝힌다. ' +
  '추천은 find_spots 결과에 있는 장소만 사용한다. 목록 밖 장소는 없다. 운영시간·요금은 모르므로 지어내지 않는다. ' +
  '답변은 한국어로, 날씨 한 줄 요약 후 장소 3~5곳을 이유와 함께 짧게 추천한다.';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 지원합니다.' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: 'message가 비어 있습니다.' });

  const messages = [{ role: 'user', content: message }];
  const steps = [];
  let spots = [];
  let weather = null;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools, messages }),
      });
      const j = await r.json();
      if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'Claude API 오류', steps });

      messages.push({ role: 'assistant', content: j.content });
      const uses = j.content.filter((b) => b.type === 'tool_use');
      if (j.stop_reason !== 'tool_use' || !uses.length) {
        const answer = j.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        return res.status(200).json({ answer, steps, spots, weather });
      }

      const results = [];
      for (const u of uses) {
        const out = await runTool(u.name, u.input).catch((e) => ({ error: String(e.message || e) }));
        steps.push({ tool: u.name, input: u.input });
        if (u.name === 'find_spots' && out.spots) spots = spots.concat(out.spots);
        if (u.name === 'get_weather' && !out.error) weather = out;
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
      }
      messages.push({ role: 'user', content: results });
    }
    res.status(200).json({ answer: '추천을 완성하지 못했습니다. 다시 시도해 주세요.', steps, spots, weather });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), steps });
  }
};
