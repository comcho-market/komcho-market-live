// 発送処理時に呼び出す：オーソリ（仮売上）していたPaymentIntentをcaptureして売上を確定する。
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { paymentIntentId } = req.body || {};
    if (!paymentIntentId) {
      res.status(400).json({ error: 'paymentIntentId is required' });
      return;
    }

    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    res.status(200).json({ status: paymentIntent.status });
  } catch (err) {
    console.error('capture-payment error:', err);
    res.status(500).json({ error: err.message || '決済の確定に失敗しました' });
  }
};
