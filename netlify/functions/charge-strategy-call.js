// Charges the Ops Room Strategy Call ($350) with Square.
// The price is fixed here, server-side, so a tampered page cannot change it.
// Secrets come ONLY from Netlify environment variables, never from the page:
//   SQUARE_ACCESS_TOKEN  (secret)  — the access token for the Square account that gets paid
//   SQUARE_LOCATION_ID   (public)  — the location that receives the payment
//   SQUARE_ENV           (public)  — "production" for live cards, "sandbox" while testing
//   ALLOWED_ORIGIN       (optional) — your funnel's URL, e.g. https://book.arvinanderson.com

const PRICE_CENTS = 35000; // $350.00 USD, fixed server-side
const CURRENCY = 'USD';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed.' });
  }

  // Optional origin lock: only your own site may call this function.
  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = event.headers.origin || event.headers.Origin;
  if (allowed && origin && origin !== allowed) {
    return json(403, { success: false, message: 'Forbidden.' });
  }

  let sourceId;
  try {
    ({ sourceId } = JSON.parse(event.body || '{}'));
  } catch (e) {
    return json(400, { success: false, message: 'Bad request.' });
  }
  if (!sourceId) {
    return json(400, { success: false, message: 'Missing payment token.' });
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!token || !locationId) {
    return json(500, { success: false, message: 'Payment is not configured yet.' });
  }

  const base = process.env.SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

  const idempotencyKey = (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const resp = await fetch(`${base}/v2/payments`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-12-18',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        amount_money: { amount: PRICE_CENTS, currency: CURRENCY },
        location_id: locationId,
        note: 'Ops Room Strategy Call'
      })
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data.payment) {
      return json(200, { success: true });
    }

    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    return json(402, { success: false, message: detail || 'The card was declined. Please try another card.' });
  } catch (e) {
    return json(502, { success: false, message: 'Could not reach the payment processor. Please try again.' });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
