
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000/api/v1';
const USERNAME = __ENV.TEST_USERNAME;
const PASSWORD = __ENV.TEST_PASSWORD;

if (!USERNAME || !PASSWORD) {
  throw new Error(
    'TEST_USERNAME and TEST_PASSWORD environment variables are required.'
  );
}

function safeParse(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: USERNAME,
      password: PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (loginRes.status !== 200) {
    throw new Error(
      `Login failed: ${loginRes.status} ${String(loginRes.body).slice(0, 300)}`
    );
  }

  const data = safeParse(loginRes.body);

  if (!data?.data?.tokens?.accessToken) {
    throw new Error('Login response did not contain an access token.');
  }

  return { token: data.data.tokens.accessToken };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  const listRes = http.get(
    `${BASE_URL}/tickets?page=1&limit=20`,
    { headers }
  );

  const body = safeParse(listRes.body);

  const statusOK = check(listRes, {
    'status is 200': (r) => r.status === 200,
  });

  const payloadOK = check(listRes, {
    'has tickets array': () =>
      Boolean(body?.data && Array.isArray(body.data.tickets)),
  });

  check(listRes, {
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!statusOK || !payloadOK);


  if (listRes.status !== 200) {
    console.error(
      `Ticket listing failed: status=${listRes.status}, body=${String(
        listRes.body
      ).slice(0, 300)}`
    );
  }

  if (listRes.timings.duration > 1000) {
    console.warn(
      `SLOW REQUEST: duration=${listRes.timings.duration.toFixed(0)}ms, ` +
      `waiting=${listRes.timings.waiting.toFixed(0)}ms, ` +
      `connecting=${listRes.timings.connecting.toFixed(0)}ms, ` +
      `receiving=${listRes.timings.receiving.toFixed(0)}ms`
    );
  }


  sleep(1);
}
