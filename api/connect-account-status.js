// 出店者のStripe Connectアカウントの状態（本人確認が完了し、入金を受けられる状態か）を取得する。
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { accountId } = req.body || {};
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }

    const account = await stripe.accounts.retrieve(accountId);

    res.status(200).json({
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted
    });
  } catch (err) {
    console.error('connect-account-status error:', err);
    res.status(500).json({ error: err.message || 'Stripeアカウント状態の取得に失敗しました' });
  }
};
