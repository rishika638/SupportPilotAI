import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const listDuration = new Trend('list_duration');
const createDuration = new Trend('create_duration');
const detailDuration = new Trend('detail_duration');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up
    { duration: '2m', target: 10 },    // Sustained load
    { duration: '30s', target: 20 },   // Ramp up to 20
    { duration: '2m', target: 20 },    // Sustained load
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    list_duration: ['p(95)<500'],
    create_duration: ['p(95)<1000'],
    detail_duration: ['p(95)<300'],
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

  // 70% list tickets, 20% get ticket detail, 10% create ticket
  const rand = Math.random();

  if (rand < 0.7) {
    // List tickets
    const start = new Date();
    const listRes = http.get(`${BASE_URL}/tickets?page=1&limit=20`, { headers });
    listDuration.add(new Date() - start);

    const success = check(listRes, {
      'list status is 200': (r) => r.status === 200,
      'list has tickets array': (r) => {
        const body = safeParse(r.body);
        return body && body.data && Array.isArray(body.data.tickets);
      },
    });
    errorRate.add(!success);
    sleep(1);
  } else if (rand < 0.9) {
    // Get ticket detail (requires TEST_TICKET_ID env var)
    const ticketId = __ENV.TEST_TICKET_ID;
    if (!ticketId) {
      // Skip detail check if no ticket ID provided
      return;
    }
    const start = new Date();
    const detailRes = http.get(`${BASE_URL}/tickets/${ticketId}`, { headers });
    detailDuration.add(new Date() - start);

    const success = check(detailRes, {
      'detail status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(!success);
    sleep(0.5);
  } else {
    // Create ticket
    const timestamp = new Date().toISOString();
    const ticketData = {
      title: `Mixed workload ticket ${timestamp}`,
      description: `Created during mixed workload test`,
      priority: 'MEDIUM',
      channel: 'WEB',
      tags: ['mixed-workload'],
    };

    const start = new Date();
    const createRes = http.post(`${BASE_URL}/tickets`, JSON.stringify(ticketData), { headers });
    createDuration.add(new Date() - start);

    const success = check(createRes, {
      'create status is 201': (r) => r.status === 201,
      'create has ticket ID': (r) => {
        const body = safeParse(r.body);
        return body && body.data && body.data.id;
      },
    });
    errorRate.add(!success);
    sleep(2);
  }
}
