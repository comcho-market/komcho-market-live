// 注文確定時に呼び出す：PaymentIntentを「オーソリのみ（manual capture）」で作成する。
// ここではまだお客様のカードに課金されない。発送処理（capture-payment）の時に初めて売上が確定する。
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { amount, shopId, userId } = req.body || {};
    const amountInt = Math.round(Number(amount));

    if (!amountInt || amountInt < 50) {
      // StripeのJPY決済は最低50円から
      res.status(400).json({ error: '決済金額が不正です' });
      return;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInt,
      currency: 'jpy',
      capture_method: 'manual', // オーソリ（仮売上）のみ。captureは発送時に別途実行
      metadata: {
        shop_id: shopId || '',
        user_id: userId || ''
      }
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    res.status(500).json({ error: err.message || '決済準備に失敗しました' });
  }
};
