// 発送前キャンセル時に呼び出す：オーソリ（仮売上）のみの状態のPaymentIntentを取り消す。
// captureされていない取り消しなので、お客様への決済手数料は発生しない。
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

    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
    res.status(200).json({ status: paymentIntent.status });
  } catch (err) {
    // すでにcapture済み・すでにキャンセル済みの場合もここに来ることがある
    console.error('cancel-payment error:', err);
    res.status(500).json({ error: err.message || '決済の取り消しに失敗しました' });
  }
};
