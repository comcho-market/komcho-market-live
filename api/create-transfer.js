// 運営管理画面から「振込を実行」した時に呼び出す：
// 店舗のStripe Connectアカウントへ、貯まった売上（shop_earningsのpending合計）を実際に送金する。
// 振込対象の金額・shop_earningsの行は運営管理画面（admin_users権限を持つユーザーのみアクセス可）側で
// 計算・選別し、実行後のDB更新（status='paid'への更新）も運営管理画面側で行う。
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { stripeAccountId, amount, shopId } = req.body || {};
    if (!stripeAccountId || !amount || !(amount > 0)) {
      res.status(400).json({ error: 'stripeAccountId, amount is required' });
      return;
    }

    // JPYはゼロ桁通貨（小数点なし）なので、amountはそのまま円の整数として渡す
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount),
      currency: 'jpy',
      destination: stripeAccountId,
      description: `こむちょマーケット 売上振込${shopId ? `（shop_id: ${shopId}）` : ''}`
    });

    res.status(200).json({ transferId: transfer.id });
  } catch (err) {
    console.error('create-transfer error:', err);
    res.status(500).json({ error: err.message || '振込の実行に失敗しました' });
  }
};
