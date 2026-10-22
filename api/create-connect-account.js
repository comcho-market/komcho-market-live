// 出店者のStripe Connectアカウント（Express）を作成し、本人確認フォームのリンクを発行する。
// すでにアカウントがある場合は作り直さず、続きの登録リンクだけ発行する。
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { shopId, accountId, email, returnUrl, refreshUrl } = req.body || {};
    if (!shopId || !returnUrl || !refreshUrl) {
      res.status(400).json({ error: 'shopId, returnUrl, refreshUrl is required' });
      return;
    }

    let account;
    if (accountId) {
      // 既存アカウントの続きから
      account = { id: accountId };
    } else {
      account = await stripe.accounts.create({
        type: 'express',
        country: 'JP',
        email: email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        metadata: { shop_id: shopId }
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });

    res.status(200).json({ accountId: account.id, url: accountLink.url });
  } catch (err) {
    console.error('create-connect-account error:', err);
    res.status(500).json({ error: err.message || 'Stripeアカウントの作成に失敗しました' });
  }
};
