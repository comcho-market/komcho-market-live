// Stripeからの決済イベント通知（Webhook）を受け取るエンドポイント。
// 今までは「お客様の画面側からStripeに結果を聞きに行く」方式だったが、
// それだと通信エラーやブラウザを閉じてしまった場合に注文の状態がずれる可能性があった。
// このWebhookにより、Stripe側で何か起きた時（決済失敗・オーソリ期限切れ・返金など）に
// サーバー側で自動的に注文のpayment_statusを更新できるようにする。
//
// 【重要】このファイルは署名検証のため「生のリクエストボディ」が必要なので、
// Vercelの自動JSON変換（bodyParser）を無効にしている。

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uawhrpizzlchkvmzrjzo.supabase.co';
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports.config = {
  api: { bodyParser: false }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // 署名が不正 = Stripeからの本物の通知ではない可能性があるので受け付けない
    console.error('Webhook署名検証エラー:', err.message);
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }

  try {
    const obj = event.data.object;

    switch (event.type) {
      case 'payment_intent.payment_failed':
        // カード決済自体の失敗（通常はお客様の画面側でも検知済みだが、保険として処理）
        await updateOrderPaymentStatus(obj.id, 'failed');
        break;

      case 'payment_intent.canceled':
        // オーソリ（仮売上）が取り消された場合。
        // 手動キャンセル時だけでなく、Stripeの自動取消（オーソリ取得から一定期間、発送処理＝captureが
        // されないままだと自動的にキャンセルされる仕様）で起きた場合もここで検知できる。
        await updateOrderPaymentStatus(obj.id, 'cancelled');
        break;

      case 'charge.refunded':
        // Stripeダッシュボードなどからの返金処理をここで検知し、注文側にも反映する
        await updateOrderPaymentStatus(obj.payment_intent, 'refunded');
        break;

      case 'charge.dispute.created':
        // チャージバック（お客様のカード会社からの異議申し立て）が発生した場合の通知
        await updateOrderPaymentStatus(obj.payment_intent, 'disputed');
        break;

      default:
        // それ以外のイベントは今のところ扱わない
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook処理エラー:', err);
    res.status(500).json({ error: err.message || 'Webhook処理に失敗しました' });
  }
};

async function updateOrderPaymentStatus(paymentIntentId, newStatus) {
  if (!paymentIntentId) return;

  const { data: order, error: findError } = await supabase
    .from('orders')
    .select('id, status, payment_status')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (findError) {
    console.error('注文検索エラー:', findError);
    return;
  }
  if (!order) {
    // 該当する注文が見つからない場合は何もしない（テスト用の決済など）
    return;
  }

  // すでに売上確定（captured）している注文は、返金・異議申し立て以外では上書きしない
  if (order.payment_status === 'captured' && newStatus !== 'refunded' && newStatus !== 'disputed') {
    return;
  }
  // すでに同じ状態、またはより後の状態なら何もしない（二重通知対策）
  if (order.payment_status === newStatus) return;

  const updatePayload = { payment_status: newStatus };

  // 決済が失敗・取消になった注文は、発送済み・すでにキャンセル済みでない限り注文自体もキャンセル扱いにする
  if ((newStatus === 'failed' || newStatus === 'cancelled') &&
      order.status !== 'shipped' && order.status !== 'cancelled') {
    updatePayload.status = 'cancelled';
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id);

  if (updateError) {
    console.error('注文更新エラー:', updateError);
  }
}
