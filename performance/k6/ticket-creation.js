import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 5 },    // Ramp up to 5 VUs
    { duration: '1m', target: 5 },     // Stay at 5 VUs
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000/api/v1';

// Credentials must be provided via environment variables
const USERNAME = __ENV.TEST_USERNAME;
const PASSWORD = __ENV.TEST_PASSWORD;

if (!USERNAME || !PASSWORD) {
  throw new Error('TEST_USERNAME and TEST_PASSWORD environment variables are required.');
}

// Safe JSON parsing helper
function safeParse(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

export function setup() {
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: USERNAME,
    password: PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status}`);
  }

  const data = safeParse(loginRes.body);
  if (!data || !data.data || !data.data.tokens || !data.data.tokens.accessToken) {
    throw new Error(`Login response has unexpected structure: ${loginRes.body}`);
  }

  return { token: data.data.tokens.accessToken };
}

export default function (data) {
  const headers = {
    'Authorization': `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  const timestamp = new Date().toISOString();
  const ticketData = {
    title: `Performance test ticket ${timestamp}`,
    description: `Load testing ticket created at ${timestamp}`,
    priority: 'MEDIUM',
    channel: 'WEB',
    tags: ['performance-test'],
  };

  const createRes = http.post(`${BASE_URL}/tickets`, JSON.stringify(ticketData), { headers });

  const success = check(createRes, {
    'status is 201': (r) => r.status === 201,
    'has ticket ID': (r) => {
      const body = safeParse(r.body);
      return body && body.data && body.data.id;
    },
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!success);

  sleep(2);
}
